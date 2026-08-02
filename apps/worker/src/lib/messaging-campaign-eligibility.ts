import {
  MessageChannel,
  MessagingCampaignRecipientStatus,
  MessagingChannelAccountStatus,
  MessagingConsentStatus,
  MessagingProviderKind,
  MessagingSuppressionReason,
  prisma,
} from '@marketingspa/database';
import {
  evaluateMessagingEligibility,
  mapCampaignKindToEligibilityType,
  type MessagingEligibilityResult,
} from '@marketingspa/shared';

export type OrgPolicySnapshot = {
  timezone: string;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  maxMessagesPerRecipientPerDay: number;
  campaignCooldownMinutes: number;
  channelRateLimits: Record<string, number>;
  excludeRecentlyManualMessaged: boolean;
  manualMessageLookbackMinutes: number;
  stopOnReply: boolean;
  stopOnOptOut: boolean;
  createTaskOnReply: boolean;
  assignEmployeeOnReply: boolean;
  handoverToChatbotOnReply: boolean;
  optOutKeywords: string[];
};

export const DEFAULT_ORG_POLICY: OrgPolicySnapshot = {
  timezone: 'Asia/Ho_Chi_Minh',
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  maxMessagesPerRecipientPerDay: 3,
  campaignCooldownMinutes: 1440,
  channelRateLimits: {},
  excludeRecentlyManualMessaged: true,
  manualMessageLookbackMinutes: 60,
  stopOnReply: true,
  stopOnOptOut: true,
  createTaskOnReply: true,
  assignEmployeeOnReply: false,
  handoverToChatbotOnReply: true,
  optOutKeywords: ['STOP', 'DUNG', 'HUY', 'UNSUBSCRIBE', 'OPT OUT'],
};

export async function getOrgMessagingPolicy(organizationId: string): Promise<OrgPolicySnapshot> {
  const row = await prisma.messagingOrgPolicy.findUnique({ where: { organizationId } });
  if (!row) return { ...DEFAULT_ORG_POLICY };
  return {
    timezone: row.timezone || DEFAULT_ORG_POLICY.timezone,
    quietHoursStart: row.quietHoursStart,
    quietHoursEnd: row.quietHoursEnd,
    maxMessagesPerRecipientPerDay: row.maxMessagesPerRecipientPerDay,
    campaignCooldownMinutes: row.campaignCooldownMinutes,
    channelRateLimits: (row.channelRateLimits as Record<string, number>) ?? {},
    excludeRecentlyManualMessaged: row.excludeRecentlyManualMessaged,
    manualMessageLookbackMinutes: row.manualMessageLookbackMinutes,
    stopOnReply: row.stopOnReply,
    stopOnOptOut: row.stopOnOptOut,
    createTaskOnReply: row.createTaskOnReply,
    assignEmployeeOnReply: row.assignEmployeeOnReply,
    handoverToChatbotOnReply: row.handoverToChatbotOnReply,
    optOutKeywords: Array.isArray(row.optOutKeywords)
      ? (row.optOutKeywords as string[])
      : DEFAULT_ORG_POLICY.optOutKeywords,
  };
}

