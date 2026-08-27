import { z } from 'zod';
import { isAdsActionsLive } from './ads-actions';

export const googleAdsAutopilotModeSchema = z.enum([
  'MANUAL',
  'GUARDED_AUTO',
  'RECOMMEND_ONLY',
  'AUTO_APPLY',
]);

export const googleAdsAutopilotActionTypeSchema = z.enum([
  'PAUSE_CAMPAIGN',
  'ENABLE_CAMPAIGN',
  'UPDATE_BUDGET',
  'PAUSE_KEYWORD',
  'ADD_NEGATIVE_KEYWORD',
]);

export const googleAdsAutopilotRiskLevelSchema = z.enum(['LOW', 'HIGH']);

export const googleAdsAutopilotProposalStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'AUTO_EXECUTED',
  'EXPIRED',
  'CANCELLED',
]);

export const googleAdsAutopilotGuardrailSchema = z.object({
  maxDailyBudget: z.number().finite().positive().nullable().optional(),
  maxMonthlyBudget: z.number().finite().positive().nullable().optional(),
  maxBudgetIncreasePct: z.number().int().min(0).max(100).default(20),
  maxBudgetDecreasePct: z.number().int().min(0).max(100).default(20),
  targetCpa: z.number().finite().positive().nullable().optional(),
  targetCpl: z.number().finite().positive().nullable().optional(),
  targetRoas: z.number().finite().positive().nullable().optional(),
  stopLossDailySpend: z.number().finite().positive().nullable().optional(),
  minSpendForAction: z.number().finite().nonnegative().nullable().optional(),
  minClicksForAction: z.number().int().nonnegative().nullable().optional(),
  minConversionsForAction: z.number().int().nonnegative().nullable().optional(),
  gracePeriodHours: z.number().int().min(0).max(168).default(24),
  maxActionsPerDay: z.number().int().min(0).max(100).default(10),
  cooldownMinutes: z.number().int().min(0).max(1440).default(60),
  allowAutoPause: z.boolean().default(true),
  minRoas: z.number().finite().positive().nullable().optional(),
});

export const googleAdsAutopilotMetricsSchema = z.object({
  spend: z.number().finite().nonnegative(),
  clicks: z.number().int().nonnegative(),
  impressions: z.number().int().nonnegative(),
  conversions: z.number().finite().nonnegative(),
  leads: z.number().finite().nonnegative(),
  cpa: z.number().finite().nonnegative(),
  cpl: z.number().finite().nonnegative(),
  roas: z.number().finite().nullable().optional(),
  ctr: z.number().finite().nonnegative().optional(),
  dailySpend: z.number().finite().nonnegative().optional(),
});

export const googleAdsAutopilotProposalInputSchema = z.object({
  actionType: googleAdsAutopilotActionTypeSchema,
  campaignId: z.string().uuid().optional(),
  externalCampaignId: z.string().optional(),
  keywordResource: z.string().optional(),
  keywordText: z.string().optional(),
  beforeState: z.record(z.unknown()).default({}),
  afterState: z.record(z.unknown()).default({}),
  payload: z.record(z.unknown()).default({}),
  evidence: z.record(z.unknown()).default({}),
  reason: z.string().max(2000).optional(),
  source: z.enum(['RULE', 'LLM', 'POLICY']).default('RULE'),
});

/** LLM output — chỉ đề xuất, không quyết định spend. */
export const googleAdsAutopilotLlmProposalSchema = z.object({
  proposals: z
    .array(
      z.object({
        actionType: googleAdsAutopilotActionTypeSchema,
        campaignExternalId: z.string().optional(),
        keywordText: z.string().optional(),
        budgetChangePercent: z.number().finite().optional(),
        proposedDailyBudget: z.number().finite().positive().optional(),
        reason: z.string().max(500),
        confidence: z.number().min(0).max(1).optional(),
      }),
    )
    .max(5),
  summary: z.string().max(1000).optional(),
});

export const googleAdsAutopilotQueuePayloadSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('scan'),
    organizationId: z.string().uuid().optional(),
    configId: z.string().uuid().optional(),
  }),
  z.object({
    kind: z.literal('execute'),
    organizationId: z.string().uuid(),
    actionId: z.string().uuid(),
  }),
  z.object({
    kind: z.literal('outcome'),
    organizationId: z.string().uuid().optional(),
  }),
]);

export type GoogleAdsAutopilotMode = z.infer<typeof googleAdsAutopilotModeSchema>;
export type GoogleAdsAutopilotActionType = z.infer<typeof googleAdsAutopilotActionTypeSchema>;
export type GoogleAdsAutopilotGuardrail = z.infer<typeof googleAdsAutopilotGuardrailSchema>;
export type GoogleAdsAutopilotMetrics = z.infer<typeof googleAdsAutopilotMetricsSchema>;
export type GoogleAdsAutopilotProposalInput = z.infer<typeof googleAdsAutopilotProposalInputSchema>;
export type GoogleAdsAutopilotQueuePayload = z.infer<typeof googleAdsAutopilotQueuePayloadSchema>;

export interface AutopilotPolicyContext {
  mode: GoogleAdsAutopilotMode;
  guardrails: GoogleAdsAutopilotGuardrail;
  metrics: GoogleAdsAutopilotMetrics;
  campaignStatus: string;
  actionsToday: number;
  emergencyStop: boolean;
  configCreatedAt: Date;
  allowAutoPause?: boolean;
  pausedByAutopilotCampaignIds?: string[];
  now?: Date;
}

/** @deprecated use normalizeAutoApplyMode from google-ads-auto-apply */
export function normalizeAutopilotMode(raw: string | null | undefined): GoogleAdsAutopilotMode {
  const v = String(raw ?? 'RECOMMEND_ONLY').toUpperCase();
  if (v === 'AUTO_APPLY' || v === 'GUARDED_AUTO') return 'AUTO_APPLY';
  if (v === 'RECOMMEND_ONLY' || v === 'MANUAL') return 'RECOMMEND_ONLY';
  return v as GoogleAdsAutopilotMode;
}

export interface AutopilotPolicyDecision {
  allowed: boolean;
  autoExecute: boolean;
  requiresApproval: boolean;
  riskLevel: 'LOW' | 'HIGH';
  reasons: string[];
  clampedBudget?: number;
  clampedBudgetChangePercent?: number;
}

export function isAdsProviderWriteEnabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  return String(env.ADS_ACTIONS_PROVIDER_WRITE ?? 'false').toLowerCase() === 'true';
}

/** Customer whitelist for live write tests — comma-separated customer IDs without dashes. */
export function isGoogleAdsAutopilotWriteWhitelisted(
  customerId: string,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  const raw = String(env.GOOGLE_ADS_AUTOPILOT_WRITE_WHITELIST ?? '').trim();
  if (!raw) return false;
  const normalized = customerId.replace(/-/g, '');
  return raw
    .split(',')
    .map((s) => s.trim().replace(/-/g, ''))
    .filter(Boolean)
    .includes(normalized);
}

export function canAutopilotProviderWrite(input: {
  customerId: string;
  writeWhitelistEnabled: boolean;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}): boolean {
  const env = input.env ?? process.env;
  if (!isAdsActionsLive(env) || !isAdsProviderWriteEnabled(env)) return false;
  if (!input.writeWhitelistEnabled) return false;
  return isGoogleAdsAutopilotWriteWhitelisted(input.customerId, env);
}

