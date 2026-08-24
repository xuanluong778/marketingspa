import { z } from 'zod';
import {
  MARKETING_AUTOPILOT_DRAFT_TYPES,
  marketingAutopilotConfidenceSchema,
  marketingAutopilotRiskLevelSchema,
} from './marketing-autopilot-planner';

export const MARKETING_AUTOPILOT_NBA_V2_LIMITS = {
  maxActions: 5,
} as const;

export const AUTOPILOT_BUDGET_SCENARIO_PRESETS = [
  { id: '5tr' as const, label: '5 triệu', amount: 5_000_000 },
  { id: '10tr' as const, label: '10 triệu', amount: 10_000_000 },
  { id: '20tr' as const, label: '20 triệu', amount: 20_000_000 },
  { id: '50tr' as const, label: '50 triệu', amount: 50_000_000 },
] as const;

export type AutopilotBudgetScenarioId = (typeof AUTOPILOT_BUDGET_SCENARIO_PRESETS)[number]['id'] | 'custom';

export type MarketingAutopilotDraftType = (typeof MARKETING_AUTOPILOT_DRAFT_TYPES)[number];

/** Maps recommendedDraft → existing draft adapters (Draft-only, never live FB/Email/Ads). */
export const NBA_DRAFT_ADAPTER_MAP = {
  CONTENT_DRAFT: 'TeleprompterSourceService',
  FUNNEL_DRAFT: 'FunnelBuilderService',
  AUTOMATION_DRAFT: 'AutomationService',
  CAMPAIGN_DRAFT: 'MessagingCampaignService',
} as const satisfies Record<MarketingAutopilotDraftType, string>;

export const HIGH_RISK_LIVE_ACTION_TYPES = [
  'FACEBOOK_PUBLISH',
  'FACEBOOK_SCHEDULE',
  'FACEBOOK_DELETE_POST',
  'SEND_EMAIL',
  'SEND_MESSENGER',
  'SEND_ZALO',
  'ENABLE_ADS',
  'EDIT_ADS_BUDGET',
  'CHARGE_MONEY',
  'PAYMENT_CHARGE',
  'DELETE_DATA',
  'ACCESS_SECRET',
  'ACCESS_TOKEN',
] as const;

export const marketingAutopilotNextBestActionV2Schema = z.object({
  priority: z.number().int().min(1).max(5),
  title: z.string().min(1).max(160),
  whyNow: z.string().min(1).max(600),
  evidence: z.string().min(1).max(600),
  confidence: marketingAutopilotConfidenceSchema,
  expectedImpact: z.string().min(1).max(400),
  estimatedCost: z.number().finite().min(0).nullable(),
  riskLevel: marketingAutopilotRiskLevelSchema,
  recommendedDraft: z.enum(MARKETING_AUTOPILOT_DRAFT_TYPES),
  /** Backward-compatible alias of recommendedDraft for confirmDraft. */
  type: z.enum(MARKETING_AUTOPILOT_DRAFT_TYPES),
  label: z.string().min(1).max(120).optional(),
  rankingSignals: z
    .object({
      organizationId: z.string().optional(),
      sources: z.array(z.string()).max(8).optional(),
    })
    .optional(),
});

export type MarketingAutopilotNextBestActionV2 = z.infer<
  typeof marketingAutopilotNextBestActionV2Schema
>;

export const forecastDataStatusSchema = z.enum([
  'historical',
  'estimate',
  'INSUFFICIENT_DATA',
]);

export type ForecastDataStatus = z.infer<typeof forecastDataStatusSchema>;

export const forecastTimeRangeSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
  })
  .nullable();

export const budgetScenarioMetricSchema = z.object({
  value: z.number().finite().nullable(),
  status: forecastDataStatusSchema,
  note: z.string().max(300).optional(),
  /** Which historical fields / formulas this number is based on */
  basedOn: z.array(z.string().max(160)).max(8),
  timeRange: forecastTimeRangeSchema,
  sampleSize: z.number().int().min(0).nullable(),
  confidence: marketingAutopilotConfidenceSchema,
});

export const budgetScenarioSchema = z.object({
  scenarioId: z.enum(['5tr', '10tr', '20tr', '50tr', 'custom']),
  label: z.string().min(1).max(64),
  monthlyBudget: z.number().finite().min(0),
  estimates: z.object({
    leads: budgetScenarioMetricSchema,
    bookings: budgetScenarioMetricSchema,
    revenue: budgetScenarioMetricSchema,
    cpl: budgetScenarioMetricSchema,
    cpa: budgetScenarioMetricSchema,
    roas: budgetScenarioMetricSchema,
  }),
  dataQuality: z.enum(['SUFFICIENT', 'PARTIAL', 'INSUFFICIENT_DATA']),
  assumptions: z.array(z.string().max(400)).max(8),
  timeRange: forecastTimeRangeSchema,
  mode: z.enum(['historical', 'assumption']).optional(),
});

export type BudgetScenario = z.infer<typeof budgetScenarioSchema>;
export type BudgetScenarioMetric = z.infer<typeof budgetScenarioMetricSchema>;

export type NbaV2ContextMetrics = {
  leads?: {
    total?: number | null;
    noFollowUp?: number | null;
    hot?: number | null;
    unassigned?: number | null;
  };
  bookings?: { total?: number | null };
  conversion?: { leadToBookingRate?: number | null };
  revenue?: { total?: number | null };
  ads?: {
    spend?: number | null;
    cpl?: number | null;
    cpc?: number | null;
    roas?: number | null;
    leads?: number | null;
  };
  content?: { teleprompterSources?: number | null; autoPostDrafts?: number | null };
  automation?: { activeFlows?: number | null; pausedFlows?: number | null };
  funnel?: { activeFunnels?: number | null; leadsInFunnel?: number | null };
};

