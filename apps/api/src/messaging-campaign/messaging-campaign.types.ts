import type {
  MessageChannel,
  MessagingCampaignKind,
  MessagingFollowStatus,
} from '@marketingspa/database';

export interface MessagingSegmentConfig {
  identityIds?: string[];
  customerIds?: string[];
  leadIds?: string[];
  followStatuses?: MessagingFollowStatus[];
  requireOptIn?: boolean;
  excludeSuppressed?: boolean;
  integrationScopeKey?: string;
  /** Tag CRM trên Customer/Lead liên kết identity */
  tag?: string;
  /** Không có inbound trong N ngày (hoặc chưa từng inbound) */
  inactiveDays?: number;
  limit?: number;
}

export interface MessagingSegmentIdentityPreview {
  id: string;
  externalUserId: string;
  displayName: string | null;
  customerId: string | null;
  leadId: string | null;
  phoneNormalized: string | null;
  followStatus: MessagingFollowStatus;
  consentStatus: string;
  optedOut: boolean;
  isBlocked: boolean;
  suppressed: boolean;
  suppressionReason?: string;
}

export interface MessagingSegmentPreviewResult {
  total: number;
  suppressed: number;
  sample: MessagingSegmentIdentityPreview[];
  identityIds: string[];
}

export function mapCampaignKindToEligibilityType(
  kind: MessagingCampaignKind,
): 'automation' | 'broadcast' | 'transactional' | 'template' {
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

export function isCampaignContentEditable(status: string, startedAt: Date | null): boolean {
  if (startedAt) return false;
  return status === 'DRAFT' || status === 'SCHEDULED';
}

export const LOCKED_CONTENT_FIELDS = [
  'segmentConfig',
  'variables',
  'messageTemplateId',
  'channelConnectionId',
  'integrationId',
  'channel',
  'campaignType',
] as const;

export function buildRecipientIdempotencyKey(campaignId: string, identityId: string): string {
  return `mc-${campaignId}-${identityId}`;
}

export type CampaignChannel = MessageChannel;
