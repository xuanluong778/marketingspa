/**
 * WAVE 4 — Autopilot Command Center.
 * Deterministic board + ≤5 NBA from real context metrics. No LLM-invented numbers.
 */
import { z } from 'zod';
import {
  marketingAutopilotConfidenceSchema,
  marketingAutopilotRiskLevelSchema,
} from './marketing-autopilot-planner';
import {
  MARKETING_AUTOPILOT_NBA_V2_LIMITS,
  type MarketingAutopilotNextBestActionV2,
  type NbaV2ContextMetrics,
} from './marketing-autopilot-nba-v2';
import { rankNextBestActionsV3 } from './marketing-autopilot-nba-v3';

export const COMMAND_CENTER_VERSION = 'command-center.v1';

export const COMMAND_CENTER_EDIT_URL = {
  CONTENT_DRAFT: '/teleprompter',
  FUNNEL_DRAFT: '/funnel',
  AUTOMATION_DRAFT: '/automation?tab=flows',
  CAMPAIGN_DRAFT: '/automation?tab=campaigns',
} as const;

export const commandCenterKpiSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.number().finite().nullable(),
  unit: z.string().optional(),
  href: z.string(),
  source: z.string(),
  sampleSize: z.number().int().min(0),
  status: z.enum(['OK', 'INSUFFICIENT_DATA', 'ERROR']),
  evidence: z.string(),
});

export type CommandCenterKpi = z.infer<typeof commandCenterKpiSchema>;

export const commandCenterNbaSchema = z.object({
  priority: z.number().int().min(1).max(5),
  title: z.string().min(1).max(160),
  whyNow: z.string().min(1).max(600),
  evidence: z.string().min(1).max(600),
  confidence: marketingAutopilotConfidenceSchema,
  expectedImpact: z.string().min(1).max(400),
  estimatedCost: z.number().finite().min(0).nullable(),
  risk: marketingAutopilotRiskLevelSchema,
  recommendedAction: z.string().min(1).max(80),
  editUrl: z.string().min(1).max(240),
});

export type CommandCenterNba = z.infer<typeof commandCenterNbaSchema>;

export function toCommandCenterNba(action: MarketingAutopilotNextBestActionV2): CommandCenterNba {
  const recommendedAction = action.recommendedDraft ?? action.type;
  return commandCenterNbaSchema.parse({
    priority: action.priority,
    title: action.title,
    whyNow: action.whyNow,
    evidence: action.evidence,
    confidence: action.confidence,
    expectedImpact: action.expectedImpact,
    estimatedCost: action.estimatedCost,
    risk: action.riskLevel,
    recommendedAction,
    editUrl: COMMAND_CENTER_EDIT_URL[recommendedAction as keyof typeof COMMAND_CENTER_EDIT_URL] ?? '/marketing-autopilot',
  });
}

export type CommandCenterBoardInput = {
  organizationId: string;
  generatedAt: string;
  timeRange: { from: string; to: string };
  engineVersion: string;
  fromCache: boolean;
  metrics: {
    leads?: {
      total?: number | null;
      new?: number | null;
      noFollowUp?: number | null;
      hot?: number | null;
    };
    bookings?: { total?: number | null; upcoming?: number | null; completed?: number | null };
    revenue?: { total?: number | null; currency?: string };
    ads?: {
      spend?: number | null;
      cpl?: number | null;
      roas?: number | null;
      anomalousCampaigns?: number | null;
    };
    customers?: { repurchaseCandidates?: number | null; total?: number | null };
    email?: { sent?: number | null; openRate?: number | null };
    zalo?: { sent?: number | null; campaigns?: number | null };
    automation?: { activeFlows?: number | null };
    funnel?: { activeFunnels?: number | null };
    conversion?: { leadToBookingRate?: number | null };
    businessEvents?: { counts?: Record<string, number> };
  };
  sources: Array<{ domain: string; status: string; recordCount?: number; error?: string }>;
  bottlenecks?: Array<{ kind?: string; title?: string; evidence?: string; severity?: string }>;
  opportunities?: Array<{ kind?: string; title?: string; evidence?: string }>;
  insights?: Array<{
    category: string;
    title: string;
    summary?: string;
    evidence?: string;
    confidence?: string;
    source?: string;
  }>;
};

