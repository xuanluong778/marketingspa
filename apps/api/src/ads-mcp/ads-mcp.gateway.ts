import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AdPlatform, Prisma } from '@marketingspa/database';
import {
  ADS_MCP_TOOLS,
  adsAiAnalysisOutputSchema,
  adsMcpAccountSchema,
  adsMcpCampaignSchema,
  adsMcpMetricsSummarySchema,
  adsMcpTrendsSchema,
  adsMcpWasteReportSchema,
  adsMcpWasteSignalSchema,
  type AdsMcpEvidence,
  type AdsMcpTenantContext,
  type AdsAiAnalysisOutput,
} from '@marketingspa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AdConnectionFacade } from '../ad-performance/ad-connection.facade';
import { AdsNormalizedService } from '../ad-performance/ads-normalized.service';
import { assertNoCredentialLeak, maskExternalId } from '../common/utils/token-security.util';
import { decimalToNumber } from '../ai-ads-manager/ads-efficiency.util';
import {
  computeEfficiencyScore,
  buildAiSuggestion,
  type CampaignMetrics,
} from '../ai-ads-manager/ads-efficiency.util';
import { assertMcpToolPermission } from './ads-mcp.context';
import {
  assertMcpDateRange,
  clampMcpLimit,
  pctChange,
  previousPeriod,
  withMcpTimeout,
} from './ads-mcp.limits';

/**
 * Internal Ads MCP Gateway.
 * - Không public Internet
 * - Không gọi Meta/Google API
 * - Chỉ query PostgreSQL theo organizationId
 * - Không trả token/secret
 */
@Injectable()
export class AdsMcpGateway {
  private readonly logger = new Logger(AdsMcpGateway.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: AdConnectionFacade,
    private readonly normalizedAds: AdsNormalizedService,
  ) {}

  /** Catalog nội bộ — không expose transport public. */
  describeTools() {
    return {
      public: false,
      internetFacing: false,
      providerApiAccess: false,
      tools: Object.values(ADS_MCP_TOOLS),
    };
  }

  async listAccounts(ctx: AdsMcpTenantContext) {
    assertMcpToolPermission(ctx, ADS_MCP_TOOLS.LIST_ACCOUNTS);
    return withMcpTimeout(this.runListAccounts(ctx), undefined, ADS_MCP_TOOLS.LIST_ACCOUNTS);
  }

  async listCampaigns(
    ctx: AdsMcpTenantContext,
    input: { dateFrom: string; dateTo: string; platform?: string; limit?: number },
  ) {
    assertMcpToolPermission(ctx, ADS_MCP_TOOLS.LIST_CAMPAIGNS);
    return withMcpTimeout(
      this.runListCampaigns(ctx, input),
      undefined,
      ADS_MCP_TOOLS.LIST_CAMPAIGNS,
    );
  }

  async getMetrics(
    ctx: AdsMcpTenantContext,
    input: { dateFrom: string; dateTo: string; platform?: string },
  ) {
    assertMcpToolPermission(ctx, ADS_MCP_TOOLS.GET_METRICS);
    return withMcpTimeout(this.runGetMetrics(ctx, input), undefined, ADS_MCP_TOOLS.GET_METRICS);
  }

  async getTrends(
    ctx: AdsMcpTenantContext,
    input: { dateFrom: string; dateTo: string; platform?: string; limit?: number },
  ) {
    assertMcpToolPermission(ctx, ADS_MCP_TOOLS.GET_TRENDS);
    return withMcpTimeout(this.runGetTrends(ctx, input), undefined, ADS_MCP_TOOLS.GET_TRENDS);
  }

  async getTopCampaigns(
    ctx: AdsMcpTenantContext,
    input: {
      dateFrom: string;
      dateTo: string;
      platform?: string;
      limit?: number;
      sortBy?: 'roas' | 'conversionValue' | 'efficiencyScore';
    },
  ) {
    assertMcpToolPermission(ctx, ADS_MCP_TOOLS.GET_TOP_CAMPAIGNS);
    return withMcpTimeout(
      this.runRankCampaigns(ctx, { ...input, mode: 'top' }),
      undefined,
      ADS_MCP_TOOLS.GET_TOP_CAMPAIGNS,
    );
  }

