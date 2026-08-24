/**
 * Approval-first Autopilot — mission lifecycle + immutable approval snapshot helpers.
 * Additive; keeps legacy PENDING/RUNNING generation statuses readable.
 */
import { z } from 'zod';

/** Full approval-first lifecycle (generation + post-approve run). */
export const MARKETING_MISSION_LIFECYCLE_STATUSES = [
  'DRAFT',
  'GENERATING',
  'READY_FOR_APPROVAL',
  'APPROVED',
  'QUEUED',
  'RUNNING',
  'FAILED',
  'BLOCKED',
  // Legacy aliases kept for backward compatibility
  'PENDING',
] as const;

export type MarketingMissionLifecycleStatus =
  (typeof MARKETING_MISSION_LIFECYCLE_STATUSES)[number];

/** Statuses while AI is still building drafts (poll UI). */
export const MARKETING_MISSION_GENERATING_STATUSES = [
  'DRAFT',
  'PENDING',
  'GENERATING',
  'RUNNING', // legacy: used during generation before GENERATING existed
] as const;

export function isMarketingMissionGenerating(status: string): boolean {
  return (MARKETING_MISSION_GENERATING_STATUSES as readonly string[]).includes(status);
}

/** Terminal for generation phase (show approve actions). */
export function isMarketingMissionReadyForApproval(status: string): boolean {
  return status === 'READY_FOR_APPROVAL';
}

export function isMarketingMissionPostApproval(status: string): boolean {
  return status === 'APPROVED' || status === 'QUEUED' || status === 'RUNNING';
}

export const marketingMissionApprovalSnapshotSchema = z.object({
  version: z.number().int().positive(),
  missionId: z.string().uuid(),
  projectId: z.string().uuid(),
  organizationId: z.string().uuid(),
  strategy: z.record(z.unknown()),
  assets: z.array(
    z.object({
      module: z.string(),
      entityType: z.string(),
      entityId: z.string(),
      status: z.string(),
      adapter: z.string().optional(),
    }),
  ),
  budget: z.record(z.unknown()),
  channels: z.array(z.string()),
  kpi: z.unknown().optional(),
  confidence: z.unknown().optional(),
  risks: z.array(z.string()).optional(),
  audience: z.unknown().optional(),
  funnel: z.unknown().optional(),
  contentCount: z.number().int().nonnegative().optional(),
  automation: z.unknown().optional(),
  campaign: z.unknown().optional(),
  email: z.unknown().optional(),
  zalo: z.unknown().optional(),
  ads: z.unknown().optional(),
  approver: z.object({
    id: z.string().uuid(),
    email: z.string().optional(),
    name: z.string().optional(),
  }),
  approvedAt: z.string(),
  draftOnlyAtApproval: z.literal(true).optional(),
  liveActionsEnabled: z.literal(false).optional(),
});

export type MarketingMissionApprovalSnapshot = z.infer<
  typeof marketingMissionApprovalSnapshotSchema
>;

export type MissionApprovalSummary = {
  progressPercent: number;
  status: string;
  currentStep: string;
  currentStepLabel?: string;
  strategy: string;
  audience: string;
  funnel: string;
  contentCount: number;
  automation: string;
  campaign: string;
  email: string;
  zalo: string;
  ads: string;
  budget: string;
  kpi: string;
  confidence: string;
  risk: string;
  canApprove: boolean;
  approval?: {
    id: string;
    version: number;
    approvedAt: string;
    approvedById: string;
    runStatus: string;
  } | null;
};

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asStr(v: unknown, fallback = '—'): string {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return fallback;
}

function countByModule(
  assets: Array<{ module?: string }>,
  module: string,
): number {
  return assets.filter((a) => String(a.module ?? '').toUpperCase() === module).length;
}

/**
 * Build additive NBA-panel summary from plan + mission assets.
 */
