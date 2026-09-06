import {
  MessageChannel,
  MessagingFollowStatus,
  MessagingProviderKind,
  prisma,
} from '@marketingspa/database';
import {
  fetchZaloUserProfile,
  formatZaloVisitorFallback,
  isWeakZaloDisplayName,
  pickBetterZaloDisplayName,
  WS_EVENTS,
} from '@marketingspa/shared';
import type Redis from 'ioredis';
import { publishRealtime } from './realtime';
import { ensureFreshZaloAccessToken } from './zalo-token-refresh';

type ConnMeta = { botId?: string } | null;
type IdentityMeta = {
  lastEventType?: string;
  profileFetchedAt?: string;
  profileFetchFailedAt?: string;
  profileErrorCode?: number | null;
  profileSource?: string;
};

/**
 * Chọn bot inbox cho OA: metadata.botId → ChatbotChannel ZALO → tên khớp OA → bot ACTIVE cũ nhất.
 * Tenant-scoped qua organizationId.
 */
export async function resolveZaloInboxBot(organizationId: string, accountRef: string) {
  const connection = await prisma.messagingChannelConnection.findFirst({
    where: {
      organizationId,
      accountRef,
      channel: MessageChannel.ZALO,
      providerKind: MessagingProviderKind.ZALO_OA,
    },
    select: { metadata: true, displayName: true },
  });

  const meta = (connection?.metadata as ConnMeta) || null;
  if (meta?.botId) {
    const byMeta = await prisma.chatbotBot.findFirst({
      where: { id: meta.botId, organizationId, status: 'ACTIVE' },
    });
    if (byMeta) return byMeta;
  }

  const zaloChannels = await prisma.chatbotChannel.findMany({
    where: { organizationId, channelType: 'ZALO', botId: { not: null } },
    select: { botId: true, config: true },
    take: 50,
  });
  for (const ch of zaloChannels) {
    const cfg = (ch.config as { oaId?: string; accountRef?: string } | null) || {};
    if (cfg.oaId === accountRef || cfg.accountRef === accountRef) {
      const byChannel = await prisma.chatbotBot.findFirst({
        where: { id: ch.botId!, organizationId, status: 'ACTIVE' },
      });
      if (byChannel) return byChannel;
    }
  }

  const oaName = String(connection?.displayName || '')
    .trim()
    .toLowerCase();
  if (oaName) {
    const bots = await prisma.chatbotBot.findMany({
      where: { organizationId, status: 'ACTIVE' },
      select: { id: true, botName: true, businessName: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const hit = bots.find((b) => {
      const botLabel = `${b.botName || ''} ${b.businessName || ''}`.toLowerCase();
      if (!botLabel.trim()) return false;
      if (botLabel.includes(oaName) || oaName.includes((b.botName || '').toLowerCase())) {
        return true;
      }
      if (oaName.includes('digi') && botLabel.includes('digi')) return true;
      return false;
    });
    if (hit) {
      return prisma.chatbotBot.findFirst({ where: { id: hit.id } });
    }
  }

  return prisma.chatbotBot.findFirst({
    where: { organizationId, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Enrich identity từ Zalo getprofile khi thiếu tên/avatar.
 * Cache trên identity — không gọi lại nếu đã có profile tốt hoặc vừa fail gần đây.
 */
export async function enrichZaloIdentityProfile(params: {
  organizationId: string;
  accountRef: string;
  identityId: string;
  externalUserId: string;
  webhookDisplayName?: string;
  webhookAvatarUrl?: string;
}): Promise<{ displayName?: string; avatarUrl?: string }> {
  const identity = await prisma.messagingContactIdentity.findFirst({
    where: { id: params.identityId, organizationId: params.organizationId },
  });
  if (!identity) return {};

  const meta = (identity.metadata as IdentityMeta) || {};
  const webhookName = String(params.webhookDisplayName || '').trim();
  const webhookAvatar = String(params.webhookAvatarUrl || '').trim().slice(0, 2000);

  let displayName = pickBetterZaloDisplayName(
    identity.displayName,
    webhookName || null,
    params.externalUserId,
  );
  let avatarUrl = identity.avatarUrl || webhookAvatar || null;

  const needsName = isWeakZaloDisplayName(displayName);
  const needsAvatar = !avatarUrl;
  const failedAt = meta.profileFetchFailedAt ? Date.parse(meta.profileFetchFailedAt) : 0;
  const fetchedAt = meta.profileFetchedAt ? Date.parse(meta.profileFetchedAt) : 0;
  const now = Date.now();
  // -224 (thiếu gói) có thể hết sau khi OA nâng tier — chỉ cache fail ngắn để tự retry
  const failTtlMs =
    Number(meta.profileErrorCode) === -224 ? 15 * 60_000 : 6 * 3600_000;
  const recentlyFailed = failedAt > 0 && now - failedAt < failTtlMs;
  const recentlyFetched = fetchedAt > 0 && now - fetchedAt < 24 * 3600_000 && !needsName && !needsAvatar;

  if ((!needsName && !needsAvatar) || recentlyFetched) {
    // Persist webhook upgrades without API
    await prisma.messagingContactIdentity.update({
      where: { id: identity.id },
      data: {
        displayName,
        ...(avatarUrl ? { avatarUrl } : {}),
        metadata: {
          ...meta,
          lastEventType: meta.lastEventType,
          profileSource: meta.profileSource || (webhookName ? 'webhook' : meta.profileSource),
        },
      },
    });
    return { displayName, avatarUrl: avatarUrl || undefined };
  }

  if (recentlyFailed && needsName && needsAvatar) {
    return {
      displayName: formatZaloVisitorFallback(params.externalUserId),
      avatarUrl: avatarUrl || undefined,
    };
  }

  if (needsName || needsAvatar) {
    const connection = await prisma.messagingChannelConnection.findFirst({
      where: {
        organizationId: params.organizationId,
        accountRef: params.accountRef,
        channel: MessageChannel.ZALO,
        providerKind: MessagingProviderKind.ZALO_OA,
      },
      select: { id: true },
    });
    if (connection) {
      try {
        const fresh = await ensureFreshZaloAccessToken(connection.id);
        if (fresh.accessToken) {
          const profile = await fetchZaloUserProfile({
            accessToken: fresh.accessToken,
            userId: params.externalUserId,
          });
          if (profile.displayName || profile.avatarUrl) {
            displayName = pickBetterZaloDisplayName(
              displayName,
              profile.displayName,
              params.externalUserId,
            );
            avatarUrl = avatarUrl || profile.avatarUrl;
            await prisma.messagingContactIdentity.update({
              where: { id: identity.id },
              data: {
                displayName,
                ...(avatarUrl ? { avatarUrl: avatarUrl.slice(0, 2000) } : {}),
                metadata: {
                  ...meta,
                  profileFetchedAt: new Date().toISOString(),
                  profileFetchFailedAt: undefined,
                  profileErrorCode: 0,
                  profileSource: 'zalo_getprofile',
                },
              },
            });
            return { displayName, avatarUrl: avatarUrl || undefined };
          }
          await prisma.messagingContactIdentity.update({
            where: { id: identity.id },
            data: {
              displayName: needsName
                ? formatZaloVisitorFallback(params.externalUserId)
                : displayName,
              metadata: {
                ...meta,
                profileFetchFailedAt: new Date().toISOString(),
                profileErrorCode: profile.errorCode ?? null,
                profileSource: 'zalo_getprofile',
              },
            },
          });
          return {
            displayName: needsName
              ? formatZaloVisitorFallback(params.externalUserId)
              : displayName,
            avatarUrl: avatarUrl || undefined,
          };
        }
      } catch {
        /* keep fallback — không log token */
      }
    }
  }

  const finalName = pickBetterZaloDisplayName(displayName, null, params.externalUserId);
  await prisma.messagingContactIdentity.update({
    where: { id: identity.id },
    data: {
      displayName: finalName,
      ...(avatarUrl ? { avatarUrl } : {}),
      metadata: {
        ...meta,
        profileSource: webhookName ? 'webhook' : meta.profileSource || 'fallback',
      },
    },
  });
  return { displayName: finalName, avatarUrl: avatarUrl || undefined };
}

/**
 * Đưa tin Zalo vào Inbox CSKH (ChatbotConversation + ChatbotMessage).
 * Tenant-scoped qua organizationId + oa accountRef. Không log token.
 */
export async function persistZaloInboxEvent(params: {
  organizationId: string;
  accountRef: string;
  externalUserId: string;
  eventType: string;
  direction: 'inbound' | 'outbound';
  text?: string;
  displayName?: string;
  avatarUrl?: string;
  followStatus?: MessagingFollowStatus;
  providerMessageIds?: string[];
  timestamp: Date;
  identityId: string;
  redis?: Redis;
}): Promise<{ conversationId?: string; messageId?: string; duplicate?: boolean }> {
  if (params.eventType === 'delivery' || params.eventType === 'read') {
    return updateZaloMessageDeliveryStatus(params);
  }

  if (params.eventType !== 'message') {
    if (params.eventType === 'follow' || params.eventType === 'unfollow') {
      await upsertZaloConversationShell(params);
    }
    return {};
  }

  const enriched = params.identityId
    ? await enrichZaloIdentityProfile({
        organizationId: params.organizationId,
        accountRef: params.accountRef,
        identityId: params.identityId,
        externalUserId: params.externalUserId,
        webhookDisplayName: params.displayName,
        webhookAvatarUrl: params.avatarUrl,
      })
    : {
        displayName: pickBetterZaloDisplayName(
          null,
          params.displayName,
          params.externalUserId,
        ),
        avatarUrl: params.avatarUrl,
      };

  const visitorName =
    enriched.displayName || formatZaloVisitorFallback(params.externalUserId);
  const visitorAvatarUrl = (enriched.avatarUrl || params.avatarUrl || '').slice(0, 2000) || null;

  const bot = await resolveZaloInboxBot(params.organizationId, params.accountRef);
  if (!bot) return {};

  const sessionId = `zalo:${params.accountRef}:${params.externalUserId}`.slice(0, 64);
  let conversation = await prisma.chatbotConversation.findFirst({
    where: { organizationId: params.organizationId, sessionId },
  });

  if (!conversation) {
    conversation = await prisma.chatbotConversation.create({
      data: {
        organizationId: params.organizationId,
        botId: bot.id,
        sessionId,
        visitorName,
        visitorAvatarUrl: visitorAvatarUrl || undefined,
        channel: 'zalo',
        channelRef: params.accountRef,
        externalUserId: params.externalUserId,
        status: 'OPEN',
        lastUserMessageAt: params.direction === 'inbound' ? params.timestamp : undefined,
      },
    });
  }

  const externalMessageId = (params.providerMessageIds?.[0] || '').slice(0, 128) || null;
  if (externalMessageId) {
    const byMid = await prisma.chatbotMessage.findFirst({
      where: { conversationId: conversation.id, externalMessageId },
      select: { id: true },
    });
    if (byMid) {
      // Vẫn sync tên/avatar nếu đang yếu
      await maybeUpgradeConversationProfile(conversation.id, visitorName, visitorAvatarUrl);
      return { conversationId: conversation.id, messageId: byMid.id, duplicate: true };
    }
  }

  const text = (params.text || '').slice(0, 2000) || '[message]';
  const isInbound = params.direction === 'inbound';

  let messageId: string;
  try {
    const created = await prisma.chatbotMessage.create({
      data: {
        conversationId: conversation.id,
        role: isInbound ? 'user' : 'assistant',
        message: text,
        status: isInbound ? 'RECEIVED' : 'SENT',
        direction: isInbound ? 'INBOUND' : 'OUTBOUND',
        senderType: isInbound ? 'CUSTOMER' : 'PAGE',
        externalMessageId,
      },
    });
    messageId = created.id;
  } catch (err) {
    if (err instanceof Error && /unique|Unique constraint/i.test(err.message)) {
      return { conversationId: conversation.id, duplicate: true };
    }
    throw err;
  }

  await prisma.chatbotConversation.update({
    where: { id: conversation.id },
    data: {
      visitorName: pickBetterZaloDisplayName(
        conversation.visitorName,
        visitorName,
        params.externalUserId,
      ),
      visitorAvatarUrl: visitorAvatarUrl || conversation.visitorAvatarUrl || undefined,
      lastUserMessageAt: isInbound ? params.timestamp : undefined,
      updatedAt: new Date(),
      status: 'OPEN',
    },
  });

  if (params.identityId) {
    await prisma.messagingContactIdentity.update({
      where: { id: params.identityId },
      data: { chatbotConversationId: conversation.id },
    });
  }

  if (params.redis) {
    await publishRealtime(params.redis, params.organizationId, WS_EVENTS.CHATBOT_MESSAGE_NEW, {
      conversationId: conversation.id,
      channel: 'zalo',
      channelRef: params.accountRef,
      externalUserId: params.externalUserId,
      direction: isInbound ? 'INBOUND' : 'OUTBOUND',
      preview: text.slice(0, 120),
    });
  }

  return { conversationId: conversation.id, messageId };
}

async function maybeUpgradeConversationProfile(
  conversationId: string,
  visitorName: string,
  visitorAvatarUrl: string | null,
) {
  const conv = await prisma.chatbotConversation.findFirst({
    where: { id: conversationId },
    select: { visitorName: true, visitorAvatarUrl: true, externalUserId: true },
  });
  if (!conv) return;
  const nextName = pickBetterZaloDisplayName(
    conv.visitorName,
    visitorName,
    conv.externalUserId,
  );
  const nextAvatar = conv.visitorAvatarUrl || visitorAvatarUrl || null;
  if (nextName === conv.visitorName && nextAvatar === conv.visitorAvatarUrl) return;
  await prisma.chatbotConversation.update({
    where: { id: conversationId },
    data: {
      visitorName: nextName,
      ...(nextAvatar ? { visitorAvatarUrl: nextAvatar } : {}),
    },
  });
}

async function updateZaloMessageDeliveryStatus(params: {
  organizationId: string;
  accountRef: string;
  externalUserId: string;
  eventType: string;
  providerMessageIds?: string[];
  timestamp: Date;
  redis?: Redis;
}): Promise<{ conversationId?: string }> {
  const ids = (params.providerMessageIds || []).map((id) => String(id).slice(0, 128)).filter(Boolean);
  if (!ids.length) return {};

  const status = params.eventType === 'read' ? 'SEEN' : 'DELIVERED';
  const sessionId = `zalo:${params.accountRef}:${params.externalUserId}`.slice(0, 64);
  const conversation = await prisma.chatbotConversation.findFirst({
    where: { organizationId: params.organizationId, sessionId },
    select: { id: true },
  });
  if (!conversation) return {};

  await prisma.chatbotMessage.updateMany({
    where: {
      conversationId: conversation.id,
      externalMessageId: { in: ids },
      direction: 'OUTBOUND',
      OR: [{ status: null }, { status: { in: ['SENT', 'DELIVERED', 'RECEIVED'] } }],
    },
    data: { status },
  });

  if (params.redis) {
    await publishRealtime(params.redis, params.organizationId, WS_EVENTS.CHATBOT_MESSAGE_NEW, {
      conversationId: conversation.id,
      channel: 'zalo',
      channelRef: params.accountRef,
      externalUserId: params.externalUserId,
      direction: 'OUTBOUND',
      preview: status,
    });
  }

  return { conversationId: conversation.id };
}

async function upsertZaloConversationShell(params: {
  organizationId: string;
  accountRef: string;
  externalUserId: string;
  displayName?: string;
  avatarUrl?: string;
  followStatus?: MessagingFollowStatus;
  timestamp: Date;
  identityId: string;
}) {
  const enriched = params.identityId
    ? await enrichZaloIdentityProfile({
        organizationId: params.organizationId,
        accountRef: params.accountRef,
        identityId: params.identityId,
        externalUserId: params.externalUserId,
        webhookDisplayName: params.displayName,
        webhookAvatarUrl: params.avatarUrl,
      })
    : {
        displayName: formatZaloVisitorFallback(params.externalUserId),
        avatarUrl: params.avatarUrl,
      };

  const bot = await resolveZaloInboxBot(params.organizationId, params.accountRef);
  if (!bot) return;

  const sessionId = `zalo:${params.accountRef}:${params.externalUserId}`.slice(0, 64);
  let conversation = await prisma.chatbotConversation.findFirst({
    where: { organizationId: params.organizationId, sessionId },
  });
  const visitorName =
    enriched.displayName || formatZaloVisitorFallback(params.externalUserId);
  if (!conversation) {
    conversation = await prisma.chatbotConversation.create({
      data: {
        organizationId: params.organizationId,
        botId: bot.id,
        sessionId,
        visitorName,
        visitorAvatarUrl: enriched.avatarUrl?.slice(0, 2000) || undefined,
        channel: 'zalo',
        channelRef: params.accountRef,
        externalUserId: params.externalUserId,
        status: 'OPEN',
      },
    });
  } else {
    await maybeUpgradeConversationProfile(
      conversation.id,
      visitorName,
      enriched.avatarUrl || null,
    );
  }

  await prisma.messagingContactIdentity.update({
    where: { id: params.identityId },
    data: {
      chatbotConversationId: conversation.id,
      followStatus: params.followStatus,
    },
  });
}
