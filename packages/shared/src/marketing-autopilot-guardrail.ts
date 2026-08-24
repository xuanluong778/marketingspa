/**
 * Marketing Autopilot Execution Engine — guardrail defaults + gate checks.
 * Order: Permission → Integration Health → Approval → Guardrail → Execute.
 */
import { z } from 'zod';

export const MARKETING_AUTOPILOT_EXECUTION_ACTIONS = [
  'ACTIVATE_AUTOMATION',
  'ACTIVATE_CHATBOT',
  'PUBLISH_FUNNEL',
  'SCHEDULE_EMAIL',
  'SEND_EMAIL',
  'SCHEDULE_ZALO',
  'SEND_ZALO',
  'PUBLISH_FACEBOOK_CONTENT',
  'PUBLISH_ADS_DRAFT',
  'ENABLE_ADS_CAMPAIGN',
  'SCHEDULE_CAMPAIGN',
] as const;

export type MarketingAutopilotExecutionAction =
  (typeof MARKETING_AUTOPILOT_EXECUTION_ACTIONS)[number];

export const MARKETING_AUTOPILOT_CHECK_STAGES = [
  'PERMISSION',
  'INTEGRATION',
  'APPROVAL',
  'GUARDRAIL',
  'EXECUTE',
] as const;

export type MarketingAutopilotCheckStage =
  (typeof MARKETING_AUTOPILOT_CHECK_STAGES)[number];

export const MARKETING_AUTOPILOT_EXECUTION_RESULTS = [
  'PASSED',
  'BLOCKED_PERMISSION',
  'BLOCKED_INTEGRATION',
  'BLOCKED_APPROVAL',
  'BLOCKED_GUARDRAIL',
  'EXECUTED',
  'FAILED',
  'SKIPPED',
] as const;

export type MarketingAutopilotExecutionResult =
  (typeof MARKETING_AUTOPILOT_EXECUTION_RESULTS)[number];

export const marketingAutopilotGuardrailSchema = z.object({
  maxDailyAdSpend: z.number().nonnegative().nullable(),
  maxCampaignBudget: z.number().nonnegative().nullable(),
  maxBudgetIncreasePercent: z.number().int().min(0).max(1000),
  allowedChannels: z.array(z.string()),
  allowFacebookPublish: z.boolean(),
  allowGoogleAdsPublish: z.boolean(),
  allowEmailSend: z.boolean(),
  allowZaloSend: z.boolean(),
  allowAutomationActivation: z.boolean(),
  stopLossCpl: z.number().nonnegative().nullable(),
  stopLossCpa: z.number().nonnegative().nullable(),
  autopilotMode: z.enum(['APPROVAL_AUTOPILOT', 'FULL_AUTOPILOT']).default('APPROVAL_AUTOPILOT'),
  fullAutopilotEnabled: z.boolean().default(false),
});

export type MarketingAutopilotGuardrailConfig = z.infer<
  typeof marketingAutopilotGuardrailSchema
>;

/** Conservative defaults — outbound send/publish OFF until org enables. */
export const DEFAULT_MARKETING_AUTOPILOT_GUARDRAIL: MarketingAutopilotGuardrailConfig =
  {
    maxDailyAdSpend: 5_000_000,
    maxCampaignBudget: 20_000_000,
    maxBudgetIncreasePercent: 20,
    allowedChannels: ['FACEBOOK', 'GOOGLE', 'EMAIL', 'ZALO', 'MESSENGER'],
    allowFacebookPublish: false,
    allowGoogleAdsPublish: false,
    allowEmailSend: false,
    allowZaloSend: false,
    allowAutomationActivation: true,
    stopLossCpl: null,
    stopLossCpa: null,
    autopilotMode: 'APPROVAL_AUTOPILOT',
    fullAutopilotEnabled: false,
  };

export type ExecutionGateInput = {
  /** Actor belongs to mission org */
  permissionOk: boolean;
  /** Integration connected & healthy for this action */
  integrationOk: boolean;
  integrationReason?: string;
  /** Mission has immutable approval covering this asset */
  approvalOk: boolean;
  approvalReason?: string;
  guardrail: MarketingAutopilotGuardrailConfig;
  action: MarketingAutopilotExecutionAction;
  channel?: string | null;
  /** Proposed ad spend / campaign budget for budget checks */
  proposedBudget?: number | null;
  /** Current daily ad spend (org) */
  currentDailyAdSpend?: number | null;
  /** Existing campaign budget before increase */
  currentCampaignBudget?: number | null;
  /** Observed CPL/CPA for stop-loss */
  observedCpl?: number | null;
  observedCpa?: number | null;
};

export type ExecutionGateOutcome = {
  ok: boolean;
  stage: MarketingAutopilotCheckStage;
  result: MarketingAutopilotExecutionResult;
  message: string;
};

function channelAllowed(
  guardrail: MarketingAutopilotGuardrailConfig,
  channel?: string | null,
): boolean {
  if (!channel) return true;
  const list = guardrail.allowedChannels.map((c) => c.toUpperCase());
  if (list.length === 0) return false;
  return list.includes(channel.toUpperCase());
}