export function classifyAutopilotRisk(
  actionType: GoogleAdsAutopilotActionType,
  payload: Record<string, unknown>,
): 'LOW' | 'HIGH' {
  switch (actionType) {
    case 'ADD_NEGATIVE_KEYWORD':
    case 'PAUSE_KEYWORD':
      return 'LOW';
    case 'UPDATE_BUDGET': {
      const pct = Number(payload.budgetChangePercent ?? 0);
      return pct < 0 && Math.abs(pct) <= 10 ? 'LOW' : 'HIGH';
    }
    case 'PAUSE_CAMPAIGN':
    case 'ENABLE_CAMPAIGN':
      return 'HIGH';
    default:
      return 'HIGH';
  }
}

function withinGracePeriod(ctx: AutopilotPolicyContext): boolean {
  const now = ctx.now ?? new Date();
  const hours = (now.getTime() - ctx.configCreatedAt.getTime()) / 3_600_000;
  return hours < (ctx.guardrails.gracePeriodHours ?? 24);
}

export function clampBudgetChangePercent(
  requestedPercent: number,
  guardrails: GoogleAdsAutopilotGuardrail,
  direction: 'increase' | 'decrease',
): number {
  const max =
    direction === 'increase'
      ? guardrails.maxBudgetIncreasePct ?? 20
      : guardrails.maxBudgetDecreasePct ?? 20;
  const cap = Math.max(0, Math.min(100, max));
  if (requestedPercent > cap) return cap;
  if (requestedPercent < -cap) return -cap;
  return requestedPercent;
}

