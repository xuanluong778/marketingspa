/**
 * Marketing Autopilot AI Orchestrator A→Z — mission steps & progress helpers.
 * Additive; does not change existing planner/NBA/confirm contracts.
 */
import { z } from 'zod';
import { MARKETING_AUTOPILOT_DRAFT_TYPES } from './marketing-autopilot-planner';

export const MARKETING_MISSION_STEPS = [
  'BRIEF',
  'CONTEXT',
  'DIAGNOSE',
  'PLANNER',
  'NBA',
  'STRATEGY',
  'BLUEPRINT',
  'ASSETS',
  'VALIDATE',
  'READY_FOR_APPROVAL',
] as const;

export type MarketingMissionStep = (typeof MARKETING_MISSION_STEPS)[number];

export const MARKETING_MISSION_STATUSES = [
  'DRAFT',
  'PENDING',
  'GENERATING',
  'RUNNING',
  'READY_FOR_APPROVAL',
  'APPROVED',
  'QUEUED',
  'FAILED',
  'BLOCKED',
] as const;

export type MarketingMissionStatus = (typeof MARKETING_MISSION_STATUSES)[number];

export const MARKETING_MISSION_STEP_LABELS: Record<MarketingMissionStep, string> = {
  BRIEF: 'Brief',
  CONTEXT: 'Context V2',
  DIAGNOSE: 'Diagnose',
  PLANNER: 'Planner V3',
  NBA: 'NBA V3',
  STRATEGY: 'Strategy',
  BLUEPRINT: 'Campaign Blueprint',
  ASSETS: 'Tạo assets (Draft)',
  VALIDATE: 'Kiểm tra',
  READY_FOR_APPROVAL: 'Sẵn sàng duyệt',
};

export function marketingMissionProgressPercent(step: MarketingMissionStep | string): number {
  const idx = (MARKETING_MISSION_STEPS as readonly string[]).indexOf(step);
  if (idx < 0) return 0;
  if (step === 'READY_FOR_APPROVAL') return 100;
  return Math.round(((idx + 1) / MARKETING_MISSION_STEPS.length) * 100);
}

export function nextMarketingMissionStep(
  step: MarketingMissionStep,
): MarketingMissionStep | null {
  const idx = MARKETING_MISSION_STEPS.indexOf(step);
  if (idx < 0 || idx >= MARKETING_MISSION_STEPS.length - 1) return null;
  return MARKETING_MISSION_STEPS[idx + 1]!;
}

export const marketingMissionStepStateSchema = z.object({
  status: z.enum(['pending', 'running', 'done', 'skipped', 'failed']),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  error: z.string().optional(),
  meta: z.record(z.unknown()).optional(),
});

export type MarketingMissionStepState = z.infer<typeof marketingMissionStepStateSchema>;

export type MarketingMissionStepsMap = Partial<
  Record<MarketingMissionStep, MarketingMissionStepState>
>;

export function emptyMissionStepsMap(): MarketingMissionStepsMap {
  const out: MarketingMissionStepsMap = {};
  for (const step of MARKETING_MISSION_STEPS) {
    out[step] = { status: 'pending' };
  }
  return out;
}

export function markMissionStep(
  steps: MarketingMissionStepsMap,
  step: MarketingMissionStep,
  patch: Partial<MarketingMissionStepState>,
): MarketingMissionStepsMap {
  const prev = steps[step] ?? { status: 'pending' as const };
  return {
    ...steps,
    [step]: {
      ...prev,
      ...patch,
    },
  };
}

/** All draft asset types the orchestrator auto-creates (no manual NBA clicks). */
export const MARKETING_MISSION_AUTO_DRAFT_TYPES = [...MARKETING_AUTOPILOT_DRAFT_TYPES] as const;

export function resolveMissionIdempotencyKey(input: {
  clientKey?: string | null;
  projectId: string;
}): string {
  const fromClient = (input.clientKey ?? '').trim();
  if (fromClient) return fromClient;
  return `marketing-mission:${input.projectId}`;
}

export const marketingMissionQueuePayloadSchema = z.object({
  missionId: z.string().uuid(),
  organizationId: z.string().uuid(),
  projectId: z.string().uuid(),
  resumeFromStep: z.string().optional(),
});

export type MarketingMissionQueuePayload = z.infer<typeof marketingMissionQueuePayloadSchema>;

export function buildCampaignBlueprintFromPlan(plan: unknown, analysis?: unknown): {
  version: string;
  draftOnly: true;
  liveActionsEnabled: false;
  productName: string;
  primaryGoal: string;
  channels: string[];
  funnelStages: Array<{ name: string; objective: string }>;
  contentThemes: string[];
  crmLifecycle: string[];
  communications: { email: string[]; messenger: string[]; zalo: string[] };
  remarketing: unknown;
  nextBestActions: unknown[];
  assetsToCreate: typeof MARKETING_MISSION_AUTO_DRAFT_TYPES;
} {
  const p = (plan && typeof plan === 'object' ? plan : {}) as Record<string, unknown>;
  const offer = (p.offer && typeof p.offer === 'object' ? p.offer : {}) as Record<string, unknown>;
  const content = (p.content && typeof p.content === 'object' ? p.content : {}) as Record<
    string,
    unknown
  >;
  const funnel = (p.funnel && typeof p.funnel === 'object' ? p.funnel : {}) as Record<
    string,
    unknown
  >;
  const crm = (p.crm && typeof p.crm === 'object' ? p.crm : {}) as Record<string, unknown>;
  const communications = (
    p.communications && typeof p.communications === 'object' ? p.communications : {}
  ) as Record<string, unknown>;
  const a = (analysis && typeof analysis === 'object' ? analysis : {}) as Record<string, unknown>;

  const asArr = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : [];

  return {
    version: 'marketing-mission-blueprint.v1',
    draftOnly: true,
    liveActionsEnabled: false,
    productName: typeof offer.productName === 'string' ? offer.productName : 'Sản phẩm',
    primaryGoal: typeof offer.primaryGoal === 'string' ? offer.primaryGoal : 'Tăng Booking',
    channels: asArr(content.channels).length
      ? asArr(content.channels)
      : asArr(a.suggestedChannels),
    funnelStages: Array.isArray(funnel.stages)
      ? (funnel.stages as Array<Record<string, unknown>>).map((s) => ({
          name: typeof s.name === 'string' ? s.name : 'Stage',
          objective: typeof s.objective === 'string' ? s.objective : '',
        }))
      : [],
    contentThemes: asArr(content.themes),
    crmLifecycle: asArr(crm.lifecycle),
    communications: {
      email: asArr(communications.email),
      messenger: asArr(communications.messenger),
      zalo: asArr(communications.zalo),
    },
    remarketing: p.remarketing ?? {},
    nextBestActions: Array.isArray(a.nextBestActions) ? a.nextBestActions : [],
    assetsToCreate: MARKETING_MISSION_AUTO_DRAFT_TYPES,
  };
}
