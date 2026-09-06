export type EmailCampaignStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'CANCELLED';

export type EmailContactStatus = 'SUBSCRIBED' | 'UNSUBSCRIBED' | 'BOUNCED';
export type EmailDomainStatus = 'PENDING' | 'VERIFIED' | 'FAILED';
export type EmailSuppressionReason = 'UNSUBSCRIBE' | 'BOUNCE' | 'COMPLAINT' | 'MANUAL';
export type EmailAutomationTrigger =
  | 'NEW_CONTACT'
  | 'LIST_JOIN'
  | 'SCHEDULED'
  | 'NEW_LEAD'
  | 'EMAIL_OPENED'
  | 'EMAIL_CLICKED'
  | 'EMAIL_NOT_OPENED'
  | 'FUNNEL_SIGNUP'
  | 'BOOKING_CREATED'
  | 'PURCHASED';
export type EmailAutomationAction = 'SEND_EMAIL' | 'ADD_LEAD_SCORE' | 'SET_CRM_STAGE';
export type EmailAutomationStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED';
export type EmailRecipeId =
  | 'new-lead'
  | 'email-opened-score'
  | 'email-clicked-stage'
  | 'not-opened-resend'
  | 'funnel-welcome'
  | 'booking-confirm'
  | 'purchased-thanks';

export interface EmailOverview {
  contacts: number;
  subscribed: number;
  lists: number;
  templates: number;
  campaigns: number;
  running: number;
  suppressions: number;
  domains: number;
  sent: number;
  opened: number;
  clicked: number;
  openRate: number;
  clickRate: number;
}

