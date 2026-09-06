import { Injectable } from '@nestjs/common';
import { Prisma } from '@marketingspa/database';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { MarketingContextCacheService } from './marketing-context-cache.service';
import { MarketingContextDatasourcesService } from './marketing-context-datasources.service';
import { redactMarketingContextSnapshot } from './marketing-context-redaction.util';
import type {
  ContextWindowDays,
  MarketingContextBottleneck,
  MarketingContextConfidence,
  MarketingContextInsight,
  MarketingContextMetrics,
  MarketingContextOpportunity,
  MarketingContextSnapshotPayload,
  MarketingContextSourceStatus,
  MarketingContextTimeRange,
  MarketingContextWindowSlice,
} from './marketing-context.types';
import { CONTEXT_ENGINE_WINDOWS } from './marketing-context.types';

const ENGINE_VERSION = 'v2';
const PRIMARY_WINDOW_DAYS: ContextWindowDays = 30;

@Injectable()
export class MarketingContextEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly datasources: MarketingContextDatasourcesService,
    private readonly cache: MarketingContextCacheService,
    private readonly audit: AuditService,
  ) {}

  defaultTimeRange(days: number = PRIMARY_WINDOW_DAYS): MarketingContextTimeRange {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  }

  async getContext(organizationId: string, options?: { refresh?: boolean; user?: AuthUser }) {
    if (!options?.refresh) {
      const cached = await this.cache.get(organizationId);
      if (cached) {
        return { snapshot: cached, fromCache: true, snapshotId: null };
      }
      const latest = await this.prisma.marketingContextSnapshot.findFirst({
        where: {
          organizationId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { createdAt: 'desc' },
      });
      if (latest) {
        const payload = this.rowToPayload(latest);
        await this.cache.set(organizationId, payload);
        return { snapshot: payload, fromCache: false, snapshotId: latest.id };
      }
    }
    return this.refreshContext(organizationId, options?.user);
  }

  async refreshContext(organizationId: string, user?: AuthUser) {
    const windows = await this.collectWindows(organizationId);
    const primary =
      windows.find((w) => w.days === PRIMARY_WINDOW_DAYS) ?? windows[windows.length - 1]!;
    const metrics = primary.metrics;
    const sources = primary.sources;
    const timeRange = primary.timeRange;

    const bottlenecks = this.detectBottlenecks(windows);
    const opportunities = this.detectOpportunities(windows);
    const insights = this.buildInsights(metrics, timeRange, sources, bottlenecks, opportunities).slice(
      0,
      8,
    );

    const payload: MarketingContextSnapshotPayload = {
      organizationId,
      generatedAt: new Date().toISOString(),
      timeRange,
      engineVersion: ENGINE_VERSION,
      metrics,
      insights,
      sources,
      windows,
      bottlenecks,
      opportunities,
    };

    const redacted = redactMarketingContextSnapshot(payload) as MarketingContextSnapshotPayload;
    const expiresAt = new Date(Date.now() + this.cache.getTtlSeconds() * 1000);

    const row = await this.prisma.marketingContextSnapshot.create({
      data: {
        organizationId,
        createdById: user?.id,
        timeRangeFrom: new Date(timeRange.from),
        timeRangeTo: new Date(timeRange.to),
        engineVersion: ENGINE_VERSION,
        metricsJson: redacted.metrics as unknown as Prisma.InputJsonValue,
        insightsJson: redacted.insights as unknown as Prisma.InputJsonValue,
        sourcesJson: redacted.sources as unknown as Prisma.InputJsonValue,
        snapshotJson: redacted as unknown as Prisma.InputJsonValue,
        expiresAt,
      },
    });

    await this.cache.set(organizationId, redacted);

    if (user) {
      await this.audit.log({
        organizationId,
        userId: user.id,
        action: 'marketing_context_snapshot_refresh',
        entityType: 'marketing_context_snapshot',
        entityId: row.id,
        metadata: {
          engineVersion: ENGINE_VERSION,
          insightCount: insights.length,
          bottleneckCount: bottlenecks.length,
          opportunityCount: opportunities.length,
          windows: windows.map((w) => w.days),
          sourceDomains: sources.map((s) => s.domain),
        },
      });
    }

    return { snapshot: redacted, fromCache: false, snapshotId: row.id };
  }

  private async collectWindows(organizationId: string): Promise<MarketingContextWindowSlice[]> {
    const slices = await Promise.all(
      CONTEXT_ENGINE_WINDOWS.map(async (days) => {
        const timeRange = this.defaultTimeRange(days);
        const datasourceResults = await this.datasources.collectAll(organizationId, timeRange);
        const metrics = this.buildMetrics(datasourceResults);
        const sources: MarketingContextSourceStatus[] = datasourceResults.map((r) => ({
          domain: r.domain,
          status: r.status,
          recordCount: r.recordCount,
          error: r.error,
        }));
        return { days, timeRange, metrics, sources };
      }),
    );
    return slices;
  }

  private rowToPayload(row: {
    organizationId: string;
    engineVersion: string;
    timeRangeFrom: Date;
    timeRangeTo: Date;
    metricsJson: unknown;
    insightsJson: unknown;
    sourcesJson: unknown;
    snapshotJson: unknown;
    createdAt: Date;
  }): MarketingContextSnapshotPayload {
    const fromSnapshot = row.snapshotJson as MarketingContextSnapshotPayload | null;
    if (fromSnapshot?.organizationId) {
      return fromSnapshot;
    }
    return {
      organizationId: row.organizationId,
      generatedAt: row.createdAt.toISOString(),
      timeRange: {
        from: row.timeRangeFrom.toISOString(),
        to: row.timeRangeTo.toISOString(),
      },
      engineVersion: row.engineVersion,
      metrics: row.metricsJson as MarketingContextMetrics,
      insights: row.insightsJson as MarketingContextInsight[],
      sources: row.sourcesJson as MarketingContextSourceStatus[],
    };
  }

  private buildMetrics(
    results: Awaited<ReturnType<MarketingContextDatasourcesService['collectAll']>>,
  ): MarketingContextMetrics {
    const byDomain = Object.fromEntries(results.map((r) => [r.domain, r]));

    const crm = byDomain['crm.leads']?.data as
      | { total: number; new?: number; hot: number; unassigned: number; noFollowUp: number }
      | undefined;
    const bookings = byDomain['bookings']?.data as
      | { total: number; upcoming: number; completed: number }
      | undefined;
    const revenue = byDomain['revenue']?.data as { total: number; currency: string } | undefined;
    const ads = byDomain['ads.adDailyStat']?.data as
      | {
          spend: number;
          impressions: number;
          clicks: number;
          leads?: number;
          ctr: number | null;
          cpc: number | null;
          cpl: number | null;
          roas: number | null;
        }
      | undefined;
    const adsAnomalies = byDomain['ads.anomalies']?.data as
      | { anomalousCampaigns: number; wastedSpend?: number }
      | undefined;
    const email = byDomain['email']?.data as
      | { campaigns: number; sent: number; openRate: number | null; clickRate: number | null }
      | undefined;
    const zalo = byDomain['zalo']?.data as { campaigns: number; sent: number } | undefined;
    const chatbot = byDomain['chatbot']?.data as
      | { bots: number; openConversations: number; leadsCaptured: number }
      | undefined;
    const funnel = byDomain['funnel']?.data as
      | { activeFunnels: number; pipelineStages: number; leadsInFunnel: number }
      | undefined;
    const campaigns = byDomain['campaigns']?.data as
      | { messagingActive: number; messagingSent: number; legacyCampaigns: number }
      | undefined;
    const content = byDomain['content']?.data as
      | { teleprompterSources: number; autoPostDrafts: number; autoPostPublished: number }
      | undefined;
    const automation = byDomain['automation']?.data as
      | { activeFlows: number; pausedFlows: number; logsSuccess: number; logsFailed: number }
      | undefined;
    const customer360 = byDomain['customer360']?.data as
      | { total: number; linkedIdentities: number; events?: number }
      | undefined;
    const repurchase = byDomain['customers.repurchase']?.data as
      | { repurchaseCandidates: number }
      | undefined;
    const businessEvents = byDomain['businessEvents']?.data as
      | { counts: Record<string, number> }
      | undefined;

    const leadTotal = crm?.total ?? null;
    const bookingTotal = bookings?.total ?? null;
    const leadToBookingRate =
      leadTotal && leadTotal > 0 && bookingTotal !== null
        ? Math.round((bookingTotal / leadTotal) * 1000) / 10
        : null;

    const m: MarketingContextMetrics = {
      leads: { total: null, new: null, hot: null, unassigned: null, noFollowUp: null },
      bookings: { total: null, upcoming: null, completed: null },
      conversion: { leadToBookingRate: null },
      revenue: { total: null, currency: 'VND' },
      ads: {
        spend: null,
        impressions: null,
        clicks: null,
        ctr: null,
        cpc: null,
        cpl: null,
        roas: null,
        leads: null,
        anomalousCampaigns: null,
      },
      email: { campaigns: null, sent: null, openRate: null, clickRate: null },
      zalo: { campaigns: null, sent: null },
      chatbot: { bots: null, openConversations: null, leadsCaptured: null },
      funnel: { activeFunnels: null, pipelineStages: null, leadsInFunnel: null },
      campaigns: { messagingActive: null, messagingSent: null, legacyCampaigns: null },
      content: { teleprompterSources: null, autoPostDrafts: null, autoPostPublished: null },
      automation: { activeFlows: null, pausedFlows: null, logsSuccess: null, logsFailed: null },
      customers: { total: null, linkedIdentities: null, repurchaseCandidates: null },
      businessEvents: { counts: {} },
    };

    if (byDomain['crm.leads']?.status === 'OK' && crm) {
      m.leads = {
        total: crm.total,
        new: crm.new ?? null,
        hot: crm.hot,
        unassigned: crm.unassigned,
        noFollowUp: crm.noFollowUp,
      };
    }
    if (byDomain['bookings']?.status === 'OK' && bookings) {
      m.bookings = {
        total: bookings.total,
        upcoming: bookings.upcoming,
        completed: bookings.completed,
      };
    }
    m.conversion.leadToBookingRate = leadToBookingRate;

    if (byDomain['revenue']?.status === 'OK' && revenue) {
      m.revenue = { total: revenue.total, currency: revenue.currency };
    }
    if (byDomain['ads.adDailyStat']?.status === 'OK' && ads) {
      const adsLeads = ads.leads ?? null;
      const crmLeads = m.leads.total;
      const spend = ads.spend;
      let cpl = ads.cpl;
      if ((cpl == null || cpl <= 0) && spend != null && spend > 0) {
        const leadCount =
          adsLeads != null && adsLeads > 0
            ? adsLeads
            : crmLeads != null && crmLeads > 0
              ? crmLeads
              : null;
        if (leadCount != null && leadCount > 0) cpl = spend / leadCount;
      }
      m.ads = {
        spend: ads.spend,
        impressions: ads.impressions,
        clicks: ads.clicks,
        ctr: ads.ctr,
        cpc: ads.cpc,
        cpl,
        roas: ads.roas,
        leads: adsLeads,
        anomalousCampaigns: adsAnomalies?.anomalousCampaigns ?? null,
      };
    }
    if (byDomain['ads.anomalies']?.status === 'OK' && adsAnomalies) {
      m.ads.anomalousCampaigns = adsAnomalies.anomalousCampaigns;
    }
    if (byDomain['email']?.status === 'OK' && email) {
      m.email = {
        campaigns: email.campaigns,
        sent: email.sent,
        openRate: email.openRate,
        clickRate: email.clickRate,
      };
    }
    if (byDomain['chatbot']?.status === 'OK' && chatbot) {
      m.chatbot = {
        bots: chatbot.bots,
        openConversations: chatbot.openConversations,
        leadsCaptured: chatbot.leadsCaptured,
      };
    }
    if (byDomain['funnel']?.status === 'OK' && funnel) {
      m.funnel = {
        activeFunnels: funnel.activeFunnels,
        pipelineStages: funnel.pipelineStages,
        leadsInFunnel: funnel.leadsInFunnel,
      };
    }
    if (byDomain['campaigns']?.status === 'OK' && campaigns) {
      m.campaigns = {
        messagingActive: campaigns.messagingActive,
        messagingSent: campaigns.messagingSent,
        legacyCampaigns: campaigns.legacyCampaigns,
      };
    }
    if (byDomain['content']?.status === 'OK' && content) {
      m.content = {
        teleprompterSources: content.teleprompterSources,
        autoPostDrafts: content.autoPostDrafts,
        autoPostPublished: content.autoPostPublished,
      };
    }
    if (byDomain['automation']?.status === 'OK' && automation) {
      m.automation = {
        activeFlows: automation.activeFlows,
        pausedFlows: automation.pausedFlows,
        logsSuccess: automation.logsSuccess,
        logsFailed: automation.logsFailed,
      };
    }
    if (byDomain['zalo']?.status === 'OK' && zalo) {
      m.zalo = { campaigns: zalo.campaigns, sent: zalo.sent };
    }
    if (byDomain['customer360']?.status === 'OK' && customer360) {
      m.customers.total = customer360.total;
      m.customers.linkedIdentities = customer360.linkedIdentities;
    }
    if (byDomain['customers.repurchase']?.status === 'OK' && repurchase) {
      m.customers.repurchaseCandidates = repurchase.repurchaseCandidates;
    }
    if (byDomain['businessEvents']?.status === 'OK' && businessEvents) {
      m.businessEvents = { counts: businessEvents.counts ?? {} };
    }

    return m;
  }

  private detectBottlenecks(windows: MarketingContextWindowSlice[]): MarketingContextBottleneck[] {
    const out: MarketingContextBottleneck[] = [];
    const w30 = windows.find((w) => w.days === 30) ?? windows[0];
    if (!w30) return out;
    const m = w30.metrics;
    const days = w30.days;

    const total = m.leads.total ?? 0;
    const noFollowUp = m.leads.noFollowUp ?? 0;
    if (noFollowUp > 0 && (total === 0 || noFollowUp / Math.max(total, 1) >= 0.2)) {
      out.push({
        id: randomUUID(),
        kind: 'crm_followup',
        title: 'Lead follow-up bottleneck',
        summary: `${noFollowUp} lead chưa follow-up / SLA breach trong ${days} ngày.`,
        evidence: `leads.noFollowUp=${noFollowUp}; leads.total=${total}; window=${days}d`,
        severity: noFollowUp / Math.max(total, 1) >= 0.4 ? 'HIGH' : 'MEDIUM',
        windowDays: days,
        confidence: total >= 10 ? 'HIGH' : 'MEDIUM',
      });
    }

    const rate = m.conversion.leadToBookingRate;
    if (rate != null && rate > 0 && rate < 15 && total >= 5) {
      out.push({
        id: randomUUID(),
        kind: 'conversion',
        title: 'Conversion lead → booking thấp',
        summary: `Lead-to-booking ${rate}% trong ${days} ngày.`,
        evidence: `leadToBookingRate=${rate}; bookings=${m.bookings.total}; leads=${total}`,
        severity: rate < 8 ? 'HIGH' : 'MEDIUM',
        windowDays: days,
        confidence: total >= 20 ? 'HIGH' : 'MEDIUM',
      });
    }

    if ((m.funnel.activeFunnels ?? 0) === 0 && total > 5) {
      out.push({
        id: randomUUID(),
        kind: 'funnel',
        title: 'Chưa có funnel đang chạy',
        summary: 'Có lead nhưng không có active funnel để nuôi dưỡng.',
        evidence: `funnel.activeFunnels=0; leads.total=${total}`,
        severity: 'HIGH',
        windowDays: days,
        confidence: 'HIGH',
      });
    }

    if (m.ads.spend != null && m.ads.spend > 0 && m.ads.roas != null && m.ads.roas < 1) {
      out.push({
        id: randomUUID(),
        kind: 'ads_efficiency',
        title: 'Ads ROAS dưới hòa vốn',
        summary: `ROAS ${m.ads.roas.toFixed(2)} với spend ${Math.round(m.ads.spend).toLocaleString('vi-VN')} VND.`,
        evidence: `ads.roas=${m.ads.roas}; ads.spend=${m.ads.spend}; ads.cpl=${m.ads.cpl}`,
        severity: 'HIGH',
        windowDays: days,
        confidence: 'HIGH',
      });
    }

    if ((m.ads.anomalousCampaigns ?? 0) > 0) {
      out.push({
        id: randomUUID(),
        kind: 'ads_efficiency',
        title: 'Campaign ads bất thường',
        summary: `${m.ads.anomalousCampaigns} chiến dịch spend>0 nhưng 0 lead / CPL lệch median.`,
        evidence: `ads.anomalousCampaigns=${m.ads.anomalousCampaigns}; ads.spend=${m.ads.spend}`,
        severity: 'HIGH',
        windowDays: days,
        confidence: 'HIGH',
      });
    }

    if ((m.automation.logsFailed ?? 0) > (m.automation.logsSuccess ?? 0) && (m.automation.logsFailed ?? 0) > 0) {
      out.push({
        id: randomUUID(),
        kind: 'automation',
        title: 'Automation thất bại nhiều hơn thành công',
        summary: `Failed ${m.automation.logsFailed} vs success ${m.automation.logsSuccess}.`,
        evidence: `logsFailed=${m.automation.logsFailed}; logsSuccess=${m.automation.logsSuccess}`,
        severity: 'MEDIUM',
        windowDays: days,
        confidence: 'MEDIUM',
      });
    }

    if (m.email.sent != null && m.email.sent >= 50 && m.email.openRate != null && m.email.openRate < 15) {
      out.push({
        id: randomUUID(),
        kind: 'email',
        title: 'Email open rate thấp',
        summary: `Open rate ${m.email.openRate.toFixed(1)}% trên ${m.email.sent} email.`,
        evidence: `email.openRate=${m.email.openRate}; email.sent=${m.email.sent}`,
        severity: 'MEDIUM',
        windowDays: days,
        confidence: 'HIGH',
      });
    }

    return out.slice(0, 6);
  }

  private detectOpportunities(windows: MarketingContextWindowSlice[]): MarketingContextOpportunity[] {
    const out: MarketingContextOpportunity[] = [];
    const w30 = windows.find((w) => w.days === 30);
    const w7 = windows.find((w) => w.days === 7);
    const w90 = windows.find((w) => w.days === 90);
    if (!w30) return out;
    const m = w30.metrics;

    if ((m.leads.hot ?? 0) > 0) {
      out.push({
        id: randomUUID(),
        kind: 'hot_leads',
        title: 'Lead nóng sẵn sàng chốt',
        summary: `${m.leads.hot} lead MQL/SQL/score cao trong 30 ngày.`,
        evidence: `leads.hot=${m.leads.hot}; leads.total=${m.leads.total}`,
        windowDays: 30,
        confidence: 'HIGH',
      });
    }

    if ((m.content.teleprompterSources ?? 0) < 3 && (m.leads.total ?? 0) > 0) {
      out.push({
        id: randomUUID(),
        kind: 'content',
        title: 'Thiếu content nurture — cơ hội bổ sung',
        summary: 'Ít hơn 3 teleprompter sources trong khi đã có lead.',
        evidence: `content.teleprompterSources=${m.content.teleprompterSources}`,
        windowDays: 30,
        confidence: 'MEDIUM',
      });
    }

    if ((m.chatbot.leadsCaptured ?? 0) > 0) {
      out.push({
        id: randomUUID(),
        kind: 'chatbot',
        title: 'Chatbot đang thu lead hiệu quả',
        summary: `${m.chatbot.leadsCaptured} lead từ chatbot — có thể mở rộng script.`,
        evidence: `chatbot.leadsCaptured=${m.chatbot.leadsCaptured}`,
        windowDays: 30,
        confidence: 'MEDIUM',
      });
    }

    if ((m.customers.repurchaseCandidates ?? 0) > 0) {
      out.push({
        id: randomUUID(),
        kind: 'repurchase',
        title: 'Khách có khả năng mua lại',
        summary: `${m.customers.repurchaseCandidates} khách đã trả tiền 30–90 ngày trước, chưa có lịch gần đây.`,
        evidence: `customers.repurchaseCandidates=${m.customers.repurchaseCandidates}`,
        windowDays: 30,
        confidence: 'MEDIUM',
      });
    }

    const rev30 = m.revenue.total ?? 0;
    const rev90 = w90?.metrics.revenue.total ?? null;
    if (rev30 > 0 && rev90 != null && rev90 > 0 && rev30 * 3 > rev90 * 1.2) {
      out.push({
        id: randomUUID(),
        kind: 'revenue_growth',
        title: 'Doanh thu 30 ngày đang tăng tốc so với 90 ngày',
        summary: 'Tốc độ revenue gần đây cao hơn baseline 90 ngày.',
        evidence: `revenue.30d=${rev30}; revenue.90d=${rev90}`,
        windowDays: 30,
        confidence: 'MEDIUM',
      });
    }

    const leads7 = w7?.metrics.leads.total ?? 0;
    const leads30 = m.leads.total ?? 0;
    if (leads7 > 0 && leads30 > 0 && leads7 / Math.max(leads30, 1) >= 0.45) {
      out.push({
        id: randomUUID(),
        kind: 'remarketing',
        title: 'Lead mới tập trung 7 ngày gần đây',
        summary: 'Cơ hội nurture/remarketing nhanh cho cohort mới.',
        evidence: `leads.7d=${leads7}; leads.30d=${leads30}`,
        windowDays: 7,
        confidence: 'MEDIUM',
      });
    }

    return out.slice(0, 6);
  }

  private buildInsights(
    metrics: MarketingContextMetrics,
    timeRange: MarketingContextTimeRange,
    sources: MarketingContextSourceStatus[],
    bottlenecks: MarketingContextBottleneck[],
    opportunities: MarketingContextOpportunity[],
  ): MarketingContextInsight[] {
    const insights: MarketingContextInsight[] = [];
    const push = (
      category: string,
      title: string,
      summary: string,
      evidence: string,
      source: string,
      confidence: MarketingContextConfidence,
    ) => {
      insights.push({
        id: randomUUID(),
        category,
        title,
        summary,
        evidence,
        source,
        timeRange,
        confidence,
      });
    };

    for (const b of bottlenecks) {
      push('bottleneck', b.title, b.summary, b.evidence, `context-v2.${b.kind}`, b.confidence);
    }
    for (const o of opportunities) {
      push('opportunity', o.title, o.summary, o.evidence, `context-v2.${o.kind}`, o.confidence);
    }

    const crmSource = sources.find((s) => s.domain === 'crm.leads');
    if (crmSource?.status === 'INSUFFICIENT_DATA') {
      push(
        'crm',
        'Chưa đủ dữ liệu CRM/Lead',
        'Không có lead trong khoảng thời gian phân tích.',
        'lead.count=0 trong timeRange',
        'crm.leads',
        'INSUFFICIENT_DATA',
      );
    }

    const adsSource = sources.find((s) => s.domain === 'ads.adDailyStat');
    if (adsSource?.status === 'INSUFFICIENT_DATA') {
      push(
        'ads',
        'Chưa đủ dữ liệu Ads',
        'Không có adDailyStat trong khoảng thời gian phân tích.',
        'adDailyStat.count=0',
        'ads.adDailyStat',
        'INSUFFICIENT_DATA',
      );
    } else if (metrics.ads.spend != null && metrics.ads.spend > 0) {
      push(
        'ads',
        'Chi phí Ads & hiệu quả',
        `Spend ${Math.round(metrics.ads.spend).toLocaleString('vi-VN')} VND` +
          (metrics.ads.roas !== null ? `, ROAS ${metrics.ads.roas.toFixed(2)}` : '') +
          (metrics.ads.cpl !== null ? `, CPL ${Math.round(metrics.ads.cpl).toLocaleString('vi-VN')}` : ''),
        `spend=${metrics.ads.spend}, ctr=${metrics.ads.ctr}, cpc=${metrics.ads.cpc}, roas=${metrics.ads.roas}`,
        'ads.adDailyStat',
        'HIGH',
      );
    }

    if (
      metrics.conversion.leadToBookingRate !== null &&
      metrics.leads.total !== null &&
      metrics.leads.total >= 5
    ) {
      push(
        'conversion',
        'Tỷ lệ Lead → Booking',
        `Lead-to-booking ${metrics.conversion.leadToBookingRate}% (${metrics.bookings.total ?? 0}/${metrics.leads.total} lead).`,
        `bookings=${metrics.bookings.total}, leads=${metrics.leads.total}`,
        'bookings+crm.leads',
        metrics.leads.total >= 20 ? 'HIGH' : 'MEDIUM',
      );
    }

    return insights.sort((a, b) => {
      const rank = (c: MarketingContextConfidence) =>
        c === 'HIGH' ? 3 : c === 'MEDIUM' ? 2 : c === 'LOW' ? 1 : 0;
      return rank(b.confidence) - rank(a.confidence);
    });
  }
}
