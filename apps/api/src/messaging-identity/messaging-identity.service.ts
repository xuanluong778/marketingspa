import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  MessageChannel,
  MessagingIdentityLinkSource,
  Prisma,
} from '@marketingspa/database';
import {
  buildIntegrationScopeKey,
  normalizeMessagingPhone,
  resolveIntegrationScopeKeys,
} from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { TenantOwnershipService } from '../common/services/tenant-ownership.service';
import { AuditService } from '../audit/audit.service';
import { maskExternalId } from '../common/utils/token-security.util';
import { MessagingEligibilityService } from '../messaging/messaging-eligibility.service';
import { buildPaginatedResult, getPaginationParams } from '../common/utils/pagination.util';
import type {
  LinkIdentityDto,
  MergeIdentitiesDto,
  MessagingIdentityQueryDto,
  UpsertMessagingIdentityDto,
} from './dto/messaging-identity.dto';

type IdentitySnapshot = Record<string, unknown>;

@Injectable()
export class MessagingIdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantOwnershipService,
    private readonly audit: AuditService,
    @Inject(forwardRef(() => MessagingEligibilityService))
    private readonly eligibility: MessagingEligibilityService,
  ) {}

  async list(organizationId: string, query: MessagingIdentityQueryDto) {
    const { page, pageSize, skip, take } = getPaginationParams(query);

    let integrationScopeKeys: string[] | undefined;
    if (query.connectionId) {
      const conn = await this.prisma.messagingChannelConnection.findFirst({
        where: { id: query.connectionId, organizationId },
      });
      if (conn) {
        integrationScopeKeys = resolveIntegrationScopeKeys({
          channel: conn.channel,
          channelAccountRef: conn.accountRef,
        });
      }
    } else if (query.integrationScopeKey) {
      integrationScopeKeys = resolveIntegrationScopeKeys({
        channel: query.channel || 'MESSENGER',
        integrationScopeKey: query.integrationScopeKey,
        channelAccountRef: query.integrationScopeKey.split(':').slice(1).join(':') || null,
      });
    }

    const where: Prisma.MessagingContactIdentityWhereInput = {
      organizationId,
      ...(query.channel && { channel: query.channel }),
      ...(query.customerId && { customerId: query.customerId }),
      ...(query.leadId && { leadId: query.leadId }),
      ...(!query.includeMerged && { mergedIntoId: null }),
      ...(integrationScopeKeys?.length === 1 && { integrationScopeKey: integrationScopeKeys[0] }),
      ...(integrationScopeKeys &&
        integrationScopeKeys.length > 1 && { integrationScopeKey: { in: integrationScopeKeys } }),
      ...(query.consentStatus && { consentStatus: query.consentStatus }),
      ...(query.followStatus && { followStatus: query.followStatus }),
    };

    const andClauses: Prisma.MessagingContactIdentityWhereInput[] = [];

    if (query.search) {
      andClauses.push({
        OR: [
          { displayName: { contains: query.search, mode: 'insensitive' } },
          { phoneNormalized: { contains: query.search.replace(/\D/g, '') } },
          { externalUserId: { contains: query.search } },
        ],
      });
    }
    if (query.inactiveDays) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - query.inactiveDays);
      andClauses.push({ OR: [{ lastInboundAt: { lt: cutoff } }, { lastInboundAt: null }] });
    }
    if (query.tag) {
      andClauses.push({
        OR: [
          { customer: { tags: { has: query.tag } } },
          { lead: { tags: { has: query.tag } } },
        ],
      });
    }
    if (query.hasAppointment) {
      andClauses.push({
        OR: [
          { customer: { appointments: { some: {} } } },
          { lead: { appointments: { some: {} } } },
        ],
      });
    }
    if (query.hasOrder) {
      andClauses.push({
        OR: [{ customer: { orders: { some: {} } } }, { lead: { orders: { some: {} } } }],
      });
    }
    if (andClauses.length) where.AND = andClauses;

    if (query.lastInboundFrom || query.lastInboundTo) {
      where.lastInboundAt = {
        ...(query.lastInboundFrom && { gte: new Date(query.lastInboundFrom) }),
        ...(query.lastInboundTo && { lte: new Date(query.lastInboundTo) }),
      };
    }
    if (query.linkedType === 'customer') where.customerId = { not: null };
    if (query.linkedType === 'lead') where.leadId = { not: null };
    if (query.linkedType === 'unlinked') {
      where.customerId = null;
      where.leadId = null;
    }
    if (query.stageId) {
      where.lead = { stageId: query.stageId };
    }
    if (query.pipelineStatus) {
      where.lead = { pipelineStatus: query.pipelineStatus };
    }

    const [rows, total] = await Promise.all([
      this.prisma.messagingContactIdentity.findMany({
        where,
        skip,
        take,
        orderBy: { lastInboundAt: 'desc' },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              tags: true,
              branch: { select: { id: true, name: true } },
              assignedEmployee: { select: { id: true, name: true } },
            },
          },
          lead: {
            select: {
              id: true,
              name: true,
              phone: true,
              tags: true,
              pipelineStatus: true,
              branch: { select: { id: true, name: true } },
              assignedTo: { select: { id: true, name: true } },
              stage: { select: { id: true, name: true } },
            },
          },
          integration: { select: { id: true, provider: true, status: true } },
        },
      }),
      this.prisma.messagingContactIdentity.count({ where }),
    ]);

    const items = await Promise.all(
      rows.map(async (row) => {
        const accountRef = row.integrationScopeKey.includes(':')
          ? row.integrationScopeKey.split(':').slice(1).join(':')
          : row.integrationScopeKey;
        const base = {
          ...row,
          externalUserId: maskExternalId(row.externalUserId),
          externalUserIdRaw: undefined,
          accountRef,
          eligibility: null as Awaited<ReturnType<MessagingEligibilityService['check']>> | null,
        };
        if (query.connectionId && query.campaignType && query.channel) {
          base.eligibility = await this.eligibility.check({
            organizationId,
            channel: query.channel,
            campaignType: query.campaignType,
            identityId: row.id,
            connectionId: query.connectionId,
            templateId: query.templateId,
            leadId: row.leadId ?? undefined,
            customerId: row.customerId ?? undefined,
          });
        }
        return base;
      }),
    );

    return buildPaginatedResult(items, total, page, pageSize);
  }

  async findOne(organizationId: string, id: string) {
    const row = await this.prisma.messagingContactIdentity.findFirst({
      where: { id, organizationId },
      include: {
        customer: true,
        lead: true,
        integration: true,
        mergedFrom: { where: { mergedIntoId: id } },
      },
    });
    if (!row) throw new NotFoundException('Identity không tồn tại');
    return row;
  }

  /** Upsert từ webhook Messenger / Zalo — không tự gộp theo tên */
  async upsert(organizationId: string, dto: UpsertMessagingIdentityDto, userId?: string) {
    if (dto.integrationId) {
      await this.tenant.assertIntegration(organizationId, dto.integrationId);
    }
    if (dto.chatbotConversationId) {
      const conv = await this.prisma.chatbotConversation.findFirst({
        where: { id: dto.chatbotConversationId, organizationId },
      });
      if (!conv) throw new NotFoundException('Hội thoại chatbot không tồn tại');
    }

    const integrationScopeKey = buildIntegrationScopeKey({
      integrationId: dto.integrationId,
      channel: dto.channel,
      channelAccountRef: dto.channelAccountRef,
    });

    const phoneNormalized = normalizeMessagingPhone(dto.phone);
    const now = new Date();
    const direction = dto.metadata?.direction as string | undefined;

    const existing = await this.prisma.messagingContactIdentity.findFirst({
      where: {
        organizationId,
        integrationScopeKey,
        externalUserId: dto.externalUserId,
      },
    });

    const phoneVerifiedAt =
      dto.phoneVerified && phoneNormalized
        ? existing?.phoneVerifiedAt ?? now
        : existing?.phoneVerifiedAt;

    if (existing) {
      const identity = await this.prisma.messagingContactIdentity.update({
        where: { id: existing.id },
        data: {
          externalConversationId:
            dto.externalConversationId ?? existing.externalConversationId,
          displayName: dto.displayName ?? existing.displayName,
          avatarUrl: dto.avatarUrl ?? existing.avatarUrl,
          phoneRaw: dto.phone ?? existing.phoneRaw,
          phoneNormalized: phoneNormalized ?? existing.phoneNormalized,
          phoneVerifiedAt,
          followStatus: dto.followStatus ?? existing.followStatus,
          consentStatus: dto.consentStatus ?? existing.consentStatus,
          isBlocked: dto.isBlocked ?? existing.isBlocked,
          optedOut: dto.optedOut ?? existing.optedOut,
          chatbotConversationId:
            dto.chatbotConversationId ?? existing.chatbotConversationId,
          metadata: dto.metadata
            ? ({ ...((existing.metadata as object) ?? {}), ...dto.metadata } as Prisma.InputJsonValue)
            : undefined,
          lastInboundAt: direction === 'inbound' ? now : existing.lastInboundAt,
          lastOutboundAt: direction === 'outbound' ? now : existing.lastOutboundAt,
        },
      });

      await this.audit.log({
        organizationId,
        userId,
        action: 'MESSAGING_IDENTITY_UPDATED',
        entityType: 'MESSAGING_IDENTITY',
        entityId: identity.id,
        metadata: {
          channel: dto.channel,
          externalUserId: dto.externalUserId,
          integrationScopeKey,
        },
      });

      return identity;
    }

    const identity = await this.prisma.messagingContactIdentity.create({
      data: {
        organizationId,
        channel: dto.channel,
        integrationId: dto.integrationId,
        integrationScopeKey,
        externalUserId: dto.externalUserId,
        externalConversationId: dto.externalConversationId,
        displayName: dto.displayName,
        avatarUrl: dto.avatarUrl,
        phoneRaw: dto.phone,
        phoneNormalized,
        phoneVerifiedAt,
        followStatus: dto.followStatus,
        consentStatus: dto.consentStatus,
        isBlocked: dto.isBlocked ?? false,
        optedOut: dto.optedOut ?? false,
        chatbotConversationId: dto.chatbotConversationId,
        metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
        lastInboundAt: direction === 'inbound' ? now : undefined,
        lastOutboundAt: direction === 'outbound' ? now : undefined,
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'MESSAGING_IDENTITY_CREATED',
      entityType: 'MESSAGING_IDENTITY',
      entityId: identity.id,
      metadata: {
        channel: dto.channel,
        externalUserId: dto.externalUserId,
        integrationScopeKey,
      },
    });

    return identity;
  }

  /** Liên kết thủ công theo Customer/Lead ID — không theo tên */
  async linkManual(
    organizationId: string,
    identityId: string,
    dto: LinkIdentityDto,
    userId?: string,
  ) {
    if (!dto.customerId && !dto.leadId) {
      throw new BadRequestException('Cần customerId hoặc leadId');
    }
    const identity = await this.findOne(organizationId, identityId);
    if (identity.mergedIntoId) {
      throw new BadRequestException('Identity đã được gộp vào identity khác');
    }

    if (dto.customerId) {
      await this.tenant.assertCustomer(organizationId, dto.customerId);
    }
    if (dto.leadId) {
      await this.tenant.assertLead(organizationId, dto.leadId);
    }

    const updated = await this.prisma.messagingContactIdentity.update({
      where: { id: identityId },
      data: {
        customerId: dto.customerId ?? identity.customerId,
        leadId: dto.leadId ?? identity.leadId,
        linkSource:
          dto.customerId && dto.leadId
            ? MessagingIdentityLinkSource.MANUAL
            : dto.customerId
              ? MessagingIdentityLinkSource.CUSTOMER_ID
              : MessagingIdentityLinkSource.LEAD_ID,
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'MESSAGING_IDENTITY_LINKED',
      entityType: 'MESSAGING_IDENTITY',
      entityId: identityId,
      metadata: { customerId: dto.customerId, leadId: dto.leadId },
    });

    return updated;
  }

  /** Liên kết theo SĐT đã xác minh — không auto theo tên */
  async linkByVerifiedPhone(organizationId: string, identityId: string, userId?: string) {
    const identity = await this.findOne(organizationId, identityId);
    if (!identity.phoneVerifiedAt || !identity.phoneNormalized) {
      throw new BadRequestException('SĐT chưa được xác minh trên identity này');
    }
    if (identity.mergedIntoId) {
      throw new BadRequestException('Identity đã được gộp');
    }

    const phone = identity.phoneNormalized;
    const customer = await this.prisma.customer.findFirst({
      where: { organizationId, phone, isActive: true },
    });
    const lead =
      customer
        ? null
        : await this.prisma.lead.findFirst({
            where: { organizationId, phone },
            orderBy: { createdAt: 'desc' },
          });

    if (!customer && !lead) {
      throw new NotFoundException('Không tìm thấy Customer/Lead khớp SĐT đã xác minh');
    }

    const updated = await this.prisma.messagingContactIdentity.update({
      where: { id: identityId },
      data: {
        customerId: customer?.id,
        leadId: lead?.id,
        linkSource: MessagingIdentityLinkSource.PHONE_VERIFIED,
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'MESSAGING_IDENTITY_PHONE_LINKED',
      entityType: 'MESSAGING_IDENTITY',
      entityId: identityId,
      metadata: { phone, customerId: customer?.id, leadId: lead?.id },
    });

    return updated;
  }

  /** Gợi ý liên kết — chỉ SĐT đã xác minh hoặc ID nguồn rõ ràng */
  async suggestLinks(organizationId: string, identityId: string) {
    const identity = await this.findOne(organizationId, identityId);
    const suggestions: {
      type: 'customer' | 'lead';
      id: string;
      name: string;
      phone?: string | null;
      reason: string;
    }[] = [];

    if (identity.phoneVerifiedAt && identity.phoneNormalized) {
      const [customers, leads] = await Promise.all([
        this.prisma.customer.findMany({
          where: {
            organizationId,
            isActive: true,
            phone: identity.phoneNormalized,
          },
          take: 5,
        }),
        this.prisma.lead.findMany({
          where: { organizationId, phone: identity.phoneNormalized },
          take: 5,
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      for (const c of customers) {
        suggestions.push({
          type: 'customer',
          id: c.id,
          name: c.name,
          phone: c.phone,
          reason: 'phone_verified_match',
        });
      }
      for (const l of leads) {
        suggestions.push({
          type: 'lead',
          id: l.id,
          name: l.name,
          phone: l.phone,
          reason: 'phone_verified_match',
        });
      }
    }

    const metaLeadId = (identity.metadata as { sourceLeadId?: string })?.sourceLeadId;
    if (metaLeadId) {
      const lead = await this.prisma.lead.findFirst({
        where: { id: metaLeadId, organizationId },
      });
      if (lead) {
        suggestions.push({
          type: 'lead',
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          reason: 'source_lead_id',
        });
      }
    }

    return { identityId, suggestions };
  }

  /** Gộp thủ công Messenger + Zalo identity vào một primary */
  async mergeIdentities(
    organizationId: string,
    dto: MergeIdentitiesDto,
    userId?: string,
  ) {
    if (dto.secondaryIdentityIds.includes(dto.primaryIdentityId)) {
      throw new BadRequestException('Primary không được nằm trong danh sách secondary');
    }

    const [primary, ...secondaries] = await Promise.all([
      this.findOne(organizationId, dto.primaryIdentityId),
      ...dto.secondaryIdentityIds.map((id) => this.findOne(organizationId, id)),
    ]);

    if (primary.mergedIntoId) {
      throw new BadRequestException('Primary đã bị gộp vào identity khác');
    }
    for (const s of secondaries) {
      if (s.mergedIntoId) {
        throw new BadRequestException(`Identity ${s.id} đã được gộp trước đó`);
      }
      if (s.organizationId !== organizationId) {
        throw new NotFoundException('Identity không tồn tại');
      }
    }

    const snapshot: IdentitySnapshot[] = secondaries.map((s) => ({ ...s }));

    await this.prisma.$transaction(async (tx) => {
      for (const s of secondaries) {
        await tx.messagingContactIdentity.update({
          where: { id: s.id },
          data: { mergedIntoId: primary.id },
        });
      }

      const patch: Prisma.MessagingContactIdentityUpdateInput = {};
      if (!primary.customerId) {
        const cid = secondaries.find((s) => s.customerId)?.customerId;
        if (cid) patch.customer = { connect: { id: cid } };
      }
      if (!primary.leadId) {
        const lid = secondaries.find((s) => s.leadId)?.leadId;
        if (lid) patch.lead = { connect: { id: lid } };
      }
      if (!primary.phoneVerifiedAt) {
        const verified = secondaries.find((s) => s.phoneVerifiedAt);
        if (verified?.phoneNormalized) {
          patch.phoneNormalized = verified.phoneNormalized;
          patch.phoneRaw = verified.phoneRaw;
          patch.phoneVerifiedAt = verified.phoneVerifiedAt;
        }
      }
      if (Object.keys(patch).length) {
        await tx.messagingContactIdentity.update({
          where: { id: primary.id },
          data: patch,
        });
      }

      await tx.messagingIdentityMergeLog.create({
        data: {
          organizationId,
          primaryIdentityId: primary.id,
          mergedIdentityIds: dto.secondaryIdentityIds,
          mergedByUserId: userId,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
        },
      });
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'MESSAGING_IDENTITY_MERGED',
      entityType: 'MESSAGING_IDENTITY',
      entityId: primary.id,
      metadata: { merged: dto.secondaryIdentityIds },
    });

    return this.findOne(organizationId, primary.id);
  }

  /** Hoàn tác gộp identity */
  async undoMerge(organizationId: string, mergeLogId: string, userId?: string) {
    const log = await this.prisma.messagingIdentityMergeLog.findFirst({
      where: { id: mergeLogId, organizationId },
    });
    if (!log) throw new NotFoundException('Log gộp không tồn tại');
    if (log.undoneAt) {
      throw new BadRequestException('Gộp này đã được hoàn tác');
    }

    const snapshots = log.snapshot as IdentitySnapshot[];

    await this.prisma.$transaction(async (tx) => {
      for (const snap of snapshots) {
        const id = snap.id as string;
        await tx.messagingContactIdentity.update({
          where: { id },
          data: {
            mergedIntoId: null,
            customerId: (snap.customerId as string) ?? null,
            leadId: (snap.leadId as string) ?? null,
            linkSource: snap.linkSource as MessagingIdentityLinkSource,
            phoneNormalized: (snap.phoneNormalized as string) ?? null,
            phoneRaw: (snap.phoneRaw as string) ?? null,
            phoneVerifiedAt: snap.phoneVerifiedAt
              ? new Date(snap.phoneVerifiedAt as string)
              : null,
          },
        });
      }
      await tx.messagingIdentityMergeLog.update({
        where: { id: mergeLogId },
        data: { undoneAt: new Date(), undoneByUserId: userId },
      });
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'MESSAGING_IDENTITY_MERGE_UNDONE',
      entityType: 'MESSAGING_IDENTITY_MERGE_LOG',
      entityId: mergeLogId,
      metadata: { primaryIdentityId: log.primaryIdentityId },
    });

    return { ok: true, mergeLogId };
  }

  async listMergeLogs(organizationId: string, primaryIdentityId?: string) {
    return this.prisma.messagingIdentityMergeLog.findMany({
      where: {
        organizationId,
        ...(primaryIdentityId && { primaryIdentityId }),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