export type NbaV2Insight = {
  id?: string;
  category: string;
  title: string;
  summary?: string;
  evidence?: string;
  confidence?: string;
  source?: string;
};

export type NbaV2CandidateInput = {
  type?: string;
  label?: string;
  title?: string;
  whyNow?: string;
  evidence?:
    | string
    | {
        reason?: string;
        evidence?: string;
        expectedImpact?: string;
        confidence?: string;
        riskLevel?: string;
      };
  confidence?: string;
  expectedImpact?: string;
  estimatedCost?: number | null;
  riskLevel?: string;
  recommendedDraft?: string;
  priority?: number;
  rationale?: string;
};

export function mapRecommendedDraft(raw: string | undefined | null): MarketingAutopilotDraftType | null {
  if (!raw) return null;
  const t = String(raw).trim();
  return (MARKETING_AUTOPILOT_DRAFT_TYPES as readonly string[]).includes(t)
    ? (t as MarketingAutopilotDraftType)
    : null;
}

export function adapterForDraft(type: MarketingAutopilotDraftType): string {
  return NBA_DRAFT_ADAPTER_MAP[type];
}

/**
 * Resolve draft types for confirmDraft — maps recommendedDraft, blocks live actions.
 * When the client sends an explicit draftTypes filter, honor those enums directly
 * (user clicked "Tạo Draft") even if nextBestActions list is sparse/mismatched.
 */
export function resolveConfirmDraftTypes(
  actions: Array<{ recommendedDraft?: string; type?: string }>,
  filter?: string[] | null,
): { allowed: MarketingAutopilotDraftType[]; blocked: string[] } {
  const cleanedFilter = Array.isArray(filter)
    ? filter
        .map((t) => (t == null ? '' : String(t).trim()))
        .filter(Boolean)
    : [];
  const highRisk = new Set<string>(HIGH_RISK_LIVE_ACTION_TYPES);
  const allowed: MarketingAutopilotDraftType[] = [];
  const blocked: string[] = [];

  if (cleanedFilter.length > 0) {
    for (const raw of cleanedFilter) {
      if (highRisk.has(raw)) {
        blocked.push(raw);
        continue;
      }
      const mapped = mapRecommendedDraft(raw);
      if (mapped) allowed.push(mapped);
      else blocked.push(raw);
    }
    return { allowed: Array.from(new Set(allowed)), blocked };
  }

  for (const action of actions) {
    const raw = String(action?.recommendedDraft ?? action?.type ?? '').trim();
    if (!raw) continue;
    if (highRisk.has(raw)) {
      blocked.push(raw);
      continue;
    }
    const mapped = mapRecommendedDraft(raw);
    if (mapped) allowed.push(mapped);
    else blocked.push(raw);
  }

  return { allowed: Array.from(new Set(allowed)), blocked };
}

export function resolveConfirmIdempotencyKey(input: {
  clientKey?: string | null;
  projectId: string;
  analysisId?: string | null;
}): string {
  const fromClient = (input.clientKey ?? '').trim();
  if (fromClient) return fromClient;
  return `marketing-autopilot-confirm:${input.projectId}:${input.analysisId ?? 'latest'}`;
}

/** Same idempotency key must reuse existing draft run (no duplicate creates). */
export function shouldReuseDraftRun(
  existingKey: string | null | undefined,
  requestKey: string,
): boolean {
  return !!existingKey && existingKey === requestKey;
}

function asDraftType(raw: string | undefined): MarketingAutopilotDraftType | null {
  return mapRecommendedDraft(raw);
}

function followUpBottleneck(metrics?: NbaV2ContextMetrics): {
  active: boolean;
  noFollowUp: number;
  total: number;
} {
  const noFollowUp = metrics?.leads?.noFollowUp ?? 0;
  const total = metrics?.leads?.total ?? 0;
  const active = noFollowUp > 0 && (total === 0 || noFollowUp / Math.max(total, 1) >= 0.2);
  return { active, noFollowUp, total };
}

function conversionBottleneck(metrics?: NbaV2ContextMetrics): boolean {
  const rate = metrics?.conversion?.leadToBookingRate ?? null;
  return rate != null && rate > 0 && rate < 15;
}

function isAdsScaleAction(action: {
  type?: string;
  draft?: string;
  title?: string;
  whyNow?: string;
  recommendedDraft?: string;
}): boolean {
  const draft = action.recommendedDraft ?? action.type ?? action.draft ?? '';
  if (draft === 'AUTOMATION_DRAFT' || draft === 'FUNNEL_DRAFT' || draft === 'CONTENT_DRAFT') {
    return false;
  }
  if (draft === 'CAMPAIGN_DRAFT') return true;
  const text = `${action.title ?? ''} ${action.whyNow ?? ''}`.toLowerCase();
  return /(?:^|[\s,;])(?:tăng|scale|mở rộng|tang|boost)\s*ads|ads budget|scale ads/.test(text);
}

type RankedCandidate = {
  draft: MarketingAutopilotDraftType;
  title: string;
  whyNow: string;
  evidence: string;
  confidence: MarketingAutopilotNextBestActionV2['confidence'];
  expectedImpact: string;
  estimatedCost: number | null;
  riskLevel: MarketingAutopilotNextBestActionV2['riskLevel'];
  score: number;
  sources: string[];
};

