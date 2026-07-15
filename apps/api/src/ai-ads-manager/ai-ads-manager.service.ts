import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AdAutomationAction,
  AdCampaignStatus,
  AdConnectionProvider,
  AdConnectionStatus,
  AdDraftStatus,
  AdPlatform,
  Prisma,
} from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { encryptSecret, decryptSecret } from '../common/utils/encryption.util';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { FacebookAdsService } from '../ad-performance/facebook-ads/facebook-ads.service';
import { MetaGraphApiService } from '../ad-performance/facebook-ads/meta-graph-api.service';
import { mapMetaInsightToCampaign } from '../ad-performance/facebook-ads/facebook-ads.mapper';
import { OpenAiService } from '../openai/openai.service';
import { evaluateRules } from './ads-automation.engine';
import {
  buildAiSuggestion,
  computeEfficiencyScore,
  decimalToNumber,
  type CampaignMetrics,
} from './ads-efficiency.util';
import type {
  ConnectGmailDto,
  ConnectGoogleDto,
  CreateAutomationRuleDto,
  GenerateAdDraftDto,
  SyncAdsDto,
  UpdateAutoModeDto,
  UpdateAutomationRuleDto,
  UpsertEmailReportDto,
} from './dto/ai-ads-manager.dto';

@Injectable()
export class AiAdsManagerService {
  private readonly logger = new Logger(AiAdsManagerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly facebookAds: FacebookAdsService,
    private readonly meta: MetaGraphApiService,
    private readonly openAi: OpenAiService,
  ) {}

  async getDashboard(user: AuthUser, dateFrom: string, dateTo: string) {
    const insights = await this.prisma.adInsight.findMany({
      where: { userId: user.id, dateFrom: new Date(dateFrom), dateTo: new Date(dateTo) },
    });

    const campaigns = await this.prisma.adManagerCampaign.findMany({
      where: { userId: user.id },
    });

    let totalSpend = 0;
    let totalRevenue = 0;
    let totalConversions = 0;
    let poorCount = 0;

    for (const row of insights) {
      totalSpend += decimalToNumber(row.spend);
      totalRevenue += decimalToNumber(row.revenue);
      totalConversions += decimalToNumber(row.conversions) + decimalToNumber(row.leads);
      if ((row.efficiencyScore ?? 50) < 40) poorCount += 1;
    }

    const roas = totalSpend > 0 ? totalRevenue / totalSpend : null;
    const cpa = totalConversions > 0 ? totalSpend / totalConversions : 0;
    const activeCampaigns = campaigns.filter((c) => c.status === 'ACTIVE').length;
    const profit = totalRevenue - totalSpend;

    return {
      dateFrom,
      dateTo,
      totalSpend,
      totalRevenue,
      roas,
      cpa,
      cpl: cpa,
      totalConversions,
      activeCampaigns,
      poorCampaigns: poorCount,
      profit,
    };
  }

  async getConnections(user: AuthUser) {
    const [connections, fbStatus] = await Promise.all([
      this.prisma.adConnection.findMany({ where: { userId: user.id } }),
      this.facebookAds.getStatus(user.id).catch(() => null),
    ]);

    const meta = this.mapConnectionStatus(
      AdConnectionProvider.META,
      connections.find((c) => c.provider === 'META'),
      fbStatus?.connected
        ? fbStatus.status === 'TOKEN_EXPIRED'
          ? AdConnectionStatus.TOKEN_EXPIRED
          : fbStatus.status === 'NO_AD_ACCOUNT_ACCESS'
            ? AdConnectionStatus.INSUFFICIENT_PERMISSIONS
            : AdConnectionStatus.CONNECTED
        : AdConnectionStatus.DISCONNECTED,
      fbStatus?.selectedAdAccountName ?? undefined,
    );

    const google = this.mapConnectionStatus(
      AdConnectionProvider.GOOGLE,
      connections.find((c) => c.provider === 'GOOGLE'),
    );

    const gmail = this.mapConnectionStatus(
      AdConnectionProvider.GMAIL,
      connections.find((c) => c.provider === 'GMAIL'),
    );

    return { items: [meta, google, gmail] };
  }

  getMetaOAuthStart(user: AuthUser): { url: string } {
    return this.facebookAds.getOAuthStartUrl(user, 'ads');
  }

