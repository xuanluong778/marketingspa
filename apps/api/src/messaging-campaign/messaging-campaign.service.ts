import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageChannel, MessagingCampaignStatus, Prisma } from '@marketingspa/database';
import type { MessagingEligibilityResult } from '@marketingspa/shared';
import {
  mapCampaignKindToEligibilityType,
  MESSAGING_NAME_FALLBACKS,
  pickCampaignRenderVariables,
  resolveMessagingDisplayNames,
  renderTemplateWithFallbacks,
} from '@marketingspa/shared';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { randomUUID } from 'crypto';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MessagingEligibilityService } from '../messaging/messaging-eligibility.service';
import { renderTemplate } from '../automation/template-renderer.util';
import { buildPaginatedResult, getPaginationParams } from '../common/utils/pagination.util';
import { redactForAudit, maskExternalId, maskPhone } from '../common/utils/token-security.util';
import { MessagingCampaignSegmentService } from './messaging-campaign-segment.service';
import { MessagingCampaignQueueService } from './messaging-campaign-queue.service';
import { isCampaignContentEditable, type MessagingSegmentConfig } from './messaging-campaign.types';
import type {
  CreateMessagingCampaignDto,
  MessagingCampaignQueryDto,
  PreviewEligibilityDto,
  ScheduleMessagingCampaignDto,
  TestSendMessagingCampaignDto,
  UpdateMessagingCampaignDto,
} from './dto/messaging-campaign.dto';