  async getPoorCampaigns(
    ctx: AdsMcpTenantContext,
    input: {
      dateFrom: string;
      dateTo: string;
      platform?: string;
      limit?: number;
    },
  ) {
    assertMcpToolPermission(ctx, ADS_MCP_TOOLS.GET_POOR_CAMPAIGNS);
    return withMcpTimeout(
      this.runRankCampaigns(ctx, { ...input, mode: 'poor', sortBy: 'efficiencyScore' }),
      undefined,
      ADS_MCP_TOOLS.GET_POOR_CAMPAIGNS,
    );
  }

  async detectBudgetWaste(
    ctx: AdsMcpTenantContext,
    input: { dateFrom: string; dateTo: string; platform?: string; limit?: number },
  ) {
    assertMcpToolPermission(ctx, ADS_MCP_TOOLS.DETECT_BUDGET_WASTE);
    return withMcpTimeout(
      this.runDetectWaste(ctx, input),
      undefined,
      ADS_MCP_TOOLS.DETECT_BUDGET_WASTE,
    );
  }

  async analyzeCampaign(
    ctx: AdsMcpTenantContext,
    input: { campaignId: string; dateFrom?: string; dateTo?: string },
  ): Promise<AdsAiAnalysisOutput> {
    assertMcpToolPermission(ctx, ADS_MCP_TOOLS.ANALYZE_CAMPAIGN);
    return withMcpTimeout(
      this.runAnalyzeCampaign(ctx, input),
      undefined,
      ADS_MCP_TOOLS.ANALYZE_CAMPAIGN,
    );
  }

  // ─── private runners (DB only) ─────────────────────────────────────────

  private async runListAccounts(ctx: AdsMcpTenantContext) {
    const [publicConns, platformAccounts] = await Promise.all([
      this.connections.listPublic(ctx.organizationId),
      this.prisma.adPlatformAccount.findMany({
        where: { organizationId: ctx.organizationId, isActive: true },
        take: 50,
      }),
    ]);

    const byPlatform = new Map(platformAccounts.map((a) => [a.platform as string, a]));

    const items = publicConns
      .filter((c) => c.provider === 'META' || c.provider === 'GOOGLE' || c.provider === 'GMAIL')
      .map((c) => {
        const acc =
          c.provider === 'META' || c.provider === 'GOOGLE' ? byPlatform.get(c.provider) : undefined;
        return adsMcpAccountSchema.parse({
          platform: c.provider,
          status: c.status,
          connected: c.connected,
          accountName: c.accountName,
          externalAccountId: c.externalAccountId ? maskExternalId(c.externalAccountId) : null,
          lastSyncAt: c.lastSyncAt ? c.lastSyncAt.toISOString() : null,
          lastError: c.lastError,
          currency: acc?.currency ?? null,
          timezone: acc?.timezone ?? null,
        });
      });

    const payload = { items, source: 'AdsMcpGateway' as const };
    assertNoCredentialLeak(payload);
    return payload;
  }

  private async runListCampaigns(
    ctx: AdsMcpTenantContext,
    input: { dateFrom: string; dateTo: string; platform?: string; limit?: number },
  ) {
    const range = assertMcpDateRange(input.dateFrom, input.dateTo);
    const limit = clampMcpLimit(input.limit);

    const result = await this.normalizedAds.listInsights(
      ctx.organizationId,
      range.dateFrom,
      range.dateTo,
      {
        platform: input.platform,
        page: 1,
        pageSize: limit,
      },
    );

    const items = result.items.map((row) => {
      const pub = this.normalizedAds.toPublicMetricsRow(row);
      return adsMcpCampaignSchema.parse({
        campaignId: pub.id,
        insightId: pub.insightId,
        platform: pub.platform,
        name: pub.name,
        status: pub.status,
        spend: pub.spend,
        impressions: pub.impressions,
        clicks: pub.clicks,
        conversions: pub.conversions,
        conversionValue: pub.conversionValue,
        ctr: pub.ctr,
        cpc: pub.cpc,
        cpm: pub.cpm,
        cpa: pub.cpa,
        roas: pub.roas,
        efficiencyScore: pub.efficiencyScore,
        currency: pub.currency,
        dateFrom: pub.dateFrom,
        dateTo: pub.dateTo,
      });
    });

    const payload = {
      total: result.total,
      limit,
      items,
      source: 'AdsMcpGateway' as const,
    };
    assertNoCredentialLeak(payload);
    return payload;
  }