function insightToDraft(category: string, title: string): MarketingAutopilotDraftType | null {
  const c = `${category} ${title}`.toLowerCase();
  if (/follow.?up|crm|lead|automation|chăm sóc/.test(c)) return 'AUTOMATION_DRAFT';
  if (/funnel|conversion|chuyển đổi|pipeline/.test(c)) return 'FUNNEL_DRAFT';
  if (/content|nội dung|teleprompter|creative/.test(c)) return 'CONTENT_DRAFT';
  if (/campaign|ads|remarketing|quảng cáo/.test(c)) return 'CAMPAIGN_DRAFT';
  return null;
}

/**
 * Rank ≤5 next-best actions by combining:
 * Marketing Context insights + Strategy Planner candidates + real metrics + safety rules.
 * Priorities differ per organizationId / metric profile (not a fixed rule list).
 */
export function rankNextBestActionsV2(input: {
  organizationId?: string;
  metrics?: NbaV2ContextMetrics;
  candidates?: NbaV2CandidateInput[];
  insights?: NbaV2Insight[];
  monthlyBudget?: number;
  timeRange?: { from: string; to: string } | null;
  safety?: { draftOnly?: boolean };
}): MarketingAutopilotNextBestActionV2[] {
  const orgId = input.organizationId ?? 'unknown-org';
  const { active: followUpActive, noFollowUp, total } = followUpBottleneck(input.metrics);
  const convBottleneck = conversionBottleneck(input.metrics);
  const budget = input.monthlyBudget ?? 0;
  const draftOnly = input.safety?.draftOnly !== false;

  const seeded: RankedCandidate[] = [];

  // --- Safety rules from real metrics (org-specific intensity) ---
  if (followUpActive) {
    seeded.push({
      draft: 'AUTOMATION_DRAFT',
      title: `Chăm sóc ${noFollowUp} lead chưa follow-up`,
      whyNow: `${noFollowUp}/${Math.max(total, noFollowUp)} lead đang chờ follow-up — bottleneck trước khi tăng Ads (org ${orgId.slice(0, 8)}).`,
      evidence: `leads.noFollowUp=${noFollowUp}; leads.total=${total || 'n/a'}; organizationId=${orgId}`,
      confidence: 'HIGH',
      expectedImpact: 'Thu hồi lead nóng → tăng booking mà không tăng chi phí Ads',
      estimatedCost: Math.round(Math.min(budget * 0.15, 2_000_000)),
      riskLevel: 'LOW',
      score: 1000 + Math.min(200, noFollowUp),
      sources: ['metrics.leads', 'safety.followUp'],
    });
  }

  if (convBottleneck) {
    seeded.push({
      draft: 'FUNNEL_DRAFT',
      title: 'Tối ưu funnel chuyển đổi lead → booking',
      whyNow: `Lead-to-booking ${input.metrics?.conversion?.leadToBookingRate}% thấp — tăng Ads lúc này lãng phí ngân sách.`,
      evidence: `conversion.leadToBookingRate=${input.metrics?.conversion?.leadToBookingRate}; organizationId=${orgId}`,
      confidence: 'HIGH',
      expectedImpact: 'Cải thiện tỷ lệ chuyển đổi trước khi scale traffic',
      estimatedCost: Math.round(Math.min(budget * 0.2, 3_000_000)),
      riskLevel: 'MEDIUM',
      score: 900,
      sources: ['metrics.conversion', 'safety.conversion'],
    });
  }

  // --- Marketing Context insights (per-org snapshot) ---
  for (const insight of input.insights ?? []) {
    if (insight.confidence === 'INSUFFICIENT_DATA') continue;
    const draft = insightToDraft(insight.category, insight.title);
    if (!draft) continue;
    const conf = (['HIGH', 'MEDIUM', 'LOW'].includes(String(insight.confidence))
      ? insight.confidence
      : 'MEDIUM') as MarketingAutopilotNextBestActionV2['confidence'];
    let score = 520;
    if (draft === 'AUTOMATION_DRAFT' && followUpActive) score = 980;
    if (draft === 'FUNNEL_DRAFT' && convBottleneck) score = 880;
    if (draft === 'CONTENT_DRAFT' && (input.metrics?.content?.teleprompterSources ?? 0) < 3) score = 720;
    if (draft === 'CAMPAIGN_DRAFT') {
      score = followUpActive || convBottleneck ? 180 : 640;
      if (draftOnly && isAdsScaleAction({ title: insight.title, recommendedDraft: draft })) {
        score = Math.min(score, 200);
      }
    }
    seeded.push({
      draft,
      title: insight.title.slice(0, 160),
      whyNow: (insight.summary || insight.title).slice(0, 600),
      evidence: (insight.evidence || `${insight.source || 'context'}:${insight.category}`).slice(0, 600),
      confidence: conf,
      expectedImpact: `Xử lý insight ${insight.category} từ Marketing Context`,
      estimatedCost: Math.round(Math.min(budget * 0.12, 2_000_000)),
      riskLevel: draft === 'CAMPAIGN_DRAFT' ? 'MEDIUM' : 'LOW',
      score,
      sources: ['marketing-context', insight.category],
    });
  }

  // --- Strategy Planner candidates ---
  for (const c of input.candidates ?? []) {
    const draft = asDraftType(c.recommendedDraft) ?? asDraftType(c.type);
    if (!draft) continue;
    const evidenceObj = typeof c.evidence === 'object' && c.evidence ? c.evidence : null;
    const evidenceText =
      typeof c.evidence === 'string'
        ? c.evidence
        : evidenceObj?.evidence ?? evidenceObj?.reason ?? 'strategy-planner';
    const title = (c.title ?? c.label ?? draft).trim();
    const whyNow = (c.whyNow ?? c.rationale ?? evidenceObj?.reason ?? title).trim();
    let score = 400 + (typeof c.priority === 'number' ? (6 - c.priority) * 55 : 0);

    // Org metric profile adjusts planner scores
    if (draft === 'CONTENT_DRAFT' && (input.metrics?.content?.autoPostDrafts ?? 0) === 0) score += 80;
    if (draft === 'AUTOMATION_DRAFT' && (input.metrics?.automation?.activeFlows ?? 0) === 0) score += 70;
    if (draft === 'FUNNEL_DRAFT' && (input.metrics?.funnel?.activeFunnels ?? 0) === 0) score += 60;
    if (draft === 'CAMPAIGN_DRAFT' && (input.metrics?.ads?.roas ?? 0) >= 2 && !followUpActive && !convBottleneck) {
      score += 120;
    }

    if (isAdsScaleAction({ type: draft, title, whyNow, recommendedDraft: draft })) {
      if (followUpActive || convBottleneck) score = Math.min(score, 150);
    }
    if (draft === 'AUTOMATION_DRAFT' && followUpActive) score = Math.max(score, 950);
    if (draft === 'FUNNEL_DRAFT' && convBottleneck) score = Math.max(score, 850);

    seeded.push({
      draft,
      title: title.slice(0, 160),
      whyNow: whyNow.slice(0, 600),
      evidence: evidenceText.slice(0, 600),
      confidence: (['HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT_DATA'].includes(
        String(c.confidence ?? evidenceObj?.confidence),
      )
        ? (c.confidence ?? evidenceObj?.confidence)
        : 'MEDIUM') as MarketingAutopilotNextBestActionV2['confidence'],
      expectedImpact: String(
        c.expectedImpact ?? evidenceObj?.expectedImpact ?? 'Cải thiện pipeline marketing',
      ).slice(0, 400),
      estimatedCost: c.estimatedCost ?? null,
      riskLevel: (['LOW', 'MEDIUM', 'HIGH'].includes(String(c.riskLevel ?? evidenceObj?.riskLevel))
        ? (c.riskLevel ?? evidenceObj?.riskLevel)
        : 'MEDIUM') as MarketingAutopilotNextBestActionV2['riskLevel'],
      score,
      sources: ['strategy-planner'],
    });
  }

  // --- Soft fillers only when pool is thin (not a fixed always-on ranking) ---
  if (seeded.length < 3 && !followUpActive) {
    seeded.push({
      draft: 'CONTENT_DRAFT',
      title: 'Chuẩn bị bộ content theo funnel',
      whyNow: 'Thiếu tín hiệu mạnh — bắt đầu bằng content draft đồng bộ thông điệp.',
      evidence: `organizationId=${orgId}; soft-fill`,
      confidence: input.metrics?.leads?.total ? 'MEDIUM' : 'LOW',
      expectedImpact: 'Tăng chất lượng nurture và consistency messaging',
      estimatedCost: Math.round(Math.min(budget * 0.25, 5_000_000)),
      riskLevel: 'LOW',
      score: 500,
      sources: ['soft-fill'],
    });
  }

  if (!followUpActive && !convBottleneck && (input.metrics?.ads?.cpl != null || seeded.length < 2)) {
    seeded.push({
      draft: 'CAMPAIGN_DRAFT',
      title: 'Lập draft campaign / remarketing',
      whyNow: 'Funnel/follow-up ổn — soạn campaign draft (chưa live Ads).',
      evidence: `ads.cpl=${input.metrics?.ads?.cpl ?? 'n/a'}; ads.roas=${input.metrics?.ads?.roas ?? 'n/a'}`,
      confidence: input.metrics?.ads?.cpl != null ? 'MEDIUM' : 'LOW',
      expectedImpact: 'Mở rộng reach có kiểm soát sau khi conversion ổn',
      estimatedCost: Math.round(budget * 0.4),
      riskLevel: 'MEDIUM',
      score: 600,
      sources: ['metrics.ads', 'soft-fill'],
    });
  } else if (followUpActive || convBottleneck) {
    seeded.push({
      draft: 'CAMPAIGN_DRAFT',
      title: 'Giữ campaign draft — chưa tăng Ads',
      whyNow: 'Bottleneck đang ở follow-up/conversion; chỉ soạn draft, không scale Ads.',
      evidence: followUpActive
        ? `noFollowUp=${noFollowUp}`
        : `leadToBookingRate=${input.metrics?.conversion?.leadToBookingRate}`,
      confidence: 'HIGH',
      expectedImpact: 'Tránh lãng phí Ads trong khi pipeline chưa sẵn sàng',
      estimatedCost: Math.round(Math.min(budget * 0.1, 1_000_000)),
      riskLevel: 'LOW',
      score: 200,
      sources: ['safety.adsHold'],
    });
  }

  // Deduplicate by draft type, keep highest score
  const byDraft = new Map<string, RankedCandidate>();
  for (const item of seeded) {
    const prev = byDraft.get(item.draft);
    if (!prev || item.score > prev.score) byDraft.set(item.draft, item);
  }

  const ranked = [...byDraft.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, MARKETING_AUTOPILOT_NBA_V2_LIMITS.maxActions);

  if (followUpActive) {
    const autoIdx = ranked.findIndex((a) => a.draft === 'AUTOMATION_DRAFT');
    if (autoIdx > 0) {
      const [auto] = ranked.splice(autoIdx, 1);
      if (auto) ranked.unshift(auto);
    }
  }

  if ((followUpActive || convBottleneck) && ranked.length > 1 && isAdsScaleAction(ranked[0]!)) {
    const ads = ranked.shift()!;
    ranked.push(ads);
  }

  return ranked.map((item, idx) => ({
    priority: idx + 1,
    title: item.title,
    whyNow: item.whyNow,
    evidence: item.evidence,
    confidence: item.confidence,
    expectedImpact: item.expectedImpact,
    estimatedCost: item.estimatedCost,
    riskLevel: item.riskLevel,
    recommendedDraft: item.draft,
    type: item.draft,
    label: item.title.slice(0, 120),
    rankingSignals: {
      organizationId: orgId,
      sources: item.sources,
    },
  }));
}

