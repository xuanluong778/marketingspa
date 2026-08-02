import { Injectable, NotFoundException } from '@nestjs/common';
import {
  MessageChannel,
  MessagingChannelAccountStatus,
  MessagingProviderKind,
} from '@marketingspa/database';
import {
  evaluateMessagingEligibility,
  type MessagingCampaignType,
  type MessagingEligibilityInput,
  type MessagingEligibilityResult,
  type MessagingProviderMode,
} from '@marketingspa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MessagingProviderRegistry } from './providers/messaging-provider.registry';

export type BuildEligibilityParams = {
  organizationId: string;
  channel: MessageChannel;
  campaignType: MessagingCampaignType;
  identityId?: string;
  externalUserId?: string;
  connectionId?: string;
  accountRef?: string;
  templateId?: string;
  flowId?: string;
  leadId?: string;
  customerId?: string;
  providerModeHint?: MessagingProviderMode;
};

@Injectable()
export class MessagingEligibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: MessagingProviderRegistry,
  ) {}

  evaluate(input: MessagingEligibilityInput): MessagingEligibilityResult {
    return evaluateMessagingEligibility(input);
  }

  /** Kiểm tra eligibility — dùng khi chuẩn bị chiến dịch (API) */
  async check(params: BuildEligibilityParams): Promise<MessagingEligibilityResult> {
    const input = await this.buildInput(params);
    return evaluateMessagingEligibility(input);
  }

  /** Kiểm tra lại ngay trước gửi (worker / engine) */
  async checkBeforeSend(params: BuildEligibilityParams): Promise<MessagingEligibilityResult> {
    return this.check(params);
  }

  async buildInput(params: BuildEligibilityParams): Promise<MessagingEligibilityInput> {
    const identity = await this.resolveIdentity(params);
    const connection = await this.resolveConnection(params);
    const template = params.templateId
      ? await this.prisma.messageTemplate.findFirst({
          where: { id: params.templateId, organizationId: params.organizationId },
        })
      : null;

    const wallet = await this.prisma.creditWallet.findUnique({
      where: { organizationId: params.organizationId },
    });

    const quota = await this.loadQuota(params, identity?.externalUserId);
    const providerKind = connection?.providerKind;
    const estimatedCost = this.estimateCost(params.channel, providerKind, template);

    const triggerConfig = params.flowId
      ? (
          await this.prisma.automationFlow.findFirst({
            where: { id: params.flowId, organizationId: params.organizationId },
            select: { triggerConfig: true, maxSendsPerDay: true, cooldownMinutes: true },
          })
        )?.triggerConfig
      : null;
    const cfg = (triggerConfig ?? {}) as {
      templateApproved?: boolean;
      isUtilityTemplate?: boolean;
      isZbsTemplate?: boolean;
    };

    return {
      organizationId: params.organizationId,
      channel: params.channel as MessagingEligibilityInput['channel'],
      campaignType: params.campaignType,
      providerModeHint: params.providerModeHint,
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
        : params.externalUserId
          ? { externalUserId: params.externalUserId }
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
        : params.accountRef
          ? { accountRef: params.accountRef }
          : undefined,
      template: template
        ? {
            id: template.id,
            isApproved: cfg.templateApproved ?? true,
            isUtility: cfg.isUtilityTemplate ?? false,
            isZbsTemplate:
              cfg.isZbsTemplate ?? connection?.providerKind === MessagingProviderKind.ZBS_TEMPLATE,
          }
        : undefined,
      quota,
      walletBalance: wallet ? Number(wallet.balance) : 0,
      estimatedCostPerMessage: estimatedCost,
      sendHistory: identity
        ? {
            lastOutboundAt: identity.lastOutboundAt,
            cooldownMinutes: quota.cooldownMinutes,
          }
        : undefined,
    };
  }

  private async resolveIdentity(params: BuildEligibilityParams) {
    if (params.identityId) {
      const row = await this.prisma.messagingContactIdentity.findFirst({
        where: { id: params.identityId, organizationId: params.organizationId },
      });
      if (!row) throw new NotFoundException('Identity không tồn tại');
      return row;
    }
    if (params.externalUserId && params.accountRef) {
      const scopeKey = `${params.channel.toLowerCase()}:${params.accountRef}`;
      return this.prisma.messagingContactIdentity.findFirst({
        where: {
          organizationId: params.organizationId,
          externalUserId: params.externalUserId,
          integrationScopeKey: scopeKey,
        },
      });
    }
    if (params.customerId) {
      return this.prisma.messagingContactIdentity.findFirst({
        where: {
          organizationId: params.organizationId,
          customerId: params.customerId,
          channel: params.channel,
          mergedIntoId: null,
        },
        orderBy: { lastInboundAt: 'desc' },
      });
    }
    if (params.leadId) {
      return this.prisma.messagingContactIdentity.findFirst({
        where: {
          organizationId: params.organizationId,
          leadId: params.leadId,
          channel: params.channel,
          mergedIntoId: null,
        },
        orderBy: { lastInboundAt: 'desc' },
      });
    }
    return null;
  }

  private async resolveConnection(params: BuildEligibilityParams) {
    if (params.connectionId) {
      return this.prisma.messagingChannelConnection.findFirst({
        where: { id: params.connectionId, organizationId: params.organizationId },
      });
    }
    if (params.accountRef) {
      return this.prisma.messagingChannelConnection.findFirst({
        where: {
          organizationId: params.organizationId,
          channel: params.channel,
          accountRef: params.accountRef,
        },
      });
    }
    return this.prisma.messagingChannelConnection.findFirst({
      where: {
        organizationId: params.organizationId,
        channel: params.channel,
        status: MessagingChannelAccountStatus.ACTIVE,
        isPaused: false,
      },
      orderBy: { lastSyncedAt: 'desc' },
    });
  }

  private async loadQuota(
    params: BuildEligibilityParams,
    externalUserId?: string,
  ): Promise<MessagingEligibilityInput['quota'] & { cooldownMinutes?: number }> {
    const flow = params.flowId
      ? await this.prisma.automationFlow.findFirst({
          where: { id: params.flowId, organizationId: params.organizationId },
        })
      : null;

    const connection = await this.resolveConnection(params);
    const meta = (connection?.metadata ?? {}) as {
      quota?: {
        broadcastsRemaining?: number;
        templatesRemaining?: number;
        dailyRecipientLimit?: number;
      };
    };

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    let flowSendsToday: number | undefined;
    if (flow) {
      flowSendsToday = await this.prisma.automationLog.count({
        where: {
          organizationId: params.organizationId,
          automationFlowId: flow.id,
          createdAt: { gte: dayStart },
          status: { in: ['SENT', 'SUCCESS'] },
        },
      });
    }

    let sendsTodayToRecipient: number | undefined;
    if (externalUserId && flow) {
      sendsTodayToRecipient = await this.prisma.automationLog.count({
        where: {
          organizationId: params.organizationId,
          automationFlowId: flow.id,
          createdAt: { gte: dayStart },
          status: { in: ['SENT', 'SUCCESS'] },
          OR: [{ leadId: params.leadId ?? undefined }, { customerId: params.customerId ?? undefined }],
        },
      });
    }

    return {
      broadcastsRemaining: meta.quota?.broadcastsRemaining,
      templatesRemaining: meta.quota?.templatesRemaining,
      dailyRecipientLimit: meta.quota?.dailyRecipientLimit,
      sendsTodayToRecipient,
      flowSendsToday,
      flowDailyLimit: flow?.maxSendsPerDay ?? undefined,
      cooldownMinutes: flow?.cooldownMinutes,
    };
  }

  private estimateCost(
    channel: MessageChannel,
    providerKind?: MessagingProviderKind,
    template?: { channel: MessageChannel } | null,
  ): number {
    if (providerKind === MessagingProviderKind.ZBS_TEMPLATE) {
      return this.providers.get(MessagingProviderKind.ZBS_TEMPLATE).estimateCost({
        to: '',
        templateId: 'estimate',
      });
    }
    if (channel === MessageChannel.ZALO) return 0;
    return 0;
  }
}
