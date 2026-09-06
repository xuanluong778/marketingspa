import { z } from 'zod';

/** Entity levels supported by the optimization engine. */
export const optimizationEntityTypeSchema = z.enum([
  'CAMPAIGN',
  'AD_GROUP',
  'KEYWORD',
  'AD',
  'SEARCH_TERM',
  'ACCOUNT',
]);

export const optimizationActionTypeSchema = z.enum([
  'INCREASE_BUDGET',
  'DECREASE_BUDGET',
  'PAUSE_CAMPAIGN',
  'ENABLE_CAMPAIGN',
  'PAUSE_KEYWORD',
  'ENABLE_KEYWORD',
  'ADD_NEGATIVE_KEYWORD',
  'SUGGEST_RSA_COPY',
  'SHIFT_BUDGET_BETWEEN_CAMPAIGNS',
  'ALERT_LANDING_CONVERSION_ANOMALY',
  'INSUFFICIENT_DATA',
]);

export const optimizationRiskLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);

export const optimizationDataStatusSchema = z.enum(['OK', 'INSUFFICIENT_DATA', 'GRACE_PERIOD']);

export const optimizationMinimumDataGuardSchema = z.object({
  minClicks: z.number().int().nonnegative().default(30),
  minImpressions: z.number().int().nonnegative().default(500),
  minSpend: z.number().finite().nonnegative().default(50_000),
  minConversionsForCpa: z.number().int().nonnegative().default(3),
  minDaysActive: z.number().int().nonnegative().default(2),
  gracePeriodHours: z.number().int().min(0).max(720).default(24),
});

export const optimizationThresholdsSchema = z.object({
  targetCpa: z.number().finite().positive().nullable().optional(),
  targetCpl: z.number().finite().positive().nullable().optional(),
  targetRoas: z.number().finite().positive().nullable().optional(),
  minCtr: z.number().finite().nonnegative().optional().default(0.5),
  maxCpc: z.number().finite().positive().nullable().optional(),
  minConversionRate: z.number().finite().nonnegative().optional().default(0.5),
  budgetUtilizationLow: z.number().finite().min(0).max(1).optional().default(0.3),
  budgetUtilizationHigh: z.number().finite().min(0).max(1).optional().default(0.95),
  searchTermWasteSpend: z.number().finite().nonnegative().optional().default(100_000),
});

export const optimizationMetricsSnapshotSchema = z.object({
  entityType: optimizationEntityTypeSchema,
  entityId: z.string(),
  entityName: z.string(),
  externalId: z.string().optional(),
  campaignId: z.string().optional(),
  adGroupId: z.string().optional(),
  status: z.string().optional(),
  spend: z.number().finite().nonnegative(),
  impressions: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  conversions: z.number().finite().nonnegative(),
  leads: z.number().finite().nonnegative(),
  conversionValue: z.number().finite().nonnegative().default(0),
  ctr: z.number().finite().nonnegative(),
  cpc: z.number().finite().nonnegative(),
  cpa: z.number().finite().nonnegative(),
  cpl: z.number().finite().nonnegative(),
  roas: z.number().finite().nullable().optional(),
  conversionRate: z.number().finite().nonnegative(),
  budget: z.number().finite().nullable().optional(),
  budgetUtilization: z.number().finite().nullable().optional(),
  daysActive: z.number().int().nonnegative().optional(),
  hoursSinceStart: z.number().finite().nonnegative().optional(),
  startedAt: z.string().optional(),
});

