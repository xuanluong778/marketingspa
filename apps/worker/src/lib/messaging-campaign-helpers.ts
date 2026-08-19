import {
  MessageChannel,
  MessagingCampaignStatus,
  MessagingConsentStatus,
  MessagingCampaignRecipientStatus,
  Prisma,
  prisma,
  resolveIntegrationScopeKeys,
} from '@marketingspa/database';
import type Redis from 'ioredis';
import {
  WS_EVENTS,
  pickCampaignRenderVariables,
  resolveMessagingDisplayNames,
} from '@marketingspa/shared';
import { publishRealtime } from './realtime';

export type MessagingSegmentConfig = {
  identityIds?: string[];
  customerIds?: string[];
  leadIds?: string[];
  followStatuses?: string[];
  requireOptIn?: boolean;
  excludeSuppressed?: boolean;
  integrationScopeKey?: string;
  tag?: string;
  inactiveDays?: number;
  limit?: number;
};

export async function resolveCampaignIdentities(
  organizationId: string,
  channel: MessageChannel,
  segmentConfig: MessagingSegmentConfig,
  channelConnectionId?: string | null,
) {
  // Sync Facebook chatbot conversations → messaging identities (PSID đã nhắn Fanpage)
  if (channel === 'MESSENGER') {
    let pageId: string | null = null;
    let pageDisplayName: string | null = null;
    let scopeKey = segmentConfig.integrationScopeKey;
    if (!scopeKey && channelConnectionId) {
      const conn = await prisma.messagingChannelConnection.findFirst({
        where: { id: channelConnectionId, organizationId },
      });
      if (conn) {
        pageId = conn.accountRef;
        pageDisplayName = conn.displayName;
        scopeKey = `messenger:${conn.accountRef}`;
      }
    } else if (scopeKey) {
      pageId = scopeKey.split(':')[1] || null;
      if (pageId) {
        const conn = await prisma.messagingChannelConnection.findFirst({
          where: { organizationId, channel: MessageChannel.MESSENGER, accountRef: pageId },
        });
        pageDisplayName = conn?.displayName ?? null;
      }
    }

    if (pageId && scopeKey) {
      const channelRefOr: Prisma.ChatbotConversationWhereInput[] = [
        { channelRef: pageId },
        { sessionId: { startsWith: `fb:${pageId}:` } },
      ];
      if (pageDisplayName?.trim()) {
        channelRefOr.push({ channelRef: pageDisplayName.trim() });
      }

      const chatbotConvs = await prisma.chatbotConversation.findMany({
        where: {
          organizationId,
          channel: 'facebook',
          externalUserId: { not: null },
          OR: channelRefOr,
        },
      });

      for (const conv of chatbotConvs) {
        if (!conv.externalUserId) continue;

        const inboundAt = conv.lastUserMessageAt ?? conv.createdAt;

        if (conv.channelRef !== pageId) {
          await prisma.chatbotConversation.update({
            where: { id: conv.id },
            data: { channelRef: pageId },
          });
        }

        const scopeKeys = resolveIntegrationScopeKeys({
          channel: 'MESSENGER',
          channelAccountRef: pageId,
          integrationScopeKey: scopeKey,
        });
        const existing = await prisma.messagingContactIdentity.findFirst({
          where: {
            organizationId,
            integrationScopeKey: { in: scopeKeys },
            externalUserId: conv.externalUserId,
          },
        });

        if (!existing) {
          await prisma.messagingContactIdentity.create({
            data: {
              organizationId,
              channel: 'MESSENGER',
              integrationScopeKey: scopeKey,
              externalUserId: conv.externalUserId,
              displayName: conv.visitorName || 'Khách Messenger',
              leadId: conv.linkedLeadId,
              lastInboundAt: inboundAt,
              consentStatus: MessagingConsentStatus.OPTED_IN,
              chatbotConversationId: conv.id,
            },
          });
        } else {
          const shouldRefreshInbound =
            inboundAt &&
            (!existing.lastInboundAt || inboundAt.getTime() > existing.lastInboundAt.getTime());
          const canMarkOptIn =
            !existing.optedOut && existing.consentStatus !== MessagingConsentStatus.OPTED_OUT;

          await prisma.messagingContactIdentity.update({
            where: { id: existing.id },
            data: {
              // Chuẩn hóa legacy messenger_page → messenger
              integrationScopeKey: scopeKey,
              chatbotConversationId: existing.chatbotConversationId ?? conv.id,
              ...(shouldRefreshInbound ? { lastInboundAt: inboundAt } : {}),
              ...(canMarkOptIn && existing.consentStatus !== MessagingConsentStatus.OPTED_IN
                ? { consentStatus: MessagingConsentStatus.OPTED_IN }
                : {}),
              ...(!existing.displayName && conv.visitorName
                ? { displayName: conv.visitorName }
                : {}),
              ...(!existing.leadId && conv.linkedLeadId ? { leadId: conv.linkedLeadId } : {}),
            },
          });
        }
      }
    }
  }

  const where: Prisma.MessagingContactIdentityWhereInput = {
    organizationId,
    channel,
    mergedIntoId: null,
  };
  if (segmentConfig.identityIds?.length) where.id = { in: segmentConfig.identityIds };
  if (segmentConfig.customerIds?.length) where.customerId = { in: segmentConfig.customerIds };
  if (segmentConfig.leadIds?.length) where.leadId = { in: segmentConfig.leadIds };
  if (segmentConfig.followStatuses?.length) {
    where.followStatus = { in: segmentConfig.followStatuses as never[] };
  }

  // Khi user chọn sẵn identityIds thì không lọc thêm scope (tránh lệch messenger vs messenger_page).
  if (!segmentConfig.identityIds?.length) {
    let scopeKey = segmentConfig.integrationScopeKey;
    let accountRef: string | null = null;
    if (!scopeKey && channelConnectionId) {
      const conn = await prisma.messagingChannelConnection.findFirst({
        where: { id: channelConnectionId, organizationId },
      });
      if (conn) {
        accountRef = conn.accountRef;
        scopeKey = `${channel.toLowerCase()}:${conn.accountRef}`;
      }
    } else if (scopeKey) {
      accountRef = scopeKey.split(':').slice(1).join(':') || null;
    }

    if (scopeKey) {
      const scopeKeys = resolveIntegrationScopeKeys({
        channel,
        channelAccountRef: accountRef,
        integrationScopeKey: scopeKey,
      });
      where.integrationScopeKey = scopeKeys.length > 1 ? { in: scopeKeys } : scopeKey;
    }
  }

  if (segmentConfig.requireOptIn) {
    where.consentStatus = MessagingConsentStatus.OPTED_IN;
    where.optedOut = false;
    where.isBlocked = false;
  }

  const andClauses: Prisma.MessagingContactIdentityWhereInput[] = [];
  if (segmentConfig.inactiveDays && segmentConfig.inactiveDays > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - segmentConfig.inactiveDays);
    andClauses.push({ OR: [{ lastInboundAt: { lt: cutoff } }, { lastInboundAt: null }] });
  }
  if (segmentConfig.tag?.trim()) {
    const tag = segmentConfig.tag.trim();
    andClauses.push({
      OR: [{ customer: { tags: { has: tag } } }, { lead: { tags: { has: tag } } }],
    });
  }
  if (andClauses.length) where.AND = andClauses;

  return prisma.messagingContactIdentity.findMany({
    where,
    take: segmentConfig.limit ?? 10_000,
    orderBy: { lastInboundAt: 'desc' },
  });
}

