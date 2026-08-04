import type {
  MessagingChannelCode,
  MessagingFollowStatusCode,
} from './messaging-webhook-normalize';
import { isInQuietHours, nextQuietHoursEnd } from './messaging-quiet-hours';

export type MessagingProviderMode =
  | 'MESSENGER_STANDARD'
  | 'MESSENGER_UTILITY'
  | 'ZALO_OA_CONSULT'
  | 'ZALO_OA_BROADCAST'
  | 'ZBS_TEMPLATE';

export type MessagingCampaignType = 'automation' | 'broadcast' | 'transactional' | 'template';

export type MessagingConsentStatusCode = 'UNKNOWN' | 'OPTED_IN' | 'OPTED_OUT' | 'PENDING';

export interface MessagingEligibilityQuota {
  /** Số broadcast còn lại trong chu kỳ (từ metadata provider/org — không hardcode gói) */
  broadcastsRemaining?: number;
  /** Số template ZBS còn gửi được */
  templatesRemaining?: number;
  /** Đã gửi hôm nay tới recipient */
  sendsTodayToRecipient?: number;
  /** Giới hạn gửi/ngày tới recipient (từ flow hoặc org policy) */
  dailyRecipientLimit?: number;
  /** Tổng gửi flow hôm nay */
  flowSendsToday?: number;
  /** maxSendsPerDay trên flow */
  flowDailyLimit?: number;
}

export interface MessagingEligibilityInput {
  organizationId: string;
  channel: MessagingChannelCode | 'SMS' | 'EMAIL' | 'PUSH';
  campaignType: MessagingCampaignType;
  identity?: {
    id?: string;
    externalUserId?: string;
    integrationScopeKey?: string;
    lastInboundAt?: Date | null;
    consentStatus?: MessagingConsentStatusCode;
    followStatus?: MessagingFollowStatusCode;
    isBlocked?: boolean;
    optedOut?: boolean;
  };
  connection?: {
    id?: string;
    accountRef?: string;
    status?: string;
    isPaused?: boolean;
    permissions?: string[];
    providerKind?: string;
    tokenExpiresAt?: Date | null;
  };
  integration?: {
    id?: string;
    provider?: string;
    status?: string;
  };
  template?: {
    id?: string;
    isApproved?: boolean;
    isUtility?: boolean;
    isZbsTemplate?: boolean;
  };
  providerModeHint?: MessagingProviderMode;
  quota?: MessagingEligibilityQuota;
  walletBalance?: number;
  estimatedCostPerMessage?: number;
  sendHistory?: {
    lastOutboundAt?: Date | null;
    cooldownMinutes?: number;
    /** Khách vừa được nhân viên nhắn thủ công trong lookback */
    recentlyManualMessaged?: boolean;
    /** Còn cooldown giữa hai chiến dịch */
    campaignCooldownUntil?: Date | null;
  };
  quietHours?: {
    start?: string | null;
    end?: string | null;
    timeZone?: string;
  };
  now?: Date;
}

export interface MessagingEligibilityResult {
  eligible: boolean;
  providerMode: MessagingProviderMode;
  reasonCode?: string;
  reasonMessage?: string;
  estimatedCost?: number;
  nextEligibleAt?: Date;
}

export const MESSENGER_INTERACTION_WINDOW_MS = 24 * 60 * 60 * 1000;
export const ZALO_OA_CONSULT_WINDOW_MS = 48 * 60 * 60 * 1000;

