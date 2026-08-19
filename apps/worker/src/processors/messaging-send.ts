import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import {
  MessageChannel,
  MessagingCampaignRecipientStatus,
  MessagingCampaignStatus,
  MessagingProviderKind,
  prisma,
} from '@marketingspa/database';
import type Redis from 'ioredis';
import {
  isPermanentMessagingError,
  MESSAGING_NAME_FALLBACKS,
  MESSAGING_RESCHEDULE_REASON_CODES,
  renderTemplateWithFallbacks,
  sendMessengerHttp,
  sendZaloOaHttp,
  sendZbsTemplateHttp,
  type MessagingSendJobData,
} from '@marketingspa/shared';
import {
  checkCampaignRecipientEligibility,
  getOrgMessagingPolicy,
} from '../lib/messaging-campaign-eligibility';
import {
  buildRecipientRenderContext,
  emitCampaignRealtime,
  emitRecipientRealtime,
  maybeCompleteCampaign,
  refreshCampaignAggregates,
} from '../lib/messaging-campaign-helpers';
import { parseConnectionCredentials } from '../lib/encryption';
import { acquireMessagingRateLimit } from '../lib/messaging-rate-limit';

const TERMINAL_STATUSES: MessagingCampaignRecipientStatus[] = [
  MessagingCampaignRecipientStatus.SENT,
  MessagingCampaignRecipientStatus.DELIVERED,
  MessagingCampaignRecipientStatus.READ,
  MessagingCampaignRecipientStatus.REPLIED,
];