export async function filterSuppressedIdentities(
  organizationId: string,
  channel: MessageChannel,
  identities: Awaited<ReturnType<typeof resolveCampaignIdentities>>,
  excludeSuppressed = true,
) {
  if (!excludeSuppressed || identities.length === 0) return identities;

  const identityIds = identities.map((i) => i.id);
  const phones = identities.map((i) => i.phoneNormalized).filter((p): p is string => Boolean(p));
  const externalUserIds = identities.map((i) => i.externalUserId);

  const suppressions = await prisma.messagingSuppression.findMany({
    where: {
      organizationId,
      OR: [
        { identityId: { in: identityIds } },
        ...(phones.length ? [{ phoneNormalized: { in: phones } }] : []),
        ...(externalUserIds.length ? [{ externalUserId: { in: externalUserIds }, channel }] : []),
      ],
    },
  });

  const byIdentity = new Set(suppressions.map((s) => s.identityId).filter(Boolean));
  const byPhone = new Set(suppressions.map((s) => s.phoneNormalized).filter(Boolean));
  const byExternal = new Set(
    suppressions
      .filter((s) => !s.channel || s.channel === channel)
      .map((s) => s.externalUserId)
      .filter(Boolean),
  );

  return identities.filter((identity) => {
    // optedOut/isBlocked → để eligibility đánh OPTED_OUT/SKIPPED (không drop sớm)
    if (byIdentity.has(identity.id)) return false;
    if (identity.phoneNormalized && byPhone.has(identity.phoneNormalized)) return false;
    if (byExternal.has(identity.externalUserId)) return false;
    return true;
  });
}