export const ELIGIBILITY_REASON = {
  OPTED_OUT: 'OPTED_OUT',
  USER_BLOCKED: 'USER_BLOCKED',
  WRONG_PAGE: 'WRONG_PAGE',
  CONNECTION_INACTIVE: 'CONNECTION_INACTIVE',
  CONNECTION_PAUSED: 'CONNECTION_PAUSED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  MISSING_PERMISSION: 'MISSING_PERMISSION',
  MESSENGER_OUTSIDE_WINDOW: 'MESSENGER_OUTSIDE_WINDOW',
  MESSENGER_UTILITY_REQUIRED: 'MESSENGER_UTILITY_REQUIRED',
  MESSENGER_TAG_NOT_ALLOWED: 'MESSENGER_TAG_NOT_ALLOWED',
  ZALO_NOT_FOLLOWING: 'ZALO_NOT_FOLLOWING',
  ZALO_OUTSIDE_CONSULT_WINDOW: 'ZALO_OUTSIDE_CONSULT_WINDOW',
  BROADCAST_QUOTA_EXCEEDED: 'BROADCAST_QUOTA_EXCEEDED',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  TEMPLATE_NOT_APPROVED: 'TEMPLATE_NOT_APPROVED',
  ZBS_TEMPLATE_REQUIRED: 'ZBS_TEMPLATE_REQUIRED',
  RECIPIENT_DAILY_LIMIT: 'RECIPIENT_DAILY_LIMIT',
  FLOW_DAILY_LIMIT: 'FLOW_DAILY_LIMIT',
  COOLDOWN_ACTIVE: 'COOLDOWN_ACTIVE',
  MISSING_IDENTITY: 'MISSING_IDENTITY',
  MISSING_CONNECTION: 'MISSING_CONNECTION',
  UNSUPPORTED_CHANNEL: 'UNSUPPORTED_CHANNEL',
  QUIET_HOURS: 'QUIET_HOURS',
  MANUAL_RECENT_CONTACT: 'MANUAL_RECENT_CONTACT',
  CAMPAIGN_COOLDOWN: 'CAMPAIGN_COOLDOWN',
  STOPPED_ON_REPLY: 'STOPPED_ON_REPLY',
} as const;

function defaultMode(
  channel: MessagingEligibilityInput['channel'],
  campaignType: MessagingCampaignType,
  hint?: MessagingProviderMode,
): MessagingProviderMode {
  if (hint) return hint;
  if (channel === 'MESSENGER') {
    return campaignType === 'transactional' ? 'MESSENGER_UTILITY' : 'MESSENGER_STANDARD';
  }
  if (campaignType === 'template') return 'ZBS_TEMPLATE';
  if (campaignType === 'broadcast') return 'ZALO_OA_BROADCAST';
  return 'ZALO_OA_CONSULT';
}

function block(
  providerMode: MessagingProviderMode,
  reasonCode: string,
  reasonMessage: string,
  extra?: Partial<MessagingEligibilityResult>,
): MessagingEligibilityResult {
  return {
    eligible: false,
    providerMode,
    reasonCode,
    reasonMessage,
    ...extra,
  };
}

function allow(
  providerMode: MessagingProviderMode,
  estimatedCost?: number,
): MessagingEligibilityResult {
  return { eligible: true, providerMode, estimatedCost };
}

function integrationScopeMatchesPage(scopeKey: string | undefined, accountRef: string): boolean {
  if (!scopeKey || !accountRef) return true;
  return scopeKey === `messenger:${accountRef}` || scopeKey.endsWith(`:${accountRef}`);
}

function nextFromWindowEnd(lastInbound: Date, windowMs: number): Date {
  return new Date(lastInbound.getTime() + windowMs);
}

