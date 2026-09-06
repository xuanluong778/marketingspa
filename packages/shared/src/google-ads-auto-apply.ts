import { z } from 'zod';
import { isAdsActionsLive } from './ads-actions';
import {
  evaluateAutopilotPolicy,
  type AutopilotPolicyContext,
  type GoogleAdsAutopilotActionType,
  type GoogleAdsAutopilotGuardrail,
  type GoogleAdsAutopilotMetrics,
  type GoogleAdsAutopilotMode,
  type GoogleAdsAutopilotProposalInput,
} from './google-ads-autopilot';

export const autoApplyModeSchema = z.enum([
  'RECOMMEND_ONLY',
  'AUTO_APPLY',
  'MANUAL',
  'GUARDED_AUTO',
]);

export const autoApplyPreWriteStepSchema = z.enum([
  'FRESH_METRICS',
  'KILL_SWITCH',
  'AUTO_APPLY_MODE',
  'PERMISSION_CONNECTION',
  'GUARDRAIL',
  'DAILY_CAP',
  'COOLDOWN',
  'STOP_LOSS',
  'AUTO_PAUSE_ALLOWED',
  'AUTO_ENABLE_GUARD',
  'IDEMPOTENCY',
  'DISTRIBUTED_LOCK',
]);

export const autoApplyPreWriteResultSchema = z.object({
  allowed: z.boolean(),
  failedStep: autoApplyPreWriteStepSchema.optional(),
  reasons: z.array(z.string()),
  steps: z.record(z.object({ ok: z.boolean(), detail: z.string().optional() })),
  rollbackSnapshot: z.record(z.unknown()).optional(),
});

export type AutoApplyPreWriteResult = z.infer<typeof autoApplyPreWriteResultSchema>;
export type AutoApplyMode = z.infer<typeof autoApplyModeSchema>;

/** Map legacy modes → canonical Auto-Apply modes. */
export function normalizeAutoApplyMode(raw: string | null | undefined): 'RECOMMEND_ONLY' | 'AUTO_APPLY' {
  const v = String(raw ?? 'RECOMMEND_ONLY').toUpperCase();
  if (v === 'AUTO_APPLY' || v === 'GUARDED_AUTO') return 'AUTO_APPLY';
  return 'RECOMMEND_ONLY';
}

export function isAutopilotGlobalKillSwitch(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  return String(env.GOOGLE_ADS_AUTOPILOT_KILL_SWITCH ?? 'false').toLowerCase() === 'true';
}

export function isAutoApplyEnabled(config: {
  enabled: boolean;
  emergencyStop: boolean;
  mode: string;
}): boolean {
  if (!config.enabled || config.emergencyStop) return false;
  return normalizeAutoApplyMode(config.mode) === 'AUTO_APPLY';
}

export interface AutoApplyPreWriteInput {
  proposal: GoogleAdsAutopilotProposalInput;
  config: {
    enabled: boolean;
    emergencyStop: boolean;
    mode: GoogleAdsAutopilotMode | string;
    cooldownMinutes: number;
    allowAutoPause: boolean;
    minRoas?: number | null;
    lastActionAt?: Date | null;
    actionsToday: number;
    createdAt: Date;
  };
  guardrails: GoogleAdsAutopilotGuardrail;
  metrics: GoogleAdsAutopilotMetrics;
  campaignStatus: string;
  hasConnection: boolean;
  idempotencyDuplicate: boolean;
  lockAcquired: boolean;
  pausedByAutopilotCampaignIds?: string[];
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  now?: Date;
}