export async function buildRecipientRenderContext(
  organizationId: string,
  identity: { customerId: string | null; leadId: string | null; displayName: string | null },
  campaignVariables: Record<string, string>,
): Promise<Record<string, string>> {
  // Không spread body/media/full_name từ campaign — tên phải theo từng identity
  const context: Record<string, string> = {
    ...pickCampaignRenderVariables(campaignVariables),
  };

  // Ưu tiên tên Facebook đã sync trên identity (PSID + page scope)
  const fbNames = resolveMessagingDisplayNames(identity.displayName);
  context.full_name = fbNames.full_name;
  context.first_name = fbNames.first_name;
  context.customer_name = fbNames.customer_name;

  if (identity.customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: identity.customerId, organizationId },
      include: { branch: true },
    });
    if (customer) {
      // CRM name chỉ bổ sung khi identity thiếu tên FB thật
      if (fbNames.full_name === 'Anh/chị' && customer.name?.trim()) {
        const crm = resolveMessagingDisplayNames(customer.name);
        context.full_name = crm.full_name;
        context.first_name = crm.first_name;
        context.customer_name = crm.customer_name;
      }
      context.branch_name = customer.branch?.name ?? context.branch_name ?? '';
    }
  } else if (identity.leadId) {
    const lead = await prisma.lead.findFirst({ where: { id: identity.leadId, organizationId } });
    if (lead && fbNames.full_name === 'Anh/chị' && lead.name?.trim()) {
      const crm = resolveMessagingDisplayNames(lead.name);
      context.full_name = crm.full_name;
      context.first_name = crm.first_name;
      context.customer_name = crm.customer_name;
    }
  }

  const latestAppt = await prisma.appointment.findFirst({
    where: {
      organizationId,
      OR: [
        ...(identity.customerId ? [{ customerId: identity.customerId }] : []),
        ...(identity.leadId ? [{ leadId: identity.leadId }] : []),
      ],
    },
    orderBy: { scheduledAt: 'desc' },
    include: { service: true, branch: true },
  });

  if (latestAppt) {
    context.appointment_time = latestAppt.scheduledAt.toLocaleString('vi-VN');
    context.service_name = latestAppt.service?.name ?? context.service_name ?? '';
    context.branch_name = latestAppt.branch?.name ?? context.branch_name ?? '';
  }

  if (!context.branch_name) {
    context.branch_name = 'Chi nhánh gần nhất';
  }
  if (!context.appointment_time) {
    context.appointment_time = 'thời gian đã hẹn';
  }
  if (!context.service_name) {
    context.service_name = 'dịch vụ';
  }

  return context;
}

