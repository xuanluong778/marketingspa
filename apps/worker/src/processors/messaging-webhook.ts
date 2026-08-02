import type { Job } from 'bullmq';
import {
  MessageChannel,
  MessagingCampaignRecipientStatus,
  MessagingConsentStatus,
  MessagingFollowStatus,
  MessagingProviderKind,
  prisma,
} from '@marketingspa/database';
import { buildIntegrationScopeKey } from '@marketingspa/database';
import { normalizeMessengerWebhook, normalizeZaloWebhook, WS_EVENTS } from '@marketingspa/shared';
import type Redis from 'ioredis';
import { publishRealtime } from '../lib/realtime';
import { refreshCampaignAggregates } from '../lib/messaging-campaign-helpers';
import { handleInboundCustomerMessage } from '../lib/messaging-reply-handler';

export type MessagingWebhookJobData = {
  organizationId: string;
  channel: MessageChannel;
  providerKind: MessagingProviderKind;
  connectionId: string;
  accountRef: string;
  payload: unknown;
};

function normalizeEvents(
  providerKind: MessagingProviderKind,
  payload: unknown,
  accountRef: string,
) {
  if (providerKind === MessagingProviderKind.MESSENGER) {
    return normalizeMessengerWebhook(payload, accountRef);
  }
  return normalizeZaloWebhook(payload, accountRef);
}

export async function processMessagingWebhook(job: Job<MessagingWebhookJobData>, redis?: Redis) {
  const data = job.data;
  const connection = await prisma.messagingChannelConnection.findFirst({
    where: { id: data.connectionId, organizationId: data.organizationId },
  });
  if (!connection || connection.isPaused) {
    return { skipped: true, reason: 'connection_inactive' };
  }

  const events = normalizeEvents(data.providerKind, data.payload, data.accountRef);

  for (const event of events) {
    if (!event.externalUserId) continue;

    const channel = event.channel === 'MESSENGER' ? MessageChannel.MESSENGER : MessageChannel.ZALO;

    const followStatus =
      event.followStatus === 'FOLLOWING'
        ? MessagingFollowStatus.FOLLOWING
        : event.followStatus === 'UNFOLLOWED'
          ? MessagingFollowStatus.UNFOLLOWED
          : event.eventType === 'follow'
            ? MessagingFollowStatus.FOLLOWING
            : event.eventType === 'unfollow'
              ? MessagingFollowStatus.UNFOLLOWED
              : undefined;

    const integrationScopeKey = buildIntegrationScopeKey({
      channel,
      channelAccountRef: event.accountRef,
    });

    const existing = await prisma.messagingContactIdentity.findFirst({
      where: {
        organizationId: data.organizationId,
        integrationScopeKey,
        externalUserId: event.externalUserId,
      },
    });

    const now = event.timestamp ?? new Date();

    let identityId: string;
    if (existing) {
      await prisma.messagingContactIdentity.update({
        where: { id: existing.id },
        data: {
          externalConversationId: event.externalConversationId ?? existing.externalConversationId,
          displayName: event.displayName ?? existing.displayName,
          followStatus: followStatus ?? existing.followStatus,
          isBlocked: event.isBlocked ?? existing.isBlocked,
          lastInboundAt: event.direction === 'inbound' ? now : existing.lastInboundAt,
          lastOutboundAt: event.direction === 'outbound' ? now : existing.lastOutboundAt,
          ...(event.direction === 'inbound' &&
          !existing.optedOut &&
          existing.consentStatus !== MessagingConsentStatus.OPTED_OUT
            ? { consentStatus: MessagingConsentStatus.OPTED_IN }
            : {}),
          metadata: {
            ...((existing.metadata as object) ?? {}),
            lastEventType: event.eventType,
          },
        },
      });
      identityId = existing.id;
    } else {
      const created = await prisma.messagingContactIdentity.create({
        data: {
          organizationId: data.organizationId,
          channel,
          integrationScopeKey,
          externalUserId: event.externalUserId,
          externalConversationId: event.externalConversationId,
          displayName: event.displayName,
          followStatus: followStatus ?? MessagingFollowStatus.UNKNOWN,
          lastInboundAt: event.direction === 'inbound' ? now : undefined,
          lastOutboundAt: event.direction === 'outbound' ? now : undefined,
          // Inbound Messenger/Zalo = khách đã tương tác → opt-in cho cửa sổ tư vấn
          consentStatus:
            event.direction === 'inbound' ? MessagingConsentStatus.OPTED_IN : undefined,
          metadata: { lastEventType: event.eventType },
        },
      });
      identityId = created.id;
    }

    await prisma.messagingWebhookEvent.updateMany({
      where: {
        organizationId: data.organizationId,
        channel,
        eventKey: event.rawEventKey,
        processedAt: null,
      },
      data: { processedAt: new Date() },
    });

    await updateCampaignRecipientFromWebhook(data.organizationId, channel, event, redis);

    if (event.eventType === 'message' && event.direction === 'inbound') {
      await handleInboundCustomerMessage({
        organizationId: data.organizationId,
        channel,
        accountRef: event.accountRef || data.accountRef,
        externalUserId: event.externalUserId,
        text: event.text,
        timestamp: now,
        identityId,
        redis,
      });
    }
  }

  await prisma.messagingChannelConnection.update({
    where: { id: connection.id },
    data: { lastSyncedAt: new Date() },
  });

  return { processed: events.length };
}

async function updateCampaignRecipientFromWebhook(
  organizationId: string,
  channel: MessageChannel,
  event: {
    externalUserId: string;
    eventType: string;
    direction: string;
    timestamp: Date;
    providerMessageIds?: string[];
  },
  redis?: Redis,
) {
  const ts = event.timestamp ?? new Date();
  const updatedRecipientIds: string[] = [];

  if (event.eventType === 'delivery' && event.providerMessageIds?.length) {
    for (const mid of event.providerMessageIds) {
      const rows = await prisma.messagingCampaignRecipient.findMany({
        where: { organizationId, providerMessageId: mid },
        select: { id: true, campaignId: true },
      });
      if (!rows.length) continue;
      await prisma.messagingCampaignRecipient.updateMany({
        where: { organizationId, providerMessageId: mid },
        data: {
          status: MessagingCampaignRecipientStatus.DELIVERED,
          deliveredAt: ts,
        },
      });
      updatedRecipientIds.push(...rows.map((r) => r.id));
      for (const campaignId of new Set(rows.map((r) => r.campaignId))) {
        await refreshCampaignAggregates(campaignId);
      }
    }
  }

  if (event.eventType === 'read') {
    const rows = await prisma.messagingCampaignRecipient.findMany({
      where: {
        organizationId,
        status: {
          in: [MessagingCampaignRecipientStatus.SENT, MessagingCampaignRecipientStatus.DELIVERED],
        },
        readAt: null,
        identity: { externalUserId: event.externalUserId, channel },
      },
      select: { id: true, campaignId: true },
    });
    if (rows.length) {
      await prisma.messagingCampaignRecipient.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { status: MessagingCampaignRecipientStatus.READ, readAt: ts },
      });
      updatedRecipientIds.push(...rows.map((r) => r.id));
      for (const campaignId of new Set(rows.map((r) => r.campaignId))) {
        await refreshCampaignAggregates(campaignId);
      }
    }
  }

  // inbound reply / opt-out handled by handleInboundCustomerMessage

  if (redis && updatedRecipientIds.length) {
    await publishRealtime(redis, organizationId, WS_EVENTS.MESSAGING_CAMPAIGN_RECIPIENT, {
      recipientIds: updatedRecipientIds,
      eventType: event.eventType,
    });
  }
}
