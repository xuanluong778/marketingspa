import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  aggregateDailyStatsToSnapshot,
  buildOptimizationExplanationPrompt,
  normalizeGoogleCustomerId,
  optimizationLlmExplanationSchema,
  optimizationMinimumDataGuardSchema,
  optimizationThresholdsSchema,
  runGoogleAdsOptimizationEngine,
  type OptimizationEngineResult,
  type SearchTermSnapshot,
} from '@marketingspa/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { OpenAiService } from '../openai/openai.service';
import { decimalToNumber } from './ads-efficiency.util';
import type { GoogleAdsOptimizationAnalyzeDto } from './dto/google-ads-optimization.dto';

/**
 * Google Ads Optimization Engine — deterministic analysis + proposals.
 * LLM chỉ explain; không quyết định action.
 */
@Injectable()
export class GoogleAdsOptimizationService {
  private readonly logger = new Logger(GoogleAdsOptimizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openAi: OpenAiService,
  ) {}

  async analyze(user: AuthUser, dto: GoogleAdsOptimizationAnalyzeDto): Promise<OptimizationEngineResult> {
    const customerId = normalizeGoogleCustomerId(dto.customerId);
    if (!customerId) throw new BadRequestException('Customer ID không hợp lệ');

    await this.assertCustomerOwned(user.organizationId, customerId);

    const dateTo = dto.dateTo ? new Date(dto.dateTo) : new Date();
    const dateFrom = dto.dateFrom
      ? new Date(dto.dateFrom)
      : new Date(dateTo.getTime() - 7 * 86400000);

    const account = await this.prisma.adAccount.findFirst({
      where: {
        organizationId: user.organizationId,
        platform: 'GOOGLE',
        externalId: customerId.replace(/-/g, ''),
      },
    });

    const campaigns = await this.prisma.adCampaign.findMany({
      where: {
        organizationId: user.organizationId,
        platform: 'GOOGLE',
        ...(account ? { adAccountId: account.id } : {}),
      },
      include: {
        dailyStats: {
          where: { date: { gte: dateFrom, lte: dateTo } },
        },
      },
      take: 100,
    });

    if (campaigns.length === 0) {
      const fallback = await this.loadFromAdManagerInsights(user.organizationId, dateFrom, dateTo, dto);
      return fallback;
    }

    const campaignSnapshots = campaigns.map((c) => {
      const rows = c.dailyStats.map((s) => ({
        date: s.date,
        spend: decimalToNumber(s.spend),
        impressions: s.impressions,
        clicks: s.clicks,
        conversions: decimalToNumber(s.conversions),
        leads: s.leads,
        conversionValue: decimalToNumber(s.conversionValue),
        ctr: s.ctr != null ? decimalToNumber(s.ctr) : null,
        cpc: s.cpc != null ? decimalToNumber(s.cpc) : null,
        cpa: s.cpa != null ? decimalToNumber(s.cpa) : null,
        roas: s.roas != null ? decimalToNumber(s.roas) : null,
      }));

      return aggregateDailyStatsToSnapshot({
        entityType: 'CAMPAIGN',
        entityId: c.id,
        entityName: c.name,
        externalId: c.externalId ?? undefined,
        status: c.status,
        budget: c.budget != null ? decimalToNumber(c.budget) : null,
        startedAt: c.startDate,
        rows,
      });
    });

    const keywords = await this.prisma.adKeyword.findMany({
      where: {
        organizationId: user.organizationId,
        adCampaignId: { in: campaigns.map((c) => c.id) },
      },
      take: 200,
    });

    const keywordSnapshots = keywords.map((kw) =>
      aggregateDailyStatsToSnapshot({
        entityType: 'KEYWORD',
        entityId: kw.id,
        entityName: kw.text,
        externalId: kw.externalId,
        campaignId: kw.adCampaignId,
        adGroupId: kw.adSetId,
        status: kw.status,
        rows: [],
      }),
    );

    const searchTermRows = await this.prisma.adSearchTermStat.findMany({
      where: {
        organizationId: user.organizationId,
        adCampaignId: { in: campaigns.map((c) => c.id) },
        date: { gte: dateFrom, lte: dateTo },
      },
      take: 500,
    });

    const termMap = new Map<string, SearchTermSnapshot>();
    for (const row of searchTermRows) {
      const key = `${row.adCampaignId}:${row.searchTerm}`;
      const prev = termMap.get(key) ?? {
        searchTerm: row.searchTerm,
        adCampaignId: row.adCampaignId,
        adSetId: row.adSetId,
        spend: 0,
        clicks: 0,
        impressions: 0,
        conversions: 0,
        ctr: 0,
        cpc: 0,
      };
      prev.spend += decimalToNumber(row.spend);
      prev.clicks += row.clicks;
      prev.impressions += row.impressions;
      prev.conversions += decimalToNumber(row.conversions);
      termMap.set(key, prev);
    }
    for (const t of termMap.values()) {
      t.ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0;
      t.cpc = t.clicks > 0 ? t.spend / t.clicks : 0;
    }

    const autopilotCfg = await this.prisma.googleAdsAutopilotConfig.findUnique({
      where: {
        organizationId_customerId: { organizationId: user.organizationId, customerId },
      },
    });

    return runGoogleAdsOptimizationEngine({
      customerId,
      guard: optimizationMinimumDataGuardSchema.parse({
        minClicks: dto.minClicks ?? 30,
        gracePeriodHours: dto.gracePeriodHours ?? autopilotCfg?.gracePeriodHours ?? 24,
      }),
      thresholds: optimizationThresholdsSchema.parse({
        targetCpa: dto.targetCpa ?? (autopilotCfg?.targetCpa ? decimalToNumber(autopilotCfg.targetCpa) : null),
        targetCpl: autopilotCfg?.targetCpl ? decimalToNumber(autopilotCfg.targetCpl) : null,
        targetRoas: dto.targetRoas ?? (autopilotCfg?.targetRoas ? decimalToNumber(autopilotCfg.targetRoas) : null),
      }),
      campaigns: campaignSnapshots,
      keywords: keywordSnapshots,
      searchTerms: [...termMap.values()],
    });
  }

