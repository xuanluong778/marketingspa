/** Mã lỗi rõ ràng cho Fanpage ↔ Chatbot CSKH (không lộ token). */
export const CSKH_FB_ERROR = {
  MISSING_SCOPE: 'MISSING_SCOPE',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  WEBHOOK_NOT_SUBSCRIBED: 'WEBHOOK_NOT_SUBSCRIBED',
  OPENAI_ERROR: 'OPENAI_ERROR',
  MESSENGER_SEND_FAILED: 'MESSENGER_SEND_FAILED',
  /** Meta App chỉ Standard Access — chỉ nhắn được admin/dev/tester */
  MESSENGER_STANDARD_ACCESS: 'MESSENGER_STANDARD_ACCESS',
  MISSING_PAGE_TOKEN: 'MISSING_PAGE_TOKEN',
  UNMAPPED_PAGE: 'UNMAPPED_PAGE',
  BOT_INACTIVE: 'BOT_INACTIVE',
  AI_DISABLED: 'AI_DISABLED',
  HUMAN_TAKEOVER: 'HUMAN_TAKEOVER',
  DUPLICATE_WEBHOOK: 'DUPLICATE_WEBHOOK',
} as const;

export type CskhFbErrorCode = (typeof CSKH_FB_ERROR)[keyof typeof CSKH_FB_ERROR];

export const CSKH_FB_REQUIRED_SCOPES = [
  'pages_show_list',
  'pages_messaging',
  'pages_manage_metadata',
] as const;

export const CSKH_FB_SUBSCRIBED_FIELDS =
  'messages,messaging_postbacks,message_deliveries,message_reads';

export const CSKH_FB_SUBSCRIBED_FIELDS_LIST = [
  'messages',
  'messaging_postbacks',
  'message_deliveries',
  'message_reads',
] as const;