function confidenceFromStatus(
  status: ForecastDataStatus,
  sampleSize: number | null,
): BudgetScenarioMetric['confidence'] {
  if (status === 'INSUFFICIENT_DATA') return 'INSUFFICIENT_DATA';
  if (status === 'historical' && (sampleSize ?? 0) >= 20) return 'HIGH';
  if (status === 'historical') return 'MEDIUM';
  if ((sampleSize ?? 0) >= 10) return 'MEDIUM';
  return 'LOW';
}

function metric(input: {
  value: number | null;
  status: ForecastDataStatus;
  basedOn: string[];
  timeRange: { from: string; to: string } | null;
  sampleSize: number | null;
  note?: string;
}): BudgetScenarioMetric {
  if (input.status === 'INSUFFICIENT_DATA' || input.value == null) {
    return {
      value: null,
      status: 'INSUFFICIENT_DATA',
      note: input.note ?? 'insufficient data',
      basedOn: input.basedOn.length ? input.basedOn : ['INSUFFICIENT_DATA'],
      timeRange: input.timeRange,
      sampleSize: input.sampleSize,
      confidence: 'INSUFFICIENT_DATA',
    };
  }
  return {
    value: input.value,
    status: input.status,
    note: input.note,
    basedOn: input.basedOn,
    timeRange: input.timeRange,
    sampleSize: input.sampleSize,
    confidence: confidenceFromStatus(input.status, input.sampleSize),
  };
}