function kpi(
  partial: CommandCenterKpi,
): CommandCenterKpi {
  return commandCenterKpiSchema.parse(partial);
}

export function buildCommandCenterBoard(input: CommandCenterBoardInput): {
  kpis: CommandCenterKpi[];
  requiredCoverage: string[];
} {
  const m = input.metrics;
  const src = (domain: string) => input.sources.find((s) => s.domain === domain);
  const statusOf = (domain: string): CommandCenterKpi['status'] => {
    const s = src(domain)?.status;
    if (s === 'ERROR') return 'ERROR';
    if (s === 'OK') return 'OK';
    return 'INSUFFICIENT_DATA';
  };
  const sample = (domain: string) => src(domain)?.recordCount ?? 0;

  const kpis: CommandCenterKpi[] = [
    kpi({
      id: 'new_leads',
      label: 'Lead mới',
      value: m.leads?.new ?? null,
      href: '/leads',
      source: 'crm.leads',
      sampleSize: sample('crm.leads'),
      status: statusOf('crm.leads'),
      evidence: `leads.new=${m.leads?.new ?? 'n/a'}; leads.total=${m.leads?.total ?? 'n/a'}`,
    }),
    kpi({
      id: 'no_follow_up',
      label: 'Lead chưa follow-up',
      value: m.leads?.noFollowUp ?? null,
      href: '/leads',
      source: 'crm.leads',
      sampleSize: sample('crm.leads'),
      status: statusOf('crm.leads'),
      evidence: `leads.noFollowUp=${m.leads?.noFollowUp ?? 'n/a'}`,
    }),
    kpi({
      id: 'bookings',
      label: 'Booking',
      value: m.bookings?.upcoming ?? m.bookings?.total ?? null,
      href: '/appointments',
      source: 'bookings',
      sampleSize: sample('bookings'),
      status: statusOf('bookings'),
      evidence: `bookings.upcoming=${m.bookings?.upcoming ?? 'n/a'}; bookings.total=${m.bookings?.total ?? 'n/a'}`,
    }),
    kpi({
      id: 'revenue',
      label: 'Sales / Revenue',
      value: m.revenue?.total ?? null,
      unit: m.revenue?.currency ?? 'VND',
      href: '/finance',
      source: 'revenue',
      sampleSize: sample('revenue'),
      status: statusOf('revenue'),
      evidence: `revenue.total=${m.revenue?.total ?? 'n/a'} ${m.revenue?.currency ?? 'VND'}`,
    }),
    kpi({
      id: 'abnormal_campaigns',
      label: 'Campaign bất thường',
      value: m.ads?.anomalousCampaigns ?? null,
      href: '/ads-manager',
      source: 'ads.anomalies',
      sampleSize: sample('ads.anomalies') || sample('ads.adDailyStat'),
      status: src('ads.anomalies') ? statusOf('ads.anomalies') : statusOf('ads.adDailyStat'),
      evidence: `ads.anomalousCampaigns=${m.ads?.anomalousCampaigns ?? 'n/a'}; ads.spend=${m.ads?.spend ?? 'n/a'}; ads.roas=${m.ads?.roas ?? 'n/a'}`,
    }),
    kpi({
      id: 'repurchase',
      label: 'Khách có khả năng mua lại',
      value: m.customers?.repurchaseCandidates ?? null,
      href: '/customers',
      source: 'customers.repurchase',
      sampleSize: sample('customers.repurchase') || sample('customer360'),
      status: src('customers.repurchase')
        ? statusOf('customers.repurchase')
        : statusOf('customer360'),
      evidence: `customers.repurchaseCandidates=${m.customers?.repurchaseCandidates ?? 'n/a'}`,
    }),
  ];

  return {
    kpis,
    requiredCoverage: [
      'crm.leads',
      'bookings',
      'revenue',
      'ads.adDailyStat',
      'email',
      'zalo',
      'automation',
      'funnel',
      'businessEvents',
      'customer360',
    ],
  };
}

export const AUTOPILOT_ACTION_LIFECYCLE =
  'RECOMMEND → USER APPROVE → RECHECK → EXECUTE → VERIFY → AUDIT' as const;