/** Deterministic policy — LLM không được bypass. */
export function evaluateAutopilotPolicy(
  proposal: GoogleAdsAutopilotProposalInput,
  ctx: AutopilotPolicyContext,
): AutopilotPolicyDecision {
  const reasons: string[] = [];
  const riskLevel = classifyAutopilotRisk(proposal.actionType, proposal.payload);
  const now = ctx.now ?? new Date();

  if (ctx.emergencyStop) {
    return {
      allowed: false,
      autoExecute: false,
      requiresApproval: true,
      riskLevel,
      reasons: ['emergency_stop'],
    };
  }

  if (proposal.actionType === 'ENABLE_CAMPAIGN') {
    const cid = proposal.campaignId ?? '';
    const autopilotPaused = (ctx.pausedByAutopilotCampaignIds ?? []).includes(cid);
    if (!autopilotPaused) {
      return {
        allowed: false,
        autoExecute: false,
        requiresApproval: true,
        riskLevel: 'HIGH',
        reasons: ['auto_enable_only_if_autopilot_paused'],
      };
    }
  }

  const effectiveMode =
    ctx.mode === 'AUTO_APPLY' || ctx.mode === 'GUARDED_AUTO'
      ? 'AUTO_APPLY'
      : 'RECOMMEND_ONLY';

  if (proposal.actionType === 'ENABLE_CAMPAIGN' && effectiveMode === 'AUTO_APPLY') {
    reasons.push('enable_campaign_requires_manual_approval');
  }

  if (proposal.actionType === 'PAUSE_CAMPAIGN' && ctx.allowAutoPause === false) {
    return {
      allowed: false,
      autoExecute: false,
      requiresApproval: true,
      riskLevel,
      reasons: ['auto_pause_disabled'],
    };
  }

  const minSpend = ctx.guardrails.minSpendForAction ?? 0;
  const minClicks = ctx.guardrails.minClicksForAction ?? 0;
  const minConv = ctx.guardrails.minConversionsForAction ?? 0;
  const results = ctx.metrics.conversions + ctx.metrics.leads;

  if (withinGracePeriod(ctx)) {
    return {
      allowed: false,
      autoExecute: false,
      requiresApproval: true,
      riskLevel,
      reasons: ['grace_period_active'],
    };
  }

  if (minSpend > 0 && ctx.metrics.spend < minSpend) {
    return {
      allowed: false,
      autoExecute: false,
      requiresApproval: true,
      riskLevel,
      reasons: [`min_spend_not_met:${ctx.metrics.spend}<${minSpend}`],
    };
  }
  if (minClicks > 0 && ctx.metrics.clicks < minClicks) {
    return {
      allowed: false,
      autoExecute: false,
      requiresApproval: true,
      riskLevel,
      reasons: [`min_clicks_not_met:${ctx.metrics.clicks}<${minClicks}`],
    };
  }
  if (minConv > 0 && results < minConv) {
    return {
      allowed: false,
      autoExecute: false,
      requiresApproval: true,
      riskLevel,
      reasons: [`min_conversions_not_met:${results}<${minConv}`],
    };
  }

  if (
    ctx.guardrails.stopLossDailySpend != null &&
    (ctx.metrics.dailySpend ?? ctx.metrics.spend) >= ctx.guardrails.stopLossDailySpend &&
    proposal.actionType !== 'PAUSE_CAMPAIGN' &&
    proposal.actionType !== 'PAUSE_KEYWORD' &&
    proposal.actionType !== 'ADD_NEGATIVE_KEYWORD'
  ) {
    return {
      allowed: false,
      autoExecute: false,
      requiresApproval: true,
      riskLevel: 'HIGH',
      reasons: ['stop_loss_daily_spend'],
    };
  }

  if (ctx.guardrails.maxActionsPerDay > 0 && ctx.actionsToday >= ctx.guardrails.maxActionsPerDay) {
    return {
      allowed: false,
      autoExecute: false,
      requiresApproval: true,
      riskLevel,
      reasons: ['max_actions_per_day'],
    };
  }

  let clampedBudget: number | undefined;
  let clampedBudgetChangePercent: number | undefined;

  if (proposal.actionType === 'UPDATE_BUDGET') {
    const current = Number(proposal.beforeState.budget ?? proposal.payload.currentBudget ?? 0);
    const proposed =
      Number(proposal.afterState.budget ?? proposal.payload.proposedDailyBudget ?? 0) || current;
    if (current <= 0 || proposed <= 0) {
      return {
        allowed: false,
        autoExecute: false,
        requiresApproval: true,
        riskLevel: 'HIGH',
        reasons: ['invalid_budget'],
      };
    }
    const rawPct = ((proposed - current) / current) * 100;
    const direction = rawPct >= 0 ? 'increase' : 'decrease';
    clampedBudgetChangePercent = clampBudgetChangePercent(rawPct, ctx.guardrails, direction);
    clampedBudget = Math.max(1, Math.round(current * (1 + clampedBudgetChangePercent / 100) * 100) / 100);

    if (ctx.guardrails.maxDailyBudget != null && clampedBudget > ctx.guardrails.maxDailyBudget) {
      return {
        allowed: false,
        autoExecute: false,
        requiresApproval: true,
        riskLevel: 'HIGH',
        reasons: [`max_daily_budget:${clampedBudget}>${ctx.guardrails.maxDailyBudget}`],
      };
    }
    if (
      ctx.guardrails.maxMonthlyBudget != null &&
      clampedBudget * 30 > ctx.guardrails.maxMonthlyBudget
    ) {
      return {
        allowed: false,
        autoExecute: false,
        requiresApproval: true,
        riskLevel: 'HIGH',
        reasons: ['max_monthly_budget'],
      };
    }
  }

  if (ctx.guardrails.targetCpa != null && ctx.metrics.cpa > ctx.guardrails.targetCpa) {
    if (proposal.actionType === 'UPDATE_BUDGET') {
      const pct = Number(proposal.payload.budgetChangePercent ?? 0);
      if (pct > 0) {
        return {
          allowed: false,
          autoExecute: false,
          requiresApproval: true,
          riskLevel: 'HIGH',
          reasons: ['cpa_above_target_no_budget_increase'],
        };
      }
    }
  }

  if (
    ctx.guardrails.targetRoas != null &&
    ctx.metrics.roas != null &&
    ctx.metrics.roas < ctx.guardrails.targetRoas &&
    proposal.actionType === 'ENABLE_CAMPAIGN'
  ) {
    return {
      allowed: false,
      autoExecute: false,
      requiresApproval: true,
      riskLevel: 'HIGH',
      reasons: ['roas_below_target'],
    };
  }

  const requiresApproval =
    effectiveMode === 'RECOMMEND_ONLY' ||
    riskLevel === 'HIGH' ||
    reasons.includes('enable_campaign_requires_manual_approval');

  const autoExecute =
    effectiveMode === 'AUTO_APPLY' &&
    !requiresApproval &&
    riskLevel === 'LOW' &&
    reasons.length === 0;

  return {
    allowed: true,
    autoExecute,
    requiresApproval,
    riskLevel,
    reasons,
    clampedBudget,
    clampedBudgetChangePercent,
  };
}

