/**
 * NBA V3 Decision Engine — Impact × Confidence × Urgency × GoalAlignment / Cost / Risk
 * Output shape stays V2-compatible for existing UI + confirmDraft.
 */
import {
  HIGH_RISK_LIVE_ACTION_TYPES,
  MARKETING_AUTOPILOT_NBA_V2_LIMITS,
  NBA_DRAFT_ADAPTER_MAP,
  assertNoFakeForecast,
  mapRecommendedDraft,
  resolveConfirmDraftTypes,
  resolveConfirmIdempotencyKey,
  shouldReuseDraftRun,
  simulateBudgetScenarios,
  type MarketingAutopilotDraftType,
  type MarketingAutopilotNextBestActionV2,
  type NbaV2CandidateInput,
  type NbaV2ContextMetrics,
  type NbaV2Insight,
} from './marketing-autopilot-nba-v2';

export const MARKETING_AUTOPILOT_NBA_V3_LIMITS = {
  maxActions: 5,
  version: 'v3' as const,
} as const;

export {
  HIGH_RISK_LIVE_ACTION_TYPES,
  NBA_DRAFT_ADAPTER_MAP,
  assertNoFakeForecast,
  mapRecommendedDraft,
  resolveConfirmDraftTypes,
  resolveConfirmIdempotencyKey,
  shouldReuseDraftRun,
  simulateBudgetScenarios,
};

const CONF_W = {
  HIGH: 1,
  MEDIUM: 0.7,
  LOW: 0.4,
  INSUFFICIENT_DATA: 0.15,
} as const;

const RISK_W = {
  LOW: 1,
  MEDIUM: 1.35,
  HIGH: 2.2,
} as const;

function confWeight(c: string): number {
  return CONF_W[c as keyof typeof CONF_W] ?? 0.7;
}

function riskWeight(r: string): number {
  return RISK_W[r as keyof typeof RISK_W] ?? 1.35;
}

function followUpBottleneck(metrics?: NbaV2ContextMetrics) {
  const noFollowUp = metrics?.leads?.noFollowUp ?? 0;
  const total = metrics?.leads?.total ?? 0;
  const active = noFollowUp > 0 && (total === 0 || noFollowUp / Math.max(total, 1) >= 0.2);
  return { active, noFollowUp, total };
}

function conversionBottleneck(metrics?: NbaV2ContextMetrics) {
  const rate = metrics?.conversion?.leadToBookingRate ?? null;
  return rate != null && rate > 0 && rate < 15;
}

function funnelBroken(metrics?: NbaV2ContextMetrics) {
  const funnels = metrics?.funnel?.activeFunnels ?? 0;
  const inFunnel = metrics?.funnel?.leadsInFunnel ?? 0;
  return funnels === 0 || (inFunnel === 0 && (metrics?.leads?.total ?? 0) > 5);
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
  if (draft === 'CAMPAIGN_DRAFT') {
    const text = `${action.title ?? ''} ${action.whyNow ?? ''}`.toLowerCase();
    return /(?:tăng|scale|mở rộng|boost)\s*ads|ads budget|scale ads|tăng ngân sách/.test(text);
  }
  const text = `${action.title ?? ''} ${action.whyNow ?? ''}`.toLowerCase();
  return /(?:^|[\s,;])(?:tăng|scale|mở rộng|tang|boost)\s*ads|ads budget|scale ads/.test(text);
}

function impactScore(draft: MarketingAutopilotDraftType, metrics?: NbaV2ContextMetrics): number {
  const { active: followUp } = followUpBottleneck(metrics);
  const conv = conversionBottleneck(metrics);
  if (draft === 'AUTOMATION_DRAFT' && followUp) return 1;
  if (draft === 'FUNNEL_DRAFT' && (conv || funnelBroken(metrics))) return 0.95;
  if (draft === 'CONTENT_DRAFT') return 0.7;
  if (draft === 'CAMPAIGN_DRAFT') return followUp || conv || funnelBroken(metrics) ? 0.25 : 0.75;
  return 0.5;
}

function urgencyScore(
  draft: MarketingAutopilotDraftType,
  metrics?: NbaV2ContextMetrics,
  whyNow?: string,
): number {
  const { active: followUp, noFollowUp } = followUpBottleneck(metrics);
  if (draft === 'AUTOMATION_DRAFT' && followUp) return Math.min(1, 0.6 + noFollowUp / 50);
  if (draft === 'FUNNEL_DRAFT' && conversionBottleneck(metrics)) return 0.9;
  if (/ngay|urgent|bottleneck|SLA|breach/i.test(whyNow ?? '')) return 0.85;
  return 0.5;
}