  private async runGetMetrics(
    ctx: AdsMcpTenantContext,
    input: { dateFrom: string; dateTo: string; platform?: string },
  ) {
    const range = assertMcpDateRange(input.dateFrom, input.dateTo);
    const dash = await this.normalizedAds.getDashboard(
      ctx.organizationId,
      range.dateFrom,
      range.dateTo,
    );

    // Optional platform filter via insights aggregate
    let impressions = 0;
    let clicks = 0;
    if (input.platform) {
      const { items } = await this.normalizedAds.listInsights(
        ctx.organizationId,
        range.dateFrom,
        range.dateTo,
        { platform: input.platform, page: 1, pageSize: 50 },
      );
      for (const row of items) {
        impressions += row.impressions;
        clicks += row.clicks;
      }
    } else {
      const { items } = await this.normalizedAds.listInsights(
        ctx.organizationId,
        range.dateFrom,
        range.dateTo,
        { page: 1, pageSize: 50 },
      );
      for (const row of items) {
        impressions += row.impressions;
        clicks += row.clicks;
      }
    }

    const evidence: AdsMcpEvidence[] = [
      { metric: 'totalSpend', value: dash.totalSpend, unit: 'money' },
      { metric: 'conversionValue', value: dash.conversionValue, unit: 'money' },
      { metric: 'roas', value: dash.roas },
      { metric: 'cpa', value: dash.cpa, unit: 'money' },
      { metric: 'totalConversions', value: dash.totalConversions },
      { metric: 'impressions', value: impressions },
      { metric: 'clicks', value: clicks },
    ];

    const payload = adsMcpMetricsSummarySchema.parse({
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      organizationId: ctx.organizationId,
      totalSpend: dash.totalSpend,
      conversionValue: dash.conversionValue,
      totalConversions: dash.totalConversions,
      impressions,
      clicks,
      roas: dash.roas,
      cpa: dash.cpa,
      ctr: impressions > 0 ? (clicks * 100) / impressions : null,
      activeCampaigns: dash.activeCampaigns,
      poorCampaigns: dash.poorCampaigns,
      source: 'AdsMcpGateway',
      evidence,
    });
    assertNoCredentialLeak(payload);
    return payload;
  }

