/**
 * Outcome Learning Loop: RUN → MONITOR → DIAGNOSE → RECOMMEND → OPTIMIZE → LEARN
 * Correlation-only diagnostics — no fake forecast, no causation claims.
 */
import { z } from 'zod';
import {
  OUTCOME_LEARNING_HORIZONS,
  type OutcomeMetricsSnapshot,
  extractOutcomeMetrics,
} from './marketing-autopilot-outcome-learning';
import type { MarketingAutopilotGuardrailConfig, AutopilotMode } from './marketing-autopilot-guardrail';

export type { AutopilotMode };

export const OUTCOME_LOOP_STEPS = [
  'RUN',
  'MONITOR',
  'DIAGNOSE',
  'RECOMMEND',
  'OPTIMIZE',
  'LEARN',
] as const;

export type OutcomeLoopStep = (typeof OUTCOME_LOOP_STEPS)[number];

export const AUTOPILOT_MODES = [
  'RECOMMEND_ONLY',
  'APPROVAL_AUTOPILOT',
  'FULL_AUTOPILOT',
] as const satisfies readonly AutopilotMode[];

export const DEFAULT_AUTOPILOT_MODE: AutopilotMode = 'APPROVAL_AUTOPILOT';

export const DIAGNOSIS_KINDS = [
  'ADS_INEFFICIENT',
  'FUNNEL_BOTTLENECK',
  'LEAD_NO_FOLLOWUP',
  'CONTENT_WEAK',
  'AUTOMATION_ERROR',
  'TRACKING_ERROR',
  'REMARKETING_OPPORTUNITY',
] as const;

export type DiagnosisKind = (typeof DIAGNOSIS_KINDS)[number];

export const STOP_LOSS_REASONS = [
  'TRACKING_ERROR',
  'SPEND_OVER_LIMIT',
  'CPL_OVER',
  'CPA_OVER',
] as const;

export type StopLossReason = (typeof STOP_LOSS_REASONS)[number];

export const CORRELATION_CAVEAT =
  'Chỉ dựa trên tương quan dữ liệu quan sát — không khẳng định nhân quả. Không dự báo tương lai.';

/** Grace period after mission RUN before CPL/CPA/creative/funnel conclusions. */
export const OUTCOME_LOOP_GRACE_PERIOD_MS = 24 * 3600 * 1000;
export const OUTCOME_MIN_IMPRESSIONS_FOR_DIAGNOSIS = 500;
export const OUTCOME_MIN_CLICKS_FOR_DIAGNOSIS = 10;
export const OUTCOME_MIN_SPEND_FOR_STOPLOSS = 100_000;
export const OUTCOME_MIN_LEADS_FOR_CRM_DIAGNOSIS = 3;
export const OUTCOME_MIN_RUNTIME_MS = 6 * 3600 * 1000;
export const OUTCOME_RECHECK_STALE_MS = 24 * 3600 * 1000;
export const OUTCOME_MUTATION_LOCK_TTL_MS = 60_000;

export type OutcomeDataVerdict = 'READY' | 'INSUFFICIENT_DATA' | 'GRACE_PERIOD';

export type OutcomeDataReadiness = {
  verdict: OutcomeDataVerdict;
  ready: boolean;
  reasons: string[];
  graceUntil?: string;
};

export type OutcomeDiagnoseResult = {
  verdict: OutcomeDataVerdict;
  diagnoses: OutcomeDiagnosis[];
  readiness: OutcomeDataReadiness;
};

export type ProposalRecheckResult = {
  allowed: boolean;
  blockStatus?: 'STALE' | 'BLOCKED_GUARDRAIL' | 'SKIPPED';
  blockReason?: string;
};