function goalAlignment(draft: MarketingAutopilotDraftType, primaryGoal?: string): number {
  const g = (primaryGoal ?? '').toLowerCase();
  if (!g) return 0.6;
  if (/booking|chốt|tư vấn/.test(g) && (draft === 'FUNNEL_DRAFT' || draft === 'AUTOMATION_DRAFT'))
    return 1;
  if (/lead|nhận diện|awareness/.test(g) && (draft === 'CONTENT_DRAFT' || draft === 'CAMPAIGN_DRAFT'))
    return 0.95;
  if (/remarketing|khách cũ|giữ chân/.test(g) && draft === 'CAMPAIGN_DRAFT') return 0.95;
  if (/doanh thu|revenue/.test(g) && draft === 'FUNNEL_DRAFT') return 0.9;
  return 0.55;
}

function costPenalty(estimatedCost: number | null, monthlyBudget: number): number {
  if (estimatedCost == null || monthlyBudget <= 0) return 1;
  const ratio = estimatedCost / monthlyBudget;
  if (ratio <= 0.1) return 1;
  if (ratio <= 0.3) return 1.15;
  if (ratio <= 0.5) return 1.4;
  return 1.8;
}

function insightToDraft(category: string, title: string): MarketingAutopilotDraftType | null {
  const c = `${category} ${title}`.toLowerCase();
  if (/follow.?up|crm|lead|automation|chăm sóc/.test(c)) return 'AUTOMATION_DRAFT';
  if (/funnel|conversion|chuyển đổi|pipeline|bottleneck/.test(c)) return 'FUNNEL_DRAFT';
  if (/content|nội dung|teleprompter|creative|opportunity/.test(c)) return 'CONTENT_DRAFT';
  if (/campaign|ads|remarketing|quảng cáo/.test(c)) return 'CAMPAIGN_DRAFT';
  return null;
}

type Ranked = {
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
  dependencyBlocked?: boolean;
};

function scoreFormula(input: {
  impact: number;
  confidence: number;
  urgency: number;
  goalAlign: number;
  costFactor: number;
  riskFactor: number;
}): number {
  const num = input.impact * input.confidence * input.urgency * input.goalAlign;
  const den = Math.max(0.2, input.costFactor * input.riskFactor);
  return (num / den) * 1000;
}

/**
 * Rank ≤5 next-best actions with V3 decision formula + dependency guards.
 * Never recommends scale Ads when funnel/lead follow-up is broken.
 */