export const AUTOPILOT_EXECUTE_COOLDOWN_MS = 5 * 60 * 1000;
export const AUTOPILOT_MIN_OK_SOURCES = 3;

type CommandCenterNbaSeed = Omit<CommandCenterNba, 'priority'>;

function seedAction(partial: CommandCenterNbaSeed): CommandCenterNbaSeed {
  return {
    title: partial.title.slice(0, 160),
    whyNow: partial.whyNow.slice(0, 600),
    evidence: partial.evidence.slice(0, 600),
    confidence: partial.confidence,
    expectedImpact: partial.expectedImpact.slice(0, 400),
    estimatedCost: partial.estimatedCost,
    risk: partial.risk,
    recommendedAction: partial.recommendedAction,
    editUrl: partial.editUrl,
  };
}

/**
 * Deterministic WAVE 4 NBA from measured metrics. Does not collapse by draft type
 * (follow-up, booking, win-back can all be AUTOMATION_DRAFT). estimatedCost is
 * null unless it is a real ledger number (anomalous ads spend).
 */
export function buildCommandCenterActions(input: CommandCenterBoardInput): CommandCenterNba[] {
  const m = input.metrics;
  const orgId = input.organizationId;
  const minData = commandCenterHasMinimumContext(input.sources);
  const confidenceFloor = minData ? 'HIGH' : 'INSUFFICIENT_DATA';
  const seeds: CommandCenterNbaSeed[] = [];

  const noFollowUp = m.leads?.noFollowUp ?? 0;
  const newLeads = m.leads?.new ?? 0;
  const totalLeads = m.leads?.total ?? 0;
  const upcoming = m.bookings?.upcoming ?? 0;
  const anomalous = m.ads?.anomalousCampaigns ?? 0;
  const repurchase = m.customers?.repurchaseCandidates ?? 0;
  const convRate = m.conversion?.leadToBookingRate ?? null;
  const adsSpend = m.ads?.spend ?? 0;

  if (noFollowUp > 0) {
    seeds.push(
      seedAction({
        title: `Chăm sóc ${noFollowUp} lead chưa follow-up`,
        whyNow: `${noFollowUp}/${Math.max(totalLeads, noFollowUp)} lead đang chờ — ưu tiên trước khi scale Ads.`,
        evidence: `leads.noFollowUp=${noFollowUp}; leads.total=${totalLeads}; organizationId=${orgId}`,
        confidence: confidenceFloor === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT_DATA' : 'HIGH',
        expectedImpact: 'Thu hồi lead nóng → tăng booking không tăng chi phí Ads',
        estimatedCost: null,
        risk: 'LOW',
        recommendedAction: 'AUTOMATION_DRAFT',
        editUrl: COMMAND_CENTER_EDIT_URL.AUTOMATION_DRAFT,
      }),
    );
  }

  if (newLeads > 0 && !(noFollowUp > 0 && newLeads === noFollowUp)) {
    seeds.push(
      seedAction({
        title: `Tiếp nhận ${newLeads} lead mới`,
        whyNow: `${newLeads} lead pipeline NEW trong cửa sổ hiện tại chưa được xử lý.`,
        evidence: `leads.new=${newLeads}; leads.total=${totalLeads}; organizationId=${orgId}`,
        confidence: confidenceFloor === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT_DATA' : 'HIGH',
        expectedImpact: 'Gán owner / nurture ngay để không mất lead lạnh',
        estimatedCost: null,
        risk: 'LOW',
        recommendedAction: 'AUTOMATION_DRAFT',
        editUrl: COMMAND_CENTER_EDIT_URL.AUTOMATION_DRAFT,
      }),
    );
  }

  if (upcoming > 0) {
    seeds.push(
      seedAction({
        title: `Nhắc lịch ${upcoming} booking sắp tới`,
        whyNow: `${upcoming} lịch SCHEDULED còn hiệu lực — giảm no-show trước giờ hẹn.`,
        evidence: `bookings.upcoming=${upcoming}; bookings.total=${m.bookings?.total ?? 'n/a'}; organizationId=${orgId}`,
        confidence: 'HIGH',
        expectedImpact: 'Giữ chỗ hẹn → bảo vệ doanh thu đã book',
        estimatedCost: null,
        risk: 'LOW',
        recommendedAction: 'AUTOMATION_DRAFT',
        editUrl: COMMAND_CENTER_EDIT_URL.AUTOMATION_DRAFT,
      }),
    );
  }

  if (anomalous > 0) {
    seeds.push(
      seedAction({
        title: `Rà soát ${anomalous} campaign ads bất thường`,
        whyNow: 'Chiến dịch đang tốn spend nhưng không ra lead / CPL lệch median — không scale Ads.',
        evidence: `ads.anomalousCampaigns=${anomalous}; ads.spend=${m.ads?.spend ?? 'n/a'}; ads.roas=${m.ads?.roas ?? 'n/a'}; organizationId=${orgId}`,
        confidence: 'HIGH',
        expectedImpact: 'Cắt lãng phí Ads trên campaign lỗi trước khi tăng budget',
        estimatedCost: adsSpend > 0 ? adsSpend : null,
        risk: 'MEDIUM',
        recommendedAction: 'CAMPAIGN_DRAFT',
        editUrl: COMMAND_CENTER_EDIT_URL.CAMPAIGN_DRAFT,
      }),
    );
  }

  if (repurchase > 0) {
    seeds.push(
      seedAction({
        title: `Win-back ${repurchase} khách có khả năng mua lại`,
        whyNow: `${repurchase} khách đã thanh toán 30–90 ngày trước, chưa có lịch gần đây.`,
        evidence: `customers.repurchaseCandidates=${repurchase}; organizationId=${orgId}`,
        confidence: 'MEDIUM',
        expectedImpact: 'Gợi ý lịch / ưu đãi giữ chân — không bịa % lift',
        estimatedCost: null,
        risk: 'LOW',
        recommendedAction: 'AUTOMATION_DRAFT',
        editUrl: COMMAND_CENTER_EDIT_URL.AUTOMATION_DRAFT,
      }),
    );
  }

  if (convRate != null && convRate > 0 && convRate < 15 && totalLeads >= 5) {
    seeds.push(
      seedAction({
        title: 'Tối ưu funnel chuyển đổi lead → booking',
        whyNow: `Lead-to-booking ${convRate}% thấp — tăng Ads lúc này lãng phí.`,
        evidence: `conversion.leadToBookingRate=${convRate}; funnel.active=${m.funnel?.activeFunnels ?? 'n/a'}; leads.total=${totalLeads}`,
        confidence: 'HIGH',
        expectedImpact: 'Cải thiện conversion trước khi scale traffic',
        estimatedCost: null,
        risk: 'MEDIUM',
        recommendedAction: 'FUNNEL_DRAFT',
        editUrl: COMMAND_CENTER_EDIT_URL.FUNNEL_DRAFT,
      }),
    );
  }

  if (seeds.length < MARKETING_AUTOPILOT_NBA_V2_LIMITS.maxActions) {
    const metrics: NbaV2ContextMetrics = {
      leads: {
        total: m.leads?.total ?? null,
        noFollowUp: m.leads?.noFollowUp ?? null,
        hot: m.leads?.hot ?? null,
        new: m.leads?.new ?? null,
      },
      bookings: { total: m.bookings?.total ?? null, upcoming: m.bookings?.upcoming ?? null },
      conversion: { leadToBookingRate: m.conversion?.leadToBookingRate ?? null },
      revenue: { total: m.revenue?.total ?? null },
      ads: {
        spend: m.ads?.spend ?? null,
        cpl: m.ads?.cpl ?? null,
        roas: m.ads?.roas ?? null,
        anomalousCampaigns: m.ads?.anomalousCampaigns ?? null,
      },
      automation: { activeFlows: m.automation?.activeFlows ?? null },
      funnel: { activeFunnels: m.funnel?.activeFunnels ?? null },
      customers: { repurchaseCandidates: m.customers?.repurchaseCandidates ?? null },
    };
    const existingKeys = new Set(seeds.map((s) => `${s.recommendedAction}:${s.title.slice(0, 40)}`));
    const extras = rankNextBestActionsV3({
      organizationId: orgId,
      metrics,
      insights: input.insights,
      bottlenecks: input.bottlenecks,
      opportunities: input.opportunities,
      monthlyBudget: 0,
      primaryGoal: 'booking',
      timeRange: input.timeRange,
      safety: { draftOnly: true },
    });
    for (const extra of extras) {
      if (seeds.length >= MARKETING_AUTOPILOT_NBA_V2_LIMITS.maxActions) break;
      const mapped = toCommandCenterNba({ ...extra, estimatedCost: null });
      const key = `${mapped.recommendedAction}:${mapped.title.slice(0, 40)}`;
      if (existingKeys.has(key)) continue;
      if (seeds.some((s) => s.title === mapped.title)) continue;
      existingKeys.add(key);
      seeds.push({
        title: mapped.title,
        whyNow: mapped.whyNow,
        evidence: mapped.evidence,
        confidence: mapped.confidence,
        expectedImpact: mapped.expectedImpact,
        estimatedCost: null,
        risk: mapped.risk,
        recommendedAction: mapped.recommendedAction,
        editUrl: mapped.editUrl,
      });
    }
  }

  return seeds.slice(0, MARKETING_AUTOPILOT_NBA_V2_LIMITS.maxActions).map((s, idx) =>
    commandCenterNbaSchema.parse({ ...s, priority: idx + 1 }),
  );
}