export const optimizationPerformanceAnalysisSchema = z.object({
  entityType: optimizationEntityTypeSchema,
  entityId: z.string(),
  entityName: z.string(),
  dataStatus: optimizationDataStatusSchema,
  dataGuardReasons: z.array(z.string()).default([]),
  efficiencyScore: z.number().int().min(0).max(100).nullable(),
  dimensions: z.object({
    cpa: z.enum(['GOOD', 'AVERAGE', 'POOR', 'UNKNOWN']).optional(),
    cpl: z.enum(['GOOD', 'AVERAGE', 'POOR', 'UNKNOWN']).optional(),
    roas: z.enum(['GOOD', 'AVERAGE', 'POOR', 'UNKNOWN']).optional(),
    ctr: z.enum(['GOOD', 'AVERAGE', 'POOR', 'UNKNOWN']).optional(),
    cpc: z.enum(['GOOD', 'AVERAGE', 'POOR', 'UNKNOWN']).optional(),
    conversionRate: z.enum(['GOOD', 'AVERAGE', 'POOR', 'UNKNOWN']).optional(),
    spend: z.enum(['LOW', 'NORMAL', 'HIGH', 'UNKNOWN']).optional(),
    budgetUtilization: z.enum(['UNDER', 'NORMAL', 'OVER', 'UNKNOWN']).optional(),
    keywordQuality: z.enum(['GOOD', 'MIXED', 'POOR', 'UNKNOWN']).optional(),
  }),
  metrics: optimizationMetricsSnapshotSchema,
});

export const optimizationProposalSchema = z.object({
  action: optimizationActionTypeSchema,
  entity: z.object({
    type: optimizationEntityTypeSchema,
    id: z.string(),
    name: z.string(),
    externalId: z.string().optional(),
    campaignId: z.string().optional(),
    adGroupId: z.string().optional(),
  }),
  reason: z.string().max(2000),
  evidence: z.record(z.unknown()),
  confidence: z.number().min(0).max(1),
  currentValue: z.unknown(),
  proposedValue: z.unknown(),
  /** Qualitative or observed-delta only — never fabricated forecast. */
  expectedImpact: z.string().max(500),
  riskLevel: optimizationRiskLevelSchema,
  source: z.literal('DETERMINISTIC_RULE').default('DETERMINISTIC_RULE'),
});

export const optimizationEngineResultSchema = z.object({
  customerId: z.string().optional(),
  analyzedAt: z.string(),
  dataStatus: optimizationDataStatusSchema,
  analyses: z.array(optimizationPerformanceAnalysisSchema),
  proposals: z.array(optimizationProposalSchema),
  insufficientDataEntities: z.array(
    z.object({
      entityType: optimizationEntityTypeSchema,
      entityId: z.string(),
      entityName: z.string(),
      reasons: z.array(z.string()),
    }),
  ),
});

export type OptimizationMetricsSnapshot = z.infer<typeof optimizationMetricsSnapshotSchema>;
export type OptimizationPerformanceAnalysis = z.infer<typeof optimizationPerformanceAnalysisSchema>;
export type OptimizationProposal = z.infer<typeof optimizationProposalSchema>;
export type OptimizationEngineResult = z.infer<typeof optimizationEngineResultSchema>;
export type OptimizationMinimumDataGuard = z.infer<typeof optimizationMinimumDataGuardSchema>;
export type OptimizationThresholds = z.infer<typeof optimizationThresholdsSchema>;

export interface SearchTermSnapshot {
  searchTerm: string;
  adCampaignId: string;
  adSetId?: string | null;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  ctr: number;
  cpc: number;
}

export interface OptimizationEngineInput {
  customerId?: string;
  guard: OptimizationMinimumDataGuard;
  thresholds: OptimizationThresholds;
  campaigns: OptimizationMetricsSnapshot[];
  keywords?: OptimizationMetricsSnapshot[];
  searchTerms?: SearchTermSnapshot[];
  now?: Date;
}

function rateMetric(
  value: number,
  target: number | null | undefined,
  higherIsBetter: boolean,
): 'GOOD' | 'AVERAGE' | 'POOR' | 'UNKNOWN' {
  if (target == null || target <= 0 || !Number.isFinite(value)) return 'UNKNOWN';
  const ratio = value / target;
  if (higherIsBetter) {
    if (ratio >= 1) return 'GOOD';
    if (ratio >= 0.8) return 'AVERAGE';
    return 'POOR';
  }
  if (ratio <= 1) return 'GOOD';
  if (ratio <= 1.2) return 'AVERAGE';
  return 'POOR';
}