export function evaluateMessagingEligibility(
  input: MessagingEligibilityInput,
): MessagingEligibilityResult {
  const now = input.now ?? new Date();
  const mode = defaultMode(input.channel, input.campaignType, input.providerModeHint);
  const cost = input.estimatedCostPerMessage ?? (mode === 'ZBS_TEMPLATE' ? 200 : 0);

  if (input.identity?.optedOut || input.identity?.consentStatus === 'OPTED_OUT') {
    return block(mode, ELIGIBILITY_REASON.OPTED_OUT, 'Người nhận đã opt-out');
  }
  if (input.identity?.isBlocked) {
    return block(mode, ELIGIBILITY_REASON.USER_BLOCKED, 'Người nhận đã chặn Page/OA');
  }
  if (!input.identity?.externalUserId) {
    return block(mode, ELIGIBILITY_REASON.MISSING_IDENTITY, 'Thiếu identity người nhận');
  }

  if (input.connection?.isPaused) {
    return block(mode, ELIGIBILITY_REASON.CONNECTION_PAUSED, 'Kết nối kênh đang tạm khóa');
  }
  if (input.connection?.status && !['ACTIVE', 'CONNECTED'].includes(input.connection.status)) {
    if (input.connection.status === 'EXPIRED') {
      return block(mode, ELIGIBILITY_REASON.TOKEN_EXPIRED, 'Token kênh đã hết hạn');
    }
    return block(mode, ELIGIBILITY_REASON.CONNECTION_INACTIVE, 'Kết nối kênh không hoạt động');
  }
  if (
    input.connection?.tokenExpiresAt &&
    input.connection.tokenExpiresAt.getTime() <= now.getTime()
  ) {
    return block(mode, ELIGIBILITY_REASON.TOKEN_EXPIRED, 'Token kênh đã hết hạn');
  }

  if (cost > 0 && (input.walletBalance ?? 0) < cost) {
    return block(mode, ELIGIBILITY_REASON.INSUFFICIENT_BALANCE, 'Số dư không đủ', {
      estimatedCost: cost,
    });
  }

  const quota = input.quota ?? {};
  if (
    quota.flowDailyLimit != null &&
    quota.flowSendsToday != null &&
    quota.flowSendsToday >= quota.flowDailyLimit
  ) {
    return block(mode, ELIGIBILITY_REASON.FLOW_DAILY_LIMIT, 'Đã đạt giới hạn gửi flow hôm nay');
  }
  if (
    quota.dailyRecipientLimit != null &&
    quota.sendsTodayToRecipient != null &&
    quota.sendsTodayToRecipient >= quota.dailyRecipientLimit
  ) {
    return block(
      mode,
      ELIGIBILITY_REASON.RECIPIENT_DAILY_LIMIT,
      'Đã đạt giới hạn gửi tới người nhận hôm nay',
    );
  }
  if (input.sendHistory?.cooldownMinutes && input.sendHistory.lastOutboundAt) {
    const cooldownEnd = new Date(
      input.sendHistory.lastOutboundAt.getTime() + input.sendHistory.cooldownMinutes * 60_000,
    );
    if (now < cooldownEnd) {
      return block(mode, ELIGIBILITY_REASON.COOLDOWN_ACTIVE, 'Đang trong thời gian cooldown', {
        nextEligibleAt: cooldownEnd,
      });
    }
  }

  if (input.sendHistory?.recentlyManualMessaged) {
    return block(
      mode,
      ELIGIBILITY_REASON.MANUAL_RECENT_CONTACT,
      'Khách vừa được nhân viên nhắn thủ công — tạm loại khỏi chiến dịch',
    );
  }
  if (
    input.sendHistory?.campaignCooldownUntil &&
    input.sendHistory.campaignCooldownUntil.getTime() > now.getTime()
  ) {
    return block(mode, ELIGIBILITY_REASON.CAMPAIGN_COOLDOWN, 'Đang cooldown giữa hai chiến dịch', {
      nextEligibleAt: input.sendHistory.campaignCooldownUntil,
    });
  }

  if (
    input.quietHours &&
    isInQuietHours(
      now,
      input.quietHours.start,
      input.quietHours.end,
      input.quietHours.timeZone ?? 'Asia/Ho_Chi_Minh',
    )
  ) {
    const next = nextQuietHoursEnd(
      now,
      input.quietHours.start,
      input.quietHours.end,
      input.quietHours.timeZone ?? 'Asia/Ho_Chi_Minh',
    );
    return block(mode, ELIGIBILITY_REASON.QUIET_HOURS, 'Đang trong quiet hours — sẽ gửi sau', {
      nextEligibleAt: next ?? undefined,
    });
  }

  if (input.channel === 'MESSENGER') {
    return evaluateMessenger(input, now, mode, cost);
  }
  if (input.channel === 'ZALO') {
    return evaluateZalo(input, now, mode, cost);
  }

  return block(mode, ELIGIBILITY_REASON.UNSUPPORTED_CHANNEL, 'Kênh không hỗ trợ eligibility');
}