export async function refreshCampaignAggregates(campaignId: string) {
  const [total, eligible, excluded, queued, sent, delivered, read, replied, failed, optOut, cost] =
    await Promise.all([
      prisma.messagingCampaignRecipient.count({ where: { campaignId } }),
      prisma.messagingCampaignRecipient.count({ where: { campaignId, eligible: true } }),
      prisma.messagingCampaignRecipient.count({ where: { campaignId, eligible: false } }),
      prisma.messagingCampaignRecipient.count({
        where: { campaignId, status: MessagingCampaignRecipientStatus.QUEUED },
      }),
      prisma.messagingCampaignRecipient.count({
        where: {
          campaignId,
          status: {
            in: [
              MessagingCampaignRecipientStatus.SENT,
              MessagingCampaignRecipientStatus.DELIVERED,
              MessagingCampaignRecipientStatus.READ,
              MessagingCampaignRecipientStatus.REPLIED,
            ],
          },
        },
      }),
      prisma.messagingCampaignRecipient.count({
        where: { campaignId, status: MessagingCampaignRecipientStatus.DELIVERED },
      }),
      prisma.messagingCampaignRecipient.count({
        where: { campaignId, status: MessagingCampaignRecipientStatus.READ },
      }),
      prisma.messagingCampaignRecipient.count({
        where: { campaignId, status: MessagingCampaignRecipientStatus.REPLIED },
      }),
      prisma.messagingCampaignRecipient.count({
        where: { campaignId, status: MessagingCampaignRecipientStatus.FAILED },
      }),
      prisma.messagingCampaignRecipient.count({
        where: { campaignId, status: MessagingCampaignRecipientStatus.OPTED_OUT },
      }),
      prisma.messagingCampaignRecipient.aggregate({
        where: { campaignId },
        _sum: { cost: true },
      }),
    ]);

  await prisma.messagingCampaign.update({
    where: { id: campaignId },
    data: {
      totalRecipients: total,
      eligibleCount: eligible,
      excludedCount: excluded,
      queuedCount: queued,
      sentCount: sent,
      deliveredCount: delivered,
      readCount: read,
      repliedCount: replied,
      failedCount: failed,
      optOutCount: optOut,
      actualCost: cost._sum.cost ?? 0,
    },
  });
}

export async function maybeCompleteCampaign(campaignId: string) {
  const campaign = await prisma.messagingCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.status !== MessagingCampaignStatus.RUNNING) return;

  const pending = await prisma.messagingCampaignRecipient.count({
    where: {
      campaignId,
      status: {
        in: [MessagingCampaignRecipientStatus.QUEUED, MessagingCampaignRecipientStatus.PENDING],
      },
    },
  });
  if (pending > 0) return;

  await prisma.messagingCampaign.update({
    where: { id: campaignId },
    data: { status: MessagingCampaignStatus.COMPLETED, completedAt: new Date() },
  });
}

export function isCampaignDispatchable(status: MessagingCampaignStatus): boolean {
  return status === MessagingCampaignStatus.RUNNING;
}

export async function emitCampaignRealtime(
  redis: Redis,
  organizationId: string,
  campaignId: string,
  extra?: Record<string, unknown>,
) {
  const campaign = await prisma.messagingCampaign.findFirst({
    where: { id: campaignId, organizationId },
    select: {
      id: true,
      status: true,
      totalRecipients: true,
      eligibleCount: true,
      excludedCount: true,
      queuedCount: true,
      sentCount: true,
      deliveredCount: true,
      readCount: true,
      repliedCount: true,
      failedCount: true,
      optOutCount: true,
      actualCost: true,
      estimatedCost: true,
    },
  });
  if (!campaign) return;
  await publishRealtime(redis, organizationId, WS_EVENTS.MESSAGING_CAMPAIGN_UPDATE, {
    ...campaign,
    ...extra,
  });
}

export async function emitRecipientRealtime(
  redis: Redis,
  organizationId: string,
  campaignId: string,
  recipientId: string,
  status: string,
) {
  await publishRealtime(redis, organizationId, WS_EVENTS.MESSAGING_CAMPAIGN_RECIPIENT, {
    campaignId,
    recipientId,
    status,
  });
}