export const missionOutcomeMetricsSchema = z.object({
  impressions: z.number().finite().nullable(),
  clicks: z.number().finite().nullable(),
  ctr: z.number().finite().nullable(),
  cpc: z.number().finite().nullable(),
  leads: z.number().finite().nullable(),
  cpl: z.number().finite().nullable(),
  bookings: z.number().finite().nullable(),
  cpa: z.number().finite().nullable(),
  conversionRate: z.number().finite().nullable(),
  revenue: z.number().finite().nullable(),
  roas: z.number().finite().nullable(),
  funnelConversion: z.number().finite().nullable(),
  crmConversion: z.number().finite().nullable(),
  funnelLeadsInFunnel: z.number().finite().nullable(),
  leadsNoFollowUp: z.number().finite().nullable(),
  leadsUnassigned: z.number().finite().nullable(),
  emailSent: z.number().finite().nullable(),
  emailOpenRate: z.number().finite().nullable(),
  emailClickRate: z.number().finite().nullable(),
  zaloSent: z.number().finite().nullable(),
  zaloDelivered: z.number().finite().nullable(),
  messagingSent: z.number().finite().nullable(),
  adsSpend: z.number().finite().nullable(),
  automationLogsFailed: z.number().finite().nullable(),
  automationLogsSuccess: z.number().finite().nullable(),
  capturedAt: z.string(),
  horizonDays: z.number().int().optional(),
});

export type MissionOutcomeMetrics = z.infer<typeof missionOutcomeMetricsSchema>;

export type OutcomeDiagnosis = {
  kind: DiagnosisKind;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  title: string;
  summary: string;
  evidence: string;
  correlationOnly: true;
  suggestedActions: string[];
};

export type OptimizationRecommendation = {
  diagnosisKind: DiagnosisKind;
  title: string;
  summary: string;
  action: string;
  module: string;
  correlationOnly: true;
  requiresApproval: boolean;
  payload?: Record<string, unknown>;
};

export type StopLossCheck = {
  triggered: boolean;
  reason?: StopLossReason;
  message?: string;
  pauseModules?: string[];
  trigger?: Record<string, unknown>;
};

type LooseMetrics = {
  leads?: { total?: number | null; unassigned?: number | null; noFollowUp?: number | null };
  bookings?: { total?: number | null };
  conversion?: { leadToBookingRate?: number | null };
  revenue?: { total?: number | null };
  ads?: {
    spend?: number | null;
    impressions?: number | null;
    clicks?: number | null;
    ctr?: number | null;
    cpc?: number | null;
    cpl?: number | null;
    roas?: number | null;
  };
  email?: { sent?: number | null; openRate?: number | null; clickRate?: number | null };
  funnel?: { leadsInFunnel?: number | null };
  campaigns?: { messagingSent?: number | null };
  automation?: { logsSuccess?: number | null; logsFailed?: number | null };
  crm?: { conversionRate?: number | null };
};

export function extractMissionOutcomeMetrics(
  metrics: LooseMetrics | null | undefined,
  opts?: { capturedAt?: string; horizonDays?: number },
): MissionOutcomeMetrics {
  const base = extractOutcomeMetrics(metrics, opts?.capturedAt ?? new Date().toISOString());
  const leads = metrics?.leads?.total ?? null;
  const funnelLeads = metrics?.funnel?.leadsInFunnel ?? null;
  const funnelConv =
    funnelLeads != null && leads != null && leads > 0
      ? Math.round((Math.min(funnelLeads, leads) / leads) * 1000) / 10
      : null;

  return missionOutcomeMetricsSchema.parse({
    impressions: metrics?.ads?.impressions ?? null,
    clicks: metrics?.ads?.clicks ?? null,
    ctr: metrics?.ads?.ctr ?? null,
    cpc: metrics?.ads?.cpc ?? null,
    leads: base.leads,
    cpl: base.cpl,
    bookings: base.bookings,
    cpa: base.cpa,
    conversionRate: base.conversionRate,
    revenue: base.revenue,
    roas: base.roas,
    funnelConversion: funnelConv,
    crmConversion: metrics?.crm?.conversionRate ?? base.conversionRate,
    funnelLeadsInFunnel: funnelLeads,
    leadsNoFollowUp: metrics?.leads?.noFollowUp ?? null,
    leadsUnassigned: metrics?.leads?.unassigned ?? null,
    emailSent: metrics?.email?.sent ?? null,
    emailOpenRate: base.emailOpenRate,
    emailClickRate: base.emailClickRate,
    zaloSent: metrics?.campaigns?.messagingSent ?? null,
    zaloDelivered: null,
    messagingSent: metrics?.campaigns?.messagingSent ?? null,
    adsSpend: metrics?.ads?.spend ?? null,
    automationLogsFailed: metrics?.automation?.logsFailed ?? null,
    automationLogsSuccess: metrics?.automation?.logsSuccess ?? null,
    capturedAt: base.capturedAt,
    horizonDays: opts?.horizonDays,
  });
}