  private async runGetTrends(
    ctx: AdsMcpTenantContext,
    input: { dateFrom: string; dateTo: string; platform?: string; limit?: number },
  ) {
    const range = assertMcpDateRange(input.dateFrom, input.dateTo);
    const limit = clampMcpLimit(input.limit);
    const prev = previousPeriod(range.dateFrom, range.dateTo);

    const where: Prisma.AdDailyStatWhereInput = {
      organizationId: ctx.organizationId,
      date: {
        gte: new Date(range.dateFrom),
        lte: new Date(range.dateTo),
      },
      ...(input.platform
        ? {
            adCampaign: {
              platform: input.platform as AdPlatform,
            },
          }
        : {}),
    };

    const rows = await this.prisma.adDailyStat.findMany({
      where,
      orderBy: { date: 'asc' },
      take: 500,
      select: {
        date: true,
        spend: true,
        conversions: true,
        conversionValue: true,
        impressions: true,
        clicks: true,
        roas: true,
      },
    });

    const byDate = new Map<
      string,
      {
        spend: number;
        conversions: number;
        conversionValue: number;
        impressions: number;
        clicks: number;
      }
    >();

    for (const r of rows) {
      const key = r.date.toISOString().slice(0, 10);
      const cur = byDate.get(key) ?? {
        spend: 0,
        conversions: 0,
        conversionValue: 0,
        impressions: 0,
        clicks: 0,
      };
      cur.spend += decimalToNumber(r.spend);
      cur.conversions += decimalToNumber(r.conversions);
      cur.conversionValue += decimalToNumber(r.conversionValue);
      cur.impressions += r.impressions;
      cur.clicks += r.clicks;
      byDate.set(key, cur);
    }

    let points = [...byDate.entries()].map(([date, v]) => ({
      date,
      spend: v.spend,
      conversions: v.conversions,
      conversionValue: v.conversionValue,
      impressions: v.impressions,
      clicks: v.clicks,
      roas: v.spend > 0 ? v.conversionValue / v.spend : null,
    }));

    // Fallback: không có AdDailyStat → dùng AdInsight window (1 điểm)
    if (points.length === 0) {
      const metrics = await this.runGetMetrics(ctx, range);
      points = [
        {
          date: range.dateFrom,
          spend: metrics.totalSpend,
          conversions: metrics.totalConversions,
          conversionValue: metrics.conversionValue,
          impressions: metrics.impressions,
          clicks: metrics.clicks,
          roas: metrics.roas,
        },
      ];
    }

    points = points.slice(0, limit);

    const prevMetrics = await this.runGetMetrics(ctx, prev);
    const curSpend = points.reduce((s, p) => s + p.spend, 0);
    const curValue = points.reduce((s, p) => s + p.conversionValue, 0);
    const curRoas = curSpend > 0 ? curValue / curSpend : null;

    const evidence: AdsMcpEvidence[] = [
      {
        metric: 'spend',
        value: curSpend,
        compareTo: prevMetrics.totalSpend,
        note: 'so với kỳ trước',
      },
      {
        metric: 'conversionValue',
        value: curValue,
        compareTo: prevMetrics.conversionValue,
      },
      {
        metric: 'roas',
        value: curRoas,
        compareTo: prevMetrics.roas,
      },
    ];

    const payload = adsMcpTrendsSchema.parse({
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      organizationId: ctx.organizationId,
      points,
      previousPeriod: {
        dateFrom: prev.dateFrom,
        dateTo: prev.dateTo,
        totalSpend: prevMetrics.totalSpend,
        conversionValue: prevMetrics.conversionValue,
        roas: prevMetrics.roas,
      },
      deltas: {
        spendPct: pctChange(curSpend, prevMetrics.totalSpend),
        conversionValuePct: pctChange(curValue, prevMetrics.conversionValue),
        roasPct:
          curRoas != null && prevMetrics.roas != null ? pctChange(curRoas, prevMetrics.roas) : null,
      },
      evidence,
      source: 'AdsMcpGateway',
    });
    assertNoCredentialLeak(payload);
    return payload;
  }

  private async runRankCampaigns(
    ctx: AdsMcpTenantContext,
    input: {
      dateFrom: string;
      dateTo: string;
      platform?: string;
      limit?: number;
      mode: 'top' | 'poor';
      sortBy?: 'roas' | 'conversionValue' | 'efficiencyScore';
    },
  ) {
    const range = assertMcpDateRange(input.dateFrom, input.dateTo);
    const limit = clampMcpLimit(input.limit ?? 10);
    const listed = await this.runListCampaigns(ctx, {
      ...range,
      platform: input.platform,
      limit: 50,
    });

    const sortBy = input.sortBy ?? (input.mode === 'poor' ? 'efficiencyScore' : 'roas');
    const sorted = [...listed.items].sort((a, b) => {
      const av =
        sortBy === 'conversionValue'
          ? a.conversionValue
          : sortBy === 'efficiencyScore'
            ? (a.efficiencyScore ?? 0)
            : (a.roas ?? -1);
      const bv =
        sortBy === 'conversionValue'
          ? b.conversionValue
          : sortBy === 'efficiencyScore'
            ? (b.efficiencyScore ?? 0)
            : (b.roas ?? -1);
      return input.mode === 'poor' ? av - bv : bv - av;
    });

    const items =
      input.mode === 'poor'
        ? sorted
            .filter((c) => (c.efficiencyScore ?? 50) < 50 || (c.roas != null && c.roas < 1))
            .slice(0, limit)
        : sorted.slice(0, limit);

    const evidence: AdsMcpEvidence[] = items.slice(0, 5).map((c) => ({
      metric: sortBy,
      value:
        sortBy === 'conversionValue'
          ? c.conversionValue
          : sortBy === 'efficiencyScore'
            ? (c.efficiencyScore ?? null)
            : c.roas,
      note: c.name,
    }));

    const payload = {
      mode: input.mode,
      sortBy,
      items,
      evidence,
      source: 'AdsMcpGateway' as const,
    };
    assertNoCredentialLeak(payload);
    return payload;
  }