function derivedCplFromMetrics(metrics?: NbaV2ContextMetrics): number | null {
  const histCpl = metrics?.ads?.cpl ?? null;
  if (histCpl != null && histCpl > 0) return histCpl;
  const spend = metrics?.ads?.spend ?? null;
  const adsLeads = metrics?.ads?.leads ?? null;
  const crmLeads = metrics?.leads?.total ?? null;
  const leadCount =
    adsLeads != null && adsLeads > 0 ? adsLeads : crmLeads != null && crmLeads > 0 ? crmLeads : null;
  if (spend != null && spend > 0 && leadCount != null && leadCount > 0) return spend / leadCount;
  return null;
}

function derivedConvFromMetrics(metrics?: NbaV2ContextMetrics): number | null {
  const convRatePct = metrics?.conversion?.leadToBookingRate ?? null;
  if (convRatePct != null && convRatePct > 0) return convRatePct / 100;
  const histLeads = metrics?.leads?.total ?? null;
  const histBookings = metrics?.bookings?.total ?? null;
  if (histLeads != null && histLeads > 0 && histBookings != null && histBookings >= 0) {
    return histBookings / histLeads;
  }
  return null;
}

function derivedAovFromMetrics(metrics?: NbaV2ContextMetrics, productPrice?: number): number | null {
  if (productPrice != null && productPrice > 0) return productPrice;
  const histBookings = metrics?.bookings?.total ?? null;
  const histRevenue = metrics?.revenue?.total ?? null;
  if (histBookings != null && histBookings > 0 && histRevenue != null && histRevenue > 0) {
    return histRevenue / histBookings;
  }
  return null;
}

/**
 * Budget scenario simulator — estimates ONLY from historical metrics.
 * Every metric carries basedOn / timeRange / sampleSize / confidence.
 * Missing inputs → INSUFFICIENT_DATA (never invent CPL/ROAS).
 */