export async function processMessagingSend(job: Job<MessagingSendJobData>, redis: Redis) {
  const { organizationId, campaignId, recipientId } = job.data;

  const recipient = await prisma.messagingCampaignRecipient.findFirst({
    where: { id: recipientId, organizationId, campaignId },
    include: { identity: true },
  });
  if (!recipient) return { skipped: true, reason: 'recipient_not_found' };

  if (TERMINAL_STATUSES.includes(recipient.status)) {
    return { skipped: true, reason: 'already_sent', status: recipient.status };
  }

  const campaign = await prisma.messagingCampaign.findFirst({
    where: { id: campaignId, organizationId },
    include: { messageTemplate: true },
  });
  if (!campaign) return { skipped: true, reason: 'campaign_not_found' };

  if (campaign.status === MessagingCampaignStatus.CANCELLED) {
    return { skipped: true, reason: 'campaign_cancelled' };
  }
  if (campaign.status === MessagingCampaignStatus.PAUSED) {
    return { skipped: true, reason: 'campaign_paused' };
  }
  if (campaign.status !== MessagingCampaignStatus.RUNNING) {
    return { skipped: true, reason: 'campaign_not_running', status: campaign.status };
  }

  const claimed = await prisma.messagingCampaignRecipient.updateMany({
    where: {
      id: recipientId,
      status: MessagingCampaignRecipientStatus.QUEUED,
    },
    data: {
      status: MessagingCampaignRecipientStatus.PENDING,
      attemptCount: { increment: 1 },
    },
  });
  if (claimed.count === 0) {
    const current = await prisma.messagingCampaignRecipient.findUnique({
      where: { id: recipientId },
    });
    if (current && TERMINAL_STATUSES.includes(current.status)) {
      return { skipped: true, reason: 'already_sent' };
    }
    return { skipped: true, reason: 'not_claimable', status: current?.status };
  }

  const statusRecheck = await prisma.messagingCampaign.findUnique({
    where: { id: campaignId },
    select: { status: true },
  });
  if (statusRecheck?.status === MessagingCampaignStatus.PAUSED) {
    await prisma.messagingCampaignRecipient.update({
      where: { id: recipientId },
      data: { status: MessagingCampaignRecipientStatus.QUEUED },
    });
    return { skipped: true, reason: 'campaign_paused' };
  }
  if (statusRecheck?.status === MessagingCampaignStatus.CANCELLED) {
    await prisma.messagingCampaignRecipient.update({
      where: { id: recipientId },
      data: { status: MessagingCampaignRecipientStatus.QUEUED },
    });
    return { skipped: true, reason: 'campaign_cancelled' };
  }

  const connection = campaign.channelConnectionId
    ? await prisma.messagingChannelConnection.findFirst({
        where: { id: campaign.channelConnectionId, organizationId },
      })
    : null;

  if (!campaign.channelConnectionId) {
    await markRecipientFailed(
      recipientId,
      'CONNECTION_REQUIRED',
      'Chiến dịch thiếu channelConnectionId — không tự chọn kết nối',
    );
    throw new UnrecoverableError('channel_connection_required');
  }

  if (!connection || connection.isPaused) {
    await markRecipientFailed(recipientId, 'CONNECTION_INACTIVE', 'Kết nối kênh không khả dụng');
    throw new UnrecoverableError('connection_inactive');
  }

  const policy = await getOrgMessagingPolicy(organizationId);
  const rateScope = campaign.integrationId ?? connection.id;
  const meta = (connection.metadata ?? {}) as { rateLimit?: { perSecond?: number } };
  const channelLimit =
    policy.channelRateLimits[campaign.channel] ??
    policy.channelRateLimits[connection.providerKind] ??
    meta.rateLimit?.perSecond;
  await acquireMessagingRateLimit(redis, connection.providerKind, rateScope, channelLimit);

  const eligibility = await checkCampaignRecipientEligibility({
    organizationId,
    campaignId,
    channel: campaign.channel,
    campaignType: campaign.campaignType,
    identityId: recipient.identityId,
    channelConnectionId: connection.id,
    messageTemplateId: campaign.messageTemplateId,
    customerId: recipient.customerId,
    leadId: recipient.leadId,
    includeQuietHours: true,
  });

  if (!eligibility.eligible) {
    const reason = eligibility.reasonCode ?? 'not_eligible';

    // Quiet hours / cooldown → reschedule, KHÔNG đánh dấu failed
    if (MESSAGING_RESCHEDULE_REASON_CODES.has(reason)) {
      const delayUntil = eligibility.nextEligibleAt?.getTime() ?? Date.now() + 15 * 60_000;
      await prisma.messagingCampaignRecipient.update({
        where: { id: recipientId },
        data: {
          status: MessagingCampaignRecipientStatus.QUEUED,
          lastError: eligibility.reasonMessage ?? reason,
          exclusionReason: null,
          eligible: true,
        },
      });
      await job.moveToDelayed(Math.max(delayUntil, Date.now() + 5_000));
      throw new Error(`reschedule:${reason}`);
    }

    const permanent = isPermanentMessagingError({ reasonCode: reason });
    await prisma.messagingCampaignRecipient.update({
      where: { id: recipientId },
      data: {
        status: permanent
          ? MessagingCampaignRecipientStatus.SKIPPED
          : MessagingCampaignRecipientStatus.QUEUED,
        eligible: false,
        exclusionReason: eligibility.reasonMessage ?? reason,
        providerMode: eligibility.providerMode,
        lastError: eligibility.reasonMessage ?? reason,
      },
    });
    await refreshCampaignAggregates(campaignId);
    await emitRecipientRealtime(redis, organizationId, campaignId, recipientId, 'SKIPPED');
    if (permanent) {
      throw new UnrecoverableError(reason);
    }
    throw new Error(reason);
  }

  // Luôn render lại theo từng recipient lúc dispatch — không tái dùng tên chung
  const campaignVars = (campaign.variables ?? {}) as Record<string, string>;
  const bodySource =
    campaign.messageTemplate?.body ||
    campaignVars.body?.trim() ||
    campaignVars.message?.trim() ||
    campaignVars.content?.trim() ||
    '';
  let renderedContent: string | null = null;
  if (bodySource) {
    const context = await buildRecipientRenderContext(
      organizationId,
      recipient.identity,
      campaignVars,
    );
    const templateFallbacks = (campaign.messageTemplate?.variableFallbacks ?? {}) as Record<
      string,
      string
    >;
    const { rendered } = renderTemplateWithFallbacks(bodySource, context, {
      ...MESSAGING_NAME_FALLBACKS,
      ...templateFallbacks,
    });
    renderedContent = rendered;
  } else if (recipient.renderedContent?.trim()) {
    // Legacy: chỉ dùng nội dung đã plan nếu không còn template/body
    renderedContent = recipient.renderedContent;
  }

  const mediaUrl = (
    campaignVars.mediaUrl ||
    campaign.messageTemplate?.mediaUrl ||
    ''
  ).trim();
  const mediaTypeRaw = (campaignVars.mediaType || '').toLowerCase();
  const mediaType =
    mediaTypeRaw === 'video' || mediaTypeRaw === 'audio' || mediaTypeRaw === 'file'
      ? mediaTypeRaw
      : mediaUrl
        ? 'image'
        : undefined;

  if (!renderedContent?.trim() && !mediaUrl) {
    await markRecipientFailed(recipientId, 'EMPTY_CONTENT', 'Chiến dịch thiếu nội dung tin nhắn');
    await refreshCampaignAggregates(campaignId);
    await emitRecipientRealtime(redis, organizationId, campaignId, recipientId, 'FAILED');
    await maybeCompleteCampaign(campaignId);
    throw new UnrecoverableError('empty_content');
  }

  const credentials = parseConnectionCredentials(connection.encryptedCredentials);
  const externalUserId = recipient.identity.externalUserId;

  // Feature flag: MESSAGING_LIVE_SEND=true → all live
  // hoặc MESSAGING_LIVE_PAGE_IDS=pageId1,pageId2 → live chỉ các Page nội bộ
  const liveAll = process.env.MESSAGING_LIVE_SEND === 'true';
  const livePageIds = (process.env.MESSAGING_LIVE_PAGE_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const liveOaIds = (process.env.MESSAGING_LIVE_OA_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const liveSend =
    liveAll ||
    (connection.channel === MessageChannel.MESSENGER &&
      livePageIds.includes(connection.accountRef)) ||
    (connection.channel === MessageChannel.ZALO && liveOaIds.includes(connection.accountRef));
  if (!liveSend) {
    const now = new Date();
    const dryRunId = `dryrun:${recipient.idempotencyKey}`;
    await prisma.messagingCampaignRecipient.update({
      where: { id: recipientId },
      data: {
        status: MessagingCampaignRecipientStatus.SENT,
        renderedContent,
        providerMode: eligibility.providerMode,
        providerMessageId: dryRunId,
        sentAt: now,
        queuedAt: recipient.queuedAt ?? now,
        cost: 0,
        lastError: null,
      },
    });
    await prisma.messagingContactIdentity.update({
      where: { id: recipient.identityId },
      data: { lastOutboundAt: now },
    });
    await refreshCampaignAggregates(campaignId);
    await emitRecipientRealtime(redis, organizationId, campaignId, recipientId, 'SENT');
    await emitCampaignRealtime(redis, organizationId, campaignId);
    await maybeCompleteCampaign(campaignId);
    return {
      recipientId,
      dryRun: true,
      messageId: dryRunId,
      liveSend: false,
    };
  }

  const sendResult = await executeProviderSend({
    providerKind: connection.providerKind,
    channel: campaign.channel,
    credentials,
    externalUserId,
    phone: recipient.identity.phoneNormalized,
    text: renderedContent ?? '',
    pageId: connection.accountRef,
    mediaUrl: mediaUrl || undefined,
    mediaType: mediaType as 'image' | 'video' | 'audio' | 'file' | undefined,
    templateId: campaign.messageTemplate?.providerTemplateId ?? campaign.messageTemplate?.id,
    templateVariables: campaignVars,
  });

  if (!sendResult.success) {
    if (sendResult.httpStatus === 429 && sendResult.retryable) {
      await prisma.messagingCampaignRecipient.update({
        where: { id: recipientId },
        data: { status: MessagingCampaignRecipientStatus.QUEUED, lastError: sendResult.message },
      });
      const delayMs = (sendResult.retryAfterSeconds ?? 5) * 1000;
      await job.moveToDelayed(Date.now() + delayMs);
      throw new Error('rate_limited');
    }

    const permanent = isPermanentMessagingError({
      reasonCode: sendResult.reasonCode,
      httpStatus: sendResult.httpStatus,
      message: sendResult.message,
    });

    if (permanent || job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
      await markRecipientFailed(
        recipientId,
        sendResult.reasonCode ?? 'SEND_FAILED',
        sendResult.message,
      );
      await refreshCampaignAggregates(campaignId);
      await emitRecipientRealtime(redis, organizationId, campaignId, recipientId, 'FAILED');
      await maybeCompleteCampaign(campaignId);
      if (permanent) throw new UnrecoverableError(sendResult.message);
    }

    await prisma.messagingCampaignRecipient.update({
      where: { id: recipientId },
      data: {
        status: MessagingCampaignRecipientStatus.QUEUED,
        lastError: sendResult.message,
      },
    });
    throw new Error(sendResult.message);
  }

  const now = new Date();
  await prisma.messagingCampaignRecipient.update({
    where: { id: recipientId },
    data: {
      status: MessagingCampaignRecipientStatus.SENT,
      renderedContent,
      providerMode: eligibility.providerMode,
      providerMessageId: sendResult.messageId,
      sentAt: now,
      queuedAt: recipient.queuedAt ?? now,
      cost: sendResult.estimatedCost ?? eligibility.estimatedCost ?? 0,
      lastError: null,
    },
  });

  await prisma.messagingContactIdentity.update({
    where: { id: recipient.identityId },
    data: { lastOutboundAt: now },
  });

  await refreshCampaignAggregates(campaignId);
  await emitRecipientRealtime(redis, organizationId, campaignId, recipientId, 'SENT');
  await emitCampaignRealtime(redis, organizationId, campaignId);
  await maybeCompleteCampaign(campaignId);

  return {
    recipientId,
    messageId: sendResult.messageId,
    providerKind: connection.providerKind,
  };
}

async function markRecipientFailed(recipientId: string, code: string, message: string) {
  await prisma.messagingCampaignRecipient.update({
    where: { id: recipientId },
    data: {
      status: MessagingCampaignRecipientStatus.FAILED,
      lastError: message,
      exclusionReason: code,
    },
  });
}

async function executeProviderSend(params: {
  providerKind: MessagingProviderKind;
  channel: MessageChannel;
  credentials: Record<string, string>;
  externalUserId: string;
  phone: string | null;
  text: string;
  pageId?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'file';
  templateId?: string;
  templateVariables: Record<string, string>;
}) {
  if (params.providerKind === MessagingProviderKind.MESSENGER) {
    const token = params.credentials.pageAccessToken || params.credentials.accessToken;
    return sendMessengerHttp({
      pageAccessToken: token ?? '',
      recipientId: params.externalUserId,
      text: params.text,
      pageId: params.pageId,
      attachment:
        params.mediaUrl && params.mediaType
          ? { type: params.mediaType, url: params.mediaUrl }
          : undefined,
    });
  }

  if (params.providerKind === MessagingProviderKind.ZBS_TEMPLATE) {
    const phone = params.phone?.trim();
    const userId = params.externalUserId?.trim();
    const looksLikePhone = phone && /^\+?\d{8,15}$/.test(phone.replace(/\s/g, ''));
    return sendZbsTemplateHttp({
      accessToken: params.credentials.accessToken ?? '',
      phone: looksLikePhone ? phone : undefined,
      userId: looksLikePhone ? undefined : userId || phone,
      templateId: params.templateId ?? params.credentials.templateId ?? '',
      templateData: params.templateVariables,
    });
  }

  const token = params.credentials.accessToken || params.credentials.oaAccessToken;
  return sendZaloOaHttp({
    accessToken: token ?? '',
    recipientId: params.externalUserId,
    text: params.text,
  });
}