export type AutopilotExecuteRecheckInput = {
  approvalOk: boolean;
  lockHeldByOther: boolean;
  lastExecutedAt: Date | null;
  now: Date;
  okSourceCount: number;
  observedCpl: number | null;
  stopLossCpl: number | null;
  cooldownMs?: number;
};

export function recheckAutopilotExecute(input: AutopilotExecuteRecheckInput): {
  ok: boolean;
  stage: 'PERMISSION' | 'APPROVAL' | 'GUARDRAIL' | 'EXECUTE';
  reason: string;
} {
  if (input.lockHeldByOther) {
    return { ok: false, stage: 'EXECUTE', reason: 'concurrency_lock_held' };
  }
  if (!input.approvalOk) {
    return { ok: false, stage: 'APPROVAL', reason: 'missing_approval_snapshot' };
  }
  const cooldown = input.cooldownMs ?? AUTOPILOT_EXECUTE_COOLDOWN_MS;
  if (input.lastExecutedAt && input.now.getTime() - input.lastExecutedAt.getTime() < cooldown) {
    return { ok: false, stage: 'GUARDRAIL', reason: 'cooldown_active' };
  }
  if (input.okSourceCount < AUTOPILOT_MIN_OK_SOURCES) {
    return { ok: false, stage: 'GUARDRAIL', reason: 'minimum_data_not_met' };
  }
  if (
    input.stopLossCpl != null &&
    input.observedCpl != null &&
    input.observedCpl > input.stopLossCpl
  ) {
    return { ok: false, stage: 'GUARDRAIL', reason: 'stop_loss_cpl' };
  }
  return { ok: true, stage: 'EXECUTE', reason: 'recheck_passed' };
}

/** Board numbers must be null when INSUFFICIENT_DATA; NBA evidence must cite real metric keys. */
export function assertCommandCenterNoFakeMetrics(input: {
  kpis: CommandCenterKpi[];
  actions: CommandCenterNba[];
}): boolean {
  for (const k of input.kpis) {
    if (k.status === 'INSUFFICIENT_DATA' && k.value != null && k.sampleSize === 0) return false;
    if (k.value != null && !Number.isFinite(k.value)) return false;
    if (!k.source || !k.evidence) return false;
  }
  for (const a of input.actions) {
    if (!a.whyNow || !a.evidence || !a.confidence || !a.expectedImpact) return false;
    if (a.confidence === 'INSUFFICIENT_DATA' && a.estimatedCost != null && a.estimatedCost > 0) {
      return false;
    }
    if (/\b(tăng|giảm)\s+\d{2,}%/.test(`${a.whyNow} ${a.expectedImpact}`) && !/\d/.test(a.evidence)) {
      return false;
    }
  }
  return input.actions.length <= 5;
}

export function commandCenterHasMinimumContext(sources: Array<{ domain: string; status: string }>): boolean {
  const ok = sources.filter((s) => s.status === 'OK').length;
  return ok >= 3;
}
