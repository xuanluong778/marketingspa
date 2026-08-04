import {
  MessageChannel,
  MessagingChannelAccountStatus,
  MessagingProviderKind,
  prisma,
} from '@marketingspa/database';
import {
  evaluateMessagingEligibility,
  type MessagingEligibilityResult,
} from '@marketingspa/shared';

export async function checkMessagingEligibilityBeforeSend(params: {
  organizationId: string;
  flowId: string;
  channel: MessageChannel;
  leadId?: string | null;
  customerId?: string | null;
  templateId?: string | null;
}): Promise<MessagingEligibilityResult> {
  const flow = await prisma.automationFlow.findFirst({
    where: { id: params.flowId, organizationId: params.organizationId },
  });

  const identity = params.customerId
    ? await prisma.messagingContactIdentity.findFirst({
        where: {
          organizationId: params.organizationId,
          customerId: params.customerId,
          channel: params.channel,
          mergedIntoId: null,
        },
        orderBy: { lastInboundAt: 'desc' },
      })
    : params.leadId
      ? await prisma.messagingContactIdentity.findFirst({
          where: {
            organizationId: params.organizationId,
            leadId: params.leadId,
            channel: params.channel,
            mergedIntoId: null,
          },
          orderBy: { lastInboundAt: 'desc' },
        })
      : null;

  const connection = await prisma.messagingChannelConnection.findFirst({
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

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const flowSendsToday = flow
    ? await prisma.automationLog.count({
        where: {
          organizationId: params.organizationId,
          automationFlowId: flow.id,
          createdAt: { gte: dayStart },
          status: { in: ['SENT', 'SUCCESS'] },
        },
      })
    : undefined;

  const isZbs = connection?.providerKind === MessagingProviderKind.ZBS_TEMPLATE;
  const estimatedCost = isZbs ? 200 : 0;

  return evaluateMessagingEligibility({
    organizationId: params.organizationId,
    channel: params.channel,
    campaignType: 'automation',
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
    template: params.templateId
      ? {
          id: params.templateId,
          isApproved: true,
          isZbsTemplate: isZbs,
        }
      : undefined,
    quota: {
      broadcastsRemaining: meta.quota?.broadcastsRemaining,
      templatesRemaining: meta.quota?.templatesRemaining,
      flowSendsToday,
      flowDailyLimit: flow?.maxSendsPerDay ?? undefined,
    },
    walletBalance: wallet ? Number(wallet.balance) : 0,
    estimatedCostPerMessage: estimatedCost,
    sendHistory: identity
      ? {
          lastOutboundAt: identity.lastOutboundAt,
          cooldownMinutes: flow?.cooldownMinutes,
        }
      : undefined,
  });
}