export interface EmailTemplate {
  id: string;
  organizationId: string;
  name: string;
  subject: string;
  previewText?: string | null;
  htmlBody: string;
  textBody?: string | null;
  category?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmailContact {
  id: string;
  organizationId: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  source?: string | null;
  tags: string[];
  crmStage?: string | null;
  status: EmailContactStatus;
  createdAt: string;
  listMembers?: Array<{ list: { id: string; name: string } }>;
  _count?: { listMembers: number };
}

export interface EmailContactFacets {
  tags: string[];
  sources: string[];
  crmStages: string[];
  lists: EmailList[];
}

export interface EmailAudienceMember {
  id: string;
  name?: string | null;
  email: string;
  source?: string | null;
  groups: string[];
  status: EmailContactStatus;
  statusLabel: string;
  eligible: boolean;
  skipReason?: string | null;
}

export interface EmailAudiencePreview {
  eligible: number;
  skippedSuppressed: number;
  skippedUnsubscribed: number;
  total: number;
  listId: string | null;
}

export interface EmailGeneratedContent {
  subject: string;
  previewText: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  footer: string;
}

export interface EmailImportResult {
  imported: number;
  updated: number;
  skipped: number;
  scanned: number;
}

export interface EmailList {
  id: string;
  organizationId: string;
  name: string;
  description?: string | null;
  createdAt: string;
  _count?: { members: number };
}

export interface EmailSegment {
  id: string;
  organizationId: string;
  name: string;
  rules: Record<string, unknown>;
  createdAt: string;
}

export interface EmailCampaign {
  id: string;
  organizationId: string;
  name: string;
  subject?: string | null;
  templateId?: string | null;
  listId?: string | null;
  segmentId?: string | null;
  senderDomainId?: string | null;
  status: EmailCampaignStatus;
  selectedContactIds?: string[];
  scheduledAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  totalRecipients: number;
  queuedCount: number;
  sentCount: number;
  deliveredCount: number;
  openCount: number;
  clickCount: number;
  bounceCount: number;
  failCount: number;
  unsubscribeCount: number;
  openRate?: number;
  clickRate?: number;
  bounceRate?: number;
  unsubscribeRate?: number;
  createdAt: string;
  template?: { id: string; name: string } | null;
  list?: { id: string; name: string } | null;
  segment?: { id: string; name: string } | null;
  senderDomain?: { id: string; domain: string; fromEmail: string } | null;
}

export type EmailRecipientStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'SENT'
  | 'DELIVERED'
  | 'OPENED'
  | 'CLICKED'
  | 'BOUNCED'
  | 'FAILED'
  | 'UNSUBSCRIBED'
  | 'SKIPPED';

export type EmailCampaignKpi = 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'unsubscribed';

export interface EmailCampaignRecipient {
  id: string;
  email: string;
  status: EmailRecipientStatus;
  lastError?: string | null;
  skipReason?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  openedAt?: string | null;
  clickedAt?: string | null;
  bouncedAt?: string | null;
  contact?: { id: string; name?: string | null; email: string } | null;
}

export interface EmailSuppression {
  id: string;
  email: string;
  reason: EmailSuppressionReason;
  note?: string | null;
  createdAt: string;
}

export interface EmailSenderDomain {
  id: string;
  domain: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string | null;
  status: EmailDomainStatus;
  dkimVerified: boolean;
  spfVerified: boolean;
  dmarcVerified: boolean;
  domainVerified: boolean;
  lastCheckedAt?: string | null;
  verifiedAt?: string | null;
  dkimHost?: string | null;
  spfValue?: string | null;
  dmarcValue?: string | null;
  dnsRecords: EmailDomainDnsRecord[];
}

export interface EmailDomainDnsRecord {
  key: string;
  purpose: 'DKIM' | 'SPF' | 'DMARC';
  title: string;
  hint: string;
  type: 'CNAME' | 'TXT';
  host: string;
  value: string;
}

export interface EmailAutomation {
  id: string;
  name: string;
  trigger: EmailAutomationTrigger;
  status: EmailAutomationStatus;
  action?: EmailAutomationAction;
  templateId?: string | null;
  listId?: string | null;
  delayMinutes: number;
  recipeId?: string | null;
  scoreDelta?: number;
  targetStage?: string | null;
  waitDays?: number;
  template?: { id: string; name: string } | null;
  list?: { id: string; name: string } | null;
  createdAt: string;
}

export interface EmailAutomationRecipe {
  id: EmailRecipeId;
  name: string;
  description: string;
  when: string;
  then: string;
  trigger: EmailAutomationTrigger;
  action: EmailAutomationAction;
  needsTemplate: boolean;
  needsList: boolean;
  needsWaitDays: boolean;
  needsScore: boolean;
  needsStage: boolean;
  defaultTemplateCategory: 'welcome' | 'nurturing' | 'voucher' | 'birthday' | 'reengagement' | null;
  defaultWaitDays: number;
  defaultScoreDelta: number;
  defaultStage: string;
}

export interface EmailCrmStageOption {
  id: string;
  code: string;
  name: string;
  legacyStatus?: string | null;
}

export interface CreateEmailAutomationFromRecipeInput {
  recipeId: EmailRecipeId;
  templateId?: string;
  listId?: string;
  waitDays?: number;
  scoreDelta?: number;
  targetStage?: string;
  activate?: boolean;
}

export interface EmailReports {
  campaigns: Array<
    EmailCampaign & {
      openRate: number;
      clickRate: number;
    }
  >;
  events: Array<{ type: string; count: number }>;
}

export const CAMPAIGN_STATUS_LABELS: Record<EmailCampaignStatus, string> = {
  DRAFT: 'Nháp',
  SCHEDULED: 'Đã lên lịch',
  RUNNING: 'Đang gửi', // SENDING
  PAUSED: 'Tạm dừng',
  COMPLETED: 'Đã gửi', // SENT
  CANCELLED: 'Đã hủy',
};

export const CONTACT_STATUS_LABELS: Record<EmailContactStatus, string> = {
  SUBSCRIBED: 'Nhận email',
  UNSUBSCRIBED: 'Đã hủy',
  BOUNCED: 'Email lỗi',
};

export const CAMPAIGN_KPI_LABELS: Record<EmailCampaignKpi, string> = {
  sent: 'Đã gửi',
  delivered: 'Đã tới',
  opened: 'Đã mở',
  clicked: 'Đã click',
  bounced: 'Bounce',
  unsubscribed: 'Hủy đăng ký',
};

export const RECIPIENT_STATUS_LABELS: Record<EmailRecipientStatus, string> = {
  PENDING: 'Chờ',
  QUEUED: 'Hàng đợi',
  SENT: 'Đã gửi',
  DELIVERED: 'Đã tới',
  OPENED: 'Đã mở',
  CLICKED: 'Đã click',
  BOUNCED: 'Bounce',
  FAILED: 'Lỗi',
  UNSUBSCRIBED: 'Hủy đăng ký',
  SKIPPED: 'Bỏ qua',
};

export const DOMAIN_STATUS_LABELS: Record<EmailDomainStatus, string> = {
  PENDING: 'Đang chờ',
  VERIFIED: 'Đã xác thực',
  FAILED: 'Chưa đạt',
};

export const AUTOMATION_TRIGGER_LABELS: Record<EmailAutomationTrigger, string> = {
  NEW_CONTACT: 'Liên hệ mới',
  LIST_JOIN: 'Tham gia danh sách',
  SCHEDULED: 'Theo lịch',
  NEW_LEAD: 'Lead mới',
  EMAIL_OPENED: 'Mở email',
  EMAIL_CLICKED: 'Click email',
  EMAIL_NOT_OPENED: 'Không mở email',
  FUNNEL_SIGNUP: 'Đăng ký Funnel',
  BOOKING_CREATED: 'Đặt lịch',
  PURCHASED: 'Đã mua',
};

export const AUTOMATION_ACTION_LABELS: Record<EmailAutomationAction, string> = {
  SEND_EMAIL: 'Gửi email',
  ADD_LEAD_SCORE: 'Cộng điểm lead',
  SET_CRM_STAGE: 'Đổi giai đoạn CRM',
};