export function rankNextBestActionsV3(input: {
  organizationId?: string;
  metrics?: NbaV2ContextMetrics;
  candidates?: NbaV2CandidateInput[];
  insights?: NbaV2Insight[];
  bottlenecks?: Array<{ kind?: string; title?: string; evidence?: string; severity?: string }>;
  opportunities?: Array<{ kind?: string; title?: string; evidence?: string }>;
  monthlyBudget?: number;
  primaryGoal?: string;
  timeRange?: { from: string; to: string } | null;
  safety?: { draftOnly?: boolean };
}): MarketingAutopilotNextBestActionV2[] {
  const orgId = input.organizationId ?? 'unknown-org';
  const { active: followUpActive, noFollowUp, total } = followUpBottleneck(input.metrics);
  const convBottleneck = conversionBottleneck(input.metrics);
  const funnelIssue = funnelBroken(input.metrics);
  const adsBlocked = followUpActive || convBottleneck || funnelIssue;
  const budget = input.monthlyBudget ?? 0;
  const draftOnly = input.safety?.draftOnly !== false;
  const goal = input.primaryGoal ?? '';

  const seeded: Ranked[] = [];

  if (followUpActive) {
    const conf = 'HIGH' as const;
    const cost = Math.round(Math.min(budget * 0.15, 2_000_000));
    seeded.push({
      draft: 'AUTOMATION_DRAFT',
      title: `Chăm sóc ${noFollowUp} lead chưa follow-up`,
      whyNow: `${noFollowUp}/${Math.max(total, noFollowUp)} lead đang chờ — phải xử lý trước khi scale Ads.`,
      evidence: `leads.noFollowUp=${noFollowUp}; leads.total=${total || 'n/a'}; organizationId=${orgId}`,
      confidence: conf,
      expectedImpact: 'Thu hồi lead nóng → tăng booking không tăng chi phí Ads',
      estimatedCost: cost,
      riskLevel: 'LOW',
      score: scoreFormula({
        impact: 1,
        confidence: confWeight("HIGH"),
        urgency: Math.min(1, 0.6 + noFollowUp / 50),
        goalAlign: goalAlignment('AUTOMATION_DRAFT', goal),
        costFactor: costPenalty(cost, budget),
        riskFactor: riskWeight("LOW"),
      }),
      sources: ['metrics.leads', 'nba-v3.followUp'],
    });
  }

  if (convBottleneck || funnelIssue) {
    const cost = Math.round(Math.min(budget * 0.2, 3_000_000));
    seeded.push({
      draft: 'FUNNEL_DRAFT',
      title: 'Tối ưu funnel chuyển đổi lead → booking',
      whyNow: convBottleneck
        ? `Lead-to-booking ${input.metrics?.conversion?.leadToBookingRate}% thấp — tăng Ads lúc này lãng phí.`
        : 'Funnel chưa sẵn sàng tiếp nhận traffic — ưu tiên dựng/sửa funnel trước Ads.',
      evidence: `conversion.leadToBookingRate=${input.metrics?.conversion?.leadToBookingRate}; funnel.active=${input.metrics?.funnel?.activeFunnels}; organizationId=${orgId}`,
      confidence: 'HIGH',
      expectedImpact: 'Cải thiện conversion trước khi scale traffic',
      estimatedCost: cost,
      riskLevel: 'MEDIUM',
      score: scoreFormula({
        impact: 0.95,
        confidence: confWeight("HIGH"),
        urgency: 0.9,
        goalAlign: goalAlignment('FUNNEL_DRAFT', goal),
        costFactor: costPenalty(cost, budget),
        riskFactor: riskWeight("MEDIUM"),
      }),
      sources: ['metrics.conversion', 'nba-v3.funnel'],
    });
  }

  for (const b of input.bottlenecks ?? []) {
    const draft =
      insightToDraft(b.kind ?? 'bottleneck', b.title ?? '') ??
      (followUpActive ? 'AUTOMATION_DRAFT' : 'FUNNEL_DRAFT');
    const cost = Math.round(Math.min(budget * 0.12, 2_000_000));
    seeded.push({
      draft,
      title: (b.title ?? 'Xử lý bottleneck').slice(0, 160),
      whyNow: `Bottleneck Context V2: ${(b.title ?? '').slice(0, 200)}`,
      evidence: (b.evidence ?? `bottleneck:${b.kind}`).slice(0, 600),
      confidence: 'HIGH',
      expectedImpact: 'Giảm bottleneck trước khi mở rộng kênh',
      estimatedCost: cost,
      riskLevel: 'MEDIUM',
      score: scoreFormula({
        impact: impactScore(draft, input.metrics),
        confidence: confWeight("HIGH"),
        urgency: 0.85,
        goalAlign: goalAlignment(draft, goal),
        costFactor: costPenalty(cost, budget),
        riskFactor: riskWeight("MEDIUM"),
      }),
      sources: ['context-v2.bottleneck', b.kind ?? 'bottleneck'],
    });
  }

  for (const o of input.opportunities ?? []) {
    const draft = insightToDraft(o.kind ?? 'opportunity', o.title ?? '') ?? 'CONTENT_DRAFT';
    if (draft === 'CAMPAIGN_DRAFT' && adsBlocked) continue;
    const cost = Math.round(Math.min(budget * 0.12, 2_000_000));
    seeded.push({
      draft,
      title: (o.title ?? 'Tận dụng opportunity').slice(0, 160),
      whyNow: `Cơ hội Context V2: ${(o.title ?? '').slice(0, 200)}`,
      evidence: (o.evidence ?? `opportunity:${o.kind}`).slice(0, 600),
      confidence: 'MEDIUM',
      expectedImpact: 'Khai thác tín hiệu tích cực từ dữ liệu doanh nghiệp',
      estimatedCost: cost,
      riskLevel: 'LOW',
      score: scoreFormula({
        impact: impactScore(draft, input.metrics),
        confidence: confWeight("MEDIUM"),
        urgency: 0.55,
        goalAlign: goalAlignment(draft, goal),
        costFactor: costPenalty(cost, budget),
        riskFactor: riskWeight("LOW"),
      }),
      sources: ['context-v2.opportunity', o.kind ?? 'opportunity'],
    });
  }

  for (const insight of input.insights ?? []) {
    if (insight.confidence === 'INSUFFICIENT_DATA') continue;
    const draft = insightToDraft(insight.category, insight.title);
    if (!draft) continue;
    if (draft === 'CAMPAIGN_DRAFT' && adsBlocked && isAdsScaleAction({ title: insight.title, recommendedDraft: draft })) {
      continue;
    }
    const conf = (['HIGH', 'MEDIUM', 'LOW'].includes(String(insight.confidence))
      ? insight.confidence
      : 'MEDIUM') as MarketingAutopilotNextBestActionV2['confidence'];
    const cost = Math.round(Math.min(budget * 0.12, 2_000_000));
    seeded.push({
      draft,
      title: insight.title.slice(0, 160),
      whyNow: (insight.summary || insight.title).slice(0, 600),
      evidence: (insight.evidence || `${insight.source || 'context'}:${insight.category}`).slice(0, 600),
      confidence: conf,
      expectedImpact: `Xử lý insight ${insight.category} từ Marketing Context`,
      estimatedCost: cost,
      riskLevel: draft === 'CAMPAIGN_DRAFT' ? 'MEDIUM' : 'LOW',
      score: scoreFormula({
        impact: impactScore(draft, input.metrics),
        confidence: confWeight(conf),
        urgency: urgencyScore(draft, input.metrics, insight.summary),
        goalAlign: goalAlignment(draft, goal),
        costFactor: costPenalty(cost, budget),
        riskFactor: riskWeight(draft === "CAMPAIGN_DRAFT" ? "MEDIUM" : "LOW"),
      }),
      sources: ['marketing-context', insight.category],
    });
  }

  for (const c of input.candidates ?? []) {
    const draft = mapRecommendedDraft(c.recommendedDraft) ?? mapRecommendedDraft(c.type);
    if (!draft) continue;
    const evidenceObj = typeof c.evidence === 'object' && c.evidence ? c.evidence : null;
    const evidenceText =
      typeof c.evidence === 'string'
        ? c.evidence
        : evidenceObj?.evidence ?? evidenceObj?.reason ?? 'strategy-planner';
    const title = (c.title ?? c.label ?? draft).trim();
    const whyNow = (c.whyNow ?? c.rationale ?? evidenceObj?.reason ?? title).trim();
    const conf = (['HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT_DATA'].includes(
      String(c.confidence ?? evidenceObj?.confidence),
    )
      ? (c.confidence ?? evidenceObj?.confidence)
      : 'MEDIUM') as MarketingAutopilotNextBestActionV2['confidence'];
    const risk = (['LOW', 'MEDIUM', 'HIGH'].includes(String(c.riskLevel ?? evidenceObj?.riskLevel))
      ? (c.riskLevel ?? evidenceObj?.riskLevel)
      : 'MEDIUM') as MarketingAutopilotNextBestActionV2['riskLevel'];
    const cost = c.estimatedCost ?? Math.round(Math.min(budget * 0.15, 3_000_000));

    let dependencyBlocked = false;
    if (isAdsScaleAction({ type: draft, title, whyNow, recommendedDraft: draft }) && adsBlocked) {
      dependencyBlocked = true;
    }

    let score = scoreFormula({
      impact: impactScore(draft, input.metrics),
      confidence: confWeight(conf),
      urgency: urgencyScore(draft, input.metrics, whyNow),
      goalAlign: goalAlignment(draft, goal) * (typeof c.priority === 'number' ? (6 - c.priority) / 5 : 1),
      costFactor: costPenalty(cost, budget),
      riskFactor: riskWeight(String(risk)),
    });
    if (dependencyBlocked) score = Math.min(score, 120);

    seeded.push({
      draft,
      title: title.slice(0, 160),
      whyNow: whyNow.slice(0, 600),
      evidence: evidenceText.slice(0, 600),
      confidence: conf,
      expectedImpact: String(
        c.expectedImpact ?? evidenceObj?.expectedImpact ?? 'Cải thiện pipeline marketing',
      ).slice(0, 400),
      estimatedCost: cost,
      riskLevel: risk,
      score,
      sources: ['strategy-planner-v3'],
      dependencyBlocked,
    });
  }

  if (seeded.length < 3 && !followUpActive) {
    const cost = Math.round(Math.min(budget * 0.25, 5_000_000));
    seeded.push({
      draft: 'CONTENT_DRAFT',
      title: 'Chuẩn bị bộ content theo funnel',
      whyNow: 'Thiếu tín hiệu mạnh — bắt đầu bằng content draft đồng bộ thông điệp (grounded soft-fill).',
      evidence: `organizationId=${orgId}; soft-fill; INSUFFICIENT_DATA_PARTIAL`,
      confidence: input.metrics?.leads?.total ? 'MEDIUM' : 'LOW',
      expectedImpact: 'Tăng chất lượng nurture và consistency messaging',
      estimatedCost: cost,
      riskLevel: 'LOW',
      score: scoreFormula({
        impact: 0.65,
        confidence: confWeight("MEDIUM"),
        urgency: 0.4,
        goalAlign: goalAlignment('CONTENT_DRAFT', goal),
        costFactor: costPenalty(cost, budget),
        riskFactor: riskWeight("LOW"),
      }),
      sources: ['soft-fill'],
    });
  }

  if (adsBlocked) {
    seeded.push({
      draft: 'CAMPAIGN_DRAFT',
      title: 'Giữ campaign draft — chưa tăng Ads',
      whyNow: 'Dependency: funnel/follow-up đang lỗi — chỉ soạn draft, tuyệt đối không scale Ads.',
      evidence: followUpActive
        ? `noFollowUp=${noFollowUp}`
        : convBottleneck
          ? `leadToBookingRate=${input.metrics?.conversion?.leadToBookingRate}`
          : `funnel.active=${input.metrics?.funnel?.activeFunnels}`,
      confidence: 'HIGH',
      expectedImpact: 'Tránh lãng phí Ads khi pipeline chưa sẵn sàng',
      estimatedCost: Math.round(Math.min(budget * 0.1, 1_000_000)),
      riskLevel: 'LOW',
      score: 110,
      sources: ['nba-v3.dependency.adsHold'],
      dependencyBlocked: true,
    });
  } else if (input.metrics?.ads?.cpl != null || seeded.length < 2) {
    const cost = Math.round(budget * 0.4);
    seeded.push({
      draft: 'CAMPAIGN_DRAFT',
      title: 'Lập draft campaign / remarketing',
      whyNow: 'Funnel/follow-up ổn — soạn campaign draft (chưa live Ads).',
      evidence: `ads.cpl=${input.metrics?.ads?.cpl ?? 'n/a'}; ads.roas=${input.metrics?.ads?.roas ?? 'n/a'}`,
      confidence: input.metrics?.ads?.cpl != null ? 'MEDIUM' : 'LOW',
      expectedImpact: 'Mở rộng reach có kiểm soát sau khi conversion ổn',
      estimatedCost: cost,
      riskLevel: 'MEDIUM',
      score: scoreFormula({
        impact: 0.75,
        confidence: confWeight("MEDIUM"),
        urgency: 0.5,
        goalAlign: goalAlignment('CAMPAIGN_DRAFT', goal),
        costFactor: costPenalty(cost, budget),
        riskFactor: riskWeight("MEDIUM"),
      }),
      sources: ['metrics.ads', 'nba-v3'],
    });
  }

  const byDraft = new Map<string, Ranked>();
  for (const item of seeded) {
    if (draftOnly && item.dependencyBlocked && item.draft === 'CAMPAIGN_DRAFT' && isAdsScaleAction(item)) {
      // keep hold action only
    }
    const prev = byDraft.get(item.draft);
    if (!prev || item.score > prev.score) byDraft.set(item.draft, item);
  }

  const ranked = [...byDraft.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, MARKETING_AUTOPILOT_NBA_V3_LIMITS.maxActions);

  if (followUpActive) {
    const autoIdx = ranked.findIndex((a) => a.draft === 'AUTOMATION_DRAFT');
    if (autoIdx > 0) {
      const [auto] = ranked.splice(autoIdx, 1);
      if (auto) ranked.unshift(auto);
    }
  }

  if (adsBlocked && ranked.length > 1 && isAdsScaleAction(ranked[0]!)) {
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
      sources: [...item.sources, 'nba-v3'],
    },
  }));
}

/** Alias keeping V2 name for gradual migration — V3 implementation. */
export function rankNextBestActionsV2Compat(
  input: Parameters<typeof rankNextBestActionsV3>[0],
): MarketingAutopilotNextBestActionV2[] {
  return rankNextBestActionsV3(input).slice(0, MARKETING_AUTOPILOT_NBA_V2_LIMITS.maxActions);
}