export async function checkCampaignRecipientEligibility(params: {
  organizationId: string;
  campaignId: string;
  channel: MessageChannel;
  campaignType: string;
  identityId: string;
  channelConnectionId?: string | null;
  messageTemplateId?: string | null;
  customerId?: string | null;
  leadId?: string | null;
  /** Bỏ qua quiet hours check ở eligibility (worker tự reschedule) — vẫn trả QUIET_HOURS nếu muốn */
  includeQuietHours?: boolean;
}): Promise<MessagingEligibilityResult> {
  const policy = await getOrgMessagingPolicy(params.organizationId);

  const identity = await prisma.messagingContactIdentity.findFirst({
    where: {
      id: params.identityId,
      organizationId: params.organizationId,
      mergedIntoId: null,
    },
  });

  const connection = params.channelConnectionId
    ? await prisma.messagingChannelConnection.findFirst({
        where: { id: params.channelConnectionId, organizationId: params.organizationId },
      })
    : await prisma.messagingChannelConnection.findFirst({
        where: {
          organizationId: params.organizationId,
          channel: params.channel,
          status: MessagingChannelAccountStatus.ACTIVE,
          isPaused: false,
        },
        orderBy: { lastSyncedAt: 'desc' },
      });

  const wallet = await prisma.creditWallet.findUnique({
    where: { organizationId: params.organizationId },
  });

  const meta = (connection?.metadata ?? {}) as {
    quota?: { broadcastsRemaining?: number; templatesRemaining?: number };
  };

  const isZbs = connection?.providerKind === MessagingProviderKind.ZBS_TEMPLATE;
  const estimatedCost = isZbs ? 200 : 0;

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const sendsTodayToRecipient = identity
    ? await prisma.messagingCampaignRecipient.count({
        where: {
          organizationId: params.organizationId,
          identityId: identity.id,
          sentAt: { gte: dayStart },
          status: {
            in: [
              MessagingCampaignRecipientStatus.SENT,
              MessagingCampaignRecipientStatus.DELIVERED,
              MessagingCampaignRecipientStatus.READ,
              MessagingCampaignRecipientStatus.REPLIED,
            ],
          },
        },
      })
    : 0;

  let recentlyManualMessaged = false;
  if (policy.excludeRecentlyManualMessaged && identity) {
    const since = new Date(Date.now() - policy.manualMessageLookbackMinutes * 60_000);
    // Manual = outbound trên identity không gắn campaign recipient trong cửa sổ
    if (identity.lastOutboundAt && identity.lastOutboundAt >= since) {
      const campaignSend = await prisma.messagingCampaignRecipient.findFirst({
        where: {
          identityId: identity.id,
          sentAt: { gte: since },
          status: {
            in: [
              MessagingCampaignRecipientStatus.SENT,
              MessagingCampaignRecipientStatus.DELIVERED,
              MessagingCampaignRecipientStatus.READ,
              MessagingCampaignRecipientStatus.REPLIED,
            ],
          },
        },
      });
      recentlyManualMessaged = !campaignSend;
    }
  }

  let campaignCooldownUntil: Date | null = null;
  if (policy.campaignCooldownMinutes > 0 && identity) {
    const lastOther = await prisma.messagingCampaignRecipient.findFirst({
      where: {
        identityId: identity.id,
        campaignId: { not: params.campaignId },
        sentAt: { not: null },
        status: {
          in: [
            MessagingCampaignRecipientStatus.SENT,
            MessagingCampaignRecipientStatus.DELIVERED,
            MessagingCampaignRecipientStatus.READ,
            MessagingCampaignRecipientStatus.REPLIED,
          ],
        },
      },
      orderBy: { sentAt: 'desc' },
    });
    if (lastOther?.sentAt) {
      const until = new Date(lastOther.sentAt.getTime() + policy.campaignCooldownMinutes * 60_000);
      if (until.getTime() > Date.now()) campaignCooldownUntil = until;
    }
  }

  const template = params.messageTemplateId
    ? await prisma.messageTemplate.findFirst({
        where: { id: params.messageTemplateId, organizationId: params.organizationId },
      })
    : null;

  return evaluateMessagingEligibility({
    organizationId: params.organizationId,
    channel: params.channel,
    campaignType: mapCampaignKindToEligibilityType(params.campaignType),
    identity: identity
      ? {
          id: identity.id,
          externalUserId: identity.externalUserId,
          integrationScopeKey: identity.integrationScopeKey,
          lastInboundAt: identity.lastInboundAt,
          consentStatus: identity.consentStatus,
          followStatus: identity.followStatus,
          isBlocked: identity.isBlocked,
          optedOut: identity.optedOut,
        }
      : undefined,
    connection: connection
      ? {
          id: connection.id,
          accountRef: connection.accountRef,
          status: connection.status,
          isPaused: connection.isPaused,
          permissions: (connection.permissions as string[]) ?? [],
          providerKind: connection.providerKind,
          tokenExpiresAt: connection.tokenExpiresAt,
        }
      : undefined,
    template: template
      ? {
          id: template.id,
          isApproved: template.approvalStatus === 'APPROVED' || template.approvalStatus === 'DRAFT',
          isZbsTemplate: isZbs || template.providerMode === 'ZBS_TEMPLATE',
          isUtility: template.providerMode === 'MESSENGER_UTILITY',
        }
      : undefined,
    quota: {
      broadcastsRemaining: meta.quota?.broadcastsRemaining,
      templatesRemaining: meta.quota?.templatesRemaining,
      dailyRecipientLimit: policy.maxMessagesPerRecipientPerDay,
      sendsTodayToRecipient,
    },
    walletBalance: wallet ? Number(wallet.balance) : 0,
    estimatedCostPerMessage: estimatedCost,
    sendHistory: {
      lastOutboundAt: identity?.lastOutboundAt,
      cooldownMinutes: 0,
      recentlyManualMessaged,
      campaignCooldownUntil,
    },
    quietHours:
      params.includeQuietHours !== false
        ? {
            start: policy.quietHoursStart,
            end: policy.quietHoursEnd,
            timeZone: policy.timezone,
          }
        : undefined,
  });
}

export async function cancelPendingForIdentity(params: {
  organizationId: string;
  identityId: string;
  reason: string;
  onlyCampaignId?: string;
}) {
  const where = {
    organizationId: params.organizationId,
    identityId: params.identityId,
    status: {
      in: [MessagingCampaignRecipientStatus.QUEUED, MessagingCampaignRecipientStatus.PENDING],
    },
    ...(params.onlyCampaignId ? { campaignId: params.onlyCampaignId } : {}),
  };
  const result = await prisma.messagingCampaignRecipient.updateMany({
    where,
    data: {
      status: MessagingCampaignRecipientStatus.SKIPPED,
      exclusionReason: params.reason,
      lastError: params.reason,
    },
  });
  return result.count;
}

export async function applyOptOut(params: {
  organizationId: string;
  identityId: string;
  channel: MessageChannel;
  externalUserId: string;
  phoneNormalized?: string | null;
  note?: string;
}) {
  await prisma.messagingContactIdentity.update({
    where: { id: params.identityId },
    data: {
      optedOut: true,
      consentStatus: MessagingConsentStatus.OPTED_OUT,
    },
  });

  await prisma.messagingSuppression.create({
    data: {
      organizationId: params.organizationId,
      channel: params.channel,
      identityId: params.identityId,
      externalUserId: params.externalUserId,
      phoneNormalized: params.phoneNormalized ?? undefined,
      reason: MessagingSuppressionReason.OPTED_OUT,
      note: params.note ?? 'Opt-out từ tin nhắn khách',
    },
  });

  await cancelPendingForIdentity({
    organizationId: params.organizationId,
    identityId: params.identityId,
    reason: 'OPTED_OUT',
  });
}