export function checkMinimumDataGuard(
  metrics: Pick<
    OptimizationMetricsSnapshot,
    'clicks' | 'impressions' | 'spend' | 'conversions' | 'leads' | 'hoursSinceStart' | 'daysActive'
  >,
  guard: OptimizationMinimumDataGuard,
): { ok: boolean; status: 'OK' | 'INSUFFICIENT_DATA' | 'GRACE_PERIOD'; reasons: string[] } {
  const reasons: string[] = [];

  if (metrics.hoursSinceStart != null && metrics.hoursSinceStart < guard.gracePeriodHours) {
    reasons.push(`grace_period:${metrics.hoursSinceStart}h<${guard.gracePeriodHours}h`);
    return { ok: false, status: 'GRACE_PERIOD', reasons };
  }

  if (metrics.daysActive != null && metrics.daysActive < guard.minDaysActive) {
    reasons.push(`min_days:${metrics.daysActive}<${guard.minDaysActive}`);
  }
  if (metrics.clicks < guard.minClicks) {
    reasons.push(`min_clicks:${metrics.clicks}<${guard.minClicks}`);
  }
  if (metrics.impressions < guard.minImpressions) {
    reasons.push(`min_impressions:${metrics.impressions}<${guard.minImpressions}`);
  }
  if (metrics.spend < guard.minSpend) {
    reasons.push(`min_spend:${metrics.spend}<${guard.minSpend}`);
  }

  const results = metrics.conversions + metrics.leads;
  if (results > 0 && results < guard.minConversionsForCpa) {
    reasons.push(`min_conversions_for_cpa:${results}<${guard.minConversionsForCpa}`);
  }

  if (reasons.length > 0) {
    return { ok: false, status: 'INSUFFICIENT_DATA', reasons };
  }
  return { ok: true, status: 'OK', reasons: [] };
}

