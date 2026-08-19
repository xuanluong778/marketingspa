import {
  MessageChannel,
  MessagingCampaignRecipientStatus,
  MessagingConsentStatus,
  prisma,
} from '@marketingspa/database';
import { matchesOptOutKeyword, WS_EVENTS } from '@marketingspa/shared';
import type Redis from 'ioredis';
import { publishRealtime } from './realtime';
import {
  applyOptOut,
  cancelPendingForIdentity,
  getOrgMessagingPolicy,
} from './messaging-campaign-eligibility';
import { refreshCampaignAggregates } from './messaging-campaign-helpers';
import { dispatchFunnelAutomation } from './dispatch-funnel-automation';
import { AutomationTriggerType } from '@marketingspa/database';

/**
 * Xử lý inbound reply / opt-out sau khi identity đã upsert.
 */
export async function handleInboundCustomerMessage(params: {
  organizationId: string;
  channel: MessageChannel;
  accountRef: string;
  externalUserId: string;
  text?: string;
  timestamp: Date;
  identityId: string;
  redis?: Redis;
}) {
  const policy = await getOrgMessagingPolicy(params.organizationId);
  const identity = await prisma.messagingContactIdentity.findUnique({
    where: { id: params.identityId },
  });
  if (!identity) return { handled: false };

  const isOptOut = policy.stopOnOptOut && matchesOptOutKeyword(params.text, policy.optOutKeywords);

  if (isOptOut) {
    await applyOptOut({
      organizationId: params.organizationId,
      identityId: identity.id,
      channel: params.channel,
      externalUserId: params.externalUserId,
      phoneNormalized: identity.phoneNormalized,
      note: `Keyword opt-out: ${params.text?.slice(0, 80) ?? ''}`,
    });

    // Đánh dấu recipient gần nhất OPTED_OUT nếu có
    await prisma.messagingCampaignRecipient.updateMany({
      where: {
        organizationId: params.organizationId,
        identityId: identity.id,
        status: {
          in: [
            MessagingCampaignRecipientStatus.SENT,
            MessagingCampaignRecipientStatus.DELIVERED,
            MessagingCampaignRecipientStatus.READ,
            MessagingCampaignRecipientStatus.QUEUED,
            MessagingCampaignRecipientStatus.PENDING,
          ],
        },
      },
      data: {
        status: MessagingCampaignRecipientStatus.OPTED_OUT,
        exclusionReason: 'OPTED_OUT',
      },
    });

    if (params.redis) {
      await publishRealtime(
        params.redis,
        params.organizationId,
        WS_EVENTS.MESSAGING_CAMPAIGN_RECIPIENT,
        {
          identityId: identity.id,
          eventType: 'opt_out',
        },
      );
    }
    return { handled: true, optOut: true };
  }

  // Reply → REPLIED + dừng bước tiếp theo
  const replied = await prisma.messagingCampaignRecipient.findMany({
    where: {
      organizationId: params.organizationId,
      repliedAt: null,
      status: {
        in: [
          MessagingCampaignRecipientStatus.SENT,
          MessagingCampaignRecipientStatus.DELIVERED,
          MessagingCampaignRecipientStatus.READ,
        ],
      },
      identityId: identity.id,
    },
    orderBy: { sentAt: 'desc' },
    take: 5,
    select: {
      id: true,
      campaignId: true,
      customerId: true,
      leadId: true,
    },
  });

  if (replied.length) {
    const primary = replied[0]!;
    await prisma.messagingCampaignRecipient.update({
      where: { id: primary.id },
      data: {
        status: MessagingCampaignRecipientStatus.REPLIED,
        repliedAt: params.timestamp,
      },
    });
    await refreshCampaignAggregates(primary.campaignId);

    if (policy.stopOnReply) {
      await cancelPendingForIdentity({
        organizationId: params.organizationId,
        identityId: identity.id,
        reason: 'STOPPED_ON_REPLY',
      });
    }

    // Attribution: ghi metadata campaign
    const campaign = await prisma.messagingCampaign.findUnique({
      where: { id: primary.campaignId },
      select: { id: true, name: true, metadata: true },
    });
    if (campaign) {
      const meta = (campaign.metadata ?? {}) as Record<string, unknown>;
      const replies = Array.isArray(meta.replyAttributions) ? meta.replyAttributions : [];
      replies.push({
        recipientId: primary.id,
        identityId: identity.id,
        at: params.timestamp.toISOString(),
        textPreview: params.text?.slice(0, 120),
      });
      await prisma.messagingCampaign.update({
        where: { id: campaign.id },
        data: {
          metadata: { ...meta, replyAttributions: replies.slice(-100) },
        },
      });
    }

    // Chatbot CSKH handover
    if (policy.handoverToChatbotOnReply) {
      await handoverToChatbot({
        organizationId: params.organizationId,
        channel: params.channel,
        accountRef: params.accountRef,
        externalUserId: params.externalUserId,
        identity,
        text: params.text,
        timestamp: params.timestamp,
        campaignId: primary.campaignId,
        campaignName: campaign?.name,
      });
    }

    // CRM task
    if (policy.createTaskOnReply) {
      await prisma.crmTask.create({
        data: {
          organizationId: params.organizationId,
          leadId: primary.leadId ?? identity.leadId ?? undefined,
          customerId: primary.customerId ?? identity.customerId ?? undefined,
          title: `Khách trả lời chiến dịch messaging`,
          dueAt: new Date(Date.now() + 60 * 60_000),
          source: 'messaging_reply',
        },
      });
    }

    // Assign employee trên lead nếu có
    if (policy.assignEmployeeOnReply && (primary.leadId || identity.leadId)) {
      const leadId = primary.leadId ?? identity.leadId!;
      const rule = await prisma.leadAssignmentRule.findFirst({
        where: { organizationId: params.organizationId, isActive: true },
      });
      const pool = await prisma.employee.findMany({
        where: { organizationId: params.organizationId, isActive: true },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });
      if (pool.length) {
        const idx = rule ? (rule.lastIndex + 1) % pool.length : 0;
        await prisma.lead.update({
          where: { id: leadId },
          data: { assignedToId: pool[idx]!.id },
        });
        if (rule) {
          await prisma.leadAssignmentRule.update({
            where: { id: rule.id },
            data: { lastIndex: idx },
          });
        }
      }
    }

    if (params.redis) {
      await publishRealtime(
        params.redis,
        params.organizationId,
        WS_EVENTS.MESSAGING_CAMPAIGN_RECIPIENT,
        {
          recipientId: primary.id,
          campaignId: primary.campaignId,
          status: 'REPLIED',
        },
      );
    }
  }

  void dispatchFunnelAutomation(params.organizationId, AutomationTriggerType.MESSAGE_RECEIVED, {
    leadId: identity.leadId,
    customerId: identity.customerId,
    context: { text: params.text?.slice(0, 200) ?? '' },
    dedupeKey: `MESSAGE_RECEIVED:${identity.id}:${params.timestamp.toISOString()}`,
  }).catch(() => undefined);

  {
    const { applyFunnelScoreEvent } = await import('./apply-funnel-score');
    void applyFunnelScoreEvent({
      organizationId: params.organizationId,
      leadId: identity.leadId,
      customerId: identity.customerId,
      eventType: 'CHATBOT_REPLY',
      text: params.text,
      source: 'messaging_inbound',
      redis: params.redis,
    }).catch(() => undefined);
  }

  return { handled: true, replied: replied.length > 0, optOut: false };
}