function evaluateMessenger(
  input: MessagingEligibilityInput,
  now: Date,
  defaultModeVal: MessagingProviderMode,
  cost: number,
): MessagingEligibilityResult {
  const accountRef = input.connection?.accountRef;
  if (
    accountRef &&
    input.identity?.integrationScopeKey &&
    !integrationScopeMatchesPage(input.identity.integrationScopeKey, accountRef)
  ) {
    return block(
      defaultModeVal,
      ELIGIBILITY_REASON.WRONG_PAGE,
      'Identity không thuộc Fanpage đang gửi',
    );
  }

  const perms = input.connection?.permissions ?? [];
  if (perms.length > 0 && !perms.some((p) => /messag/i.test(p))) {
    return block(
      defaultModeVal,
      ELIGIBILITY_REASON.MISSING_PERMISSION,
      'Page thiếu quyền gửi tin nhắn',
    );
  }

  const lastInbound = input.identity?.lastInboundAt;
  const withinWindow =
    lastInbound != null && now.getTime() - lastInbound.getTime() <= MESSENGER_INTERACTION_WINDOW_MS;

  if (withinWindow) {
    if (input.campaignType === 'broadcast') {
      return block(
        'MESSENGER_STANDARD',
        ELIGIBILITY_REASON.MESSENGER_TAG_NOT_ALLOWED,
        'Messenger không hỗ trợ broadcast — chỉ gửi trong cửa sổ tương tác',
      );
    }
    return allow('MESSENGER_STANDARD', cost);
  }

  const utilityOk =
    input.campaignType === 'transactional' ||
    (input.template?.isUtility === true && input.template?.isApproved !== false);

  if (utilityOk && input.template?.isApproved !== false) {
    return allow('MESSENGER_UTILITY', cost);
  }

  const nextEligibleAt =
    lastInbound != null
      ? nextFromWindowEnd(lastInbound, MESSENGER_INTERACTION_WINDOW_MS)
      : undefined;

  return block(
    'MESSENGER_UTILITY',
    ELIGIBILITY_REASON.MESSENGER_OUTSIDE_WINDOW,
    'Ngoài cửa sổ 24h — cần template utility/transactional hợp lệ',
    { nextEligibleAt, estimatedCost: cost },
  );
}

function evaluateZalo(
  input: MessagingEligibilityInput,
  now: Date,
  defaultModeVal: MessagingProviderMode,
  cost: number,
): MessagingEligibilityResult {
  const quota = input.quota ?? {};
  const lastInbound = input.identity?.lastInboundAt;
  const withinConsult =
    lastInbound != null && now.getTime() - lastInbound.getTime() <= ZALO_OA_CONSULT_WINDOW_MS;

  if (input.campaignType === 'template' || input.providerModeHint === 'ZBS_TEMPLATE') {
    if (!input.template?.isZbsTemplate && !input.template?.isApproved) {
      return block(
        'ZBS_TEMPLATE',
        ELIGIBILITY_REASON.ZBS_TEMPLATE_REQUIRED,
        'ZBS yêu cầu template đã duyệt',
      );
    }
    if (input.template?.isApproved === false) {
      return block(
        'ZBS_TEMPLATE',
        ELIGIBILITY_REASON.TEMPLATE_NOT_APPROVED,
        'Template chưa được duyệt',
      );
    }
    if (quota.templatesRemaining != null && quota.templatesRemaining <= 0) {
      return block(
        'ZBS_TEMPLATE',
        ELIGIBILITY_REASON.BROADCAST_QUOTA_EXCEEDED,
        'Hết quota template ZBS',
      );
    }
    return allow('ZBS_TEMPLATE', cost);
  }

  if (input.campaignType === 'broadcast' || defaultModeVal === 'ZALO_OA_BROADCAST') {
    if (input.identity?.followStatus === 'UNFOLLOWED') {
      return block(
        'ZALO_OA_BROADCAST',
        ELIGIBILITY_REASON.ZALO_NOT_FOLLOWING,
        'Người nhận đã bỏ quan tâm OA',
      );
    }
    if (
      input.identity?.followStatus !== 'FOLLOWING' &&
      input.identity?.followStatus !== 'UNKNOWN'
    ) {
      return block(
        'ZALO_OA_BROADCAST',
        ELIGIBILITY_REASON.ZALO_NOT_FOLLOWING,
        'Broadcast chỉ gửi người còn quan tâm OA',
      );
    }
    if (quota.broadcastsRemaining != null && quota.broadcastsRemaining <= 0) {
      return block(
        'ZALO_OA_BROADCAST',
        ELIGIBILITY_REASON.BROADCAST_QUOTA_EXCEEDED,
        'Hết quota broadcast OA',
      );
    }
    return allow('ZALO_OA_BROADCAST', cost);
  }

  if (withinConsult) {
    return allow('ZALO_OA_CONSULT', cost);
  }

  const nextEligibleAt =
    lastInbound != null ? nextFromWindowEnd(lastInbound, ZALO_OA_CONSULT_WINDOW_MS) : undefined;

  return block(
    'ZALO_OA_CONSULT',
    ELIGIBILITY_REASON.ZALO_OUTSIDE_CONSULT_WINDOW,
    'Ngoài cửa sổ tư vấn OA — cần broadcast hoặc ZBS template',
    { nextEligibleAt, estimatedCost: cost },
  );
}