export function computeEfficiencyScoreFromSnapshot(m: OptimizationMetricsSnapshot): number | null {
  if (m.clicks < 5 && m.impressions < 100) return null;
  let score = 50;
  const results = m.conversions + m.leads;

  if (m.roas != null) {
    if (m.roas >= 3) score += 25;
    else if (m.roas >= 1.5) score += 10;
    else if (m.roas < 1) score -= 20;
  }
  if (m.ctr >= 2) score += 10;
  else if (m.ctr < 0.5) score -= 10;
  if (m.spend > 0 && results === 0) score -= 25;
  if (results > 0 && m.cpa > 0 && m.cpa < 200_000) score += 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function analyzeEntityPerformance(
  metrics: OptimizationMetricsSnapshot,
  guard: OptimizationMinimumDataGuard,
  thresholds: OptimizationThresholds,
): OptimizationPerformanceAnalysis {
  const dataGuard = checkMinimumDataGuard(metrics, guard);

  const dimensions: OptimizationPerformanceAnalysis['dimensions'] = {
    cpa: 'UNKNOWN',
    cpl: 'UNKNOWN',
    roas: 'UNKNOWN',
    ctr: 'UNKNOWN',
    cpc: 'UNKNOWN',
    conversionRate: 'UNKNOWN',
    spend: 'UNKNOWN',
    budgetUtilization: 'UNKNOWN',
    keywordQuality: metrics.entityType === 'KEYWORD' ? 'UNKNOWN' : undefined,
  };

  if (!dataGuard.ok) {
    return optimizationPerformanceAnalysisSchema.parse({
      entityType: metrics.entityType,
      entityId: metrics.entityId,
      entityName: metrics.entityName,
      dataStatus: dataGuard.status,
      dataGuardReasons: dataGuard.reasons,
      efficiencyScore: null,
      dimensions,
      metrics,
    });
  }

  const results = metrics.conversions + metrics.leads;
  dimensions.cpa =
    results > 0 ? rateMetric(metrics.cpa, thresholds.targetCpa, false) : 'UNKNOWN';
  dimensions.cpl =
    results > 0 ? rateMetric(metrics.cpl, thresholds.targetCpl, false) : 'UNKNOWN';
  dimensions.roas =
    metrics.roas != null ? rateMetric(metrics.roas, thresholds.targetRoas, true) : 'UNKNOWN';
  dimensions.ctr =
    metrics.ctr > 0 ? (metrics.ctr >= (thresholds.minCtr ?? 0.5) ? 'GOOD' : 'POOR') : 'UNKNOWN';
  dimensions.cpc =
    thresholds.maxCpc != null
      ? rateMetric(metrics.cpc, thresholds.maxCpc, false)
      : metrics.cpc > 0
        ? 'AVERAGE'
        : 'UNKNOWN';
  dimensions.conversionRate =
    metrics.clicks > 0
      ? metrics.conversionRate >= (thresholds.minConversionRate ?? 0.5)
        ? 'GOOD'
        : 'POOR'
      : 'UNKNOWN';

  if (metrics.spend <= 0) dimensions.spend = 'LOW';
  else if (metrics.budget != null && metrics.spend > metrics.budget * 1.05) dimensions.spend = 'HIGH';
  else dimensions.spend = 'NORMAL';

  if (metrics.budgetUtilization != null) {
    if (metrics.budgetUtilization < (thresholds.budgetUtilizationLow ?? 0.3)) {
      dimensions.budgetUtilization = 'UNDER';
    } else if (metrics.budgetUtilization > (thresholds.budgetUtilizationHigh ?? 0.95)) {
      dimensions.budgetUtilization = 'OVER';
    } else {
      dimensions.budgetUtilization = 'NORMAL';
    }
  }

  return optimizationPerformanceAnalysisSchema.parse({
    entityType: metrics.entityType,
    entityId: metrics.entityId,
    entityName: metrics.entityName,
    dataStatus: 'OK',
    dataGuardReasons: [],
    efficiencyScore: computeEfficiencyScoreFromSnapshot(metrics),
    dimensions,
    metrics,
  });
}

function proposal(
  partial: Omit<OptimizationProposal, 'source'> & { source?: 'DETERMINISTIC_RULE' },
): OptimizationProposal {
  return optimizationProposalSchema.parse({ ...partial, source: 'DETERMINISTIC_RULE' });
}

/** Deterministic rules — LLM không được gọi ở đây. */
export function buildOptimizationProposals(
  analyses: OptimizationPerformanceAnalysis[],
  thresholds: OptimizationThresholds,
  opts?: { searchTerms?: SearchTermSnapshot[] },
): OptimizationProposal[] {
  const out: OptimizationProposal[] = [];
  const okCampaigns = analyses.filter(
    (a) => a.entityType === 'CAMPAIGN' && a.dataStatus === 'OK',
  );
  const okKeywords = analyses.filter((a) => a.entityType === 'KEYWORD' && a.dataStatus === 'OK');

  for (const a of okCampaigns) {
    const m = a.metrics;
    const results = m.conversions + m.leads;

    if (
      thresholds.targetCpa != null &&
      results >= 3 &&
      m.cpa > thresholds.targetCpa * 1.25 &&
      m.status === 'ACTIVE'
    ) {
      const pct = -15;
      const proposed = m.budget != null ? Math.max(1, Math.round(m.budget * 0.85 * 100) / 100) : null;
      out.push(
        proposal({
          action: 'DECREASE_BUDGET',
          entity: {
            type: 'CAMPAIGN',
            id: m.entityId,
            name: m.entityName,
            externalId: m.externalId,
          },
          reason: `CPA ${Math.round(m.cpa)} vượt target ${thresholds.targetCpa} >25%`,
          evidence: { cpa: m.cpa, targetCpa: thresholds.targetCpa, spend: m.spend, conversions: results },
          confidence: Math.min(0.95, 0.6 + (m.cpa / thresholds.targetCpa - 1) * 0.2),
          currentValue: { budget: m.budget, cpa: m.cpa },
          proposedValue: { budget: proposed, budgetChangePercent: pct },
          expectedImpact: 'Giảm lãng phí chi tiêu khi CPA cao — dựa trên CPA quan sát, không dự báo ROAS',
          riskLevel: 'MEDIUM',
        }),
      );
    }

    if (
      thresholds.targetRoas != null &&
      m.roas != null &&
      m.roas >= thresholds.targetRoas * 1.1 &&
      m.status === 'ACTIVE' &&
      m.budget != null &&
      a.dimensions.budgetUtilization === 'OVER'
    ) {
      const pct = 10;
      const proposed = Math.round(m.budget * 1.1 * 100) / 100;
      out.push(
        proposal({
          action: 'INCREASE_BUDGET',
          entity: {
            type: 'CAMPAIGN',
            id: m.entityId,
            name: m.entityName,
            externalId: m.externalId,
          },
          reason: `ROAS ${m.roas.toFixed(2)} ≥ target và budget utilization cao`,
          evidence: { roas: m.roas, targetRoas: thresholds.targetRoas, budgetUtilization: m.budgetUtilization },
          confidence: 0.72,
          currentValue: { budget: m.budget, roas: m.roas },
          proposedValue: { budget: proposed, budgetChangePercent: pct },
          expectedImpact: 'Tăng ngân sách có kiểm soát cho campaign đang có ROAS quan sát tốt',
          riskLevel: 'HIGH',
        }),
      );
    }

    if (m.spend > 0 && results === 0 && m.clicks >= 30 && m.status === 'ACTIVE') {
      out.push(
        proposal({
          action: 'PAUSE_CAMPAIGN',
          entity: {
            type: 'CAMPAIGN',
            id: m.entityId,
            name: m.entityName,
            externalId: m.externalId,
          },
          reason: `Chi tiêu ${Math.round(m.spend)} với ${m.clicks} click nhưng 0 conversion`,
          evidence: { spend: m.spend, clicks: m.clicks, conversions: 0 },
          confidence: 0.85,
          currentValue: { status: m.status },
          proposedValue: { status: 'PAUSED' },
          expectedImpact: 'Dừng chi tiêu lãng phí — dựa trên dữ liệu quan sát hiện tại',
          riskLevel: 'HIGH',
        }),
      );
    }

    if (m.clicks >= 50 && results > 0 && m.conversionRate < (thresholds.minConversionRate ?? 0.5)) {
      out.push(
        proposal({
          action: 'ALERT_LANDING_CONVERSION_ANOMALY',
          entity: {
            type: 'CAMPAIGN',
            id: m.entityId,
            name: m.entityName,
            externalId: m.externalId,
          },
          reason: `Conversion rate ${m.conversionRate.toFixed(2)}% thấp dù có traffic — kiểm tra landing/form`,
          evidence: {
            conversionRate: m.conversionRate,
            clicks: m.clicks,
            conversions: results,
          },
          confidence: 0.7,
          currentValue: { conversionRate: m.conversionRate },
          proposedValue: { action: 'audit_landing_page' },
          expectedImpact: 'Cảnh báo bất thường funnel — không tự thay đổi quảng cáo',
          riskLevel: 'LOW',
        }),
      );
    }

    if (a.dimensions.ctr === 'POOR' && m.impressions >= 1000) {
      out.push(
        proposal({
          action: 'SUGGEST_RSA_COPY',
          entity: { type: 'CAMPAIGN', id: m.entityId, name: m.entityName, externalId: m.externalId },
          reason: `CTR ${m.ctr.toFixed(2)}% thấp — thử headline/description mới`,
          evidence: { ctr: m.ctr, impressions: m.impressions, clicks: m.clicks },
          confidence: 0.65,
          currentValue: { ctr: m.ctr },
          proposedValue: { suggestNewCopy: true },
          expectedImpact: 'Đề xuất A/B copy — cần duyệt trước khi publish',
          riskLevel: 'LOW',
        }),
      );
    }
  }

  for (const a of okKeywords) {
    const m = a.metrics;
    const results = m.conversions + m.leads;
    if (m.spend > 50_000 && results === 0 && m.clicks >= 15) {
      out.push(
        proposal({
          action: 'PAUSE_KEYWORD',
          entity: {
            type: 'KEYWORD',
            id: m.entityId,
            name: m.entityName,
            externalId: m.externalId,
            campaignId: m.campaignId,
            adGroupId: m.adGroupId,
          },
          reason: `Keyword chi ${Math.round(m.spend)} không có conversion`,
          evidence: { spend: m.spend, clicks: m.clicks },
          confidence: 0.8,
          currentValue: { status: m.status ?? 'ENABLED' },
          proposedValue: { status: 'PAUSED' },
          expectedImpact: 'Giảm chi phí keyword kém hiệu quả',
          riskLevel: 'LOW',
        }),
      );
    }
  }

  for (const st of opts?.searchTerms ?? []) {
    if (st.spend >= (thresholds.searchTermWasteSpend ?? 100_000) && st.conversions === 0 && st.clicks >= 10) {
      out.push(
        proposal({
          action: 'ADD_NEGATIVE_KEYWORD',
          entity: {
            type: 'SEARCH_TERM',
            id: `${st.adCampaignId}:${st.searchTerm}`,
            name: st.searchTerm,
            campaignId: st.adCampaignId,
            adGroupId: st.adSetId ?? undefined,
          },
          reason: `Search term "${st.searchTerm}" tiêu ${Math.round(st.spend)} không conversion`,
          evidence: { searchTerm: st.searchTerm, spend: st.spend, clicks: st.clicks },
          confidence: 0.78,
          currentValue: { spend: st.spend, conversions: 0 },
          proposedValue: { negativeKeyword: st.searchTerm, matchType: 'BROAD' },
          expectedImpact: 'Loại trừ truy vấn lãng phí — dựa trên spend/conversion quan sát',
          riskLevel: 'LOW',
        }),
      );
    }
  }

  // Budget shift: from worst CPA campaign to best ROAS (observed only)
  const donors = okCampaigns.filter(
    (c) =>
      c.dimensions.cpa === 'POOR' &&
      c.metrics.budget != null &&
      c.metrics.budget > 0 &&
      c.metrics.conversions + c.metrics.leads > 0,
  );
  const receivers = okCampaigns.filter(
    (c) =>
      c.dimensions.roas === 'GOOD' &&
      c.metrics.budget != null &&
      c.metrics.roas != null &&
      c.entityId !== donors[0]?.entityId,
  );
  if (donors[0] && receivers[0]) {
    const from = donors[0].metrics;
    const to = receivers[0].metrics;
    const shiftAmount = Math.min(from.budget! * 0.1, to.budget! * 0.1);
    if (shiftAmount >= 10_000) {
      out.push(
        proposal({
          action: 'SHIFT_BUDGET_BETWEEN_CAMPAIGNS',
          entity: { type: 'ACCOUNT', id: 'account', name: 'Multi-campaign' },
          reason: `Chuyển ngân sách từ "${from.entityName}" (CPA cao) sang "${to.entityName}" (ROAS tốt)`,
          evidence: {
            fromCampaignId: from.entityId,
            toCampaignId: to.entityId,
            fromCpa: from.cpa,
            toRoas: to.roas,
          },
          confidence: 0.68,
          currentValue: {
            fromBudget: from.budget,
            toBudget: to.budget,
          },
          proposedValue: {
            shiftAmount,
            fromCampaignId: from.entityId,
            toCampaignId: to.entityId,
          },
          expectedImpact: 'Tái phân bổ ngân sách theo hiệu quả quan sát — không forecast',
          riskLevel: 'HIGH',
        }),
      );
    }
  }

  return out;
}

export function runGoogleAdsOptimizationEngine(input: OptimizationEngineInput): OptimizationEngineResult {
  const guard = optimizationMinimumDataGuardSchema.parse(input.guard);
  const thresholds = optimizationThresholdsSchema.parse(input.thresholds);
  const now = input.now ?? new Date();

  const allEntities = [...input.campaigns, ...(input.keywords ?? [])];
  const analyses = allEntities.map((m) => analyzeEntityPerformance(m, guard, thresholds));

  const insufficientDataEntities = analyses
    .filter((a) => a.dataStatus !== 'OK')
    .map((a) => ({
      entityType: a.entityType,
      entityId: a.entityId,
      entityName: a.entityName,
      reasons: a.dataGuardReasons,
    }));

  const proposals = buildOptimizationProposals(analyses, thresholds, {
    searchTerms: input.searchTerms,
  });

  const anyOk = analyses.some((a) => a.dataStatus === 'OK');
  const dataStatus = anyOk ? 'OK' : insufficientDataEntities.some((e) => e.reasons.some((r) => r.startsWith('grace_period')))
    ? 'GRACE_PERIOD'
    : 'INSUFFICIENT_DATA';

  return optimizationEngineResultSchema.parse({
    customerId: input.customerId,
    analyzedAt: now.toISOString(),
    dataStatus,
    analyses,
    proposals,
    insufficientDataEntities,
  });
}

/** LLM chỉ được explain proposals đã có — schema output. */
export const optimizationLlmExplanationSchema = z.object({
  summary: z.string().max(1500),
  proposalExplanations: z.array(
    z.object({
      proposalIndex: z.number().int().nonnegative(),
      explanation: z.string().max(800),
      /** LLM không được thêm action mới */
      disclaimer: z.string().max(200).default('Quyết định cuối do rule engine + guardrail backend'),
    }),
  ),
});

export type OptimizationLlmExplanation = z.infer<typeof optimizationLlmExplanationSchema>;

export function buildOptimizationExplanationPrompt(
  result: OptimizationEngineResult,
): { system: string; user: string } {
  const system = `Bạn là chuyên gia Google Ads. CHỈ giải thích các đề xuất đã được rule engine tạo sẵn.
KHÔNG thêm action mới, KHÔNG dự báo ROAS/CPA tương lai, KHÔNG đưa con số forecast.
Trả JSON: { "summary": "...", "proposalExplanations": [{ "proposalIndex": 0, "explanation": "...", "disclaimer": "..." }] }`;

  const user = JSON.stringify(
    {
      dataStatus: result.dataStatus,
      proposals: result.proposals.map((p, i) => ({
        index: i,
        action: p.action,
        entity: p.entity,
        reason: p.reason,
        evidence: p.evidence,
        confidence: p.confidence,
        expectedImpact: p.expectedImpact,
        riskLevel: p.riskLevel,
      })),
    },
    null,
    2,
  );

  return { system, user };
}

/** Static guard — codebase không được chứa forecast giả. */
export const FORBIDDEN_FORECAST_PATTERNS = [
  /predictedRoas/i,
  /forecastCpa/i,
  /willIncreaseRoasBy/i,
  /expectedRoasIn30Days/i,
];

export function assertNoFakeForecastInProposals(proposals: OptimizationProposal[]): boolean {
  for (const p of proposals) {
    const blob = JSON.stringify(p);
    if (FORBIDDEN_FORECAST_PATTERNS.some((re) => re.test(blob))) return false;
    if (/\+?\d+(\.\d+)?%\s*(ROAS|CPA|CPL)\s*(in|within|sau|trong)/i.test(p.expectedImpact)) {
      return false;
    }
  }
  return true;
}

/** Aggregate daily stats into campaign snapshot. */
export function aggregateDailyStatsToSnapshot(input: {
  entityType: OptimizationMetricsSnapshot['entityType'];
  entityId: string;
  entityName: string;
  externalId?: string;
  campaignId?: string;
  adGroupId?: string;
  status?: string;
  budget?: number | null;
  startedAt?: Date | null;
  rows: Array<{
    date: Date;
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    leads: number;
    conversionValue: number;
    ctr?: number | null;
    cpc?: number | null;
    cpa?: number | null;
    roas?: number | null;
  }>;
  now?: Date;
}): OptimizationMetricsSnapshot {
  const now = input.now ?? new Date();
  let spend = 0;
  let impressions = 0;
  let clicks = 0;
  let conversions = 0;
  let leads = 0;
  let conversionValue = 0;

  for (const r of input.rows) {
    spend += r.spend;
    impressions += r.impressions;
    clicks += r.clicks;
    conversions += r.conversions;
    leads += r.leads;
    conversionValue += r.conversionValue;
  }

  const results = conversions + leads;
  const hoursSinceStart = input.startedAt
    ? (now.getTime() - input.startedAt.getTime()) / 3_600_000
    : undefined;
  const uniqueDays = new Set(input.rows.map((r) => r.date.toISOString().slice(0, 10))).size;

  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  const cpa = results > 0 ? spend / results : 0;
  const cpl = results > 0 ? spend / results : 0;
  const roas = spend > 0 && conversionValue > 0 ? conversionValue / spend : null;
  const conversionRate = clicks > 0 ? (results / clicks) * 100 : 0;
  const budgetUtilization =
    input.budget != null && input.budget > 0 ? spend / input.budget : null;

  return optimizationMetricsSnapshotSchema.parse({
    entityType: input.entityType,
    entityId: input.entityId,
    entityName: input.entityName,
    externalId: input.externalId,
    campaignId: input.campaignId,
    adGroupId: input.adGroupId,
    status: input.status,
    spend,
    impressions,
    clicks,
    conversions,
    leads,
    conversionValue,
    ctr,
    cpc,
    cpa,
    cpl,
    roas,
    conversionRate,
    budget: input.budget ?? null,
    budgetUtilization,
    daysActive: uniqueDays,
    hoursSinceStart,
    startedAt: input.startedAt?.toISOString(),
  });
}

/** Map optimization proposal → autopilot executable action (null = human-only). */
export function mapOptimizationProposalToAutopilot(
  p: OptimizationProposal,
): {
  actionType: 'PAUSE_CAMPAIGN' | 'ENABLE_CAMPAIGN' | 'UPDATE_BUDGET' | 'PAUSE_KEYWORD' | 'ADD_NEGATIVE_KEYWORD';
  campaignId?: string;
  externalCampaignId?: string;
  keywordText?: string;
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
  payload: Record<string, unknown>;
  reason: string;
  evidence: Record<string, unknown>;
} | null {
  const baseEvidence = { ...p.evidence, optimizationConfidence: p.confidence, optimizationAction: p.action };
  switch (p.action) {
    case 'PAUSE_CAMPAIGN':
      return {
        actionType: 'PAUSE_CAMPAIGN',
        campaignId: p.entity.id,
        externalCampaignId: p.entity.externalId,
        beforeState: p.currentValue as Record<string, unknown>,
        afterState: p.proposedValue as Record<string, unknown>,
        payload: {},
        reason: p.reason,
        evidence: baseEvidence,
      };
    case 'ENABLE_CAMPAIGN':
      return {
        actionType: 'ENABLE_CAMPAIGN',
        campaignId: p.entity.id,
        externalCampaignId: p.entity.externalId,
        beforeState: p.currentValue as Record<string, unknown>,
        afterState: p.proposedValue as Record<string, unknown>,
        payload: {},
        reason: p.reason,
        evidence: baseEvidence,
      };
    case 'INCREASE_BUDGET':
    case 'DECREASE_BUDGET':
      return {
        actionType: 'UPDATE_BUDGET',
        campaignId: p.entity.id,
        externalCampaignId: p.entity.externalId,
        beforeState: p.currentValue as Record<string, unknown>,
        afterState: p.proposedValue as Record<string, unknown>,
        payload: p.proposedValue as Record<string, unknown>,
        reason: p.reason,
        evidence: baseEvidence,
      };
    case 'PAUSE_KEYWORD':
      return {
        actionType: 'PAUSE_KEYWORD',
        campaignId: p.entity.campaignId,
        externalCampaignId: p.entity.externalId,
        keywordText: p.entity.name,
        beforeState: p.currentValue as Record<string, unknown>,
        afterState: p.proposedValue as Record<string, unknown>,
        payload: {},
        reason: p.reason,
        evidence: baseEvidence,
      };
    case 'ADD_NEGATIVE_KEYWORD':
      return {
        actionType: 'ADD_NEGATIVE_KEYWORD',
        campaignId: p.entity.campaignId,
        keywordText: p.entity.name,
        beforeState: p.currentValue as Record<string, unknown>,
        afterState: p.proposedValue as Record<string, unknown>,
        payload: p.proposedValue as Record<string, unknown>,
        reason: p.reason,
        evidence: baseEvidence,
      };
    default:
      return null;
  }
}
