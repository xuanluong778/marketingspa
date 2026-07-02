/** Queue names used across API and worker */
export const QUEUE_NAMES = {
  CAMPAIGN_SEND: 'campaign-send',
  LEAD_ALERT: 'lead-alert-queue',
  APPOINTMENT_REMINDER: 'appointment-reminder-queue',
  AUTOMATION_MESSAGE: 'automation-message-queue',
  DAILY_REPORT: 'daily-report-queue',
  BACKUP: 'backup-queue',
} as const;

/** Redis pub/sub channel — worker publishes, API forwards to Socket.IO */
export const REALTIME_CHANNEL = 'marketingspa:realtime:events';

/** Socket.IO event names */
export const WS_EVENTS = {
  CAMPAIGN_UPDATE: 'campaign:update',
  LEAD_NEW: 'lead:new',
  LEAD_STALE_ALERT: 'lead:stale-alert',
  LEAD_STATUS_CHANGED: 'lead:status-changed',
  APPOINTMENT_NEW: 'appointment:new',
  APPOINTMENT_REMINDER: 'appointment:reminder',
  DAILY_REPORT: 'daily-report:ready',
} as const;

/** Campaign status lifecycle */
export const CAMPAIGN_STATUS = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

/** User roles within a spa organization */
export const USER_ROLE = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MARKETER: 'MARKETER',
  STAFF: 'STAFF',
} as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUS)[keyof typeof CAMPAIGN_STATUS];
export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];