export function buildAutopilotIdempotencyKey(parts: {
  organizationId: string;
  customerId: string;
  actionType: string;
  targetId: string;
  windowHours?: number;
}): string {
  const window = parts.windowHours ?? 24;
  const bucket = Math.floor(Date.now() / (window * 3_600_000));
  const cid = parts.customerId.replace(/-/g, '');
  return `autopilot:${parts.organizationId}:${cid}:${parts.actionType}:${parts.targetId}:${bucket}`;
}

export function buildAutopilotActionIdempotencyKey(proposalId: string): string {
  return `autopilot-action:${proposalId}`;
}

export const AUTOPILOT_OUTCOME_HORIZONS_MS: Record<'H24' | 'D3' | 'D7', number> = {
  H24: 24 * 3_600_000,
  D3: 3 * 24 * 3_600_000,
  D7: 7 * 24 * 3_600_000,
};

export function evaluateOutcomeVerdict(
  before: GoogleAdsAutopilotMetrics,
  after: GoogleAdsAutopilotMetrics,
  actionType: GoogleAdsAutopilotActionType,
): 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' {
  const spendDelta = after.spend - before.spend;
  const convDelta = after.conversions + after.leads - (before.conversions + before.leads);
  const cpaBefore = before.cpa || 0;
  const cpaAfter = after.cpa || 0;

  if (actionType === 'PAUSE_CAMPAIGN' || actionType === 'PAUSE_KEYWORD') {
    if (spendDelta <= 0 && cpaAfter <= cpaBefore) return 'POSITIVE';
    if (spendDelta > 0) return 'NEGATIVE';
    return 'NEUTRAL';
  }

  if (actionType === 'UPDATE_BUDGET') {
    if (convDelta > 0 && cpaAfter <= cpaBefore) return 'POSITIVE';
    if (cpaAfter > cpaBefore * 1.15) return 'NEGATIVE';
    return 'NEUTRAL';
  }

  if (actionType === 'ADD_NEGATIVE_KEYWORD') {
    if (after.cpa < before.cpa && spendDelta <= 0) return 'POSITIVE';
    if (convDelta < 0) return 'NEGATIVE';
    return 'NEUTRAL';
  }

  if (actionType === 'ENABLE_CAMPAIGN') {
    if (convDelta > 0) return 'POSITIVE';
    if (cpaAfter > cpaBefore * 1.2) return 'NEGATIVE';
    return 'NEUTRAL';
  }

  return 'NEUTRAL';
}