/**
 * Evaluate gates in fixed order. First failure wins.
 * Never returns ok for outbound actions without approvalOk.
 */
export function evaluateExecutionGate(input: ExecutionGateInput): ExecutionGateOutcome {
  if (!input.permissionOk) {
    return {
      ok: false,
      stage: 'PERMISSION',
      result: 'BLOCKED_PERMISSION',
      message: 'User không thuộc organization của mission',
    };
  }

  if (!input.integrationOk) {
    return {
      ok: false,
      stage: 'INTEGRATION',
      result: 'BLOCKED_INTEGRATION',
      message: input.integrationReason ?? 'Integration chưa kết nối / không healthy',
    };
  }

  if (!input.approvalOk) {
    return {
      ok: false,
      stage: 'APPROVAL',
      result: 'BLOCKED_APPROVAL',
      message:
        input.approvalReason ??
        'Chưa có Approval Snapshot — tuyệt đối không send/publish/tiêu Ads',
    };
  }

  const g = input.guardrail;
  const action = input.action;

  if (action === 'PUBLISH_FACEBOOK_CONTENT' && !g.allowFacebookPublish) {
    return {
      ok: false,
      stage: 'GUARDRAIL',
      result: 'BLOCKED_GUARDRAIL',
      message: 'allowFacebookPublish=false',
    };
  }
  if (action === 'ENABLE_ADS_CAMPAIGN' && !g.allowGoogleAdsPublish && !g.allowFacebookPublish) {
    return {
      ok: false,
      stage: 'GUARDRAIL',
      result: 'BLOCKED_GUARDRAIL',
      message: 'Ads publish bị tắt (allowFacebookPublish/allowGoogleAdsPublish)',
    };
  }
  if (action === 'ENABLE_ADS_CAMPAIGN') {
    const ch = (input.channel ?? '').toUpperCase();
    if (ch === 'GOOGLE' && !g.allowGoogleAdsPublish) {
      return {
        ok: false,
        stage: 'GUARDRAIL',
        result: 'BLOCKED_GUARDRAIL',
        message: 'allowGoogleAdsPublish=false',
      };
    }
    if ((ch === 'FACEBOOK' || ch === 'META') && !g.allowFacebookPublish) {
      return {
        ok: false,
        stage: 'GUARDRAIL',
        result: 'BLOCKED_GUARDRAIL',
        message: 'allowFacebookPublish=false (Meta Ads)',
      };
    }
  }
  if (action === 'SEND_EMAIL' && !g.allowEmailSend) {
    return {
      ok: false,
      stage: 'GUARDRAIL',
      result: 'BLOCKED_GUARDRAIL',
      message: 'allowEmailSend=false',
    };
  }
  if (action === 'SEND_ZALO' && !g.allowZaloSend) {
    return {
      ok: false,
      stage: 'GUARDRAIL',
      result: 'BLOCKED_GUARDRAIL',
      message: 'allowZaloSend=false',
    };
  }
  if (
    (action === 'ACTIVATE_AUTOMATION' || action === 'ACTIVATE_CHATBOT') &&
    !g.allowAutomationActivation
  ) {
    return {
      ok: false,
      stage: 'GUARDRAIL',
      result: 'BLOCKED_GUARDRAIL',
      message: 'allowAutomationActivation=false',
    };
  }
  if (input.channel && !channelAllowed(g, input.channel)) {
    return {
      ok: false,
      stage: 'GUARDRAIL',
      result: 'BLOCKED_GUARDRAIL',
      message: `Channel ${input.channel} không nằm trong allowedChannels`,
    };
  }

  const proposed = input.proposedBudget ?? null;
  if (
    proposed != null &&
    g.maxCampaignBudget != null &&
    proposed > Number(g.maxCampaignBudget)
  ) {
    return {
      ok: false,
      stage: 'GUARDRAIL',
      result: 'BLOCKED_GUARDRAIL',
      message: `proposedBudget ${proposed} > maxCampaignBudget ${g.maxCampaignBudget}`,
    };
  }
  if (
    proposed != null &&
    g.maxDailyAdSpend != null &&
    (input.currentDailyAdSpend ?? 0) + proposed > Number(g.maxDailyAdSpend)
  ) {
    return {
      ok: false,
      stage: 'GUARDRAIL',
      result: 'BLOCKED_GUARDRAIL',
      message: `daily ad spend vượt maxDailyAdSpend ${g.maxDailyAdSpend}`,
    };
  }
  if (
    proposed != null &&
    input.currentCampaignBudget != null &&
    input.currentCampaignBudget > 0 &&
    proposed > input.currentCampaignBudget
  ) {
    const increasePct =
      ((proposed - input.currentCampaignBudget) / input.currentCampaignBudget) * 100;
    if (increasePct > g.maxBudgetIncreasePercent) {
      return {
        ok: false,
        stage: 'GUARDRAIL',
        result: 'BLOCKED_GUARDRAIL',
        message: `budget increase ${increasePct.toFixed(1)}% > maxBudgetIncreasePercent ${g.maxBudgetIncreasePercent}`,
      };
    }
  }
  if (g.stopLossCpl != null && input.observedCpl != null && input.observedCpl > Number(g.stopLossCpl)) {
    return {
      ok: false,
      stage: 'GUARDRAIL',
      result: 'BLOCKED_GUARDRAIL',
      message: `CPL ${input.observedCpl} > stopLossCpl ${g.stopLossCpl}`,
    };
  }
  if (g.stopLossCpa != null && input.observedCpa != null && input.observedCpa > Number(g.stopLossCpa)) {
    return {
      ok: false,
      stage: 'GUARDRAIL',
      result: 'BLOCKED_GUARDRAIL',
      message: `CPA ${input.observedCpa} > stopLossCpa ${g.stopLossCpa}`,
    };
  }

  return {
    ok: true,
    stage: 'EXECUTE',
    result: 'PASSED',
    message: 'All gates passed',
  };
}

