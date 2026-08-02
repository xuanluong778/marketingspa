import { z } from 'zod';
import { adsPlatformSchema, ADS_PERMISSIONS } from './ads-metrics';

export const adsActionRequestStatusSchema = z.enum([
  'PROPOSED',
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'QUEUED',
  'EXECUTING',
  'VERIFYING',
  'SUCCEEDED',
  'FAILED',
  'REJECTED',
  'CANCELLED',
  'SKIPPED_DISABLED',
]);

export const adsActionTypeSchema = z.enum([
  'PAUSE_CAMPAIGN',
  'ENABLE_CAMPAIGN',
  'ADJUST_BUDGET',
  'PUBLISH_DRAFT',
  'UPDATE_STATUS',
]);

export const adsActionSourceSchema = z.enum(['AI', 'HUMAN', 'RULE']);

/** Before/after snapshot — không chứa token/secret. */
export const adsActionStateSchema = z
  .object({
    campaignId: z.string().optional(),
    status: z.string().optional(),
    budget: z.number().finite().nonnegative().nullable().optional(),
    name: z.string().optional(),
    platform: adsPlatformSchema.optional(),
    externalCampaignId: z.string().optional(),
  })
  .passthrough();

export const adsActionProposeSchema = z.object({
  organizationId: z.string().uuid(),
  requestedByUserId: z.string().uuid(),
  campaignId: z.string().uuid().optional(),
  draftId: z.string().uuid().optional(),
  recommendationId: z.string().uuid().optional(),
  platform: adsPlatformSchema,
  actionType: adsActionTypeSchema,
  source: adsActionSourceSchema.default('HUMAN'),
  beforeState: adsActionStateSchema,
  afterState: adsActionStateSchema,
  payload: z.record(z.unknown()).default({}),
  evidence: z.record(z.unknown()).default({}),
  reason: z.string().max(2000).optional(),
  budgetLimit: z.number().finite().nonnegative().optional(),
  proposedBudget: z.number().finite().nonnegative().optional(),
  /** Bắt buộc — client hoặc server generate; unique */
  idempotencyKey: z.string().min(8).max(200),
  aiGenerated: z.boolean().default(false),
});

export const adsActionApproveSchema = z.object({
  organizationId: z.string().uuid(),
  actionRequestId: z.string().uuid(),
  approvedByUserId: z.string().uuid(),
});

export const adsActionRejectSchema = z.object({
  organizationId: z.string().uuid(),
  actionRequestId: z.string().uuid(),
  rejectedByUserId: z.string().uuid(),
  rejectionReason: z.string().min(1).max(2000),
});

/** BullMQ payload — chỉ ID, không token. */
export const adsActionQueuePayloadSchema = z.object({
  organizationId: z.string().uuid(),
  actionRequestId: z.string().uuid(),
});

export type AdsActionQueuePayload = z.infer<typeof adsActionQueuePayloadSchema>;
export type AdsActionProposeInput = z.infer<typeof adsActionProposeSchema>;
export type AdsActionRequestStatus = z.infer<typeof adsActionRequestStatusSchema>;
export type AdsActionType = z.infer<typeof adsActionTypeSchema>;

export const adsActionPublicSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  requestedByUserId: z.string().uuid(),
  approvedByUserId: z.string().uuid().nullable(),
  campaignId: z.string().uuid().nullable(),
  platform: adsPlatformSchema,
  actionType: adsActionTypeSchema,
  source: adsActionSourceSchema,
  status: adsActionRequestStatusSchema,
  beforeState: adsActionStateSchema,
  afterState: adsActionStateSchema,
  payload: z.record(z.unknown()),
  evidence: z.record(z.unknown()),
  result: z.unknown().nullable().optional(),
  reason: z.string().nullable().optional(),
  rejectionReason: z.string().nullable().optional(),
  budgetLimit: z.number().finite().nullable().optional(),
  proposedBudget: z.number().finite().nullable().optional(),
  idempotencyKey: z.string(),
  aiGenerated: z.boolean(),
  providerWriteEnabled: z.boolean(),
  proposedAt: z.union([z.string(), z.date()]),
  submittedAt: z.union([z.string(), z.date()]).nullable().optional(),
  approvedAt: z.union([z.string(), z.date()]).nullable().optional(),
  executedAt: z.union([z.string(), z.date()]).nullable().optional(),
  verifiedAt: z.union([z.string(), z.date()]).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
});

/**
 * Env kill-switch: ADS_ACTIONS_LIVE=true mới cho phép worker apply write.
 * Mặc định false — tắt toàn bộ write action.
 */
export function isAdsActionsLive(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  return String(env.ADS_ACTIONS_LIVE ?? 'false').toLowerCase() === 'true';
}

/** AI/RULE không được tự phê duyệt. */
export function assertApproverAllowed(input: {
  source: string;
  aiGenerated: boolean;
  requestedByUserId: string;
  approvedByUserId: string;
}): void {
  const needsSeparateApprover =
    input.aiGenerated || input.source === 'AI' || input.source === 'RULE';
  if (needsSeparateApprover && input.approvedByUserId === input.requestedByUserId) {
    throw new Error(
      'AI/RULE không được tự phê duyệt AdsActionRequest — cần người khác có ads.manage',
    );
  }
}

export const ADS_ACTION_PERMISSIONS = {
  PROPOSE: ADS_PERMISSIONS.ANALYZE,
  APPROVE: ADS_PERMISSIONS.MANAGE,
  REJECT: ADS_PERMISSIONS.MANAGE,
  READ: ADS_PERMISSIONS.READ,
} as const;