export type MonitorWindows = Partial<
  Record<(typeof OUTCOME_LEARNING_HORIZONS)[number], MissionOutcomeMetrics>
>;

export function buildOutcomeMutationLockKey(
  missionId: string,
  target: 'loop-tick' | 'stop-loss' | `module:${string}` | `proposal:${string}`,
): string {
  return `mission:${missionId}:${target}`;
}

export function assessOutcomeDataReadiness(
  metrics: MissionOutcomeMetrics,
  opts?: {
    loopStartedAt?: Date | string | null;
    now?: Date;
    horizonDays?: number;
  },
): OutcomeDataReadiness {
  const now = opts?.now ?? new Date();
  const reasons: string[] = [];

  if (opts?.loopStartedAt) {
    const started =
      typeof opts.loopStartedAt === 'string'
        ? new Date(opts.loopStartedAt)
        : opts.loopStartedAt;
    const elapsed = now.getTime() - started.getTime();
    if (elapsed < OUTCOME_LOOP_GRACE_PERIOD_MS) {
      const graceUntil = new Date(started.getTime() + OUTCOME_LOOP_GRACE_PERIOD_MS).toISOString();
      return {
        verdict: 'GRACE_PERIOD',
        ready: false,
        reasons: [`Grace period: cần ${OUTCOME_LOOP_GRACE_PERIOD_MS / 3600000}h runtime trước khi kết luận`],
        graceUntil,
      };
    }
    if (elapsed < OUTCOME_MIN_RUNTIME_MS) {
      reasons.push(`Runtime ${Math.round(elapsed / 3600000)}h < minimum`);
    }
  }

  const impressions = metrics.impressions ?? 0;
  const clicks = metrics.clicks ?? 0;
  const spend = metrics.adsSpend ?? 0;
  const leads = metrics.leads ?? 0;

  const hasAdsSignal = impressions >= OUTCOME_MIN_IMPRESSIONS_FOR_DIAGNOSIS || clicks >= OUTCOME_MIN_CLICKS_FOR_DIAGNOSIS;
  const hasSpendSignal = spend >= OUTCOME_MIN_SPEND_FOR_STOPLOSS;
  const hasLeadSignal = leads >= OUTCOME_MIN_LEADS_FOR_CRM_DIAGNOSIS;

  if (!hasAdsSignal && !hasSpendSignal && !hasLeadSignal) {
    reasons.push(
      `Thiếu dữ liệu: impressions<${OUTCOME_MIN_IMPRESSIONS_FOR_DIAGNOSIS}, clicks<${OUTCOME_MIN_CLICKS_FOR_DIAGNOSIS}, spend<${OUTCOME_MIN_SPEND_FOR_STOPLOSS}, leads<${OUTCOME_MIN_LEADS_FOR_CRM_DIAGNOSIS}`,
    );
    return { verdict: 'INSUFFICIENT_DATA', ready: false, reasons };
  }

  if (reasons.length > 0) {
    return { verdict: 'INSUFFICIENT_DATA', ready: false, reasons };
  }

  return { verdict: 'READY', ready: true, reasons: [] };
}

export function diagnoseMissionOutcomesWithReadiness(
  metrics: MissionOutcomeMetrics,
  baseline?: OutcomeMetricsSnapshot | null,
  opts?: Parameters<typeof assessOutcomeDataReadiness>[1],
): OutcomeDiagnoseResult {
  const readiness = assessOutcomeDataReadiness(metrics, opts);
  if (!readiness.ready) {
    return { verdict: readiness.verdict, diagnoses: [], readiness };
  }
  return {
    verdict: 'READY',
    diagnoses: diagnoseMissionOutcomes(metrics, baseline),
    readiness,
  };
}