async function handoverToChatbot(params: {
  organizationId: string;
  channel: MessageChannel;
  accountRef: string;
  externalUserId: string;
  identity: {
    id: string;
    displayName: string | null;
    phoneNormalized: string | null;
    chatbotConversationId: string | null;
    leadId: string | null;
  };
  text?: string;
  timestamp: Date;
  campaignId: string;
  campaignName?: string;
}) {
  const bot = await prisma.chatbotBot.findFirst({
    where: { organizationId: params.organizationId, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });
  if (!bot) return;

  const channelKey = params.channel === MessageChannel.MESSENGER ? 'facebook' : 'zalo';
  const sessionId = `${channelKey}:${params.accountRef}:${params.externalUserId}`;

  let conversation = params.identity.chatbotConversationId
    ? await prisma.chatbotConversation.findFirst({
        where: { id: params.identity.chatbotConversationId, organizationId: params.organizationId },
      })
    : await prisma.chatbotConversation.findFirst({
        where: { botId: bot.id, sessionId },
      });

  if (!conversation) {
    conversation = await prisma.chatbotConversation.create({
      data: {
        organizationId: params.organizationId,
        botId: bot.id,
        sessionId,
        visitorName: params.identity.displayName,
        visitorPhone: params.identity.phoneNormalized,
        channel: channelKey,
        externalUserId: params.externalUserId,
        channelRef: params.accountRef,
        status: 'NEEDS_STAFF',
        humanTakeover: true,
        linkedLeadId: params.identity.leadId,
        lastUserMessageAt: params.timestamp,
      },
    });
  } else {
    conversation = await prisma.chatbotConversation.update({
      where: { id: conversation.id },
      data: {
        status: 'NEEDS_STAFF',
        humanTakeover: true,
        lastUserMessageAt: params.timestamp,
        linkedLeadId: conversation.linkedLeadId ?? params.identity.leadId,
      },
    });
  }

  if (params.text) {
    await prisma.chatbotMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        message: `[Chiến dịch: ${params.campaignName ?? params.campaignId}] ${params.text}`,
      },
    });
  }

  if (!params.identity.chatbotConversationId) {
    await prisma.messagingContactIdentity.update({
      where: { id: params.identity.id },
      data: { chatbotConversationId: conversation.id },
    });
  }
}

/** Chỉ đánh dấu consent lại khi có tín hiệu opt-in tường minh — helper cho API sau */
export async function clearOptOutIfConsented(organizationId: string, identityId: string) {
  await prisma.messagingContactIdentity.update({
    where: { id: identityId },
    data: {
      optedOut: false,
      consentStatus: MessagingConsentStatus.OPTED_IN,
    },
  });
  // Không xóa suppression history — chỉ tạo record mới khi opt-out lại
  void organizationId;
}