export function buildMissionApprovalSummary(input: {
  status: string;
  currentStep: string;
  currentStepLabel?: string;
  progressPercent: number;
  plan?: unknown;
  analysis?: unknown;
  blueprint?: unknown;
  assets?: Array<{ module?: string; entityType?: string; status?: string }>;
  approval?: {
    id: string;
    version: number;
    approvedAt: string | Date;
    approvedById: string;
    runStatus: string;
  } | null;
}): MissionApprovalSummary {
  const plan = asObj(input.plan);
  const analysis = asObj(input.analysis);
  const blueprint = asObj(input.blueprint);
  const offer = asObj(plan.offer);
  const customers = asObj(plan.customersTarget);
  const funnel = asObj(plan.funnel);
  const budget = asObj(plan.budget);
  const kpi = asObj(plan.kpi);
  const assets = input.assets ?? [];

  const funnelStages = Array.isArray(funnel.stages)
    ? funnel.stages
        .map((s) => asObj(s).name)
        .filter((n): n is string => typeof n === 'string' && !!n)
    : Array.isArray(blueprint.funnelStages)
      ? (blueprint.funnelStages as Array<Record<string, unknown>>)
          .map((s) => asStr(s.name, ''))
          .filter(Boolean)
      : [];

  const channels = Array.isArray(blueprint.channels)
    ? (blueprint.channels as unknown[]).filter((c): c is string => typeof c === 'string')
    : Array.isArray(analysis.suggestedChannels)
      ? (analysis.suggestedChannels as unknown[]).filter(
          (c): c is string => typeof c === 'string',
        )
      : [];

  const risks = Array.isArray(analysis.risks)
    ? (analysis.risks as unknown[]).filter((r): r is string => typeof r === 'string')
    : Array.isArray(plan.risks)
      ? (plan.risks as unknown[]).filter((r): r is string => typeof r === 'string')
      : [];

  const contentCount =
    countByModule(assets, 'CONTENT') ||
    (Array.isArray(asObj(plan.content).themes) ? (plan.content as { themes: unknown[] }).themes.length : 0);

  const monthly =
    typeof budget.monthlyBudget === 'number'
      ? budget.monthlyBudget
      : typeof analysis.score === 'number'
        ? null
        : null;

  const confidenceRaw =
    asStr(asObj(analysis.plannerMeta).engine, '') ||
    asStr(asObj(analysis.contextUsed).insightCount, '') ||
    asStr(analysis.score, '');

  return {
    progressPercent: input.progressPercent,
    status: input.status,
    currentStep: input.currentStep,
    currentStepLabel: input.currentStepLabel,
    strategy: asStr(
      offer.primaryGoal || analysis.summary || blueprint.primaryGoal,
      'Chiến lược đang tạo…',
    ),
    audience: asStr(
      customers.targetProfile || customers.targetArea,
      'Đang xác định audience…',
    ),
    funnel:
      funnelStages.length > 0
        ? funnelStages.slice(0, 5).join(' → ')
        : countByModule(assets, 'FUNNEL') > 0
          ? `${countByModule(assets, 'FUNNEL')} funnel draft`
          : 'Chưa có funnel',
    contentCount,
    automation:
      countByModule(assets, 'AUTOMATION') > 0
        ? `${countByModule(assets, 'AUTOMATION')} flow draft`
        : countByModule(assets, 'CHATBOT') > 0
          ? `${countByModule(assets, 'CHATBOT')} chatbot draft`
          : 'Chưa có automation',
    campaign:
      countByModule(assets, 'CAMPAIGN') > 0
        ? `${countByModule(assets, 'CAMPAIGN')} campaign draft`
        : 'Chưa có campaign',
    email:
      countByModule(assets, 'EMAIL') > 0
        ? `${countByModule(assets, 'EMAIL')} email draft`
        : '—',
    zalo:
      countByModule(assets, 'ZALO') > 0
        ? `${countByModule(assets, 'ZALO')} Zalo draft`
        : channels.some((c) => /zalo/i.test(c))
          ? 'Kê hoạch Zalo (chưa OA)'
          : '—',
    ads:
      countByModule(assets, 'ADS') > 0
        ? `${countByModule(assets, 'ADS')} ads draft`
        : '—',
    budget:
      monthly != null
        ? `${Math.round(monthly).toLocaleString('vi-VN')}đ/tháng`
        : channels.length
          ? `Channels: ${channels.slice(0, 4).join(', ')}`
          : '—',
    kpi: asStr(
      kpi.primary || kpi.northStar || asObj(plan.kpi).bookingTarget || analysis.score,
      '—',
    ),
    confidence: confidenceRaw || (input.status === 'READY_FOR_APPROVAL' ? 'MEDIUM' : '—'),
    risk: risks.length ? risks.slice(0, 2).join('; ') : 'Thấp — draft only',
    canApprove: input.status === 'READY_FOR_APPROVAL' && !input.approval,
    approval: input.approval
      ? {
          id: input.approval.id,
          version: input.approval.version,
          approvedAt:
            typeof input.approval.approvedAt === 'string'
              ? input.approval.approvedAt
              : input.approval.approvedAt.toISOString(),
          approvedById: input.approval.approvedById,
          runStatus: input.approval.runStatus,
        }
      : null,
  };
}