export function simulateBudgetScenarios(input: {
  metrics?: NbaV2ContextMetrics;
  productPrice?: number;
  customBudget?: number | null;
  timeRange?: { from: string; to: string } | null;
}): BudgetScenario[] {
  const histCpl = input.metrics?.ads?.cpl ?? null;
  const histRoas = input.metrics?.ads?.roas ?? null;
  const histSpend = input.metrics?.ads?.spend ?? null;
  const histLeads = input.metrics?.leads?.total ?? null;
  const histBookings = input.metrics?.bookings?.total ?? null;
  const histRevenue = input.metrics?.revenue?.total ?? null;
  const convRatePct = input.metrics?.conversion?.leadToBookingRate ?? null;
  const productPrice = input.productPrice != null && input.productPrice > 0 ? input.productPrice : null;
  const timeRange = input.timeRange ?? null;

  const derivedCpl = derivedCplFromMetrics(input.metrics);
  const derivedConv = derivedConvFromMetrics(input.metrics);
  const derivedAov = derivedAovFromMetrics(input.metrics, productPrice ?? undefined);

  const scenarios: Array<{ id: AutopilotBudgetScenarioId; label: string; amount: number }> = [
    ...AUTOPILOT_BUDGET_SCENARIO_PRESETS.map((p) => ({ id: p.id, label: p.label, amount: p.amount })),
  ];

  if (input.customBudget != null && Number.isFinite(input.customBudget) && input.customBudget > 0) {
    const matchesPreset = AUTOPILOT_BUDGET_SCENARIO_PRESETS.some((p) => p.amount === input.customBudget);
    if (!matchesPreset) {
      scenarios.push({
        id: 'custom',
        label: `Tùy chỉnh (${Math.round(input.customBudget).toLocaleString('vi-VN')}đ)`,
        amount: Math.round(input.customBudget),
      });
    }
  }

  return scenarios.map((s) => {
    const assumptions: string[] = [];
    let missingCritical = 0;

    let cplStatus: ForecastDataStatus = 'INSUFFICIENT_DATA';
    let cplValue: number | null = null;
    let cplBasedOn: string[] = [];
    if (derivedCpl != null && derivedCpl > 0) {
      cplValue = Math.round(derivedCpl);
      cplStatus = histCpl != null ? 'historical' : 'estimate';
      cplBasedOn =
        histCpl != null
          ? ['ads.cpl']
          : histSpend != null && (input.metrics?.ads?.leads ?? 0) > 0
            ? ['ads.spend', 'ads.leads', 'formula:spend/leads']
            : ['ads.spend', 'leads.total', 'formula:spend/leads'];
      if (cplStatus === 'estimate') {
        assumptions.push('CPL ước từ ads.spend / leads.total (không có CPL lịch sử trực tiếp)');
      }
    } else {
      missingCritical += 1;
      assumptions.push('Thiếu CPL lịch sử — không thể ước Lead tin cậy');
      cplBasedOn = ['INSUFFICIENT_DATA'];
    }

    let leadsValue: number | null = null;
    let leadsStatus: ForecastDataStatus = 'INSUFFICIENT_DATA';
    let leadsBasedOn: string[] = [];
    if (cplValue != null && cplValue > 0) {
      leadsValue = Math.max(0, Math.round(s.amount / cplValue));
      leadsStatus = 'estimate';
      leadsBasedOn = ['scenario.budget', ...cplBasedOn, 'formula:budget/cpl'];
      assumptions.push(`Lead ≈ ngân sách / CPL (${cplValue})`);
    } else {
      leadsBasedOn = ['INSUFFICIENT_DATA'];
    }

    let bookingsValue: number | null = null;
    let bookingsStatus: ForecastDataStatus = 'INSUFFICIENT_DATA';
    let bookingsBasedOn: string[] = [];
    if (leadsValue != null && derivedConv != null && derivedConv >= 0) {
      bookingsValue = Math.max(0, Math.round(leadsValue * derivedConv));
      bookingsStatus = 'estimate';
      bookingsBasedOn =
        convRatePct != null
          ? ['estimate.leads', 'conversion.leadToBookingRate']
          : ['estimate.leads', 'bookings.total', 'leads.total'];
      assumptions.push(
        convRatePct != null
          ? `Booking ≈ Lead × leadToBookingRate (${convRatePct}%)`
          : 'Booking ≈ Lead × (bookings/leads lịch sử)',
      );
    } else {
      missingCritical += 1;
      assumptions.push('Thiếu tỷ lệ lead→booking — không ước Booking');
      bookingsBasedOn = ['INSUFFICIENT_DATA'];
    }

    let revenueValue: number | null = null;
    let revenueStatus: ForecastDataStatus = 'INSUFFICIENT_DATA';
    let revenueBasedOn: string[] = [];
    if (bookingsValue != null && derivedAov != null && derivedAov > 0) {
      revenueValue = Math.round(bookingsValue * derivedAov);
      revenueStatus = 'estimate';
      revenueBasedOn = productPrice != null
        ? ['estimate.bookings', 'productPrice']
        : ['estimate.bookings', 'revenue.total', 'bookings.total'];
      assumptions.push(
        productPrice != null
          ? `Revenue ≈ Booking × productPrice (${productPrice})`
          : 'Revenue ≈ Booking × AOV lịch sử',
      );
    } else if (bookingsValue != null) {
      assumptions.push('Thiếu giá SP / AOV — không ước Revenue');
      revenueBasedOn = ['INSUFFICIENT_DATA'];
    } else {
      revenueBasedOn = ['INSUFFICIENT_DATA'];
    }

    let cpaValue: number | null = null;
    let cpaStatus: ForecastDataStatus = 'INSUFFICIENT_DATA';
    let cpaBasedOn: string[] = [];
    if (bookingsValue != null && bookingsValue > 0) {
      cpaValue = Math.round(s.amount / bookingsValue);
      cpaStatus = 'estimate';
      cpaBasedOn = ['scenario.budget', 'estimate.bookings', 'formula:budget/bookings'];
    } else {
      assumptions.push('Thiếu Booking ước tính — không tính CPA');
      cpaBasedOn = ['INSUFFICIENT_DATA'];
    }

    let roasValue: number | null = null;
    let roasStatus: ForecastDataStatus = 'INSUFFICIENT_DATA';
    let roasBasedOn: string[] = [];
    if (histRoas != null && histRoas > 0 && revenueValue != null) {
      roasValue = s.amount > 0 ? Number((revenueValue / s.amount).toFixed(2)) : null;
      roasStatus = 'estimate';
      roasBasedOn = ['estimate.revenue', 'scenario.budget', 'ads.roas(ref)'];
      assumptions.push(`ROAS ước = revenue/budget; ROAS lịch sử tham chiếu = ${histRoas}`);
    } else if (revenueValue != null && s.amount > 0) {
      roasValue = Number((revenueValue / s.amount).toFixed(2));
      roasStatus = 'estimate';
      roasBasedOn = ['estimate.revenue', 'scenario.budget'];
      assumptions.push('ROAS ước = revenue ước / ngân sách (không có ROAS lịch sử)');
    } else if (histRoas != null && histRoas > 0) {
      roasValue = histRoas;
      roasStatus = 'historical';
      roasBasedOn = ['ads.roas'];
      assumptions.push('Chỉ có ROAS lịch sử — chưa đủ để forecast theo scenario');
    } else {
      assumptions.push('Thiếu ROAS / revenue — INSUFFICIENT_DATA');
      roasBasedOn = ['INSUFFICIENT_DATA'];
    }

    const leadSample = histLeads != null && histLeads >= 0 ? histLeads : null;
    const bookingSample = histBookings != null && histBookings >= 0 ? histBookings : null;

    const statuses = [cplStatus, leadsStatus, bookingsStatus, revenueStatus, cpaStatus, roasStatus];
    const insuffCount = statuses.filter((x) => x === 'INSUFFICIENT_DATA').length;
    const dataQuality =
      insuffCount >= 4 || missingCritical >= 2
        ? 'INSUFFICIENT_DATA'
        : insuffCount > 0
          ? 'PARTIAL'
          : 'SUFFICIENT';

    return {
      scenarioId: s.id,
      label: s.label,
      monthlyBudget: s.amount,
      timeRange,
      estimates: {
        leads: metric({
          value: leadsValue,
          status: leadsStatus,
          basedOn: leadsBasedOn,
          timeRange,
          sampleSize: leadSample,
          note: leadsStatus === 'INSUFFICIENT_DATA' ? 'insufficient data — thiếu CPL lịch sử' : undefined,
        }),
        bookings: metric({
          value: bookingsValue,
          status: bookingsStatus,
          basedOn: bookingsBasedOn,
          timeRange,
          sampleSize: bookingSample,
          note:
            bookingsStatus === 'INSUFFICIENT_DATA'
              ? 'insufficient data — thiếu conversion lịch sử'
              : undefined,
        }),
        revenue: metric({
          value: revenueValue,
          status: revenueStatus,
          basedOn: revenueBasedOn,
          timeRange,
          sampleSize: bookingSample,
          note: revenueStatus === 'INSUFFICIENT_DATA' ? 'insufficient data — thiếu AOV/giá SP' : undefined,
        }),
        cpl: metric({
          value: cplValue,
          status: cplStatus,
          basedOn: cplBasedOn,
          timeRange,
          sampleSize: leadSample,
          note: cplStatus === 'INSUFFICIENT_DATA' ? 'insufficient data' : undefined,
        }),
        cpa: metric({
          value: cpaValue,
          status: cpaStatus,
          basedOn: cpaBasedOn,
          timeRange,
          sampleSize: bookingSample,
          note: cpaStatus === 'INSUFFICIENT_DATA' ? 'insufficient data' : undefined,
        }),
        roas: metric({
          value: roasValue,
          status: roasStatus,
          basedOn: roasBasedOn,
          timeRange,
          sampleSize: leadSample,
          note: roasStatus === 'INSUFFICIENT_DATA' ? 'insufficient data' : undefined,
        }),
      },
      dataQuality,
      assumptions: [...new Set(assumptions)].slice(0, 8),
    };
  });
}