  private async runDetectWaste(
    ctx: AdsMcpTenantContext,
    input: { dateFrom: string; dateTo: string; platform?: string; limit?: number },
  ) {
    const range = assertMcpDateRange(input.dateFrom, input.dateTo);
    const limit = clampMcpLimit(input.limit ?? 20);
    const listed = await this.runListCampaigns(ctx, {
      ...range,
      platform: input.platform,
      limit: 50,
    });

    const signals = [];
    for (const c of listed.items) {
      if (c.spend >= 100_000 && c.conversions === 0) {
        signals.push(
          adsMcpWasteSignalSchema.parse({
            code: 'SPEND_NO_CONVERSION',
            severity: c.spend >= 500_000 ? 'high' : 'medium',
            campaignId: c.campaignId,
            campaignName: c.name,
            platform: c.platform,
            message: `Chi ${c.spend} nhưng 0 conversion`,
            evidence: [
              { metric: 'spend', value: c.spend, unit: 'money' },
              { metric: 'conversions', value: 0 },
            ],
            estimatedWasteSpend: c.spend,
          }),
        );
      }
      if (c.roas != null && c.roas < 1 && c.spend >= 50_000) {
        signals.push(
          adsMcpWasteSignalSchema.parse({
            code: 'LOW_ROAS',
            severity: c.roas < 0.5 ? 'high' : 'medium',
            campaignId: c.campaignId,
            campaignName: c.name,
            platform: c.platform,
            message: `ROAS ${c.roas.toFixed(2)} < 1`,
            evidence: [
              { metric: 'roas', value: c.roas },
              { metric: 'spend', value: c.spend, unit: 'money' },
              { metric: 'conversionValue', value: c.conversionValue, unit: 'money' },
            ],
            estimatedWasteSpend: Math.max(0, c.spend - c.conversionValue),
          }),
        );
      }
      if (c.cpa != null && c.cpa > 500_000 && c.conversions > 0) {
        signals.push(
          adsMcpWasteSignalSchema.parse({
            code: 'HIGH_CPA',
            severity: 'medium',
            campaignId: c.campaignId,
            campaignName: c.name,
            platform: c.platform,
            message: `CPA cao (${c.cpa})`,
            evidence: [
              { metric: 'cpa', value: c.cpa, unit: 'money' },
              { metric: 'conversions', value: c.conversions },
            ],
          }),
        );
      }
      if (c.cpm != null && c.cpm > 150_000 && c.ctr != null && c.ctr < 0.8 && c.spend >= 50_000) {
        signals.push(
          adsMcpWasteSignalSchema.parse({
            code: 'HIGH_CPM_LOW_CTR',
            severity: 'low',
            campaignId: c.campaignId,
            campaignName: c.name,
            platform: c.platform,
            message: `CPM cao + CTR thấp`,
            evidence: [
              { metric: 'cpm', value: c.cpm, unit: 'money' },
              { metric: 'ctr', value: c.ctr, unit: '%' },
            ],
          }),
        );
      }
      if ((c.efficiencyScore ?? 50) < 35 && c.spend >= 50_000) {
        signals.push(
          adsMcpWasteSignalSchema.parse({
            code: 'POOR_EFFICIENCY',
            severity: 'medium',
            campaignId: c.campaignId,
            campaignName: c.name,
            platform: c.platform,
            message: `efficiencyScore ${c.efficiencyScore}`,
            evidence: [
              { metric: 'efficiencyScore', value: c.efficiencyScore ?? null },
              { metric: 'spend', value: c.spend, unit: 'money' },
            ],
            estimatedWasteSpend: c.spend * 0.3,
          }),
        );
      }
    }

    const trimmed = signals.slice(0, limit);
    const totalEstimatedWaste = trimmed.reduce((s, x) => s + (x.estimatedWasteSpend ?? 0), 0);

    const payload = adsMcpWasteReportSchema.parse({
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      organizationId: ctx.organizationId,
      signals: trimmed,
      totalEstimatedWaste,
      evidence: [
        { metric: 'signalCount', value: trimmed.length },
        { metric: 'totalEstimatedWaste', value: totalEstimatedWaste, unit: 'money' },
      ],
      source: 'AdsMcpGateway',
    });
    assertNoCredentialLeak(payload);
    return payload;
  }