/** Rule-based proposals from synced metrics — no LLM spend decisions. */
export function buildRuleBasedProposals(input: {
  campaignId: string;
  externalCampaignId: string;
  campaignStatus: string;
  metrics: GoogleAdsAutopilotMetrics;
  guardrails: GoogleAdsAutopilotGuardrail;
  currentBudget?: number | null;
}): GoogleAdsAutopilotProposalInput[] {
  const out: GoogleAdsAutopilotProposalInput[] = [];
  const results = input.metrics.conversions + input.metrics.leads;

  if (
    input.guardrails.stopLossDailySpend != null &&
    (input.metrics.dailySpend ?? input.metrics.spend) >= input.guardrails.stopLossDailySpend &&
    input.campaignStatus === 'ACTIVE'
  ) {
    out.push({
      actionType: 'PAUSE_CAMPAIGN',
      campaignId: input.campaignId,
      externalCampaignId: input.externalCampaignId,
      beforeState: { status: 'ACTIVE', budget: input.currentBudget ?? null },
      afterState: { status: 'PAUSED' },
      payload: {},
      evidence: { metrics: input.metrics, trigger: 'stop_loss' },
      reason: 'Stop-loss daily spend — đề xuất tạm dừng chiến dịch',
      source: 'RULE',
    });
  }

  if (
    input.guardrails.targetCpa != null &&
    input.metrics.cpa > input.guardrails.targetCpa &&
    results > 0 &&
    input.campaignStatus === 'ACTIVE'
  ) {
    out.push({
      actionType: 'PAUSE_CAMPAIGN',
      campaignId: input.campaignId,
      externalCampaignId: input.externalCampaignId,
      beforeState: { status: 'ACTIVE' },
      afterState: { status: 'PAUSED' },
      payload: {},
      evidence: { metrics: input.metrics, targetCpa: input.guardrails.targetCpa },
      reason: `CPA ${input.metrics.cpa} vượt target ${input.guardrails.targetCpa}`,
      source: 'RULE',
    });
  }

  if (
    input.guardrails.targetRoas != null &&
    input.metrics.roas != null &&
    input.metrics.roas < input.guardrails.targetRoas &&
    input.currentBudget != null &&
    input.currentBudget > 0 &&
    input.campaignStatus === 'ACTIVE'
  ) {
    const pct = -10;
    const proposed = Math.max(1, Math.round(input.currentBudget * 0.9 * 100) / 100);
    out.push({
      actionType: 'UPDATE_BUDGET',
      campaignId: input.campaignId,
      externalCampaignId: input.externalCampaignId,
      beforeState: { budget: input.currentBudget, status: 'ACTIVE' },
      afterState: { budget: proposed },
      payload: { budgetChangePercent: pct, proposedDailyBudget: proposed, currentBudget: input.currentBudget },
      evidence: { metrics: input.metrics, targetRoas: input.guardrails.targetRoas },
      reason: `ROAS ${input.metrics.roas} dưới target — đề xuất giảm ngân sách 10%`,
      source: 'RULE',
    });
  }

  return out;
}

export function createDryRunAutopilotMutatePort(): {
  calls: Array<{ actionType: string; payload: Record<string, unknown> }>;
  port: {
    pauseCampaign: (id: string) => Promise<string>;
    enableCampaign: (id: string) => Promise<string>;
    updateCampaignBudget: (id: string, micros: number) => Promise<string>;
    pauseKeyword: (resource: string) => Promise<string>;
    addNegativeKeyword: (campaignId: string, text: string) => Promise<string>;
  };
} {
  const calls: Array<{ actionType: string; payload: Record<string, unknown> }> = [];
  return {
    calls,
    port: {
      async pauseCampaign(id) {
        calls.push({ actionType: 'PAUSE_CAMPAIGN', payload: { campaignId: id } });
        return `customers/0/campaigns/${id}`;
      },
      async enableCampaign(id) {
        calls.push({ actionType: 'ENABLE_CAMPAIGN', payload: { campaignId: id } });
        return `customers/0/campaigns/${id}`;
      },
      async updateCampaignBudget(id, micros) {
        calls.push({ actionType: 'UPDATE_BUDGET', payload: { campaignId: id, budgetMicros: micros } });
        return `customers/0/campaignBudgets/${id}`;
      },
      async pauseKeyword(resource) {
        calls.push({ actionType: 'PAUSE_KEYWORD', payload: { keywordResource: resource } });
        return resource;
      },
      async addNegativeKeyword(campaignId, text) {
        calls.push({ actionType: 'ADD_NEGATIVE_KEYWORD', payload: { campaignId, text } });
        return `customers/0/campaignCriteria/${campaignId}~${text}`;
      },
    },
  };
}
