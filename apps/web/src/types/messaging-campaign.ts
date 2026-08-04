import type { MessageChannel } from './automation-messaging';

export type MessagingCampaignStatus =
  'DRAFT' | 'SCHEDULED' | 'PLANNING' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' | 'FAILED';

export type MessagingCampaignKind = 'AUTOMATION' | 'BROADCAST' | 'TRANSACTIONAL' | 'TEMPLATE';

export const CAMPAIGN_STATUS_LABELS: Record<MessagingCampaignStatus, string> = {
  DRAFT: 'Nháp',
  SCHEDULED: 'Đã lên lịch',
  PLANNING: 'Đang lập kế hoạch',
  RUNNING: 'Đang chạy',
  PAUSED: 'Tạm dừng',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
  FAILED: 'Thất bại',
};

export const CAMPAIGN_KIND_LABELS: Record<MessagingCampaignKind, string> = {
  AUTOMATION: 'Automation',
  BROADCAST: 'Broadcast',
  TRANSACTIONAL: 'Giao dịch',
  TEMPLATE: 'Template ZBS',
};

export const ELIGIBILITY_REASON_LABELS: Record<string, string> = {
  OPTED_OUT: 'Opt-out',
  BLOCKED: 'Blocked',
  USER_BLOCKED: 'Bị chặn',
  MESSENGER_OUTSIDE_WINDOW: 'Ngoài cửa sổ Messenger',
  ZALO_OUTSIDE_CONSULT_WINDOW: 'Ngoài cửa sổ Zalo',
  MISSING_IDENTITY: 'Thiếu ID',
  MISSING_CONNECTION: 'Thiếu kết nối',
  BROADCAST_QUOTA_EXCEEDED: 'Hết quota broadcast',
  INSUFFICIENT_BALANCE: 'Không đủ số dư',
  ZALO_NOT_FOLLOWING: 'Chưa follow OA',
  CONNECTION_INACTIVE: 'Kết nối không hoạt động',
  CONNECTION_PAUSED: 'Kết nối tạm dừng',
  UNKNOWN: 'Khác',
};

export interface MessagingSegmentConfig {
  identityIds?: string[];
  customerIds?: string[];
  leadIds?: string[];
  followStatuses?: string[];
  requireOptIn?: boolean;
  excludeSuppressed?: boolean;
  integrationScopeKey?: string;
  tag?: string;
  inactiveDays?: number;
  limit?: number;
}

export interface MessagingCampaignDetail {
  id: string;
  name: string;
  channel: MessageChannel;
  campaignType: MessagingCampaignKind;
  status: MessagingCampaignStatus;
  channelConnectionId?: string | null;
  messageTemplateId?: string | null;
  segmentConfig: MessagingSegmentConfig;
  variables: Record<string, string>;
  scheduledAt?: string | null;
  timezone: string;
  totalRecipients: number;
  eligibleCount: number;
  excludedCount: number;
  queuedCount: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  repliedCount: number;
  failedCount: number;
  optOutCount: number;
  estimatedCost: number | string;
  actualCost: number | string;
  startedAt?: string | null;
  createdAt: string;
  channelConnection?: { id: string; displayName?: string | null; accountRef: string } | null;
  messageTemplate?: { id: string; name: string; body: string } | null;
}

export interface EligibilityPreviewResult {
  totalIdentities: number;
  sampled: number;
  estimatedEligible: number;
  estimatedExcluded: number;
  estimatedCost: number;
  breakdown: Record<string, number>;
  contentPreviews: Array<{ identityId: string; name: string; content: string }>;
  results: Array<{
    identityId: string;
    externalUserId: string;
    displayName: string | null;
    eligibility: { eligible: boolean; reasonCode?: string; reasonMessage?: string };
    renderedPreview?: string;
  }>;
}

export interface MessagingIdentityRow {
  id: string;
  channel: MessageChannel;
  integrationScopeKey: string;
  accountRef?: string;
  externalUserId: string;
  displayName: string | null;
  phoneNormalized: string | null;
  consentStatus: string;
  followStatus: string;
  optedOut: boolean;
  isBlocked: boolean;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  customer?: {
    id: string;
    name: string;
    phone?: string | null;
    tags: string[];
    branch?: { id: string; name: string } | null;
    assignedEmployee?: { id: string; name: string } | null;
  } | null;
  lead?: {
    id: string;
    name: string;
    phone?: string | null;
    tags: string[];
    pipelineStatus?: string;
    branch?: { id: string; name: string } | null;
    assignedTo?: { id: string; name: string } | null;
    funnelStage?: { id: string; name: string } | null;
  } | null;
  eligibility?: {
    eligible: boolean;
    reasonCode?: string;
    reasonMessage?: string;
    providerMode?: string;
  } | null;
}