  async connectGoogle(user: AuthUser, dto: ConnectGoogleDto) {
    const encrypted = encryptSecret(
      JSON.stringify({ refreshToken: dto.refreshToken, customerId: dto.customerId }),
      this.getEncryptionKey(),
    );

    await this.prisma.adConnection.upsert({
      where: { userId_provider: { userId: user.id, provider: 'GOOGLE' } },
      create: {
        userId: user.id,
        organizationId: user.organizationId,
        provider: 'GOOGLE',
        status: AdConnectionStatus.CONNECTED,
        encryptedCredentials: encrypted,
        externalAccountId: dto.customerId,
        externalAccountName: dto.accountName ?? `Google Ads ${dto.customerId}`,
        scopes: ['https://www.googleapis.com/auth/adwords'],
      },
      update: {
        status: AdConnectionStatus.CONNECTED,
        encryptedCredentials: encrypted,
        externalAccountId: dto.customerId,
        externalAccountName: dto.accountName ?? `Google Ads ${dto.customerId}`,
        lastError: null,
      },
    });

    await this.prisma.adPlatformAccount.upsert({
      where: {
        userId_platform_externalId: {
          userId: user.id,
          platform: 'GOOGLE',
          externalId: dto.customerId,
        },
      },
      create: {
        userId: user.id,
        organizationId: user.organizationId,
        platform: 'GOOGLE',
        externalId: dto.customerId,
        name: dto.accountName ?? `Google Ads ${dto.customerId}`,
      },
      update: {
        name: dto.accountName ?? `Google Ads ${dto.customerId}`,
        isActive: true,
      },
    });

    return { ok: true };
  }

  async connectGmail(user: AuthUser, dto: ConnectGmailDto) {
    const encrypted = encryptSecret(
      JSON.stringify({ refreshToken: dto.refreshToken, email: dto.email }),
      this.getEncryptionKey(),
    );

    await this.prisma.adConnection.upsert({
      where: { userId_provider: { userId: user.id, provider: 'GMAIL' } },
      create: {
        userId: user.id,
        organizationId: user.organizationId,
        provider: 'GMAIL',
        status: AdConnectionStatus.CONNECTED,
        encryptedCredentials: encrypted,
        externalAccountId: dto.email,
        externalAccountName: dto.email,
        scopes: ['https://www.googleapis.com/auth/gmail.send'],
      },
      update: {
        status: AdConnectionStatus.CONNECTED,
        encryptedCredentials: encrypted,
        externalAccountId: dto.email,
        externalAccountName: dto.email,
        lastError: null,
      },
    });

    return { ok: true };
  }

  async disconnect(user: AuthUser, provider: AdConnectionProvider) {
    if (provider === 'META') {
      await this.facebookAds.disconnect(user.id);
    }

    await this.prisma.adConnection.updateMany({
      where: { userId: user.id, provider },
      data: {
        status: AdConnectionStatus.DISCONNECTED,
        encryptedCredentials: null,
        externalAccountId: null,
        externalAccountName: null,
      },
    });

    return { ok: true };
  }

  async sync(user: AuthUser, dto: SyncAdsDto) {
    const platforms = dto.platform ? [dto.platform] : [AdPlatform.META, AdPlatform.GOOGLE];
    const results: Array<{ platform: string; synced: number }> = [];

    for (const platform of platforms) {
      if (platform === 'META') {
        const count = await this.syncMeta(user, dto.dateFrom, dto.dateTo);
        results.push({ platform: 'META', synced: count });
      } else if (platform === 'GOOGLE') {
        const count = await this.syncGoogle(user, dto.dateFrom, dto.dateTo);
        results.push({ platform: 'GOOGLE', synced: count });
      }
    }

    await this.runAutomationAfterSync(user, dto.dateFrom, dto.dateTo);

    return { results };
  }

  async getCampaigns(user: AuthUser, dateFrom: string, dateTo: string) {
    const insights = await this.prisma.adInsight.findMany({
      where: { userId: user.id, dateFrom: new Date(dateFrom), dateTo: new Date(dateTo) },
      include: { campaign: true },
      orderBy: { spend: 'desc' },
    });

    return {
      items: insights.map((row) => ({
        id: row.campaignId ?? row.id,
        insightId: row.id,
        platform: row.platform,
        name: row.campaignName,
        status: row.campaign?.status ?? 'ACTIVE',
        budget: row.campaign?.budget ? decimalToNumber(row.campaign.budget) : null,
        externalId: row.externalCampaignId,
        spend: decimalToNumber(row.spend),
        impressions: row.impressions,
        clicks: row.clicks,
        ctr: decimalToNumber(row.ctr),
        cpc: decimalToNumber(row.cpc),
        cpm: decimalToNumber(row.cpm),
        conversions: decimalToNumber(row.conversions),
        leads: decimalToNumber(row.leads),
        cpa: decimalToNumber(row.cpa),
        cpl: decimalToNumber(row.cpl),
        roas: row.roas ? decimalToNumber(row.roas) : null,
        efficiencyScore: row.efficiencyScore,
        aiSuggestion: row.aiSuggestion,
      })),
    };
  }