/** Map mission asset module/entityType → primary execution action. */
export function resolveExecutionActionForAsset(input: {
  module: string;
  entityType: string;
  /** Prefer non-send after approval when allow* is false — caller may override */
  preferSend?: boolean;
}): MarketingAutopilotExecutionAction | null {
  const mod = input.module.toUpperCase();
  const et = input.entityType.toLowerCase();

  if (mod === 'AUTOMATION' || et.includes('automation')) return 'ACTIVATE_AUTOMATION';
  if (mod === 'CHATBOT' || et.includes('chatbot')) return 'ACTIVATE_CHATBOT';
  if (mod === 'FUNNEL' || et.includes('funnel')) return 'PUBLISH_FUNNEL';
  if (mod === 'EMAIL' || et.includes('email')) {
    return input.preferSend ? 'SEND_EMAIL' : 'SCHEDULE_EMAIL';
  }
  if (mod === 'ZALO' || et.includes('zalo')) {
    return input.preferSend ? 'SEND_ZALO' : 'SCHEDULE_ZALO';
  }
  if (mod === 'CONTENT' || et.includes('auto_post') || et.includes('teleprompter')) {
    return 'PUBLISH_FACEBOOK_CONTENT';
  }
  if (mod === 'ADS' || et.includes('ad_draft') || et.includes('ad_')) {
    return input.preferSend ? 'ENABLE_ADS_CAMPAIGN' : 'PUBLISH_ADS_DRAFT';
  }
  if (mod === 'CAMPAIGN' || et.includes('messaging_campaign') || et.includes('campaign')) {
    return 'SCHEDULE_CAMPAIGN';
  }
  if (mod === 'CRM') return null; // scoring config — no live execute
  return null;
}

export function normalizeGuardrailFromDb(row: {
  maxDailyAdSpend?: unknown;
  maxCampaignBudget?: unknown;
  maxBudgetIncreasePercent?: number;
  allowedChannels?: unknown;
  allowFacebookPublish?: boolean;
  allowGoogleAdsPublish?: boolean;
  allowEmailSend?: boolean;
  allowZaloSend?: boolean;
  allowAutomationActivation?: boolean;
  stopLossCpl?: unknown;
  stopLossCpa?: unknown;
  autopilotMode?: string;
  fullAutopilotEnabled?: boolean;
} | null): MarketingAutopilotGuardrailConfig {
  if (!row) return { ...DEFAULT_MARKETING_AUTOPILOT_GUARDRAIL };
  const num = (v: unknown): number | null => {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const channels = Array.isArray(row.allowedChannels)
    ? row.allowedChannels.filter((c): c is string => typeof c === 'string')
    : DEFAULT_MARKETING_AUTOPILOT_GUARDRAIL.allowedChannels;
  return {
    maxDailyAdSpend: num(row.maxDailyAdSpend) ?? DEFAULT_MARKETING_AUTOPILOT_GUARDRAIL.maxDailyAdSpend,
    maxCampaignBudget:
      num(row.maxCampaignBudget) ?? DEFAULT_MARKETING_AUTOPILOT_GUARDRAIL.maxCampaignBudget,
    maxBudgetIncreasePercent:
      row.maxBudgetIncreasePercent ?? DEFAULT_MARKETING_AUTOPILOT_GUARDRAIL.maxBudgetIncreasePercent,
    allowedChannels: channels,
    allowFacebookPublish: row.allowFacebookPublish ?? false,
    allowGoogleAdsPublish: row.allowGoogleAdsPublish ?? false,
    allowEmailSend: row.allowEmailSend ?? false,
    allowZaloSend: row.allowZaloSend ?? false,
    allowAutomationActivation: row.allowAutomationActivation ?? true,
    stopLossCpl: num(row.stopLossCpl),
    stopLossCpa: num(row.stopLossCpa),
    autopilotMode:
      (row.autopilotMode === 'FULL_AUTOPILOT'
        ? 'FULL_AUTOPILOT'
        : 'APPROVAL_AUTOPILOT') as MarketingAutopilotGuardrailConfig['autopilotMode'],
    fullAutopilotEnabled: row.fullAutopilotEnabled ?? false,
  };
}