  private async runAnalyzeCampaign(
    ctx: AdsMcpTenantContext,
    input: { campaignId: string; dateFrom?: string; dateTo?: string },
  ): Promise<AdsAiAnalysisOutput> {
    const campaign = await this.prisma.adManagerCampaign.findFirst({
      where: { id: input.campaignId, organizationId: ctx.organizationId },
    });
    if (!campaign) throw new NotFoundException('Chiến dịch không tồn tại');

    const insight = await this.prisma.adInsight.findFirst({
      where: {
        organizationId: ctx.organizationId,
        campaignId: input.campaignId,
        ...(input.dateFrom && input.dateTo
          ? {
              dateFrom: new Date(input.dateFrom),
              dateTo: new Date(input.dateTo),
            }
          : {}),
      },
      orderBy: { syncedAt: 'desc' },
    });

    const metrics: CampaignMetrics = {
      spend: insight ? decimalToNumber(insight.spend) : 0,
      revenue: insight ? decimalToNumber(insight.conversionValue ?? insight.revenue) : 0,
      impressions: insight?.impressions ?? 0,
      clicks: insight?.clicks ?? 0,
      ctr: insight ? decimalToNumber(insight.ctr) : 0,
      cpc: insight ? decimalToNumber(insight.cpc) : 0,
      cpm: insight ? decimalToNumber(insight.cpm) : 0,
      conversions: insight ? decimalToNumber(insight.conversions) : 0,
      leads: insight ? decimalToNumber(insight.leads) : 0,
      cpa: insight ? decimalToNumber(insight.cpa) : 0,
      cpl: insight?.cpl != null ? decimalToNumber(insight.cpl) : null,
      roas: insight?.roas != null ? decimalToNumber(insight.roas) : null,
    };

    const score = computeEfficiencyScore(metrics);
    const suggestion = buildAiSuggestion(metrics, score);

    const dateFrom =
      input.dateFrom ??
      (insight?.dateFrom
        ? insight.dateFrom.toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10));
    const dateTo =
      input.dateTo ?? (insight?.dateTo ? insight.dateTo.toISOString().slice(0, 10) : dateFrom);

    let wasteSignals: ReturnType<typeof adsMcpWasteSignalSchema.parse>[] = [];
    try {
      const waste = await this.runDetectWaste(ctx, { dateFrom, dateTo, limit: 50 });
      wasteSignals = waste.signals.filter((s) => s.campaignId === input.campaignId);
    } catch (err) {
      this.logger.warn(`analyzeCampaign waste scan skipped: ${String(err)}`);
    }

    let verdict: AdsAiAnalysisOutput['verdict'] = 'hold';
    if (metrics.spend > 0 && metrics.conversions + metrics.leads === 0) verdict = 'pause';
    else if (metrics.roas != null && metrics.roas >= 3 && score >= 70) verdict = 'scale';
    else if (metrics.roas != null && metrics.roas < 1) verdict = 'optimize';
    else if (score < 40) verdict = 'investigate';
    else if (score >= 60) verdict = 'hold';
    else verdict = 'optimize';

    const evidence: AdsMcpEvidence[] = [
      { metric: 'spend', value: metrics.spend, unit: 'money' },
      { metric: 'conversionValue', value: metrics.revenue, unit: 'money' },
      { metric: 'conversions', value: metrics.conversions },
      { metric: 'roas', value: metrics.roas },
      { metric: 'cpa', value: metrics.cpa, unit: 'money' },
      { metric: 'ctr', value: metrics.ctr, unit: '%' },
      { metric: 'cpm', value: metrics.cpm, unit: 'money' },
      { metric: 'efficiencyScore', value: score },
      { metric: 'impressions', value: metrics.impressions },
      { metric: 'clicks', value: metrics.clicks },
    ];

    const output = adsAiAnalysisOutputSchema.parse({
      organizationId: ctx.organizationId,
      campaignId: input.campaignId,
      summary: suggestion,
      verdict,
      confidence: insight ? 0.75 : 0.4,
      efficiencyScore: score,
      recommendations: suggestion
        .split(/(?<=\.)\s+/)
        .filter(Boolean)
        .slice(0, 5),
      evidence,
      wasteSignals,
      source: 'AdsMcpGateway',
      generatedAt: new Date().toISOString(),
    });
    assertNoCredentialLeak(output);
    return output;
  }
}
