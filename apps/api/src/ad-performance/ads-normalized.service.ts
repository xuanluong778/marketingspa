import { Injectable, Logger } from '@nestjs/common';
import { AdCampaignStatus, AdPlatform, Prisma } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildAiSuggestion,
  computeEfficiencyScore,
  decimalToNumber,
  type CampaignMetrics,
} from '../ai-ads-manager/ads-efficiency.util';

/**
 * Lớp metric chuẩn hóa org-scoped.
 * Sync Meta → FacebookAdsCampaignSnapshot → materialize vào AdManagerCampaign + AdInsight.
 * ai-ads-manager chỉ đọc từ đây — không sync provider / không đụng token.
 */
@Injectable()
export class AdsNormalizedService {
  private readonly logger = new Logger(AdsNormalizedService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Materialize snapshots Meta (sau FacebookAdsService.sync) vào bảng chuẩn hóa AI đọc.
   * Adapter tương thích: giữ FacebookAdsCampaignSnapshot; đồng bộ sang AdInsight.
   */
  async materializeMetaSnapshots(
    organizationId: string,
    userId: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<number> {
    const meta = await this.prisma.facebookAdsConnection.findUnique({
      where: { organizationId },
    });
    const adAccountId = meta?.selectedAdAccountId;
    if (!adAccountId) return 0;

    const snapshots = await this.prisma.facebookAdsCampaignSnapshot.findMany({
      where: { organizationId, dateFrom, dateTo },
    });

    const account = await this.ensurePlatformAccount(
      organizationId,
      userId,
      AdPlatform.META,
      adAccountId,
      meta?.selectedAdAccountName ?? adAccountId,
    );

    const { normalizeAdsMetrics } = await import('@marketingspa/shared');
    const timezone = account.timezone || 'UTC';
    const currency = account.currency || 'USD';
    const dateKey = dateFrom.toISOString().slice(0, 10);

    let count = 0;
    for (const snap of snapshots) {
      const spend = decimalToNumber(snap.spend);
      const conversions = decimalToNumber(snap.results);
      const purchaseRoas = snap.purchaseRoas ? decimalToNumber(snap.purchaseRoas) : null;
      // conversionValue từ ROAS khi có — không làm tròn sớm
      const conversionValue = purchaseRoas != null && spend > 0 ? spend * purchaseRoas : 0;

      const normalized = normalizeAdsMetrics({
        impressions: snap.impressions,
        reach: snap.reach,
        clicks: snap.clicks,
        spend,
        conversions,
        conversionValue,
        currency,
        date: dateKey,
        conversionActions:
          conversions > 0
            ? [
                {
                  type: snap.campaignType || 'result',
                  count: conversions,
                  value: conversionValue || undefined,
                },
              ]
            : [],
        recomputeRates: true,
      });

      const metrics: CampaignMetrics = {
        spend: normalized.spend,
        revenue: normalized.conversionValue,
        impressions: normalized.impressions,
        clicks: normalized.clicks,
        ctr: normalized.ctr ?? 0,
        cpc: normalized.cpc ?? 0,
        cpm: normalized.cpm ?? 0,
        conversions: normalized.conversions,
        leads: 0,
        cpa: normalized.cpa ?? 0,
        cpl: null,
        roas: normalized.roas,
      };
      const score = computeEfficiencyScore(metrics);
      const suggestion = buildAiSuggestion(metrics, score);

      const campaign = await this.prisma.adManagerCampaign.upsert({
        where: {
          userId_platform_externalId: {
            userId,
            platform: AdPlatform.META,
            externalId: snap.campaignId,
          },
        },
        create: {
          userId,
          organizationId,
          accountId: account.id,
          platform: AdPlatform.META,
          externalId: snap.campaignId,
          name: snap.campaignName,
          status: AdCampaignStatus.ACTIVE,
          objective: snap.objective,
          lastSyncedAt: snap.syncedAt,
        },
        update: {
          name: snap.campaignName,
          objective: snap.objective,
          lastSyncedAt: snap.syncedAt,
          organizationId,
        },
      });

      const insightData = {
        organizationId,
        campaignId: campaign.id,
        campaignName: snap.campaignName,
        date: dateFrom,
        spend: normalized.spend,
        revenue: normalized.conversionValue,
        conversionValue: normalized.conversionValue,
        impressions: Math.floor(normalized.impressions),
        clicks: Math.floor(normalized.clicks),
        ctr: normalized.ctr,
        cpc: normalized.cpc,
        cpm: normalized.cpm,
        reach: Math.floor(normalized.reach),
        frequency: decimalToNumber(snap.frequency),
        conversions: normalized.conversions,
        leads: 0,
        cpa: normalized.cpa,
        cpl: null,
        roas: normalized.roas,
        currency: normalized.currency,
        timezone,
        conversionActions: normalized.conversionActions as Prisma.InputJsonValue,
        efficiencyScore: score,
        aiSuggestion: suggestion,
        syncedAt: snap.syncedAt,
      };

      await this.prisma.adInsight.upsert({
        where: {
          userId_platform_externalCampaignId_dateFrom_dateTo: {
            userId,
            platform: AdPlatform.META,
            externalCampaignId: snap.campaignId,
            dateFrom,
            dateTo,
          },
        },
        create: {
          userId,
          platform: AdPlatform.META,
          externalCampaignId: snap.campaignId,
          dateFrom,
          dateTo,
          rawMetrics: {
            source: 'FacebookAdsCampaignSnapshot',
            campaignType: snap.campaignType,
          } as Prisma.InputJsonValue,
          ...insightData,
        },
        update: insightData,
      });
      count += 1;
    }

    await this.prisma.adConnection.updateMany({
      where: { organizationId, provider: 'META' },
      data: { lastSyncAt: new Date(), lastError: null, userId },
    });

    this.logger.log(`Materialized ${count} Meta campaigns → AdInsight org=${organizationId}`);
    return count;
  }

  async listInsights(
    organizationId: string,
    dateFrom: string,
    dateTo: string,
    opts?: {
      platform?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = opts?.page ?? 1;
    const pageSize = opts?.pageSize ?? 20;
    const where: Prisma.AdInsightWhereInput = {
      organizationId,
      dateFrom: new Date(dateFrom),
      dateTo: new Date(dateTo),
      ...(opts?.platform ? { platform: opts.platform as AdPlatform } : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.adInsight.count({ where }),
      this.prisma.adInsight.findMany({
        where,
        include: { campaign: true },
        orderBy: { spend: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  toPublicMetricsRow(row: {
    id: string;
    organizationId: string;
    platform: AdPlatform;
    externalCampaignId: string;
    campaignName: string;
    dateFrom: Date;
    dateTo: Date;
    date: Date | null;
    spend: Prisma.Decimal | number;
    conversionValue?: Prisma.Decimal | number | null;
    revenue: Prisma.Decimal | number;
    impressions: number;
    reach: number;
    clicks: number;
    ctr: Prisma.Decimal | number | null;
    cpc: Prisma.Decimal | number | null;
    cpm: Prisma.Decimal | number | null;
    cpa: Prisma.Decimal | number | null;
    roas: Prisma.Decimal | number | null;
    conversions: Prisma.Decimal | number;
    currency?: string | null;
    timezone?: string | null;
    conversionActions?: unknown;
    campaignId?: string | null;
    campaign?: { status?: string; budget?: Prisma.Decimal | null } | null;
    efficiencyScore?: number | null;
    aiSuggestion?: string | null;
  }) {
    const conversionValue =
      row.conversionValue != null
        ? decimalToNumber(row.conversionValue)
        : decimalToNumber(row.revenue);
    return {
      insightId: row.id,
      id: row.campaignId ?? row.id,
      organizationId: row.organizationId,
      platform: row.platform,
      externalCampaignId: row.externalCampaignId,
      name: row.campaignName,
      campaignName: row.campaignName,
      status: row.campaign?.status ?? 'ACTIVE',
      budget: row.campaign?.budget ? decimalToNumber(row.campaign.budget) : null,
      dateFrom: row.dateFrom.toISOString().slice(0, 10),
      dateTo: row.dateTo.toISOString().slice(0, 10),
      date: (row.date ?? row.dateFrom).toISOString().slice(0, 10),
      impressions: row.impressions,
      reach: row.reach,
      clicks: row.clicks,
      spend: decimalToNumber(row.spend),
      conversions: decimalToNumber(row.conversions),
      conversionValue,
      ctr: row.ctr != null ? decimalToNumber(row.ctr) : null,
      cpc: row.cpc != null ? decimalToNumber(row.cpc) : null,
      cpm: row.cpm != null ? decimalToNumber(row.cpm) : null,
      cpa: row.cpa != null ? decimalToNumber(row.cpa) : null,
      roas: row.roas != null ? decimalToNumber(row.roas) : null,
      currency: row.currency ?? 'USD',
      timezone: row.timezone ?? 'UTC',
      conversionActions: Array.isArray(row.conversionActions) ? row.conversionActions : [],
      efficiencyScore: row.efficiencyScore,
      aiSuggestion: row.aiSuggestion,
      /** tương thích FE cũ */
      leads: 0,
      externalId: row.externalCampaignId,
    };
  }

  async getDashboard(organizationId: string, dateFrom: string, dateTo: string) {
    const { items: insights } = await this.listInsights(organizationId, dateFrom, dateTo, {
      page: 1,
      pageSize: 500,
    });
    const campaigns = await this.prisma.adManagerCampaign.findMany({
      where: { organizationId },
    });

    let totalSpend = 0;
    let totalRevenue = 0;
    let totalConversions = 0;
    let poorCount = 0;

    for (const row of insights) {
      totalSpend += decimalToNumber(row.spend);
      const cv =
        row.conversionValue != null
          ? decimalToNumber(row.conversionValue)
          : decimalToNumber(row.revenue);
      totalRevenue += cv;
      totalConversions += decimalToNumber(row.conversions) + decimalToNumber(row.leads);
      if ((row.efficiencyScore ?? 50) < 40) poorCount += 1;
    }

    const roas = totalSpend > 0 ? totalRevenue / totalSpend : null;
    const cpa = totalConversions > 0 ? totalSpend / totalConversions : null;

    return {
      dateFrom,
      dateTo,
      totalSpend,
      totalRevenue,
      conversionValue: totalRevenue,
      roas,
      cpa,
      cpl: cpa,
      totalConversions,
      activeCampaigns: campaigns.filter((c) => c.status === 'ACTIVE').length,
      poorCampaigns: poorCount,
      profit: totalRevenue - totalSpend,
      source: 'AdsNormalizedService' as const,
    };
  }

  /**
   * @deprecated Google sync thật qua BullMQ (`enqueueGoogleSync`). Giữ method để tránh break import.
   */
  async syncGoogleStub(_organizationId: string): Promise<{
    synced: number;
    deprecated: true;
    message: string;
  }> {
    return {
      synced: 0,
      deprecated: true,
      message: 'Google Ads mock đã tắt. Dùng OAuth /ad-performance/google và POST sync (BullMQ).',
    };
  }

  private async ensurePlatformAccount(
    organizationId: string,
    userId: string,
    platform: AdPlatform,
    externalId: string,
    name: string,
  ) {
    const existing = await this.prisma.adPlatformAccount.findFirst({
      where: { organizationId, platform, externalId },
    });
    if (existing) {
      return this.prisma.adPlatformAccount.update({
        where: { id: existing.id },
        data: { name, isActive: true },
      });
    }
    return this.prisma.adPlatformAccount.create({
      data: {
        userId,
        organizationId,
        platform,
        externalId,
        name,
      },
    });
  }
}
