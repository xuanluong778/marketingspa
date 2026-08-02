import { ELIGIBILITY_REASON } from './messaging-eligibility';

/** Lỗi không retry — quyền, policy, blocked, recipient không hợp lệ */
export const MESSAGING_PERMANENT_REASON_CODES = new Set<string>([
  ELIGIBILITY_REASON.OPTED_OUT,
  ELIGIBILITY_REASON.USER_BLOCKED,
  'BLOCKED',
  'OPTED_OUT',
  ELIGIBILITY_REASON.WRONG_PAGE,
  ELIGIBILITY_REASON.CONNECTION_INACTIVE,
  ELIGIBILITY_REASON.CONNECTION_PAUSED,
  ELIGIBILITY_REASON.TOKEN_EXPIRED,
  ELIGIBILITY_REASON.MISSING_PERMISSION,
  ELIGIBILITY_REASON.MESSENGER_OUTSIDE_WINDOW,
  ELIGIBILITY_REASON.MESSENGER_UTILITY_REQUIRED,
  ELIGIBILITY_REASON.MESSENGER_TAG_NOT_ALLOWED,
  ELIGIBILITY_REASON.ZALO_NOT_FOLLOWING,
  ELIGIBILITY_REASON.ZALO_OUTSIDE_CONSULT_WINDOW,
  ELIGIBILITY_REASON.BROADCAST_QUOTA_EXCEEDED,
  ELIGIBILITY_REASON.INSUFFICIENT_BALANCE,
  ELIGIBILITY_REASON.TEMPLATE_NOT_APPROVED,
  ELIGIBILITY_REASON.ZBS_TEMPLATE_REQUIRED,
  ELIGIBILITY_REASON.MISSING_IDENTITY,
  ELIGIBILITY_REASON.MISSING_CONNECTION,
  ELIGIBILITY_REASON.UNSUPPORTED_CHANNEL,
  ELIGIBILITY_REASON.MANUAL_RECENT_CONTACT,
  ELIGIBILITY_REASON.STOPPED_ON_REPLY,
  'INVALID_RECIPIENT',
  'POLICY_VIOLATION',
  'PERMISSION_DENIED',
]);

/** Quiet hours / cooldown — retry/reschedule, không permanent fail */
export const MESSAGING_RESCHEDULE_REASON_CODES = new Set<string>([
  ELIGIBILITY_REASON.QUIET_HOURS,
  ELIGIBILITY_REASON.CAMPAIGN_COOLDOWN,
  ELIGIBILITY_REASON.COOLDOWN_ACTIVE,
  ELIGIBILITY_REASON.RECIPIENT_DAILY_LIMIT,
]);

const PERMANENT_HTTP_STATUSES = new Set([400, 401, 403, 404, 422]);

const PERMANENT_MESSAGE_PATTERNS = [
  /permission/i,
  /oauth/i,
  /blocked/i,
  /opt.?out/i,
  /invalid.*recipient/i,
  /policy/i,
  /outside.*window/i,
  /not.*following/i,
  /quota/i,
  /template.*not.*approved/i,
];

export function isPermanentMessagingError(params: {
  reasonCode?: string;
  httpStatus?: number;
  message?: string;
}): boolean {
  if (params.reasonCode && MESSAGING_PERMANENT_REASON_CODES.has(params.reasonCode)) {
    return true;
  }
  if (params.httpStatus && PERMANENT_HTTP_STATUSES.has(params.httpStatus)) {
    return true;
  }
  const msg = params.message ?? '';
  return PERMANENT_MESSAGE_PATTERNS.some((re) => re.test(msg));
}

export function parseRetryAfterSeconds(
  retryAfterHeader: string | null,
  fallbackSeconds = 5,
): number {
  if (!retryAfterHeader?.trim()) return fallbackSeconds;
  const asNumber = Number(retryAfterHeader);
  if (Number.isFinite(asNumber) && asNumber >= 0) return Math.ceil(asNumber);
  const asDate = Date.parse(retryAfterHeader);
  if (!Number.isNaN(asDate)) {
    return Math.max(1, Math.ceil((asDate - Date.now()) / 1000));
  }
  return fallbackSeconds;
}