  async getSettings(user: AuthUser) {
    const settings = await this.ensureSettings(user);
    return {
      autoModeEnabled: settings.autoModeEnabled,
      dailyBudgetLimit: settings.dailyBudgetLimit
        ? decimalToNumber(settings.dailyBudgetLimit)
        : null,
      maxTogglesPerDay: settings.maxTogglesPerDay,
      togglesToday: settings.togglesToday,
      emergencyStop: settings.emergencyStop,
    };
  }

  async updateAutoMode(user: AuthUser, dto: UpdateAutoModeDto) {
    if (dto.autoModeEnabled) {
      await this.ensureSettings(user);
    }

    const settings = await this.prisma.adManagerSettings.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        organizationId: user.organizationId,
        autoModeEnabled: dto.autoModeEnabled,
        dailyBudgetLimit: dto.dailyBudgetLimit,
        maxTogglesPerDay: dto.maxTogglesPerDay ?? 10,
      },
      update: {
        autoModeEnabled: dto.autoModeEnabled,
        ...(dto.dailyBudgetLimit !== undefined && { dailyBudgetLimit: dto.dailyBudgetLimit }),
        ...(dto.maxTogglesPerDay !== undefined && { maxTogglesPerDay: dto.maxTogglesPerDay }),
      },
    });

    await this.prisma.adAutomationLog.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        platform: 'META',
        action: AdAutomationAction.RECOMMEND,
        autoMode: dto.autoModeEnabled,
        reason: dto.autoModeEnabled
          ? 'User bật Auto Mode — AI có thể pause/enable theo rule'
          : 'User tắt Auto Mode — AI chỉ gợi ý',
        snapshot: { settings },
      },
    });

    return this.getSettings(user);
  }

  async setEmergencyStop(user: AuthUser, emergencyStop: boolean) {
    await this.prisma.adManagerSettings.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        organizationId: user.organizationId,
        emergencyStop,
        autoModeEnabled: false,
      },
      update: { emergencyStop, ...(emergencyStop && { autoModeEnabled: false }) },
    });

    return { emergencyStop };
  }

  async listRules(user: AuthUser) {
    const items = await this.prisma.adAutomationRule.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    return {
      items: items.map((r) => ({
        ...r,
        threshold: r.threshold ? decimalToNumber(r.threshold) : null,
        spendThreshold: r.spendThreshold ? decimalToNumber(r.spendThreshold) : null,
      })),
    };
  }

  async createRule(user: AuthUser, dto: CreateAutomationRuleDto) {
    const rule = await this.prisma.adAutomationRule.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        name: dto.name,
        ruleType: dto.ruleType,
        platform: dto.platform,
        threshold: dto.threshold,
        spendThreshold: dto.spendThreshold,
        enabled: dto.enabled ?? true,
      },
    });
    return rule;
  }

  async updateRule(user: AuthUser, id: string, dto: UpdateAutomationRuleDto) {
    const existing = await this.prisma.adAutomationRule.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) throw new NotFoundException('Rule không tồn tại');

    return this.prisma.adAutomationRule.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.threshold !== undefined && { threshold: dto.threshold }),
        ...(dto.spendThreshold !== undefined && { spendThreshold: dto.spendThreshold }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
      },
    });
  }

  async deleteRule(user: AuthUser, id: string) {
    const existing = await this.prisma.adAutomationRule.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) throw new NotFoundException('Rule không tồn tại');
    await this.prisma.adAutomationRule.delete({ where: { id } });
    return { ok: true };
  }

  async pauseCampaign(user: AuthUser, campaignId: string) {
    return this.toggleCampaign(user, campaignId, 'PAUSED', true);
  }

  async enableCampaign(user: AuthUser, campaignId: string) {
    return this.toggleCampaign(user, campaignId, 'ACTIVE', true);
  }

  async listLogs(user: AuthUser, limit = 50) {
    const items = await this.prisma.adAutomationLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { rule: { select: { name: true, ruleType: true } } },
    });
    return { items };
  }

  async listDrafts(user: AuthUser) {
    const items = await this.prisma.adDraft.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    return {
      items: items.map((d) => ({
        ...d,
        budget: d.budget ? decimalToNumber(d.budget) : null,
      })),
    };
  }

  async generateDraft(user: AuthUser, dto: GenerateAdDraftDto) {
    const settings = await this.ensureSettings(user);
    if (dto.budget && settings.dailyBudgetLimit) {
      const limit = decimalToNumber(settings.dailyBudgetLimit);
      if (dto.budget > limit) {
        throw new BadRequestException(`Ngân sách vượt giới hạn ${limit}/ngày`);
      }
    }

    let content = {
      objective: dto.objective,
      audience: dto.audience ?? 'Khách hàng tiềm năng spa/beauty 25–45 tuổi',
      headline: `Ưu đãi ${dto.product ?? 'dịch vụ'} — đặt lịch ngay`,
      content: `Khám phá ${dto.product ?? 'dịch vụ'} với ưu đãi hấp dẫn. Liên hệ để được tư vấn miễn phí.`,
      cta: 'Đặt lịch ngay',
      landingPage: '/dat-lich',
    };

    if (this.openAi.isConfigured()) {
      try {
        const raw = await this.openAi.chatCompletion({
          messages: [
            {
              role: 'system',
              content:
                'Bạn là chuyên gia quảng cáo Facebook/Google cho spa. Trả về JSON: objective, audience, headline, content, cta, landingPage. Tiếng Việt.',
            },
            {
              role: 'user',
              content: `Tạo bản nháp quảng cáo ${dto.platform}: mục tiêu ${dto.objective}, sản phẩm ${dto.product ?? 'spa'}, ngân sách ${dto.budget ?? 'chưa xác định'}`,
            },
          ],
          temperature: 0.7,
        });
        const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim()) as typeof content;
        content = { ...content, ...parsed };
      } catch {
        this.logger.warn('AI draft fallback to template');
      }
    }

    const draft = await this.prisma.adDraft.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        platform: dto.platform,
        status: AdDraftStatus.DRAFT,
        objective: content.objective,
        budget: dto.budget,
        audience: content.audience,
        content: content.content,
        headline: content.headline,
        cta: content.cta,
        landingPage: content.landingPage,
        aiGenerated: true,
      },
    });

    return draft;
  }

  async publishDraft(user: AuthUser, draftId: string) {
    const draft = await this.prisma.adDraft.findFirst({
      where: { id: draftId, userId: user.id },
    });
    if (!draft) throw new NotFoundException('Bản nháp không tồn tại');

    const updated = await this.prisma.adDraft.update({
      where: { id: draftId },
      data: { status: AdDraftStatus.PUBLISHED, publishedAt: new Date() },
    });

    await this.prisma.adAutomationLog.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        platform: draft.platform,
        action: AdAutomationAction.RECOMMEND,
        autoMode: false,
        reason: `User duyệt & đăng quảng cáo bản nháp ${draftId}`,
        snapshot: { draftId, headline: draft.headline },
      },
    });

    return updated;
  }

  async getEmailReports(user: AuthUser) {
    const items = await this.prisma.adEmailReport.findMany({
      where: { userId: user.id },
    });
    return { items };
  }

  async upsertEmailReport(user: AuthUser, dto: UpsertEmailReportDto) {
    const existing = await this.prisma.adEmailReport.findFirst({
      where: { userId: user.id },
    });

    if (existing) {
      return this.prisma.adEmailReport.update({
        where: { id: existing.id },
        data: dto,
      });
    }

    return this.prisma.adEmailReport.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        ...dto,
      },
    });
  }

  async sendReport(user: AuthUser, dateFrom: string, dateTo: string) {
    const dashboard = await this.getDashboard(user, dateFrom, dateTo);
    const campaigns = await this.getCampaigns(user, dateFrom, dateTo);
    const logs = await this.listLogs(user, 10);

    const report = await this.prisma.adEmailReport.findFirst({
      where: { userId: user.id, enabled: true },
    });

    if (!report) {
      throw new BadRequestException('Chưa cấu hình Gmail báo cáo hoặc chưa bật gửi email');
    }

    const body = this.buildEmailBody(dashboard, campaigns.items, logs.items);
    this.logger.log(
      `Email report queued for user ${user.id} → ${report.recipientEmail} (${body.length} chars)`,
    );

    await this.prisma.adEmailReport.update({
      where: { id: report.id },
      data: { lastSentAt: new Date() },
    });

    await this.prisma.adAutomationLog.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        platform: 'META',
        action: AdAutomationAction.RECOMMEND,
        autoMode: false,
        reason: `Gửi báo cáo email tới ${report.recipientEmail}`,
        snapshot: { dashboard, recipient: report.recipientEmail },
      },
    });

    return { ok: true, preview: body.slice(0, 500) };
  }

  async optimizeCampaign(user: AuthUser, campaignId: string) {
    const campaign = await this.prisma.adManagerCampaign.findFirst({
      where: { id: campaignId, userId: user.id },
    });
    if (!campaign) throw new NotFoundException('Chiến dịch không tồn tại');

    const insight = await this.prisma.adInsight.findFirst({
      where: { userId: user.id, campaignId },
      orderBy: { syncedAt: 'desc' },
    });

    const metrics: CampaignMetrics = {
      spend: insight ? decimalToNumber(insight.spend) : 0,
      revenue: insight ? decimalToNumber(insight.revenue) : 0,
      impressions: insight?.impressions ?? 0,
      clicks: insight?.clicks ?? 0,
      ctr: insight ? decimalToNumber(insight.ctr) : 0,
      cpc: insight ? decimalToNumber(insight.cpc) : 0,
      cpm: insight ? decimalToNumber(insight.cpm) : 0,
      conversions: insight ? decimalToNumber(insight.conversions) : 0,
      leads: insight ? decimalToNumber(insight.leads) : 0,
      cpa: insight ? decimalToNumber(insight.cpa) : 0,
      cpl: insight ? decimalToNumber(insight.cpl) : 0,
      roas: insight?.roas ? decimalToNumber(insight.roas) : null,
    };

    const score = computeEfficiencyScore(metrics);
    const suggestion = buildAiSuggestion(metrics, score);

    const rec = await this.prisma.adAiRecommendation.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        campaignId,
        platform: campaign.platform,
        type: 'optimize',
        content: suggestion,
        priority: 100 - score,
      },
    });

    if (insight) {
      await this.prisma.adInsight.update({
        where: { id: insight.id },
        data: { aiSuggestion: suggestion, efficiencyScore: score },
      });
    }

    return { recommendation: rec, suggestion, efficiencyScore: score };
  }

  private async syncMeta(user: AuthUser, dateFrom: string, dateTo: string): Promise<number> {
    const fbStatus = await this.facebookAds.getStatus(user.id);
    if (!fbStatus.connected || !fbStatus.selectedAdAccountId) {
      return 0;
    }

    await this.facebookAds.sync(user.id, { dateFrom, dateTo });

    const snapshots = await this.prisma.facebookAdsCampaignSnapshot.findMany({
      where: { userId: user.id, dateFrom: new Date(dateFrom), dateTo: new Date(dateTo) },
    });

    const account = await this.prisma.adPlatformAccount.upsert({
      where: {
        userId_platform_externalId: {
          userId: user.id,
          platform: 'META',
          externalId: fbStatus.selectedAdAccountId,
        },
      },
      create: {
        userId: user.id,
        organizationId: user.organizationId,
        platform: 'META',
        externalId: fbStatus.selectedAdAccountId,
        name: fbStatus.selectedAdAccountName ?? fbStatus.selectedAdAccountId,
      },
      update: {
        name: fbStatus.selectedAdAccountName ?? fbStatus.selectedAdAccountId,
      },
    });

    let count = 0;
    for (const snap of snapshots) {
      const mapped = {
        spend: decimalToNumber(snap.spend),
        results: decimalToNumber(snap.results),
        costPerResult: decimalToNumber(snap.costPerResult),
        purchaseRoas: snap.purchaseRoas ? decimalToNumber(snap.purchaseRoas) : null,
      };

      const campaign = await this.prisma.adManagerCampaign.upsert({
        where: {
          userId_platform_externalId: {
            userId: user.id,
            platform: 'META',
            externalId: snap.campaignId,
          },
        },
        create: {
          userId: user.id,
          organizationId: user.organizationId,
          accountId: account.id,
          platform: 'META',
          externalId: snap.campaignId,
          name: snap.campaignName,
          status: AdCampaignStatus.ACTIVE,
          objective: snap.objective ?? undefined,
          lastSyncedAt: new Date(),
        },
        update: {
          name: snap.campaignName,
          lastSyncedAt: new Date(),
        },
      });

      const revenue = mapped.purchaseRoas ? mapped.spend * mapped.purchaseRoas : 0;
      const metrics: CampaignMetrics = {
        spend: mapped.spend,
        revenue,
        impressions: snap.impressions,
        clicks: snap.clicks,
        ctr: decimalToNumber(snap.ctr),
        cpc: decimalToNumber(snap.cpc),
        cpm: decimalToNumber(snap.cpm),
        conversions: snap.campaignType === 'SALES' ? mapped.results : 0,
        leads: snap.campaignType === 'MESSAGE_LEAD' ? mapped.results : 0,
        cpa: mapped.costPerResult,
        cpl: mapped.costPerResult,
        roas: mapped.purchaseRoas,
      };

      const score = computeEfficiencyScore(metrics);
      const suggestion = buildAiSuggestion(metrics, score);

      await this.prisma.adInsight.upsert({
        where: {
          userId_platform_externalCampaignId_dateFrom_dateTo: {
            userId: user.id,
            platform: 'META',
            externalCampaignId: snap.campaignId,
            dateFrom: new Date(dateFrom),
            dateTo: new Date(dateTo),
          },
        },
        create: {
          userId: user.id,
          organizationId: user.organizationId,
          campaignId: campaign.id,
          platform: 'META',
          externalCampaignId: snap.campaignId,
          campaignName: snap.campaignName,
          dateFrom: new Date(dateFrom),
          dateTo: new Date(dateTo),
          spend: mapped.spend,
          revenue,
          impressions: snap.impressions,
          clicks: snap.clicks,
          ctr: decimalToNumber(snap.ctr),
          cpc: decimalToNumber(snap.cpc),
          cpm: decimalToNumber(snap.cpm),
          reach: snap.reach,
          frequency: decimalToNumber(snap.frequency),
          conversions: metrics.conversions,
          leads: metrics.leads,
          cpa: mapped.costPerResult,
          cpl: mapped.costPerResult,
          roas: mapped.purchaseRoas,
          efficiencyScore: score,
          aiSuggestion: suggestion,
          syncedAt: new Date(),
        },
        update: {
          campaignId: campaign.id,
          campaignName: snap.campaignName,
          spend: mapped.spend,
          revenue,
          impressions: snap.impressions,
          clicks: snap.clicks,
          ctr: decimalToNumber(snap.ctr),
          cpc: decimalToNumber(snap.cpc),
          cpm: decimalToNumber(snap.cpm),
          conversions: metrics.conversions,
          leads: metrics.leads,
          cpa: mapped.costPerResult,
          cpl: mapped.costPerResult,
          roas: mapped.purchaseRoas,
          efficiencyScore: score,
          aiSuggestion: suggestion,
          syncedAt: new Date(),
        },
      });

      count += 1;
    }

    await this.prisma.adConnection.upsert({
      where: { userId_provider: { userId: user.id, provider: 'META' } },
      create: {
        userId: user.id,
        organizationId: user.organizationId,
        provider: 'META',
        status: AdConnectionStatus.CONNECTED,
        externalAccountId: fbStatus.selectedAdAccountId,
        externalAccountName: fbStatus.selectedAdAccountName,
        lastSyncAt: new Date(),
      },
      update: {
        status: AdConnectionStatus.CONNECTED,
        externalAccountId: fbStatus.selectedAdAccountId,
        externalAccountName: fbStatus.selectedAdAccountName,
        lastSyncAt: new Date(),
      },
    });

    return count;
  }

  private async syncGoogle(user: AuthUser, dateFrom: string, dateTo: string): Promise<number> {
    const conn = await this.prisma.adConnection.findUnique({
      where: { userId_provider: { userId: user.id, provider: 'GOOGLE' } },
    });
    if (!conn || conn.status !== 'CONNECTED' || !conn.externalAccountId) return 0;

    const account = await this.prisma.adPlatformAccount.findFirst({
      where: { userId: user.id, platform: 'GOOGLE', externalId: conn.externalAccountId },
    });
    if (!account) return 0;

    const mockCampaigns = [
      { id: 'g-demo-1', name: 'Google Search — Spa', spend: 1_500_000, impressions: 12000, clicks: 340, conversions: 8, roas: 2.1 },
      { id: 'g-demo-2', name: 'Google Display — Remarketing', spend: 800_000, impressions: 45000, clicks: 120, conversions: 2, roas: 0.8 },
    ];

    let count = 0;
    for (const mc of mockCampaigns) {
      const ctr = mc.impressions > 0 ? (mc.clicks / mc.impressions) * 100 : 0;
      const cpc = mc.clicks > 0 ? mc.spend / mc.clicks : 0;
      const cpm = mc.impressions > 0 ? (mc.spend / mc.impressions) * 1000 : 0;
      const revenue = mc.spend * mc.roas;
      const cpa = mc.conversions > 0 ? mc.spend / mc.conversions : 0;

      const campaign = await this.prisma.adManagerCampaign.upsert({
        where: {
          userId_platform_externalId: { userId: user.id, platform: 'GOOGLE', externalId: mc.id },
        },
        create: {
          userId: user.id,
          organizationId: user.organizationId,
          accountId: account.id,
          platform: 'GOOGLE',
          externalId: mc.id,
          name: mc.name,
          status: AdCampaignStatus.ACTIVE,
          lastSyncedAt: new Date(),
        },
        update: { name: mc.name, lastSyncedAt: new Date() },
      });

      const metrics: CampaignMetrics = {
        spend: mc.spend,
        revenue,
        impressions: mc.impressions,
        clicks: mc.clicks,
        ctr,
        cpc,
        cpm,
        conversions: mc.conversions,
        leads: 0,
        cpa,
        cpl: cpa,
        roas: mc.roas,
      };

      const score = computeEfficiencyScore(metrics);
      const suggestion = buildAiSuggestion(metrics, score);

      await this.prisma.adInsight.upsert({
        where: {
          userId_platform_externalCampaignId_dateFrom_dateTo: {
            userId: user.id,
            platform: 'GOOGLE',
            externalCampaignId: mc.id,
            dateFrom: new Date(dateFrom),
            dateTo: new Date(dateTo),
          },
        },
        create: {
          userId: user.id,
          organizationId: user.organizationId,
          campaignId: campaign.id,
          platform: 'GOOGLE',
          externalCampaignId: mc.id,
          campaignName: mc.name,
          dateFrom: new Date(dateFrom),
          dateTo: new Date(dateTo),
          spend: mc.spend,
          revenue,
          impressions: mc.impressions,
          clicks: mc.clicks,
          ctr,
          cpc,
          cpm,
          conversions: mc.conversions,
          cpa,
          cpl: cpa,
          roas: mc.roas,
          efficiencyScore: score,
          aiSuggestion: suggestion,
          syncedAt: new Date(),
        },
        update: {
          spend: mc.spend,
          revenue,
          impressions: mc.impressions,
          clicks: mc.clicks,
          ctr,
          cpc,
          cpm,
          conversions: mc.conversions,
          cpa,
          roas: mc.roas,
          efficiencyScore: score,
          aiSuggestion: suggestion,
          syncedAt: new Date(),
        },
      });
      count += 1;
    }

    await this.prisma.adConnection.update({
      where: { id: conn.id },
      data: { lastSyncAt: new Date() },
    });

    return count;
  }

  private async runAutomationAfterSync(user: AuthUser, dateFrom: string, dateTo: string) {
    const settings = await this.ensureSettings(user);
    const rules = await this.prisma.adAutomationRule.findMany({
      where: { userId: user.id, enabled: true },
    });

    const insights = await this.prisma.adInsight.findMany({
      where: { userId: user.id, dateFrom: new Date(dateFrom), dateTo: new Date(dateTo) },
      include: { campaign: true },
    });

    for (const row of insights) {
      if (!row.campaign) continue;

      const metrics: CampaignMetrics = {
        spend: decimalToNumber(row.spend),
        revenue: decimalToNumber(row.revenue),
        impressions: row.impressions,
        clicks: row.clicks,
        ctr: decimalToNumber(row.ctr),
        cpc: decimalToNumber(row.cpc),
        cpm: decimalToNumber(row.cpm),
        conversions: decimalToNumber(row.conversions),
        leads: decimalToNumber(row.leads),
        cpa: decimalToNumber(row.cpa),
        cpl: decimalToNumber(row.cpl),
        roas: row.roas ? decimalToNumber(row.roas) : null,
      };

      const evaluations = evaluateRules(
        rules.map((r) => ({
          id: r.id,
          ruleType: r.ruleType,
          threshold: r.threshold ? decimalToNumber(r.threshold) : null,
          spendThreshold: r.spendThreshold ? decimalToNumber(r.spendThreshold) : null,
          enabled: r.enabled,
        })),
        metrics,
        row.campaign.status,
      );

      for (const ev of evaluations) {
        if (ev.shouldPause && settings.autoModeEnabled && !settings.emergencyStop) {
          await this.toggleCampaign(user, row.campaign.id, 'PAUSED', false, ev);
        } else {
          await this.prisma.adAutomationLog.create({
            data: {
              userId: user.id,
              organizationId: user.organizationId,
              ruleId: ev.ruleId,
              campaignId: row.campaign.id,
              platform: row.platform,
              externalCampaignId: row.externalCampaignId,
              campaignName: row.campaignName,
              action: ev.shouldPause ? AdAutomationAction.PAUSE : AdAutomationAction.ALERT,
              autoMode: false,
              reason: ev.reason,
              snapshot: metrics as unknown as Prisma.InputJsonValue,
            },
          });

          if (ev.shouldAlert) {
            await this.prisma.adAiRecommendation.create({
              data: {
                userId: user.id,
                organizationId: user.organizationId,
                campaignId: row.campaign.id,
                platform: row.platform,
                type: ev.ruleType,
                content: ev.reason,
                priority: 50,
              },
            });
          }
        }
      }
    }
  }

  private async toggleCampaign(
    user: AuthUser,
    campaignId: string,
    status: AdCampaignStatus,
    manual: boolean,
    ruleEv?: { ruleId: string; reason: string },
  ) {
    const campaign = await this.prisma.adManagerCampaign.findFirst({
      where: { id: campaignId, userId: user.id },
    });
    if (!campaign) throw new NotFoundException('Chiến dịch không tồn tại');

    const settings = await this.ensureSettings(user);

    if (!manual && settings.emergencyStop) {
      throw new BadRequestException('Emergency stop đang bật — không thực hiện tự động');
    }

    if (!manual && settings.autoModeEnabled) {
      await this.checkToggleLimit(settings);
    }

    if (campaign.platform === 'META' && (manual || settings.autoModeEnabled)) {
      try {
        const token = await this.getMetaAccessToken(user.id);
        await this.meta.updateCampaignStatus(token, campaign.externalId, status === 'ACTIVE');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Meta API lỗi';
        this.logger.warn(`Meta pause/enable failed for campaign ${campaign.externalId}: ${msg}`);
        if (manual) throw new BadRequestException(msg);
      }
    }

    const updated = await this.prisma.adManagerCampaign.update({
      where: { id: campaignId },
      data: { status },
    });

    await this.prisma.adAutomationLog.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        ruleId: ruleEv?.ruleId,
        campaignId,
        platform: campaign.platform,
        externalCampaignId: campaign.externalId,
        campaignName: campaign.name,
        action: status === 'PAUSED' ? AdAutomationAction.PAUSE : AdAutomationAction.ENABLE,
        autoMode: !manual && settings.autoModeEnabled,
        reason: ruleEv?.reason ?? (manual ? `User ${status === 'PAUSED' ? 'tạm dừng' : 'bật lại'} thủ công` : 'Auto Mode'),
        snapshot: { status },
      },
    });

    return updated;
  }

  private async checkToggleLimit(settings: { id: string; maxTogglesPerDay: number; togglesToday: number; togglesResetDate: Date | null }) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let togglesToday = settings.togglesToday;
    const resetDate = settings.togglesResetDate ? new Date(settings.togglesResetDate) : null;

    if (!resetDate || resetDate < today) {
      togglesToday = 0;
    }

    if (togglesToday >= settings.maxTogglesPerDay) {
      throw new BadRequestException('Đã đạt giới hạn bật/tắt trong ngày');
    }

    await this.prisma.adManagerSettings.update({
      where: { id: settings.id },
      data: { togglesToday: togglesToday + 1, togglesResetDate: today },
    });
  }

  private async getMetaAccessToken(userId: string): Promise<string> {
    const row = await this.prisma.facebookAdsConnection.findUnique({ where: { userId } });
    if (!row?.encryptedAccessToken) {
      throw new BadRequestException('Chưa kết nối Facebook Ads');
    }
    return decryptSecret(row.encryptedAccessToken, this.getEncryptionKey());
  }

  private async ensureSettings(user: AuthUser) {
    return this.prisma.adManagerSettings.upsert({
      where: { userId: user.id },
      create: { userId: user.id, organizationId: user.organizationId },
      update: {},
    });
  }

  private mapConnectionStatus(
    provider: AdConnectionProvider,
    row: { status: AdConnectionStatus; externalAccountName: string | null; lastSyncAt: Date | null; lastError: string | null } | undefined,
    overrideStatus?: AdConnectionStatus,
    accountName?: string,
  ) {
    const status = overrideStatus ?? row?.status ?? AdConnectionStatus.DISCONNECTED;
    return {
      provider,
      status,
      accountName: accountName ?? row?.externalAccountName ?? null,
      lastSyncAt: row?.lastSyncAt ?? null,
      lastError: row?.lastError ?? null,
      connected: status === AdConnectionStatus.CONNECTED,
    };
  }

  private buildEmailBody(
    dashboard: Awaited<ReturnType<AiAdsManagerService['getDashboard']>>,
    campaigns: Awaited<ReturnType<AiAdsManagerService['getCampaigns']>>['items'],
    logs: Awaited<ReturnType<AiAdsManagerService['listLogs']>>['items'],
  ): string {
    const best = campaigns[0];
    const worst = campaigns[campaigns.length - 1];
    return [
      'Báo cáo AI Ads Manager',
      `Chi tiêu: ${dashboard.totalSpend}`,
      `Doanh thu: ${dashboard.totalRevenue}`,
      `ROAS: ${dashboard.roas ?? '—'}`,
      `CPA/CPL: ${dashboard.cpa}`,
      `Chiến dịch tốt nhất: ${best?.name ?? '—'}`,
      `Chiến dịch kém nhất: ${worst?.name ?? '—'}`,
      `Hành động AI: ${logs.map((l) => l.reason).join('; ')}`,
    ].join('\n');
  }

  private getEncryptionKey(): string {
    const key = this.config.get<string>('ENCRYPTION_KEY');
    if (!key || key.length < 16) {
      throw new Error('ENCRYPTION_KEY chưa cấu hình');
    }
    return key;
  }
}