export function buildImmutableApprovalSnapshot(input: {
  version: number;
  missionId: string;
  projectId: string;
  organizationId: string;
  plan?: unknown;
  analysis?: unknown;
  blueprint?: unknown;
  assets: Array<{
    module: string;
    entityType: string;
    entityId: string;
    status: string;
    adapter?: string;
  }>;
  approver: { id: string; email?: string; name?: string };
  approvedAt: string;
}): MarketingMissionApprovalSnapshot {
  const plan = asObj(input.plan);
  const analysis = asObj(input.analysis);
  const blueprint = asObj(input.blueprint);
  const summary = buildMissionApprovalSummary({
    status: 'READY_FOR_APPROVAL',
    currentStep: 'READY_FOR_APPROVAL',
    progressPercent: 100,
    plan: input.plan,
    analysis: input.analysis,
    blueprint: input.blueprint,
    assets: input.assets,
  });

  const channels = Array.isArray(blueprint.channels)
    ? (blueprint.channels as unknown[]).filter((c): c is string => typeof c === 'string')
    : Array.isArray(analysis.suggestedChannels)
      ? (analysis.suggestedChannels as unknown[]).filter(
          (c): c is string => typeof c === 'string',
        )
      : [];

  const risks = Array.isArray(analysis.risks)
    ? (analysis.risks as unknown[]).filter((r): r is string => typeof r === 'string')
    : [];

  return {
    version: input.version,
    missionId: input.missionId,
    projectId: input.projectId,
    organizationId: input.organizationId,
    strategy: {
      primaryGoal: asObj(plan.offer).primaryGoal ?? summary.strategy,
      productName: asObj(plan.offer).productName,
      summary: analysis.summary,
      blueprintVersion: blueprint.version,
    },
    assets: input.assets.map((a) => ({
      module: a.module,
      entityType: a.entityType,
      entityId: a.entityId,
      status: a.status,
      adapter: a.adapter,
    })),
    budget: {
      plan: plan.budget ?? null,
      split: analysis.budgetSplit ?? null,
      scenarios: analysis.budgetScenarios ?? null,
      display: summary.budget,
    },
    channels,
    kpi: plan.kpi ?? summary.kpi,
    confidence: summary.confidence,
    risks,
    audience: plan.customersTarget ?? summary.audience,
    funnel: plan.funnel ?? summary.funnel,
    contentCount: summary.contentCount,
    automation: summary.automation,
    campaign: summary.campaign,
    email: summary.email,
    zalo: summary.zalo,
    ads: summary.ads,
    approver: input.approver,
    approvedAt: input.approvedAt,
    draftOnlyAtApproval: true,
    liveActionsEnabled: false,
  };
}