export function recheckProposalBeforeApply(input: {
  proposalMetrics: MissionOutcomeMetrics;
  currentMetrics: MissionOutcomeMetrics;
  proposalCreatedAt: Date | string;
  missionStatus: string;
  guardrail: Pick<
    MarketingAutopilotGuardrailConfig,
    'allowAutomationActivation' | 'maxDailyAdSpend'
  >;
  integrationOk: boolean;
  permissionOk: boolean;
  readiness: OutcomeDataReadiness;
  now?: Date;
}): ProposalRecheckResult {
  const now = input.now ?? new Date();
  const created =
    typeof input.proposalCreatedAt === 'string'
      ? new Date(input.proposalCreatedAt)
      : input.proposalCreatedAt;

  if (!input.permissionOk) {
    return { allowed: false, blockStatus: 'BLOCKED_GUARDRAIL', blockReason: 'PERMISSION_DENIED' };
  }
  if (!input.integrationOk) {
    return { allowed: false, blockStatus: 'BLOCKED_GUARDRAIL', blockReason: 'INTEGRATION_UNHEALTHY' };
  }
  if (!input.readiness.ready) {
    return {
      allowed: false,
      blockStatus: 'BLOCKED_GUARDRAIL',
      blockReason: input.readiness.verdict,
    };
  }
  if (!['RUNNING', 'APPROVED', 'QUEUED'].includes(input.missionStatus)) {
    return { allowed: false, blockStatus: 'STALE', blockReason: 'MISSION_STATUS_CHANGED' };
  }
  if (now.getTime() - created.getTime() > OUTCOME_RECHECK_STALE_MS) {
    return { allowed: false, blockStatus: 'STALE', blockReason: 'PROPOSAL_TOO_OLD' };
  }

  const pSpend = input.proposalMetrics.adsSpend ?? 0;
  const cSpend = input.currentMetrics.adsSpend ?? 0;
  if (pSpend > 0 && Math.abs(cSpend - pSpend) / pSpend > 0.25) {
    return { allowed: false, blockStatus: 'STALE', blockReason: 'METRICS_SPEND_CHANGED' };
  }

  const pCpl = input.proposalMetrics.cpl;
  const cCpl = input.currentMetrics.cpl;
  if (pCpl != null && cCpl != null && pCpl > 0 && Math.abs(cCpl - pCpl) / pCpl > 0.25) {
    return { allowed: false, blockStatus: 'STALE', blockReason: 'METRICS_CPL_CHANGED' };
  }

  if (
    input.guardrail.maxDailyAdSpend != null &&
    cSpend > Number(input.guardrail.maxDailyAdSpend)
  ) {
    return { allowed: false, blockStatus: 'BLOCKED_GUARDRAIL', blockReason: 'SPEND_OVER_GUARDRAIL' };
  }

  return { allowed: true };
}