export function canForecastBudgetFromMetrics(
  metrics?: NbaV2ContextMetrics,
  productPrice?: number,
): boolean {
  return (
    derivedCplFromMetrics(metrics) != null &&
    derivedConvFromMetrics(metrics) != null &&
    derivedAovFromMetrics(metrics, productPrice) != null
  );
}

export function describeBudgetDataGaps(
  metrics?: NbaV2ContextMetrics,
  productPrice?: number,
): { canForecast: boolean; reason: string; missing: string[] } {
  const missing: string[] = [];
  if (derivedCplFromMetrics(metrics) == null) {
    missing.push('Chi phí mỗi lead (CPL) từ quảng cáo hoặc chi tiêu ads + số lead');
  }
  if (derivedConvFromMetrics(metrics) == null) {
    missing.push('Tỷ lệ Lead → Booking từ CRM/lịch hẹn');
  }
  if (derivedAovFromMetrics(metrics, productPrice) == null) {
    missing.push('Giá trị đơn hàng trung bình (doanh thu / booking hoặc giá sản phẩm)');
  }
  return {
    canForecast: missing.length === 0,
    reason: 'Chưa đủ dữ liệu lịch sử để dự báo chính xác.',
    missing,
  };
}

export function pickBudgetSimSource(input: {
  metrics?: NbaV2ContextMetrics;
  timeRange?: { from: string; to: string } | null;
  windows?: Array<{
    days?: number;
    metrics?: NbaV2ContextMetrics;
    timeRange?: { from: string; to: string } | null;
  }>;
  productPrice?: number;
}): { metrics?: NbaV2ContextMetrics; timeRange?: { from: string; to: string } | null } {
  const rank = (days: number) => (days === 30 ? 0 : days === 90 ? 1 : days === 7 ? 2 : 3);
  const candidates = [
    { metrics: input.metrics, timeRange: input.timeRange ?? null, days: 30 },
    ...(input.windows ?? []).map((w) => ({
      metrics: w.metrics,
      timeRange: w.timeRange ?? null,
      days: typeof w.days === 'number' ? w.days : 0,
    })),
  ].sort((a, b) => rank(a.days) - rank(b.days));
  for (const c of candidates) {
    if (canForecastBudgetFromMetrics(c.metrics, input.productPrice)) {
      return { metrics: c.metrics, timeRange: c.timeRange };
    }
  }
  return { metrics: input.metrics, timeRange: input.timeRange ?? null };
}

export type BudgetAssumptionInput = {
  cpl: number;
  leadToBookingRatePct: number;
  averageOrderValue: number;
};

