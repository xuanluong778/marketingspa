import { Injectable } from '@nestjs/common';
import { MessageChannel, MessagingConsentStatus, Prisma } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import type {
  MessagingSegmentConfig,
  MessagingSegmentIdentityPreview,
  MessagingSegmentPreviewResult,
} from './messaging-campaign.types';

@Injectable()
export class MessagingCampaignSegmentService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(
    organizationId: string,
    channel: MessageChannel,
    segmentConfig: MessagingSegmentConfig,
    channelConnectionId?: string | null,
  ): Promise<MessagingSegmentPreviewResult> {
    const identities = await this.resolveIdentities(
      organizationId,
      channel,
      segmentConfig,
      channelConnectionId,
    );
    const suppressedSet = await this.loadSuppressedKeys(organizationId, channel, identities);

    const sample: MessagingSegmentIdentityPreview[] = [];
    let suppressed = 0;

    for (const identity of identities) {
      const suppressionReason = this.resolveSuppressionReason(identity, suppressedSet);
      const isSuppressed = Boolean(suppressionReason);
      if (isSuppressed) suppressed += 1;

      if (sample.length < 50) {
        sample.push({
          id: identity.id,
          externalUserId: identity.externalUserId,
          displayName: identity.displayName,
          customerId: identity.customerId,
          leadId: identity.leadId,
          phoneNormalized: identity.phoneNormalized,
          followStatus: identity.followStatus,
          consentStatus: identity.consentStatus,
          optedOut: identity.optedOut,
          isBlocked: identity.isBlocked,
          suppressed: isSuppressed,
          suppressionReason,
        });
      }
    }

    return {
      total: identities.length,
      suppressed,
      sample,
      identityIds: identities.map((i) => i.id),
    };
  }

  async resolveIdentities(
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
        const conn = await this.prisma.messagingChannelConnection.findFirst({
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
          const conn = await this.prisma.messagingChannelConnection.findFirst({
            where: { organizationId, channel: 'MESSENGER', accountRef: pageId },
          });
          pageDisplayName = conn?.displayName ?? null;
        }
      }

      if (pageId && scopeKey) {
        // Khớp pageId, sessionId chuẩn fb:{pageId}:{psid}, và channelRef cũ nhầm = pageName
        const channelRefOr: Prisma.ChatbotConversationWhereInput[] = [
          { channelRef: pageId },
          { sessionId: { startsWith: `fb:${pageId}:` } },
        ];
        if (pageDisplayName?.trim()) {
          channelRefOr.push({ channelRef: pageDisplayName.trim() });
        }

        const chatbotConvs = await this.prisma.chatbotConversation.findMany({
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

          // Chuẩn hóa channelRef về pageId nếu dữ liệu cũ lưu nhầm pageName
          if (conv.channelRef !== pageId) {
            await this.prisma.chatbotConversation.update({
              where: { id: conv.id },
              data: { channelRef: pageId },
            });
          }

          const existing = await this.prisma.messagingContactIdentity.findFirst({
            where: {
              organizationId,
              integrationScopeKey: scopeKey,
              externalUserId: conv.externalUserId,
            },
          });

          if (!existing) {
            await this.prisma.messagingContactIdentity.create({
              data: {
                organizationId,
                channel: 'MESSENGER',
                integrationScopeKey: scopeKey,
                externalUserId: conv.externalUserId,
                displayName: conv.visitorName || 'Khách Messenger',
                leadId: conv.linkedLeadId,
                lastInboundAt: inboundAt,
                // Khách đã nhắn Fanpage = đồng ý nhận tin trong cửa sổ Messenger
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

            await this.prisma.messagingContactIdentity.update({
              where: { id: existing.id },
              data: {
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

    if (segmentConfig.identityIds?.length) {
      where.id = { in: segmentConfig.identityIds };
    }
    if (segmentConfig.customerIds?.length) {
      where.customerId = { in: segmentConfig.customerIds };
    }
    if (segmentConfig.leadIds?.length) {
      where.leadId = { in: segmentConfig.leadIds };
    }
    if (segmentConfig.followStatuses?.length) {
      where.followStatus = { in: segmentConfig.followStatuses };
    }

    let scopeKey = segmentConfig.integrationScopeKey;
    if (!scopeKey && channelConnectionId) {
      const conn = await this.prisma.messagingChannelConnection.findFirst({
        where: { id: channelConnectionId, organizationId },
      });
      if (conn) {
        scopeKey = `${channel.toLowerCase()}:${conn.accountRef}`;
      }
    }

    if (scopeKey) {
      where.integrationScopeKey = scopeKey;
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
    if (andClauses.length) {
      where.AND = andClauses;
    }

    return this.prisma.messagingContactIdentity.findMany({
      where,
      take: segmentConfig.limit ?? 10_000,
      orderBy: { lastInboundAt: 'desc' },
    });
  }

  async filterOutSuppressed(
    organizationId: string,
    channel: MessageChannel,
    identities: Awaited<ReturnType<typeof this.resolveIdentities>>,
    excludeSuppressed = true,
  ) {
    if (!excludeSuppressed) return identities;
    const suppressedSet = await this.loadSuppressedKeys(organizationId, channel, identities);
    return identities.filter((identity) => !this.resolveSuppressionReason(identity, suppressedSet));
  }

  private async loadSuppressedKeys(
    organizationId: string,
    channel: MessageChannel,
    identities: Awaited<ReturnType<typeof this.resolveIdentities>>,
  ) {
    const identityIds = identities.map((i) => i.id);
    const phones = identities.map((i) => i.phoneNormalized).filter((p): p is string => Boolean(p));
    const externalUserIds = identities.map((i) => i.externalUserId);

    const suppressions = await this.prisma.messagingSuppression.findMany({
      where: {
        organizationId,
        OR: [
          { identityId: { in: identityIds } },
          ...(phones.length ? [{ phoneNormalized: { in: phones } }] : []),
          ...(externalUserIds.length ? [{ externalUserId: { in: externalUserIds }, channel }] : []),
        ],
      },
    });

    const byIdentity = new Set<string>();
    const byPhone = new Set<string>();
    const byExternal = new Set<string>();
    const reasons = new Map<string, string>();

    for (const s of suppressions) {
      if (s.identityId) {
        byIdentity.add(s.identityId);
        reasons.set(`id:${s.identityId}`, s.reason);
      }
      if (s.phoneNormalized) {
        byPhone.add(s.phoneNormalized);
        reasons.set(`phone:${s.phoneNormalized}`, s.reason);
      }
      if (s.externalUserId && (!s.channel || s.channel === channel)) {
        byExternal.add(s.externalUserId);
        reasons.set(`ext:${s.externalUserId}`, s.reason);
      }
    }

    return { byIdentity, byPhone, byExternal, reasons };
  }

  private resolveSuppressionReason(
    identity: Awaited<ReturnType<typeof this.resolveIdentities>>[number],
    suppressedSet: Awaited<ReturnType<typeof this.loadSuppressedKeys>>,
  ): string | undefined {
    if (identity.optedOut || identity.isBlocked) {
      return identity.optedOut ? 'OPTED_OUT' : 'BLOCKED';
    }
    if (suppressedSet.byIdentity.has(identity.id)) {
      return suppressedSet.reasons.get(`id:${identity.id}`);
    }
    if (identity.phoneNormalized && suppressedSet.byPhone.has(identity.phoneNormalized)) {
      return suppressedSet.reasons.get(`phone:${identity.phoneNormalized}`);
    }
    if (suppressedSet.byExternal.has(identity.externalUserId)) {
      return suppressedSet.reasons.get(`ext:${identity.externalUserId}`);
    }
    return undefined;
  }
}
