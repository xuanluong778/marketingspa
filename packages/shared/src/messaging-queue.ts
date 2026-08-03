import type { MessagingCampaignType } from './messaging-eligibility';

export const MESSAGING_PLAN_BATCH_SIZE = 100;
export const MESSAGING_DISPATCH_CHUNK_SIZE = 50;

export const MESSAGING_SEND_MAX_ATTEMPTS = 4;

export const MESSAGING_DEFAULT_RATE_PER_SEC: Record<string, number> = {
  MESSENGER: 20,
  ZALO_OA: 15,
  ZBS_TEMPLATE: 5,
};

export type MessagingCampaignPlanJobData = {
  organizationId: string;
  campaignId: string;
};

export type MessagingCampaignDispatchJobData = {
  organizationId: string;
  campaignId: string;
  cursor?: string;
};

export type MessagingSendJobData = {
  organizationId: string;
  campaignId: string;
  recipientId: string;
};

/** BullMQ custom jobId không được chứa `:` — dùng `-`. */
export function buildCampaignPlanJobId(campaignId: string): string {
  return `messaging-plan-${campaignId}`;
}

export function buildCampaignDispatchJobId(campaignId: string, cursor?: string): string {
  return cursor ? `messaging-dispatch-${campaignId}-${cursor}` : `messaging-dispatch-${campaignId}`;
}

export function buildRecipientIdempotencyKey(campaignId: string, identityId: string): string {
  return `mc-${campaignId}-${identityId}`;
}

export function mapCampaignKindToEligibilityType(kind: string): MessagingCampaignType {
  switch (kind) {
    case 'AUTOMATION':
      return 'automation';
    case 'BROADCAST':
      return 'broadcast';
    case 'TRANSACTIONAL':
      return 'transactional';
    case 'TEMPLATE':
      return 'template';
    default:
      return 'broadcast';
  }
}