  async explain(user: AuthUser, result: OptimizationEngineResult) {
    if (!this.openAi.isConfigured()) {
      return {
        configured: false,
        explanation: {
          summary: 'OpenAI chưa cấu hình — chỉ trả proposals deterministic.',
          proposalExplanations: result.proposals.map((_, i) => ({
            proposalIndex: i,
            explanation: result.proposals[i]?.reason ?? '',
            disclaimer: 'Quyết định cuối do rule engine + guardrail backend',
          })),
        },
      };
    }

    const { system, user: userPrompt } = buildOptimizationExplanationPrompt(result);
    const raw = await this.openAi.chatCompletion({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      maxTokens: 1200,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
    } catch {
      parsed = {
        summary: raw.slice(0, 500),
        proposalExplanations: result.proposals.map((p, i) => ({
          proposalIndex: i,
          explanation: p.reason,
          disclaimer: 'Quyết định cuối do rule engine + guardrail backend',
        })),
      };
    }

    return {
      configured: true,
      explanation: optimizationLlmExplanationSchema.parse(parsed),
    };
  }

  private async loadFromAdManagerInsights(
    organizationId: string,
    dateFrom: Date,
    dateTo: Date,
    dto: GoogleAdsOptimizationAnalyzeDto,
  ): Promise<OptimizationEngineResult> {
    const insights = await this.prisma.adInsight.findMany({
      where: {
        organizationId,
        platform: 'GOOGLE',
        dateFrom: { lte: dateTo },
        dateTo: { gte: dateFrom },
      },
      include: { campaign: true },
      take: 100,
    });

    if (insights.length === 0) {
      throw new NotFoundException('Chưa có dữ liệu Google Ads — sync trước khi optimize');
    }

    const campaignSnapshots = insights
      .filter((r) => r.campaign)
      .map((r) =>
        aggregateDailyStatsToSnapshot({
          entityType: 'CAMPAIGN',
          entityId: r.campaign!.id,
          entityName: r.campaignName,
          externalId: r.externalCampaignId,
          status: r.campaign!.status,
          budget: r.campaign!.budget != null ? decimalToNumber(r.campaign!.budget) : null,
          startedAt: r.campaign!.startDate,
          rows: [
            {
              date: r.dateTo,
              spend: decimalToNumber(r.spend),
              impressions: r.impressions,
              clicks: r.clicks,
              conversions: decimalToNumber(r.conversions),
              leads: decimalToNumber(r.leads),
              conversionValue: decimalToNumber(r.conversionValue),
              ctr: r.ctr != null ? decimalToNumber(r.ctr) : null,
              cpc: r.cpc != null ? decimalToNumber(r.cpc) : null,
              cpa: r.cpa != null ? decimalToNumber(r.cpa) : null,
              roas: r.roas != null ? decimalToNumber(r.roas) : null,
            },
          ],
        }),
      );

    return runGoogleAdsOptimizationEngine({
      customerId: dto.customerId,
      guard: optimizationMinimumDataGuardSchema.parse({
        minClicks: dto.minClicks ?? 30,
        gracePeriodHours: dto.gracePeriodHours ?? 24,
      }),
      thresholds: optimizationThresholdsSchema.parse({
        targetCpa: dto.targetCpa ?? null,
        targetRoas: dto.targetRoas ?? null,
      }),
      campaigns: campaignSnapshots,
    });
  }

  private async assertCustomerOwned(organizationId: string, customerId: string) {
    const account = await this.prisma.adGoogleAdsAccount.findFirst({
      where: { organizationId, customerId, isSelected: true },
    });
    if (!account) {
      throw new ForbiddenException('Tài khoản Google Ads không thuộc tenant hoặc chưa được chọn');
    }
    return account;
  }
}