/** Deterministic pre-write pipeline — LLM never calls this. */
export function runAutoApplyPreWriteChecks(input: AutoApplyPreWriteInput): AutoApplyPreWriteResult {
  const env = input.env ?? process.env;
  const now = input.now ?? new Date();
  const steps: AutoApplyPreWriteResult['steps'] = {};
  const reasons: string[] = [];

  const mark = (step: z.infer<typeof autoApplyPreWriteStepSchema>, ok: boolean, detail?: string) => {
    steps[step] = { ok, detail };
    if (!ok && detail) reasons.push(`${step}:${detail}`);
  };

  // 1. Fresh metrics
  const metricsOk =
    input.metrics.impressions >= 0 &&
    input.metrics.clicks >= 0 &&
    Number.isFinite(input.metrics.spend);
  mark('FRESH_METRICS', metricsOk, metricsOk ? undefined : 'invalid_metrics');

  // 2. Kill switch (global + config)
  const killOff =
    !isAutopilotGlobalKillSwitch(env) &&
    input.config.enabled &&
    !input.config.emergencyStop;
  mark('KILL_SWITCH', killOff, killOff ? undefined : 'kill_switch_active');

  // 3. Auto-apply mode (immediate effect when user disables)
  const autoMode = normalizeAutoApplyMode(input.config.mode);
  const modeOk = autoMode === 'AUTO_APPLY' || input.proposal.source === 'POLICY';
  mark(
    'AUTO_APPLY_MODE',
    modeOk || autoMode === 'RECOMMEND_ONLY',
    autoMode === 'RECOMMEND_ONLY' ? 'recommend_only_no_auto_write' : undefined,
  );

  // 4. Permission / connection
  mark('PERMISSION_CONNECTION', input.hasConnection, input.hasConnection ? undefined : 'no_connection');

  // 5. Guardrail policy
  const policyCtx: AutopilotPolicyContext = {
    mode: input.config.mode as GoogleAdsAutopilotMode,
    guardrails: input.guardrails,
    metrics: input.metrics,
    campaignStatus: input.campaignStatus,
    actionsToday: input.config.actionsToday,
    emergencyStop: input.config.emergencyStop,
    configCreatedAt: input.config.createdAt,
    allowAutoPause: input.config.allowAutoPause,
    pausedByAutopilotCampaignIds: input.pausedByAutopilotCampaignIds,
    now,
  };
  const policy = evaluateAutopilotPolicy(input.proposal, policyCtx);
  mark('GUARDRAIL', policy.allowed, policy.allowed ? undefined : policy.reasons.join(','));

  // Min ROAS guard (deterministic)
  if (
    input.config.minRoas != null &&
    input.metrics.roas != null &&
    input.metrics.roas < input.config.minRoas &&
    (input.proposal.actionType === 'UPDATE_BUDGET' ||
      input.proposal.actionType === 'ENABLE_CAMPAIGN')
  ) {
    mark('GUARDRAIL', false, `min_roas:${input.metrics.roas}<${input.config.minRoas}`);
  }

  // 6. Daily cap
  const dailyOk =
    input.guardrails.maxActionsPerDay <= 0 ||
    input.config.actionsToday < input.guardrails.maxActionsPerDay;
  mark('DAILY_CAP', dailyOk, dailyOk ? undefined : 'max_actions_per_day');

  // 7. Cooldown
  let cooldownOk = true;
  if (input.config.lastActionAt && input.config.cooldownMinutes > 0) {
    const elapsed = (now.getTime() - input.config.lastActionAt.getTime()) / 60_000;
    cooldownOk = elapsed >= input.config.cooldownMinutes;
  }
  mark('COOLDOWN', cooldownOk, cooldownOk ? undefined : 'cooldown_active');

  // 8. Stop-loss
  const stopLoss = input.guardrails.stopLossDailySpend;
  const dailySpend = input.metrics.dailySpend ?? input.metrics.spend;
  let stopLossOk = true;
  if (
    stopLoss != null &&
    dailySpend >= stopLoss &&
    input.proposal.actionType !== 'PAUSE_CAMPAIGN' &&
    input.proposal.actionType !== 'PAUSE_KEYWORD' &&
    input.proposal.actionType !== 'ADD_NEGATIVE_KEYWORD'
  ) {
    stopLossOk = false;
  }
  mark('STOP_LOSS', stopLossOk, stopLossOk ? undefined : 'stop_loss_triggered');

  // 9. Auto-pause allowed
  if (input.proposal.actionType === 'PAUSE_CAMPAIGN') {
    mark(
      'AUTO_PAUSE_ALLOWED',
      input.config.allowAutoPause,
      input.config.allowAutoPause ? undefined : 'auto_pause_disabled',
    );
  } else {
    mark('AUTO_PAUSE_ALLOWED', true);
  }

  // 10. AUTO_ENABLE only if autopilot paused
  if (input.proposal.actionType === 'ENABLE_CAMPAIGN') {
    const cid = input.proposal.campaignId ?? '';
    const ok =
      cid.length > 0 &&
      (input.pausedByAutopilotCampaignIds ?? []).includes(cid);
    mark('AUTO_ENABLE_GUARD', ok, ok ? undefined : 'not_paused_by_autopilot');
  } else {
    mark('AUTO_ENABLE_GUARD', true);
  }

  // 11. Idempotency
  mark('IDEMPOTENCY', !input.idempotencyDuplicate, input.idempotencyDuplicate ? 'duplicate' : undefined);

  // 12. Lock
  mark('DISTRIBUTED_LOCK', input.lockAcquired, input.lockAcquired ? undefined : 'lock_not_acquired');

  const allowed =
    metricsOk &&
    killOff &&
    input.hasConnection &&
    policy.allowed &&
    dailyOk &&
    cooldownOk &&
    stopLossOk &&
    !input.idempotencyDuplicate &&
    input.lockAcquired &&
    (input.proposal.actionType !== 'PAUSE_CAMPAIGN' || input.config.allowAutoPause) &&
    (input.proposal.actionType !== 'ENABLE_CAMPAIGN' ||
      (input.pausedByAutopilotCampaignIds ?? []).includes(input.proposal.campaignId ?? '')) &&
    !(autoMode === 'RECOMMEND_ONLY' && input.proposal.source !== 'POLICY');

  const failedStep = (Object.entries(steps).find(([, v]) => !v.ok)?.[0] ?? undefined) as
    | z.infer<typeof autoApplyPreWriteStepSchema>
    | undefined;

  return autoApplyPreWriteResultSchema.parse({
    allowed,
    failedStep,
    reasons,
    steps,
    rollbackSnapshot: {
      beforeState: input.proposal.beforeState,
      campaignStatus: input.campaignStatus,
      capturedAt: now.toISOString(),
    },
  });
}

export function buildRollbackSnapshot(action: {
  beforeState: Record<string, unknown>;
  actionType: GoogleAdsAutopilotActionType;
  campaignId?: string | null;
}): Record<string, unknown> {
  return {
    actionType: action.actionType,
    campaignId: action.campaignId,
    beforeState: action.beforeState,
    capturedAt: new Date().toISOString(),
  };
}

export function shouldSkipWriteDryRun(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  return !isAdsActionsLive(env);
}

export const AUTO_APPLY_AUDIT_ACTIONS = {
  PRE_WRITE_BLOCKED: 'GOOGLE_ADS_AUTO_APPLY_PREWRITE_BLOCKED',
  EXECUTED: 'GOOGLE_ADS_AUTO_APPLY_EXECUTED',
  DRY_RUN: 'GOOGLE_ADS_AUTO_APPLY_DRY_RUN',
  ROLLBACK: 'GOOGLE_ADS_AUTO_APPLY_ROLLBACK',
  KILL_SWITCH: 'GOOGLE_ADS_AUTO_APPLY_KILL_SWITCH',
} as const;
