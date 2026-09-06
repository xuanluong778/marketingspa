import { Injectable } from '@nestjs/common';
import {
  LeadPipelineStatus,
  MarketingFunnelEventType,
  Prisma,
} from '@marketingspa/database';
import {
  avgHoursBetween,
  dropOffFromPrevious,
  FUNNEL_SAAS_STAGES,
  pctRate,
  resolveAttributionTouch,
  type FunnelSaaSStageKey,
  type FunnelTouchModel,
} from '@marketingspa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { LeadsService } from './leads.service';
import { AttributionDashboardService } from '../attribution/attribution-dashboard.service';
import type { FunnelAnalyticsQueryDto } from './dto/funnel.dto';
import { leadSourceCodesForPlatform } from '../common/utils/platform-lead-source.util';

type TrackingBucket = { value: string; leads: number };

@Injectable()
export class FunnelAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leadsService: LeadsService,
    private readonly attributionDashboard: AttributionDashboardService,
  ) {}

  async getAnalytics(organizationId: string, query: FunnelAnalyticsQueryDto) {
    const touchModel: FunnelTouchModel = query.touchModel === 'first' ? 'first' : 'last';
    const to = query.to ? new Date(query.to) : new Date();
    to.setHours(23, 59, 59, 999);
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    from.setHours(0, 0, 0, 0);

    const baseWhere = await this.buildLeadWhere(organizationId, query, from, to);
    const dateSlice = { gte: from, lte: to };
    const fromDate = from.toISOString().slice(0, 10);
    const toDate = to.toISOString().slice(0, 10);

    const [
      pipelineStats,
      attribution,
      totalLeads,
      mqlCount,
      sqlCount,
      bookingCount,
      purchasedCount,
      purchasedLeads,
      attributions,
    ] = await Promise.all([
      this.leadsService.getFunnelStats(organizationId, query),
      this.attributionDashboard.getDashboard(organizationId, {
        from: from.toISOString(),
        to: to.toISOString(),
        touchModel,
        adCampaignId: query.adCampaignId,
        adId: query.adId,
        branchId: query.branchId,
        employeeId: query.assignedToId,
        utmSource: query.utmSource,
        groupByAd: query.groupBy === 'ad',
      }),
      this.prisma.lead.count({ where: baseWhere }),
      this.prisma.lead.count({
        where: {
          ...baseWhere,
          OR: [
            { qualification: { in: ['MQL', 'SQL'] } },
            { mqlReachedAt: { not: null } },
          ],
        },
      }),
      this.prisma.lead.count({
        where: {
          ...baseWhere,
          OR: [{ qualification: 'SQL' }, { sqlReachedAt: { not: null } }],
        },
      }),
      this.prisma.lead.count({
        where: {
          ...baseWhere,
          pipelineStatus: {
            in: [
              LeadPipelineStatus.BOOKED,
              LeadPipelineStatus.CONFIRMED,
              LeadPipelineStatus.VISITED,
              LeadPipelineStatus.PURCHASED,
            ],
          },
        },
      }),
      this.prisma.lead.count({
        where: { ...baseWhere, pipelineStatus: LeadPipelineStatus.PURCHASED },
      }),
      this.prisma.lead.findMany({
        where: { ...baseWhere, pipelineStatus: LeadPipelineStatus.PURCHASED },
        select: { id: true, createdAt: true, convertedAt: true },
      }),
      this.prisma.leadAttribution.findMany({
        where: {
          organizationId,
          lead: baseWhere,
        },
        include: {
          adCampaign: { select: { id: true, name: true } },
        },
      }),
    ]);

    const purchasedIds = purchasedLeads.map((l) => l.id);
    const purchaseEvents = purchasedIds.length
      ? await this.prisma.marketingFunnelEvent.findMany({
          where: {
            organizationId,
            leadId: { in: purchasedIds },
            eventType: {
              in: [
                MarketingFunnelEventType.SERVICE_PURCHASED,
                MarketingFunnelEventType.PAYMENT_COMPLETED,
              ],
            },
            occurredAt: dateSlice,
          },
          select: { leadId: true, occurredAt: true },
          orderBy: { occurredAt: 'asc' },
        })
      : [];

    const firstPurchaseAt = new Map<string, Date>();
    for (const ev of purchaseEvents) {
      if (!ev.leadId || firstPurchaseAt.has(ev.leadId)) continue;
      firstPurchaseAt.set(ev.leadId, ev.occurredAt);
    }

    const conversionDiffs: number[] = [];
    for (const lead of purchasedLeads) {
      const end = firstPurchaseAt.get(lead.id) ?? lead.convertedAt ?? null;
      if (!end) continue;
      conversionDiffs.push(end.getTime() - lead.createdAt.getTime());
    }

    const stageCounts: Record<FunnelSaaSStageKey, number> = {
      LEAD: totalLeads,
      MQL: mqlCount,
      SQL: sqlCount,
      BOOKING: bookingCount,
      PURCHASED: purchasedCount,
    };

    const sharedFilters = {
      createdFrom: fromDate,
      createdTo: toDate,
      ...(query.leadSourceId && { leadSourceId: query.leadSourceId }),
      ...(query.assignedToId && { assignedToId: query.assignedToId }),
      ...(query.branchId && { branchId: query.branchId }),
      ...(query.funnelRecommendationId && { funnelRecommendationId: query.funnelRecommendationId }),
    };

    const funnelStages = FUNNEL_SAAS_STAGES.map((stage, idx) => {
      const count = stageCounts[stage.key];
      const previous = idx > 0 ? stageCounts[FUNNEL_SAAS_STAGES[idx - 1]!.key] : 0;
      let leadFilter: Record<string, string> = { ...sharedFilters };

      switch (stage.key) {
        case 'LEAD':
          break;
        case 'MQL':
          leadFilter = { ...sharedFilters, qualificationIn: 'MQL,SQL' };
          break;
        case 'SQL':
          leadFilter = { ...sharedFilters, qualification: 'SQL' };
          break;
        case 'BOOKING':
          leadFilter = {
            ...sharedFilters,
            pipelineStatusIn: 'BOOKED,CONFIRMED,VISITED,PURCHASED',
          };
          break;
        case 'PURCHASED':
          leadFilter = { ...sharedFilters, pipelineStatus: 'PURCHASED' };
          break;
      }

      return {
        key: stage.key,
        label: stage.label,
        count,
        dropOffFromPrevious: idx > 0 ? dropOffFromPrevious(count, previous) : null,
        conversionFromLead: pctRate(count, totalLeads),
        leadFilter,
      };
    });

    const revenue = attribution.totals.revenue;
    const spend = attribution.totals.spend;

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      touchModel,
      kpis: {
        leads: totalLeads,
        mql: mqlCount,
        sql: sqlCount,
        booking: bookingCount,
        purchased: purchasedCount,
        revenue,
        spend,
        conversionRate: pctRate(purchasedCount, totalLeads),
        cpl: attribution.totals.cpl,
        cac: attribution.totals.cac,
        roas: attribution.totals.roas,
        avgConversionTimeHours: avgHoursBetween(conversionDiffs),
      },
      funnelStages,
      pipeline: {
        totalLeads: pipelineStats.totalLeads,
        steps: pipelineStats.steps,
        conversions: pipelineStats.conversions,
        counts: pipelineStats.counts,
      },
      attribution: {
        totals: attribution.totals,
        rows: attribution.rows,
      },
      trackingBreakdown: this.buildTrackingBreakdown(attributions, touchModel),
    };
  }

  private buildTrackingBreakdown(
    attributions: Array<{
      leadId: string;
      channel?: string | null;
      utmSource?: string | null;
      utmMedium?: string | null;
      utmCampaign?: string | null;
      fbclid?: string | null;
      gclid?: string | null;
      adCampaignId?: string | null;
      adSetId?: string | null;
      adId?: string | null;
      landingPage?: string | null;
      referrer?: string | null;
      firstTouchJson?: unknown;
      lastTouchJson?: unknown;
      adCampaign?: { id: string; name: string } | null;
    }>,
    touchModel: FunnelTouchModel,
  ) {
    const bump = (map: Map<string, number>, value: string | null | undefined) => {
      if (!value?.trim()) return;
      map.set(value, (map.get(value) ?? 0) + 1);
    };

    const utmSources = new Map<string, number>();
    const utmCampaigns = new Map<string, number>();
    const landingPages = new Map<string, number>();
    const referrers = new Map<string, number>();
    const campaigns = new Map<string, { label: string; leads: number }>();
    const clickIds = { fbclid: 0, gclid: 0 };
    const adSets = new Map<string, number>();
    const ads = new Map<string, number>();

    for (const attr of attributions) {
      const touch = resolveAttributionTouch(attr, touchModel);
      bump(utmSources, touch.utmSource);
      bump(utmCampaigns, touch.utmCampaign);
      bump(landingPages, touch.landingPage);
      bump(referrers, touch.referrer);
      if (touch.fbclid) clickIds.fbclid += 1;
      if (touch.gclid) clickIds.gclid += 1;
      if (touch.adSetId) bump(adSets, touch.adSetId);
      if (touch.adId) bump(ads, touch.adId);

      const campaignKey = touch.adCampaignId ?? touch.externalCampaignId ?? 'unknown';
      const label =
        attr.adCampaign?.name ??
        touch.utmCampaign ??
        touch.externalCampaignId ??
        'Không xác định';
      const existing = campaigns.get(campaignKey);
      if (existing) existing.leads += 1;
      else campaigns.set(campaignKey, { label, leads: 1 });
    }

    const toSorted = (map: Map<string, number>): TrackingBucket[] =>
      [...map.entries()]
        .map(([value, leads]) => ({ value, leads }))
        .sort((a, b) => b.leads - a.leads)
        .slice(0, 15);

    return {
      utmSources: toSorted(utmSources),
      utmCampaigns: toSorted(utmCampaigns),
      landingPages: toSorted(landingPages),
      referrers: toSorted(referrers),
      adSets: toSorted(adSets),
      ads: toSorted(ads),
      campaigns: [...campaigns.entries()]
        .map(([campaignId, row]) => ({
          campaignId: campaignId === 'unknown' ? null : campaignId,
          label: row.label,
          leads: row.leads,
        }))
        .sort((a, b) => b.leads - a.leads)
        .slice(0, 15),
      clickIds,
      attributedLeads: attributions.length,
    };
  }

  private async buildLeadWhere(
    organizationId: string,
    query: FunnelAnalyticsQueryDto,
    from: Date,
    to: Date,
  ): Promise<Prisma.LeadWhereInput> {
    const baseWhere: Prisma.LeadWhereInput = {
      organizationId,
      createdAt: { gte: from, lte: to },
      ...(query.leadSourceId && { leadSourceId: query.leadSourceId }),
      ...(query.assignedToId && { assignedToId: query.assignedToId }),
      ...(query.branchId && { branchId: query.branchId }),
      ...(query.funnelRecommendationId && { funnelRecommendationId: query.funnelRecommendationId }),
    };

    if (query.adCampaignId) {
      const campaign = await this.prisma.adCampaign.findFirst({
        where: { id: query.adCampaignId, organizationId },
      });
      if (campaign) {
        const codes = leadSourceCodesForPlatform(campaign.platform);
        if (codes.length > 0) {
          const sources = await this.prisma.leadSource.findMany({
            where: { organizationId, code: { in: codes } },
            select: { id: true },
          });
          if (sources.length > 0) {
            baseWhere.leadSourceId = { in: sources.map((s) => s.id) };
          }
        }
      }
    }

    if (
      query.utmSource ||
      query.utmMedium ||
      query.utmCampaign ||
      query.adId ||
      query.adSetId ||
      query.fbclid ||
      query.gclid ||
      query.landingPage ||
      query.referrer
    ) {
      baseWhere.attribution = {
        ...(query.utmSource && { utmSource: query.utmSource }),
        ...(query.utmMedium && { utmMedium: query.utmMedium }),
        ...(query.utmCampaign && { utmCampaign: query.utmCampaign }),
        ...(query.adId && { adId: query.adId }),
        ...(query.adSetId && { adSetId: query.adSetId }),
        ...(query.fbclid && { fbclid: query.fbclid }),
        ...(query.gclid && { gclid: query.gclid }),
        ...(query.landingPage && { landingPage: { contains: query.landingPage } }),
        ...(query.referrer && { referrer: { contains: query.referrer } }),
      };
    }

    return baseWhere;
  }
}
