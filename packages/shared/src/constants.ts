/** Queue names used across API and worker */
export const QUEUE_NAMES = {
  CAMPAIGN_SEND: 'campaign-send',
  LEAD_ALERT: 'lead-alert-queue',
  APPOINTMENT_REMINDER: 'appointment-reminder-queue',
  AUTOMATION_MESSAGE: 'automation-message-queue',
  DAILY_REPORT: 'daily-report-queue',
  BACKUP: 'backup-queue',
  AUTO_POST_PUBLISH: 'auto-post-publish-queue',
  HRM_ATTENDANCE_REBUILD: 'hrm-attendance-rebuild-queue',
  OFFLINE_CONVERSION: 'offline-conversion-queue',
  MESSAGING_WEBHOOK: 'messaging-webhook-queue',
  MESSAGING_CAMPAIGN_PLAN: 'messaging-campaign-plan-queue',
  MESSAGING_CAMPAIGN_DISPATCH: 'messaging-campaign-dispatch-queue',
  MESSAGING_SEND: 'messaging-send-queue',
  ADS_SYNC: 'ads-sync-queue',
  ADS_ACTION: 'ads-action-queue',
  AFFILIATE_HOLD: 'affiliate-hold-queue',
  VIDEO_TRANSCRIPTION: 'video-transcription-queue',
  AD_URL_ANALYZE: 'ad-url-analyze-queue',
  EMAIL_CAMPAIGN_PLAN: 'email-campaign-plan-queue',
  EMAIL_CAMPAIGN_SEND: 'email-campaign-send-queue',
} as const;

/** Redis pub/sub channel — worker publishes, API forwards to Socket.IO */
export const REALTIME_CHANNEL = 'marketingspa:realtime:events';

/** Socket.IO event names */
export const WS_EVENTS = {
  CAMPAIGN_UPDATE: 'campaign:update',
  LEAD_NEW: 'lead:new',
  LEAD_STALE_ALERT: 'lead:stale-alert',
  LEAD_STATUS_CHANGED: 'lead:status-changed',
  LEAD_SCORE_CHANGED: 'lead:score-changed',
  LEAD_QUALIFIED: 'lead:qualified',
  LEAD_SLA_BREACHED: 'lead:sla-breached',
  LEAD_REASSIGNED: 'lead:reassigned',
  APPOINTMENT_NEW: 'appointment:new',
  APPOINTMENT_REMINDER: 'appointment:reminder',
  DAILY_REPORT: 'daily-report:ready',
  CHATBOT_MESSAGE_NEW: 'chatbot:message-new',
  MESSAGING_CAMPAIGN_UPDATE: 'messaging-campaign:update',
  MESSAGING_CAMPAIGN_RECIPIENT: 'messaging-campaign:recipient',
  ADS_SYNC_PROGRESS: 'ads:sync-progress',
} as const;

/** Campaign status lifecycle */
export const CAMPAIGN_STATUS = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

/** User roles within a spa organization (Phase 0 canonical) */
export const USER_ROLE = {
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  MARKETING: 'MARKETING',
  SALE: 'SALE',
  TECHNICIAN: 'TECHNICIAN',
  HR: 'HR',
} as const;

/** Legacy aliases kept for migration/readers */
export const USER_ROLE_ALIASES = {
  ADMIN: 'MANAGER',
  MARKETER: 'MARKETING',
  STAFF: 'TECHNICIAN',
} as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUS)[keyof typeof CAMPAIGN_STATUS];
export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];