export function diagnoseMissionOutcomes(
  metrics: MissionOutcomeMetrics,
  baseline?: OutcomeMetricsSnapshot | null,
): OutcomeDiagnosis[] {
  const out: OutcomeDiagnosis[] = [];
  const spend = metrics.adsSpend ?? 0;
  const roas = metrics.roas;
  const cpl = metrics.cpl;
  const baselineCpl = baseline?.cpl ?? null;

  if (spend > 0 && (roas == null || roas < 1)) {
    out.push({
      kind: 'ADS_INEFFICIENT',
      severity: roas != null && roas < 0.5 ? 'HIGH' : 'MEDIUM',
      title: 'Ads có thể kém hiệu quả',
      summary: `ROAS quan sát ${roas ?? 'n/a'} với spend ${Math.round(spend).toLocaleString('vi-VN')}đ — tương quan với hiệu suất thấp.`,
      evidence: `roas=${roas}, spend=${spend}, cpl=${cpl}`,
      correlationOnly: true,
      suggestedActions: ['Giảm ngân sách Ads', 'Thử creative mới', 'Thu hẹp audience'],
    });
  }

  if (baselineCpl != null && cpl != null && cpl > baselineCpl * 1.25) {
    out.push({
      kind: 'ADS_INEFFICIENT',
      severity: 'MEDIUM',
      title: 'CPL tăng so với baseline',
      summary: `CPL hiện ${Math.round(cpl).toLocaleString('vi-VN')}đ vs baseline ${Math.round(baselineCpl).toLocaleString('vi-VN')}đ (tương quan).`,
      evidence: `cpl=${cpl}, baselineCpl=${baselineCpl}`,
      correlationOnly: true,
      suggestedActions: ['Pause adset CPL cao', 'A/B test landing'],
    });
  }

  if ((metrics.funnelLeadsInFunnel ?? 0) > 5 && (metrics.conversionRate ?? 100) < 8) {
    out.push({
      kind: 'FUNNEL_BOTTLENECK',
      severity: 'MEDIUM',
      title: 'Funnel có thể nghẽn',
      summary: `${metrics.funnelLeadsInFunnel} lead trong funnel nhưng conversion ${metrics.conversionRate ?? 'n/a'}% — tương quan bottleneck.`,
      evidence: `funnelLeads=${metrics.funnelLeadsInFunnel}, conversion=${metrics.conversionRate}`,
      correlationOnly: true,
      suggestedActions: ['Rà soát stage funnel', 'Thêm nurture automation'],
    });
  }

  const noFollow = metrics.leadsNoFollowUp ?? 0;
  const unassigned = metrics.leadsUnassigned ?? 0;
  if (noFollow > 3 || unassigned > 2) {
    out.push({
      kind: 'LEAD_NO_FOLLOWUP',
      severity: noFollow > 10 ? 'HIGH' : 'MEDIUM',
      title: 'Lead chưa được follow-up',
      summary: `${noFollow} lead chưa follow-up, ${unassigned} chưa assign — tương quan với mất cơ hội.`,
      evidence: `noFollowUp=${noFollow}, unassigned=${unassigned}`,
      correlationOnly: true,
      suggestedActions: ['Bật automation follow-up', 'Assign lead cho sale'],
    });
  }

  if ((metrics.impressions ?? 0) > 1000 && (metrics.ctr ?? 100) < 1) {
    out.push({
      kind: 'CONTENT_WEAK',
      severity: 'MEDIUM',
      title: 'Content/creative có thể yếu',
      summary: `CTR ${metrics.ctr ?? 'n/a'}% với ${metrics.impressions} impressions — tương quan creative yếu.`,
      evidence: `ctr=${metrics.ctr}, impressions=${metrics.impressions}`,
      correlationOnly: true,
      suggestedActions: ['Thử headline/hook mới', 'Refresh creative Ads'],
    });
  }

  const fail = metrics.automationLogsFailed ?? 0;
  const ok = metrics.automationLogsSuccess ?? 0;
  if (fail > 0 && fail >= ok) {
    out.push({
      kind: 'AUTOMATION_ERROR',
      severity: fail > 5 ? 'HIGH' : 'MEDIUM',
      title: 'Automation có lỗi',
      summary: `${fail} log failed vs ${ok} success — tương quan automation lỗi.`,
      evidence: `logsFailed=${fail}, logsSuccess=${ok}`,
      correlationOnly: true,
      suggestedActions: ['Pause flow lỗi', 'Kiểm tra template/channel'],
    });
  }

  if (
    spend >= OUTCOME_MIN_SPEND_FOR_STOPLOSS &&
    metrics.impressions == null &&
    metrics.clicks == null &&
    metrics.leads == null
  ) {
    out.push({
      kind: 'TRACKING_ERROR',
      severity: 'HIGH',
      title: 'Tracking có thể lỗi',
      summary: 'Có spend Ads nhưng thiếu impressions/clicks/leads — tương quan tracking gap.',
      evidence: `spend=${spend}, impressions=${metrics.impressions}`,
      correlationOnly: true,
      suggestedActions: ['Pause Ads', 'Kiểm tra pixel/UTM', 'Verify CRM sync'],
    });
  }

  const leads = metrics.leads ?? 0;
  const bookings = metrics.bookings ?? 0;
  if (leads > bookings + 5) {
    out.push({
      kind: 'REMARKETING_OPPORTUNITY',
      severity: 'LOW',
      title: 'Cơ hội remarketing',
      summary: `${leads - bookings} lead chưa booking — tương quan audience remarketing.`,
      evidence: `leads=${leads}, bookings=${bookings}`,
      correlationOnly: true,
      suggestedActions: ['Tạo audience remarketing', 'Email/Zalo nurture sequence'],
    });
  }

  return out;
}