const campaignInclude = {
  channelConnection: { select: { id: true, displayName: true, accountRef: true, status: true } },
  messageTemplate: { select: { id: true, name: true, channel: true, body: true, mediaUrl: true } },
  integration: { select: { id: true, provider: true, status: true } },
  createdBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.MessagingCampaignInclude;

const MEDIA_MAX_BYTES = 25 * 1024 * 1024;

@Injectable()
export class MessagingCampaignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly segment: MessagingCampaignSegmentService,
    private readonly eligibility: MessagingEligibilityService,
    private readonly audit: AuditService,
    private readonly campaignQueue: MessagingCampaignQueueService,
    private readonly config: ConfigService,
  ) {}

  async create(organizationId: string, dto: CreateMessagingCampaignDto, userId: string) {
    await this.validateReferences(organizationId, dto);
    const campaign = await this.prisma.messagingCampaign.create({
      data: {
        organizationId,
        name: dto.name,
        channel: dto.channel,
        campaignType: dto.campaignType,
        channelConnectionId: dto.channelConnectionId,
        integrationId: dto.integrationId,
        messageTemplateId: dto.messageTemplateId,
        segmentConfig: (dto.segmentConfig ?? {}) as Prisma.InputJsonValue,
        variables: (dto.variables ?? {}) as Prisma.InputJsonValue,
        timezone: dto.timezone ?? 'Asia/Ho_Chi_Minh',
        createdByUserId: userId,
        status: MessagingCampaignStatus.DRAFT,
      },
      include: campaignInclude,
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'MESSAGING_CAMPAIGN_CREATED',
      entityType: 'MESSAGING_CAMPAIGN',
      entityId: campaign.id,
      metadata: redactForAudit({
        name: campaign.name,
        channel: campaign.channel,
      }) as Prisma.InputJsonValue,
    });

    return campaign;
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateMessagingCampaignDto,
    userId: string,
  ) {
    const existing = await this.ensureCampaign(organizationId, id);
    this.assertContentEditable(existing);

    if (this.hasLockedFieldChanges(dto)) {
      this.assertContentEditable(existing);
    }

    await this.validateReferences(organizationId, dto);

    const contentChanged = this.hasLockedFieldChanges(dto);
    const needsReset =
      contentChanged &&
      (Boolean(existing.startedAt) ||
        existing.status === MessagingCampaignStatus.COMPLETED ||
        existing.status === MessagingCampaignStatus.FAILED ||
        existing.status === MessagingCampaignStatus.CANCELLED ||
        existing.status === MessagingCampaignStatus.PAUSED);

    if (needsReset) {
      await this.prisma.messagingCampaignRecipient.deleteMany({ where: { campaignId: id } });
    }

    const campaign = await this.prisma.messagingCampaign.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.channel !== undefined && { channel: dto.channel }),
        ...(dto.campaignType !== undefined && { campaignType: dto.campaignType }),
        ...(dto.channelConnectionId !== undefined && {
          channelConnectionId: dto.channelConnectionId,
        }),
        ...(dto.integrationId !== undefined && { integrationId: dto.integrationId }),
        ...(dto.messageTemplateId !== undefined && { messageTemplateId: dto.messageTemplateId }),
        ...(dto.segmentConfig !== undefined && {
          segmentConfig: dto.segmentConfig as Prisma.InputJsonValue,
        }),
        ...(dto.variables !== undefined && { variables: dto.variables as Prisma.InputJsonValue }),
        ...(dto.timezone !== undefined && { timezone: dto.timezone }),
        ...(needsReset && {
          status: MessagingCampaignStatus.DRAFT,
          startedAt: null,
          pausedAt: null,
          completedAt: null,
          scheduledAt: null,
          totalRecipients: 0,
          eligibleCount: 0,
          excludedCount: 0,
          queuedCount: 0,
          sentCount: 0,
          deliveredCount: 0,
          readCount: 0,
          repliedCount: 0,
          failedCount: 0,
          optOutCount: 0,
          actualCost: 0,
          estimatedCost: 0,
          segmentSnapshot: {} as Prisma.InputJsonValue,
        }),
      },
      include: campaignInclude,
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'MESSAGING_CAMPAIGN_UPDATED',
      entityType: 'MESSAGING_CAMPAIGN',
      entityId: campaign.id,
      metadata: redactForAudit({ ...dto, resetToDraft: needsReset }) as Prisma.InputJsonValue,
    });

    return campaign;
  }

  async list(organizationId: string, query: MessagingCampaignQueryDto) {
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const where: Prisma.MessagingCampaignWhereInput = {
      organizationId,
      ...(query.status && { status: query.status }),
      ...(query.channel && { channel: query.channel }),
      ...(query.search && {
        name: { contains: query.search, mode: 'insensitive' },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.messagingCampaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: campaignInclude,
      }),
      this.prisma.messagingCampaign.count({ where }),
    ]);

    return buildPaginatedResult(items, total, page, pageSize);
  }

  async findOne(organizationId: string, id: string) {
    const campaign = await this.prisma.messagingCampaign.findFirst({
      where: { id, organizationId },
      include: {
        ...campaignInclude,
        recipients: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: {
            identity: {
              select: {
                id: true,
                displayName: true,
                externalUserId: true,
                channel: true,
              },
            },
          },
        },
      },
    });
    if (!campaign) throw new NotFoundException('Chiến dịch không tồn tại');
    return campaign;
  }

  async previewSegment(organizationId: string, id: string) {
    const campaign = await this.ensureCampaign(organizationId, id);
    const segmentConfig = campaign.segmentConfig as MessagingSegmentConfig;
    return this.segment.preview(
      organizationId,
      campaign.channel,
      segmentConfig,
      campaign.channelConnectionId,
    );
  }

  async previewEligibility(organizationId: string, id: string, dto: PreviewEligibilityDto) {
    const campaign = await this.ensureCampaign(organizationId, id);
    const segmentConfig = campaign.segmentConfig as MessagingSegmentConfig;
    const limit = dto.limit ?? 500;
    let identities = await this.segment.resolveIdentities(
      organizationId,
      campaign.channel,
      segmentConfig,
      campaign.channelConnectionId,
    );

    if (dto.identityIds?.length) {
      const allowed = new Set(dto.identityIds);
      identities = identities.filter((i) => allowed.has(i.id));
    }

    identities = await this.segment.filterOutSuppressed(
      organizationId,
      campaign.channel,
      identities,
      segmentConfig.excludeSuppressed !== false,
    );

    const template = campaign.messageTemplateId
      ? await this.prisma.messageTemplate.findFirst({
          where: { id: campaign.messageTemplateId, organizationId },
        })
      : null;

    const results: Array<{
      identityId: string;
      externalUserId: string;
      displayName: string | null;
      eligibility: MessagingEligibilityResult;
      renderedPreview?: string;
    }> = [];

    const breakdown: Record<string, number> = {};
    let eligible = 0;
    let excluded = 0;
    let estimatedCost = 0;
    const contentPreviews: Array<{ identityId: string; name: string; content: string }> = [];

    const processList = identities.slice(0, limit);

    for (const identity of processList) {
      const eligibility = await this.eligibility.check({
        organizationId,
        channel: campaign.channel,
        campaignType: mapCampaignKindToEligibilityType(campaign.campaignType),
        identityId: identity.id,
        connectionId: campaign.channelConnectionId ?? undefined,
        templateId: campaign.messageTemplateId ?? undefined,
        leadId: identity.leadId ?? undefined,
        customerId: identity.customerId ?? undefined,
      });

      if (eligibility.eligible) {
        eligible += 1;
        estimatedCost += eligibility.estimatedCost ?? 0;
        if (contentPreviews.length < 50) {
          const vars = (campaign.variables ?? {}) as Record<string, string>;
          const bodySource =
            template?.body || vars.body?.trim() || vars.message?.trim() || vars.content?.trim() || '';
          if (bodySource) {
            const context = await this.buildRenderContext(
              organizationId,
              {
                customerId: identity.customerId ?? undefined,
                leadId: identity.leadId ?? undefined,
              },
              identity,
              vars,
            );
            contentPreviews.push({
              identityId: identity.id,
              name: identity.displayName ?? 'Khách',
              content: renderTemplateWithFallbacks(bodySource, context, MESSAGING_NAME_FALLBACKS)
                .rendered,
            });
          }
        }
      } else {
        excluded += 1;
        const code = eligibility.reasonCode ?? 'UNKNOWN';
        breakdown[code] = (breakdown[code] ?? 0) + 1;
      }

      if (results.length < 50) {
        let renderedPreview: string | undefined;
        if (eligibility.eligible && template) {
          const context = await this.buildRenderContext(
            organizationId,
            { customerId: identity.customerId ?? undefined, leadId: identity.leadId ?? undefined },
            identity,
            campaign.variables as Record<string, string>,
          );
          renderedPreview = renderTemplate(template.body, context);
        }
        results.push({
          identityId: identity.id,
          externalUserId: maskExternalId(identity.externalUserId),
          displayName: identity.displayName,
          eligibility,
          renderedPreview,
        });
      }
    }

    const totalIdentities = identities.length;
    const ratio = processList.length > 0 ? totalIdentities / processList.length : 0;

    const scaledBreakdown: Record<string, number> = {};
    for (const [code, count] of Object.entries(breakdown)) {
      scaledBreakdown[code] = Math.round(count * ratio);
    }

    return {
      totalIdentities,
      sampled: processList.length,
      estimatedEligible: Math.round(eligible * ratio),
      estimatedExcluded: Math.round(excluded * ratio),
      estimatedCost: Math.round(estimatedCost * ratio),
      breakdown: scaledBreakdown,
      contentPreviews,
      results,
    };
  }

  async testSend(
    organizationId: string,
    id: string,
    dto: TestSendMessagingCampaignDto,
    userId: string,
  ) {
    const campaign = await this.ensureCampaign(organizationId, id);
    const template = campaign.messageTemplateId
      ? await this.prisma.messageTemplate.findFirst({
          where: { id: campaign.messageTemplateId, organizationId },
        })
      : null;

    const identity = await this.resolveTestIdentity(organizationId, campaign.channel, dto);
    const eligibility = await this.eligibility.check({
      organizationId,
      channel: campaign.channel,
      campaignType: mapCampaignKindToEligibilityType(campaign.campaignType),
      identityId: identity?.id,
      customerId: dto.customerId ?? identity?.customerId ?? undefined,
      leadId: dto.leadId ?? identity?.leadId ?? undefined,
      connectionId: campaign.channelConnectionId ?? undefined,
      templateId: campaign.messageTemplateId ?? undefined,
    });

    if (!eligibility.eligible) {
      return {
        simulated: true,
        sent: false,
        message: eligibility.reasonMessage ?? 'Không đủ điều kiện gửi',
        eligibility,
      };
    }

    const context = await this.buildRenderContext(
      organizationId,
      dto,
      identity,
      campaign.variables as Record<string, string>,
    );
    const bodyTemplate = template?.body ?? 'Tin nhắn giả lập — chưa gắn template';
    const renderedContent = renderTemplate(bodyTemplate, context);

    await this.audit.log({
      organizationId,
      userId,
      action: 'MESSAGING_CAMPAIGN_TEST_SEND',
      entityType: 'MESSAGING_CAMPAIGN',
      entityId: campaign.id,
      metadata: redactForAudit({
        identityId: identity?.id,
        customerId: dto.customerId,
        leadId: dto.leadId,
        simulated: true,
        providerMode: eligibility.providerMode,
      }) as Prisma.InputJsonValue,
    });

    return {
      simulated: true,
      sent: false,
      message: 'Gửi thử giả lập — không gửi tin thật qua API',
      renderedContent,
      providerMode: eligibility.providerMode,
      eligibility,
      identityId: identity?.id,
    };
  }

  async schedule(
    organizationId: string,
    id: string,
    dto: ScheduleMessagingCampaignDto,
    userId: string,
  ) {
    const campaign = await this.ensureCampaign(organizationId, id);
    if (
      campaign.status !== MessagingCampaignStatus.DRAFT &&
      campaign.status !== MessagingCampaignStatus.SCHEDULED
    ) {
      throw new BadRequestException('Chỉ lên lịch chiến dịch ở trạng thái nháp hoặc đã lên lịch');
    }

    const scheduledAt = new Date(dto.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException('Thời gian lên lịch phải ở tương lai');
    }

    const updated = await this.prisma.messagingCampaign.update({
      where: { id },
      data: {
        status: MessagingCampaignStatus.SCHEDULED,
        scheduledAt,
        ...(dto.timezone && { timezone: dto.timezone }),
      },
      include: campaignInclude,
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'MESSAGING_CAMPAIGN_SCHEDULED',
      entityType: 'MESSAGING_CAMPAIGN',
      entityId: id,
      metadata: { scheduledAt: scheduledAt.toISOString() } as Prisma.InputJsonValue,
    });

    return updated;
  }

  async start(organizationId: string, id: string, userId: string) {
    const campaign = await this.ensureCampaign(organizationId, id);
    if (
      campaign.status !== MessagingCampaignStatus.DRAFT &&
      campaign.status !== MessagingCampaignStatus.SCHEDULED
    ) {
      throw new BadRequestException('Chỉ bắt đầu chiến dịch ở trạng thái nháp hoặc đã lên lịch');
    }
    if (!campaign.channelConnectionId) {
      throw new BadRequestException('Chọn Fanpage/Zalo OA đã kết nối trước khi gửi');
    }

    const vars = (campaign.variables ?? {}) as Record<string, string>;
    const hasBody = Boolean(
      campaign.messageTemplateId ||
        vars.body?.trim() ||
        vars.message?.trim() ||
        vars.content?.trim() ||
        vars.mediaUrl?.trim(),
    );
    if (!hasBody) {
      throw new BadRequestException('Nhập nội dung tin nhắn hoặc đính kèm media trước khi gửi');
    }

    await this.prisma.messagingCampaign.update({
      where: { id },
      data: { status: MessagingCampaignStatus.PLANNING, startedAt: new Date() },
    });

    await this.campaignQueue.enqueuePlan(organizationId, id);

    await this.audit.log({
      organizationId,
      userId,
      action: 'MESSAGING_CAMPAIGN_STARTED',
      entityType: 'MESSAGING_CAMPAIGN',
      entityId: id,
      metadata: { queued: true, planner: 'messaging-campaign-plan-queue' } as Prisma.InputJsonValue,
    });

    return this.findOne(organizationId, id);
  }

  async uploadMedia(
    organizationId: string,
    file?: {
      originalname?: string;
      mimetype?: string;
      size?: number;
      buffer?: Buffer;
      stream?: Readable;
    },
  ) {
    if (!file?.buffer && !file?.stream) {
      throw new BadRequestException('Thiếu file upload');
    }
    const size = file.size ?? file.buffer?.length ?? 0;
    if (size <= 0 || size > MEDIA_MAX_BYTES) {
      throw new BadRequestException('File media tối đa 25MB');
    }
    const mime = (file.mimetype || '').toLowerCase();
    let mediaType: 'image' | 'video' = 'image';
    if (mime.startsWith('video/')) mediaType = 'video';
    else if (mime.startsWith('image/')) mediaType = 'image';
    else {
      throw new BadRequestException('Chỉ hỗ trợ ảnh hoặc video');
    }

    const ext = extname(file.originalname || '') || (mediaType === 'video' ? '.mp4' : '.jpg');
    const filename = `${randomUUID()}${ext}`.slice(0, 180);
    const dir = join(process.cwd(), 'uploads', 'messaging-campaigns', organizationId);
    try {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(
        `Không tạo được thư mục upload media (${msg}). Kiểm tra quyền ghi uploads/messaging-campaigns.`,
      );
    }
    const absPath = join(dir, filename);

    try {
      if (file.buffer) {
        const { writeFileSync } = await import('fs');
        writeFileSync(absPath, file.buffer);
      } else if (file.stream) {
        await pipeline(file.stream, createWriteStream(absPath));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Không lưu được file media: ${msg}`);
    }

    const port = this.config.get<number>('PORT', 4000);
    const base =
      this.config.get<string>('API_PUBLIC_URL') ||
      this.config.get<string>('CHATBOT_PUBLIC_API_URL') ||
      this.config.get<string>('APP_URL') ||
      `http://127.0.0.1:${port}`;
    const url = `${String(base).replace(/\/$/, '')}/uploads/messaging-campaigns/${organizationId}/${filename}`;

    return { url, mediaType, mimeType: mime, sizeBytes: size, filename };
  }

  async pause(organizationId: string, id: string, userId: string) {
    const campaign = await this.ensureCampaign(organizationId, id);
    if (campaign.status !== MessagingCampaignStatus.RUNNING) {
      throw new BadRequestException('Chỉ tạm dừng chiến dịch đang chạy');
    }

    const updated = await this.prisma.messagingCampaign.update({
      where: { id },
      data: {
        status: MessagingCampaignStatus.PAUSED,
        pausedAt: new Date(),
      },
      include: campaignInclude,
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'MESSAGING_CAMPAIGN_PAUSED',
      entityType: 'MESSAGING_CAMPAIGN',
      entityId: id,
    });

    return updated;
  }

  async resume(organizationId: string, id: string, userId: string) {
    const campaign = await this.ensureCampaign(organizationId, id);
    if (campaign.status !== MessagingCampaignStatus.PAUSED) {
      throw new BadRequestException('Chỉ tiếp tục chiến dịch đang tạm dừng');
    }

    const updated = await this.prisma.messagingCampaign.update({
      where: { id },
      data: {
        status: MessagingCampaignStatus.RUNNING,
        pausedAt: null,
      },
      include: campaignInclude,
    });

    await this.campaignQueue.enqueueDispatch(organizationId, id);

    await this.audit.log({
      organizationId,
      userId,
      action: 'MESSAGING_CAMPAIGN_RESUMED',
      entityType: 'MESSAGING_CAMPAIGN',
      entityId: id,
    });

    return updated;
  }

  async cancel(organizationId: string, id: string, userId: string) {
    const campaign = await this.ensureCampaign(organizationId, id);
    const cancellable: MessagingCampaignStatus[] = [
      MessagingCampaignStatus.DRAFT,
      MessagingCampaignStatus.SCHEDULED,
      MessagingCampaignStatus.PLANNING,
      MessagingCampaignStatus.RUNNING,
      MessagingCampaignStatus.PAUSED,
    ];
    if (!cancellable.includes(campaign.status)) {
      throw new BadRequestException('Không thể hủy chiến dịch ở trạng thái hiện tại');
    }

    const updated = await this.prisma.messagingCampaign.update({
      where: { id },
      data: {
        status: MessagingCampaignStatus.CANCELLED,
        cancelledAt: new Date(),
      },
      include: campaignInclude,
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'MESSAGING_CAMPAIGN_CANCELLED',
      entityType: 'MESSAGING_CAMPAIGN',
      entityId: id,
    });

    return updated;
  }

  async duplicate(organizationId: string, id: string, userId: string) {
    const source = await this.ensureCampaign(organizationId, id);
    const copy = await this.prisma.messagingCampaign.create({
      data: {
        organizationId,
        name: `${source.name} (bản sao)`,
        channel: source.channel,
        campaignType: source.campaignType,
        channelConnectionId: source.channelConnectionId,
        integrationId: source.integrationId,
        messageTemplateId: source.messageTemplateId,
        segmentConfig: source.segmentConfig as Prisma.InputJsonValue,
        variables: source.variables as Prisma.InputJsonValue,
        timezone: source.timezone,
        createdByUserId: userId,
        status: MessagingCampaignStatus.DRAFT,
      },
      include: campaignInclude,
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'MESSAGING_CAMPAIGN_DUPLICATED',
      entityType: 'MESSAGING_CAMPAIGN',
      entityId: copy.id,
      metadata: { sourceCampaignId: id } as Prisma.InputJsonValue,
    });

    return copy;
  }

  async remove(organizationId: string, id: string, userId: string) {
    const campaign = await this.ensureCampaign(organizationId, id);
    if (
      campaign.status === MessagingCampaignStatus.RUNNING ||
      campaign.status === MessagingCampaignStatus.PLANNING
    ) {
      throw new BadRequestException('Hãy hủy chiến dịch đang chạy trước khi xóa');
    }

    await this.prisma.messagingCampaign.delete({ where: { id } });

    await this.audit.log({
      organizationId,
      userId,
      action: 'MESSAGING_CAMPAIGN_DELETED',
      entityType: 'MESSAGING_CAMPAIGN',
      entityId: id,
      metadata: {
        name: campaign.name,
        status: campaign.status,
        channel: campaign.channel,
      } as Prisma.InputJsonValue,
    });

    return { ok: true, id };
  }

  /**
   * Dashboard báo cáo chiến dịch — counters, tỷ lệ, attribution, cost, lỗi theo provider.
   * Chỉ trả dữ liệu thuộc organizationId.
   */
  async getDashboard(organizationId: string, id: string) {
    const campaign = await this.ensureCampaign(organizationId, id);

    const statusGroups = await this.prisma.messagingCampaignRecipient.groupBy({
      by: ['status'],
      where: { organizationId, campaignId: id },
      _count: { _all: true },
    });
    const byStatus = Object.fromEntries(
      statusGroups.map((g) => [g.status, g._count._all]),
    ) as Record<string, number>;

    const blockedCount = await this.prisma.messagingCampaignRecipient.count({
      where: {
        organizationId,
        campaignId: id,
        OR: [
          { exclusionReason: { contains: 'BLOCKED' } },
          { lastError: { contains: 'BLOCKED' } },
          { lastError: { contains: 'USER_BLOCKED' } },
        ],
      },
    });

    const errorRows = await this.prisma.messagingCampaignRecipient.findMany({
      where: {
        organizationId,
        campaignId: id,
        OR: [
          { status: 'FAILED' },
          { status: 'SKIPPED' },
          { lastError: { not: null } },
          { exclusionReason: { not: null } },
        ],
      },
      select: {
        lastError: true,
        exclusionReason: true,
        status: true,
        identity: {
          select: {
            integrationScopeKey: true,
            channel: true,
          },
        },
      },
      take: 5_000,
    });

    const errorsByReason: Record<string, number> = {};
    const errorsByPageOrOa: Record<string, number> = {};
    for (const row of errorRows) {
      const reason = row.exclusionReason || row.lastError || row.status || 'UNKNOWN';
      const reasonKey = reason.slice(0, 120);
      errorsByReason[reasonKey] = (errorsByReason[reasonKey] ?? 0) + 1;
      const pageKey = row.identity.integrationScopeKey || row.identity.channel;
      errorsByPageOrOa[pageKey] = (errorsByPageOrOa[pageKey] ?? 0) + 1;
    }

    const connection = campaign.channelConnection;
    const providerLabel = connection
      ? `${campaign.channel}:${connection.accountRef}`
      : campaign.channel;

    const since = campaign.startedAt ?? campaign.createdAt;
    const leadIds = (
      await this.prisma.messagingCampaignRecipient.findMany({
        where: { organizationId, campaignId: id, leadId: { not: null } },
        select: { leadId: true },
        distinct: ['leadId'],
        take: 10_000,
      })
    )
      .map((r) => r.leadId!)
      .filter(Boolean);

    const customerIds = (
      await this.prisma.messagingCampaignRecipient.findMany({
        where: { organizationId, campaignId: id, customerId: { not: null } },
        select: { customerId: true },
        distinct: ['customerId'],
        take: 10_000,
      })
    )
      .map((r) => r.customerId!)
      .filter(Boolean);

    const [appointmentsCount, ordersCount, revenueAgg] = await Promise.all([
      leadIds.length || customerIds.length
        ? this.prisma.appointment.count({
            where: {
              organizationId,
              createdAt: { gte: since },
              OR: [
                ...(leadIds.length ? [{ leadId: { in: leadIds } }] : []),
                ...(customerIds.length ? [{ customerId: { in: customerIds } }] : []),
              ],
            },
          })
        : Promise.resolve(0),
      customerIds.length
        ? this.prisma.order.count({
            where: {
              organizationId,
              customerId: { in: customerIds },
              orderedAt: { gte: since },
            },
          })
        : Promise.resolve(0),
      customerIds.length
        ? this.prisma.order.aggregate({
            where: {
              organizationId,
              customerId: { in: customerIds },
              orderedAt: { gte: since },
            },
            _sum: { total: true },
          })
        : Promise.resolve({ _sum: { total: null } }),
    ]);

    const attributedRevenue = Number(revenueAgg._sum.total ?? 0);
    const conversions = appointmentsCount + ordersCount;
    const actualCost = Number(campaign.actualCost ?? 0);
    const estimatedCost = Number(campaign.estimatedCost ?? 0);
    const sent = campaign.sentCount || byStatus.SENT || 0;
    const replied = campaign.repliedCount || byStatus.REPLIED || 0;
    const replyRate = sent > 0 ? replied / sent : 0;
    const costPerConversion = conversions > 0 ? actualCost / conversions : null;

    const meta = (campaign.metadata ?? {}) as { replyAttributions?: unknown[] };

    return {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        channel: campaign.channel,
        status: campaign.status,
        campaignType: campaign.campaignType,
        provider: providerLabel,
        pageOrOa: connection?.accountRef ?? null,
        startedAt: campaign.startedAt,
        completedAt: campaign.completedAt,
      },
      totals: {
        totalRecipients: campaign.totalRecipients,
        eligible: campaign.eligibleCount,
        excluded: campaign.excludedCount,
        queued: campaign.queuedCount,
        sent: campaign.sentCount,
        delivered: campaign.deliveredCount,
        read: campaign.readCount,
        replied: campaign.repliedCount,
        failed: campaign.failedCount,
        blocked: blockedCount,
        optOut: campaign.optOutCount,
        byStatus,
      },
      rates: {
        replyRate,
        deliveryRate: sent > 0 ? campaign.deliveredCount / sent : 0,
        readRate: sent > 0 ? campaign.readCount / sent : 0,
      },
      attribution: {
        appointments: appointmentsCount,
        orders: ordersCount,
        revenue: attributedRevenue,
        conversions,
        replyAttributionCount: Array.isArray(meta.replyAttributions)
          ? meta.replyAttributions.length
          : 0,
        windowFrom: since,
      },
      costs: {
        estimatedCost,
        actualCost,
        costPerConversion,
        costPerSent: sent > 0 ? actualCost / sent : null,
      },
      errors: {
        byReason: errorsByReason,
        byPageOrOa: errorsByPageOrOa,
        provider: providerLabel,
      },
    };
  }

  async exportRecipients(
    organizationId: string,
    id: string,
    opts: {
      format?: string;
      userId?: string;
      userRole?: string;
      permissions?: string[];
      reveal?: boolean;
    },
  ) {
    const campaign = await this.ensureCampaign(organizationId, id);
    const format = opts.format === 'xlsx' || opts.format === 'xls' ? 'xlsx' : 'csv';

    const canReveal =
      opts.reveal === true &&
      (opts.userRole === 'OWNER' ||
        (opts.permissions ?? []).includes('automation.integration.manage'));

    const recipients = await this.prisma.messagingCampaignRecipient.findMany({
      where: { organizationId, campaignId: id },
      orderBy: { createdAt: 'asc' },
      take: 50_000,
      include: {
        identity: {
          select: {
            externalUserId: true,
            phoneNormalized: true,
            displayName: true,
            integrationScopeKey: true,
          },
        },
      },
    });

    const headers = [
      'Recipient ID',
      'Status',
      'Eligible',
      'External ID',
      'Phone',
      'Display Name',
      'Page/OA',
      'Provider Mode',
      'Exclusion / Error',
      'Sent At',
      'Delivered At',
      'Read At',
      'Replied At',
      'Cost',
    ];

    const rows = recipients.map((r) => [
      r.id,
      r.status,
      r.eligible ? '1' : '0',
      canReveal ? r.identity.externalUserId : maskExternalId(r.identity.externalUserId),
      canReveal ? (r.identity.phoneNormalized ?? '') : maskPhone(r.identity.phoneNormalized),
      r.identity.displayName ?? '',
      r.identity.integrationScopeKey,
      r.providerMode ?? '',
      r.exclusionReason || r.lastError || '',
      r.sentAt?.toISOString() ?? '',
      r.deliveredAt?.toISOString() ?? '',
      r.readAt?.toISOString() ?? '',
      r.repliedAt?.toISOString() ?? '',
      String(r.cost ?? 0),
    ]);

    await this.audit.log({
      organizationId,
      userId: opts.userId,
      action: 'MESSAGING_CAMPAIGN_EXPORTED',
      entityType: 'MESSAGING_CAMPAIGN',
      entityId: id,
      metadata: redactForAudit({
        format,
        rowCount: recipients.length,
        masked: !canReveal,
        campaignName: campaign.name,
      }) as Prisma.InputJsonValue,
    });

    const stamp = new Date().toISOString().slice(0, 10);
    const safeName = campaign.name.replace(/[^\w-]+/g, '_').slice(0, 40);

    if (format === 'csv') {
      const body = [headers, ...rows]
        .map((cols) => cols.map((c) => this.csvEscape(String(c))).join(','))
        .join('\n');
      return {
        content: Buffer.from(`\uFEFF${body}`, 'utf8'),
        contentType: 'text/csv; charset=utf-8',
        filename: `campaign-${safeName}-${stamp}.csv`,
      };
    }

    const xmlRows = rows
      .map(
        (cols) =>
          `<Row>${cols.map((c) => `<Cell><Data ss:Type="String">${this.xmlEscape(String(c))}</Data></Cell>`).join('')}</Row>`,
      )
      .join('');
    const headerRow = `<Row>${headers
      .map((c) => `<Cell><Data ss:Type="String">${this.xmlEscape(c)}</Data></Cell>`)
      .join('')}</Row>`;
    const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Recipients">
  <Table>${headerRow}${xmlRows}</Table>
 </Worksheet>
</Workbook>`;

    return {
      content: Buffer.from(xml, 'utf8'),
      contentType: 'application/vnd.ms-excel; charset=utf-8',
      filename: `campaign-${safeName}-${stamp}.xls`,
    };
  }

  private csvEscape(value: string): string {
    if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
  }

  private xmlEscape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private async ensureCampaign(organizationId: string, id: string) {
    const campaign = await this.prisma.messagingCampaign.findFirst({
      where: { id, organizationId },
      include: campaignInclude,
    });
    if (!campaign) throw new NotFoundException('Chiến dịch không tồn tại');
    return campaign;
  }

  private assertContentEditable(campaign: {
    status: MessagingCampaignStatus;
    startedAt: Date | null;
  }) {
    if (!isCampaignContentEditable(campaign.status, campaign.startedAt)) {
      throw new ForbiddenException(
        'Không thể sửa nội dung hoặc segment sau khi chiến dịch đã bắt đầu',
      );
    }
  }

  private hasLockedFieldChanges(dto: UpdateMessagingCampaignDto): boolean {
    return (
      dto.segmentConfig !== undefined ||
      dto.variables !== undefined ||
      dto.messageTemplateId !== undefined ||
      dto.channelConnectionId !== undefined ||
      dto.integrationId !== undefined ||
      dto.channel !== undefined ||
      dto.campaignType !== undefined
    );
  }

  private async validateReferences(
    organizationId: string,
    dto: CreateMessagingCampaignDto | UpdateMessagingCampaignDto,
  ) {
    if (dto.channelConnectionId) {
      const conn = await this.prisma.messagingChannelConnection.findFirst({
        where: { id: dto.channelConnectionId, organizationId },
      });
      if (!conn) throw new BadRequestException('Kết nối kênh không tồn tại');
      if (dto.channel && conn.channel !== dto.channel) {
        throw new BadRequestException('Kênh kết nối không khớp với kênh chiến dịch');
      }
    }

    if (dto.integrationId) {
      const integration = await this.prisma.integration.findFirst({
        where: { id: dto.integrationId, organizationId },
      });
      if (!integration) throw new BadRequestException('Integration không tồn tại');
    }

    if (dto.messageTemplateId) {
      const template = await this.prisma.messageTemplate.findFirst({
        where: { id: dto.messageTemplateId, organizationId },
      });
      if (!template) throw new BadRequestException('Template không tồn tại');
      if (dto.channel && template.channel !== dto.channel) {
        throw new BadRequestException('Template không khớp kênh chiến dịch');
      }
    }
  }

  private async resolveTestIdentity(
    organizationId: string,
    channel: MessageChannel,
    dto: TestSendMessagingCampaignDto,
  ) {
    if (dto.identityId) {
      const identity = await this.prisma.messagingContactIdentity.findFirst({
        where: { id: dto.identityId, organizationId, channel, mergedIntoId: null },
      });
      if (!identity) throw new NotFoundException('Identity không tồn tại');
      return identity;
    }

    if (dto.customerId) {
      const identity = await this.prisma.messagingContactIdentity.findFirst({
        where: { organizationId, channel, customerId: dto.customerId, mergedIntoId: null },
        orderBy: { lastInboundAt: 'desc' },
      });
      if (identity) return identity;
    }

    if (dto.leadId) {
      const identity = await this.prisma.messagingContactIdentity.findFirst({
        where: { organizationId, channel, leadId: dto.leadId, mergedIntoId: null },
        orderBy: { lastInboundAt: 'desc' },
      });
      if (identity) return identity;
    }

    return null;
  }

  private async buildRenderContext(
    organizationId: string,
    dto: Pick<TestSendMessagingCampaignDto, 'customerId' | 'leadId' | 'context'>,
    identity: {
      customerId: string | null;
      leadId: string | null;
      displayName: string | null;
    } | null,
    campaignVariables: Record<string, string>,
  ): Promise<Record<string, string>> {
    const context: Record<string, string> = {
      ...pickCampaignRenderVariables(campaignVariables),
      ...(dto.context ?? {}),
    };

    const fbNames = resolveMessagingDisplayNames(identity?.displayName);
    context.full_name = fbNames.full_name;
    context.first_name = fbNames.first_name;
    context.customer_name = fbNames.customer_name;

    const customerId = dto.customerId ?? identity?.customerId;
    const leadId = dto.leadId ?? identity?.leadId;

    if (customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: customerId, organizationId },
        include: { branch: true },
      });
      if (customer) {
        if (fbNames.full_name === 'Anh/chị' && customer.name?.trim()) {
          const crm = resolveMessagingDisplayNames(customer.name);
          context.full_name = crm.full_name;
          context.first_name = crm.first_name;
          context.customer_name = crm.customer_name;
        }
        context.branch_name = customer.branch?.name ?? context.branch_name ?? '';
      }
    } else if (leadId) {
      const lead = await this.prisma.lead.findFirst({
        where: { id: leadId, organizationId },
      });
      if (lead && fbNames.full_name === 'Anh/chị' && lead.name?.trim()) {
        const crm = resolveMessagingDisplayNames(lead.name);
        context.full_name = crm.full_name;
        context.first_name = crm.first_name;
        context.customer_name = crm.customer_name;
      }
    }

    const latestAppt = await this.prisma.appointment.findFirst({
      where: {
        organizationId,
        OR: [
          ...(customerId ? [{ customerId }] : []),
          ...(leadId ? [{ leadId }] : []),
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
}