export function simulateBudgetScenariosFromAssumptions(
  input: BudgetAssumptionInput,
  customBudget?: number | null,
): BudgetScenario[] {
  const cpl = Number(input.cpl);
  const rate = Number(input.leadToBookingRatePct);
  const aov = Number(input.averageOrderValue);
  if (!(cpl > 0) || !(rate > 0) || !(aov > 0)) {
    return simulateBudgetScenarios({ metrics: {}, customBudget }).map((s) => ({
      ...s,
      mode: 'assumption' as const,
    }));
  }
  return simulateBudgetScenarios({
    productPrice: aov,
    customBudget,
    metrics: {
      ads: { cpl },
      conversion: { leadToBookingRate: rate },
    },
  }).map((s) => ({
    ...s,
    mode: 'assumption' as const,
    assumptions: ['Ước tính theo giả định, không phải dự báo AI.'],
    dataQuality: s.dataQuality === 'INSUFFICIENT_DATA' ? s.dataQuality : 'PARTIAL',
  }));
}

const CONFIDENCE_VI: Record<string, string> = {
  HIGH: 'Cao',
  MEDIUM: 'Trung bình',
  LOW: 'Thấp',
};

function formatVndPlain(amount: number): string {
  return `${Math.round(amount).toLocaleString('vi-VN')}đ`;
}

export type BudgetScenarioCardView = {
  scenarioId: string;
  label: string;
  budgetLabel: string;
  leadsLabel: string;
  bookingsLabel: string;
  revenueLabel: string;
  roasLabel: string;
  confidenceLabel: string;
};

export type BudgetScenarioUiView =
  | { kind: 'ready'; source: 'historical' | 'assumption'; cards: BudgetScenarioCardView[]; disclaimer?: string }
  | { kind: 'insufficient'; reason: string; missing: string[] };

/** Presentation layer: never emits INSUFFICIENT_DATA / conf= / basedOn= / sample=. */
export function toBudgetScenarioUiView(
  scenarios: BudgetScenario[] | undefined,
  opts?: { metrics?: NbaV2ContextMetrics; productPrice?: number; mode?: 'historical' | 'assumption' },
): BudgetScenarioUiView {
  const list = scenarios ?? [];
  const mode = opts?.mode ?? (list.some((s) => s.mode === 'assumption') ? 'assumption' : 'historical');
  const usable = list.filter(
    (s) =>
      s.estimates.leads.value != null &&
      s.estimates.bookings.value != null &&
      s.estimates.revenue.value != null &&
      s.estimates.roas.value != null,
  );
  if (!usable.length) {
    const gaps = describeBudgetDataGaps(opts?.metrics, opts?.productPrice);
    return { kind: 'insufficient', reason: gaps.reason, missing: gaps.missing };
  }
  const cards = usable.map((s) => {
    const confRaw = s.estimates.leads.confidence;
    const confidenceLabel =
      mode === 'assumption'
        ? 'Theo giả định'
        : confRaw && confRaw !== 'INSUFFICIENT_DATA'
          ? CONFIDENCE_VI[confRaw] ?? 'Thấp'
          : 'Thấp';
    return {
      scenarioId: s.scenarioId,
      label: s.label,
      budgetLabel: formatVndPlain(s.monthlyBudget),
      leadsLabel: Math.round(s.estimates.leads.value ?? 0).toLocaleString('vi-VN'),
      bookingsLabel: Math.round(s.estimates.bookings.value ?? 0).toLocaleString('vi-VN'),
      revenueLabel: formatVndPlain(s.estimates.revenue.value ?? 0),
      roasLabel: `${Number(s.estimates.roas.value ?? 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} lần`,
      confidenceLabel,
    };
  });
  return {
    kind: 'ready',
    source: mode,
    cards,
    disclaimer:
      mode === 'assumption' ? 'Ước tính theo giả định, không phải dự báo AI.' : undefined,
  };
}

export function budgetScenarioUiHasTechnicalLeak(view: BudgetScenarioUiView): boolean {
  const blob = JSON.stringify(view);
  return /INSUFFICIENT_DATA|conf=|basedOn=|sample=/i.test(blob);
}

/** True when forecasts never invent numbers without source metadata. */
export function assertNoFakeForecast(scenarios: BudgetScenario[]): boolean {
  for (const s of scenarios) {
    for (const key of ['leads', 'bookings', 'revenue', 'cpl', 'cpa', 'roas'] as const) {
      const m = s.estimates[key];
      if (m.value != null && m.status === 'INSUFFICIENT_DATA') return false;
      if (m.status === 'historical' && m.value == null) return false;
      if (!Array.isArray(m.basedOn) || m.basedOn.length === 0) return false;
      if (m.confidence == null) return false;
      if (m.value != null && m.confidence === 'INSUFFICIENT_DATA') return false;
      if (m.status === 'INSUFFICIENT_DATA' && m.value != null) return false;
    }
  }
  return true;
}

export function assertForecastSourceComplete(scenarios: BudgetScenario[]): boolean {
  for (const s of scenarios) {
    for (const key of ['leads', 'bookings', 'revenue', 'cpl', 'cpa', 'roas'] as const) {
      const m = s.estimates[key];
      if (!('basedOn' in m) || !('timeRange' in m) || !('sampleSize' in m) || !('confidence' in m)) {
        return false;
      }
      if (m.status === 'INSUFFICIENT_DATA' && m.value != null) return false;
    }
  }
  return true;
}

export function parseNextBestActionsV2(raw: unknown): MarketingAutopilotNextBestActionV2[] {
  return z.array(marketingAutopilotNextBestActionV2Schema).max(5).parse(raw);
}