export function buildOptimizationRecommendations(
  diagnoses: OutcomeDiagnosis[],
  autopilotMode: AutopilotMode,
): OptimizationRecommendation[] {
  return diagnoses.map((d) => ({
    diagnosisKind: d.kind,
    title: `Tối ưu: ${d.title}`,
    summary: `${d.summary} ${CORRELATION_CAVEAT}`,
    action: d.suggestedActions[0] ?? 'Review manually',
    module:
      d.kind === 'ADS_INEFFICIENT' || d.kind === 'CONTENT_WEAK' || d.kind === 'TRACKING_ERROR'
        ? 'ADS'
        : d.kind === 'FUNNEL_BOTTLENECK'
          ? 'FUNNEL'
          : d.kind === 'LEAD_NO_FOLLOWUP'
            ? 'CRM'
            : d.kind === 'AUTOMATION_ERROR'
              ? 'AUTOMATION'
              : 'CAMPAIGN',
    correlationOnly: true,
    requiresApproval:
      autopilotMode === 'APPROVAL_AUTOPILOT' || autopilotMode === 'RECOMMEND_ONLY',
    payload: { suggestedActions: d.suggestedActions, evidence: d.evidence },
  }));
}

export function checkMissionStopLoss(
  metrics: MissionOutcomeMetrics,
  guardrail: Pick<
    MarketingAutopilotGuardrailConfig,
    'maxDailyAdSpend' | 'stopLossCpl' | 'stopLossCpa'
  >,
  opts?: Parameters<typeof assessOutcomeDataReadiness>[1],
): StopLossCheck {
  const readiness = assessOutcomeDataReadiness(metrics, opts);
  if (!readiness.ready) {
    return { triggered: false, message: readiness.verdict };
  }

  const spend = metrics.adsSpend ?? 0;
  const cpl = metrics.cpl;
  const cpa = metrics.cpa;
  const impressions = metrics.impressions ?? 0;
  const clicks = metrics.clicks ?? 0;

  if (
    spend >= OUTCOME_MIN_SPEND_FOR_STOPLOSS &&
    impressions < OUTCOME_MIN_IMPRESSIONS_FOR_DIAGNOSIS &&
    clicks < OUTCOME_MIN_CLICKS_FOR_DIAGNOSIS &&
    metrics.leads == null
  ) {
    return {
      triggered: true,
      reason: 'TRACKING_ERROR',
      message: 'Tracking gap — pause Ads liên quan',
      pauseModules: ['ADS', 'CONTENT'],
      trigger: { spend, impressions: metrics.impressions },
    };
  }

  if (guardrail.maxDailyAdSpend != null && spend > Number(guardrail.maxDailyAdSpend) && spend >= OUTCOME_MIN_SPEND_FOR_STOPLOSS) {
    return {
      triggered: true,
      reason: 'SPEND_OVER_LIMIT',
      message: `Spend ${spend} vượt maxDailyAdSpend ${guardrail.maxDailyAdSpend}`,
      pauseModules: ['ADS'],
      trigger: { spend, maxDailyAdSpend: guardrail.maxDailyAdSpend },
    };
  }

  if (
    guardrail.stopLossCpl != null &&
    cpl != null &&
    cpl > Number(guardrail.stopLossCpl) &&
    spend >= OUTCOME_MIN_SPEND_FOR_STOPLOSS &&
    (metrics.leads ?? 0) >= OUTCOME_MIN_LEADS_FOR_CRM_DIAGNOSIS
  ) {
    return {
      triggered: true,
      reason: 'CPL_OVER',
      message: `CPL ${cpl} vượt stopLossCpl ${guardrail.stopLossCpl}`,
      pauseModules: ['ADS'],
      trigger: { cpl, stopLossCpl: guardrail.stopLossCpl },
    };
  }

  if (
    guardrail.stopLossCpa != null &&
    cpa != null &&
    cpa > Number(guardrail.stopLossCpa) &&
    (metrics.bookings ?? 0) >= 1 &&
    spend >= OUTCOME_MIN_SPEND_FOR_STOPLOSS
  ) {
    return {
      triggered: true,
      reason: 'CPA_OVER',
      message: `CPA ${cpa} vượt stopLossCpa ${guardrail.stopLossCpa}`,
      pauseModules: ['ADS', 'CAMPAIGN'],
      trigger: { cpa, stopLossCpa: guardrail.stopLossCpa },
    };
  }

  return { triggered: false };
}

export function nextOutcomeLoopStep(step: OutcomeLoopStep): OutcomeLoopStep | null {
  const idx = OUTCOME_LOOP_STEPS.indexOf(step);
  if (idx < 0 || idx >= OUTCOME_LOOP_STEPS.length - 1) return null;
  return OUTCOME_LOOP_STEPS[idx + 1]!;
}
