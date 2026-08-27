import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MessageChannel,
  MessageTemplateApprovalStatus,
  MessagingCampaignKind,
  MessagingCampaignStatus,
  MessagingConsentStatus,
  MessagingProviderKind,
  Prisma,
} from '@marketingspa/database';
import {
  extractZbsTemplateVariables,
  listZaloZbsTemplates,
  mapZaloTemplateApprovalStatus,
  renderTemplateWithFallbacks,
  resolveMessagingDisplayNames,
  sendZbsTemplateHttp,
  MESSAGING_NAME_FALLBACKS,
  pickCampaignRenderVariables,
} from '@marketingspa/shared';
import { buildIntegrationScopeKey } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelConnectionsService } from '../messaging/channel-connections.service';
import { MessagingCampaignService } from '../messaging-campaign/messaging-campaign.service';
import { MessagingCampaignSegmentService } from '../messaging-campaign/messaging-campaign-segment.service';
import { MessagingEligibilityService } from '../messaging/messaging-eligibility.service';
import { parseContactSpreadsheet } from '../email-marketing/email-spreadsheet.util';
import { ZaloOAuthService } from './zalo-oauth.service';
import { mapCampaignKindToEligibilityType } from '../messaging-campaign/messaging-campaign.types';
import type {
  ConnectZaloZbsDto,
  CreateZaloCampaignDto,
  PreviewZaloAudienceDto,
  PreviewZaloCampaignDto,
  ScheduleZaloCampaignDto,
  TestZaloZbsSendDto,
  UpdateZaloCampaignDto,
  ZaloCampaignQueryDto,
} from './dto/zalo-marketing.dto';
import type { MessagingSegmentConfig } from '../messaging-campaign/messaging-campaign.types';

const ZALO_CHANNEL = MessageChannel.ZALO;

@Injectable()
export class ZaloMarketingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channelConnections: ChannelConnectionsService,
    private readonly campaigns: MessagingCampaignService,
    private readonly segment: MessagingCampaignSegmentService,
    private readonly eligibility: MessagingEligibilityService,
    private readonly oauth: ZaloOAuthService,
  ) {}

  async overview(organizationId: string) {
    const [oaCount, zbsCount, campaigns, templates, recent] = await Promise.all([
      this.prisma.messagingChannelConnection.count({
        where: {
          organizationId,
          channel: ZALO_CHANNEL,
          providerKind: MessagingProviderKind.ZALO_OA,
          status: 'ACTIVE',
          isPaused: false,
        },
      }),
      this.prisma.messagingChannelConnection.count({
        where: {
          organizationId,
          channel: ZALO_CHANNEL,
          providerKind: MessagingProviderKind.ZBS_TEMPLATE,
          status: 'ACTIVE',
          isPaused: false,
        },
      }),
      this.prisma.messagingCampaign.groupBy({
        by: ['status'],
        where: { organizationId, channel: ZALO_CHANNEL },
        _count: { _all: true },
      }),
      this.prisma.messageTemplate.count({
        where: {
          organizationId,
          channel: ZALO_CHANNEL,
          providerMode: 'ZBS_TEMPLATE',
          isActive: true,
        },
      }),
      this.prisma.messagingCampaign.findMany({
        where: { organizationId, channel: ZALO_CHANNEL },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          name: true,
          status: true,
          campaignType: true,
          sentCount: true,
          deliveredCount: true,
          failedCount: true,
          totalRecipients: true,
          updatedAt: true,
        },
      }),
    ]);

    const statusMap = Object.fromEntries(campaigns.map((c) => [c.status, c._count._all]));
    const running = statusMap[MessagingCampaignStatus.RUNNING] ?? 0;
    const completed = statusMap[MessagingCampaignStatus.COMPLETED] ?? 0;

    return {
      oaConnections: oaCount,
      zbsConnections: zbsCount,
      zbsTemplates: templates,
      campaignsRunning: running,
      campaignsCompleted: completed,
      oauthConfigured: this.oauth.isConfigured(),
      oauthRedirectUri: this.oauth.getRedirectUri(),
      oauthAppIdMasked: this.oauth.getAppId()
        ? `…${this.oauth.getAppId().slice(-6)}`
        : null,
      oauthPkce: this.oauth.isPkceEnabled(),
      oauthFlow: 'oa/permission',
      recentCampaigns: recent.map((c) => ({
        ...c,
        updatedAt: c.updatedAt.toISOString(),
      })),
    };
  }

  async listOas(organizationId: string) {
    const all = await this.channelConnections.list(organizationId);
    return all.filter((c) => c.channel === ZALO_CHANNEL);
  }

  async getOa(organizationId: string, id: string) {
    await this.ensureZaloOaRow(organizationId, id);
    return this.channelConnections.getPublic(organizationId, id);
  }

  async disconnectOa(organizationId: string, id: string, userId?: string) {
    await this.ensureZaloOaRow(organizationId, id);
    return this.channelConnections.disconnectZaloOa(organizationId, id, userId);
  }

  async refreshOa(organizationId: string, id: string, userId?: string) {
    await this.ensureZaloOaRow(organizationId, id);
    const refreshed = await this.channelConnections.refreshZaloOaToken(
      organizationId,
      id,
      userId,
    );
    return { connection: refreshed };
  }

  async startOAuth(userId: string, organizationId: string, returnPath?: string) {
    return this.oauth.createState({ userId, organizationId, returnPath });
  }

  async handleOAuthCallback(
    code: string,
    state?: string,
    cookieValue?: string,
    callbackOaId?: string,
  ) {
    const payload = this.oauth.resolveCallbackSession(state, cookieValue);
    const tokens = await this.oauth.exchangeCode(code, payload.codeVerifier);
    const oa = await this.oauth.fetchOaInfo(tokens.accessToken);
    const oaId = oa.oa_id?.trim() || callbackOaId?.trim();
    if (!oaId) {
      throw new BadRequestException('Zalo không trả về OA ID');
    }
    if (callbackOaId?.trim() && oa.oa_id?.trim() && callbackOaId.trim() !== oa.oa_id.trim()) {
      throw new BadRequestException('OA ID callback không khớp thông tin OA từ Zalo');
    }
    await this.channelConnections.upsertZaloOaOAuth(payload.organizationId, {
      oaId,
      oaName: oa.name,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.expiresAt,
      userId: payload.userId,
    });
    return {
      redirectUrl: this.oauth.buildSuccessRedirect(payload.returnPath),
      oaId,
      oaName: oa.name,
      organizationId: payload.organizationId,
    };
  }

  async connectZbs(organizationId: string, dto: ConnectZaloZbsDto, userId?: string) {
    if (dto.oaConnectionId) {
      await this.ensureZaloConnection(organizationId, dto.oaConnectionId);
    }
    const conn = await this.channelConnections.connectZbs(
      organizationId,
      {
        appId: dto.appId,
        secretKey: dto.secretKey,
        accessToken: dto.accessToken,
        accountRef: dto.accountRef,
        displayName: dto.displayName,
      },
      userId,
    );
    if (dto.oaConnectionId) {
      await this.prisma.messagingChannelConnection.update({
        where: { id: conn.id },
        data: {
          metadata: {
            oaConnectionId: dto.oaConnectionId,
          } as Prisma.InputJsonValue,
        },
      });
    }
    return conn;
  }

  async syncZbsTemplates(organizationId: string, connectionId: string, userId?: string) {
    const conn = await this.ensureZbsConnection(organizationId, connectionId);
    const credentials = this.channelConnections.decryptCredentials(conn.encryptedCredentials);
    const accessToken = credentials.accessToken?.trim();
    if (!accessToken) throw new BadRequestException('Thiếu access token ZBS');

    const remote = await listZaloZbsTemplates({ accessToken, limit: 200 });
    let synced = 0;
    for (const item of remote) {
      const templateId = String(item.template_id || '').trim();
      if (!templateId) continue;
      const vars = extractZbsTemplateVariables(item);
      const approvalStatus = mapZaloTemplateApprovalStatus(item.status || '');
      const existing = await this.prisma.messageTemplate.findFirst({
        where: { organizationId, providerTemplateId: templateId, channel: ZALO_CHANNEL },
      });
      const data = {
        name: item.template_name || templateId,
        body: item.preview_text || item.template_name || templateId,
        variables: vars.map((v) => v.key) as unknown as Prisma.InputJsonValue,
        variableFallbacks: Object.fromEntries(vars.map((v) => [v.key, ''])) as Prisma.InputJsonValue,
        providerTemplateId: templateId,
        providerMode: 'ZBS_TEMPLATE',
        campaignKind: MessagingCampaignKind.TEMPLATE,
        approvalStatus,
        isActive: approvalStatus === MessageTemplateApprovalStatus.APPROVED,
      };
      if (existing) {
        await this.prisma.messageTemplate.update({ where: { id: existing.id }, data });
      } else {
        await this.prisma.messageTemplate.create({
          data: { organizationId, channel: ZALO_CHANNEL, ...data },
        });
      }
      synced += 1;
    }

    await this.prisma.messagingChannelConnection.update({
      where: { id: conn.id },
      data: { lastSyncedAt: new Date() },
    });

    return { synced, total: remote.length, connectionId };
  }

  async listZbsTemplates(organizationId: string, connectionId?: string) {
    if (connectionId) await this.ensureZbsConnection(organizationId, connectionId);
    const rows = await this.prisma.messageTemplate.findMany({
      where: {
        organizationId,
        channel: ZALO_CHANNEL,
        providerMode: 'ZBS_TEMPLATE',
      },
      orderBy: [{ approvalStatus: 'asc' }, { name: 'asc' }],
    });
    return rows;
  }

  async listCampaigns(organizationId: string, query: ZaloCampaignQueryDto) {
    return this.campaigns.list(organizationId, {
      ...query,
      channel: ZALO_CHANNEL,
    });
  }

  async getCampaign(organizationId: string, id: string) {
    const campaign = await this.campaigns.findOne(organizationId, id);
    this.assertZaloCampaign(campaign.channel);
    return campaign;
  }

  async createCampaign(organizationId: string, dto: CreateZaloCampaignDto, userId: string) {
    const oa = await this.ensureZaloConnection(organizationId, dto.channelConnectionId);

    const allowed: MessagingCampaignKind[] = [
      MessagingCampaignKind.BROADCAST,
      MessagingCampaignKind.TRANSACTIONAL,
      MessagingCampaignKind.TEMPLATE,
    ];
    if (!allowed.includes(dto.campaignType)) {
      throw new BadRequestException(
        'Zalo Marketing chỉ hỗ trợ Broadcast, Tin tư vấn (TRANSACTIONAL) hoặc ZBS Template',
      );
    }

    if (dto.campaignType === MessagingCampaignKind.TEMPLATE) {
      if (!dto.messageTemplateId) {
        throw new BadRequestException('ZBS cần chọn template đã duyệt');
      }
      if (!dto.zbsConnectionId) {
        throw new BadRequestException('ZBS cần chọn kết nối ZBS');
      }
      await this.ensureZbsConnection(organizationId, dto.zbsConnectionId);
      const tmpl = await this.prisma.messageTemplate.findFirst({
        where: {
          id: dto.messageTemplateId,
          organizationId,
          channel: ZALO_CHANNEL,
          providerMode: 'ZBS_TEMPLATE',
        },
      });
      if (!tmpl) throw new BadRequestException('Template ZBS không tồn tại');
      if (
        tmpl.approvalStatus !== MessageTemplateApprovalStatus.APPROVED &&
        !tmpl.isActive
      ) {
        throw new BadRequestException('Template ZBS chưa được duyệt');
      }
    }

    if (dto.campaignType === MessagingCampaignKind.BROADCAST) {
      const body = (dto.variables?.body || dto.variables?.message || '').trim();
      if (!body && !dto.variables?.mediaUrl) {
        throw new BadRequestException('Broadcast cần nội dung hoặc ảnh');
      }
    }

    if (dto.campaignType === MessagingCampaignKind.TRANSACTIONAL) {
      const body = (dto.variables?.body || dto.variables?.message || '').trim();
      if (!body) throw new BadRequestException('Tin tư vấn cần nội dung');
    }

    // Audience luôn gắn OA (follower / consult window). ZBS chỉ dùng lúc gửi.
    const segmentConfig = this.normalizeSegmentForMode(
      dto.campaignType,
      (dto.segmentConfig ?? {}) as MessagingSegmentConfig,
      oa.accountRef,
    );

    const variables: Record<string, string> = {
      ...(dto.variables ?? {}),
      ...(dto.zbsConnectionId ? { zbsConnectionId: dto.zbsConnectionId } : {}),
    };

    return this.campaigns.create(
      organizationId,
      {
        name: dto.name,
        channel: ZALO_CHANNEL,
        campaignType: dto.campaignType,
        channelConnectionId: dto.channelConnectionId,
        messageTemplateId: dto.messageTemplateId,
        segmentConfig: segmentConfig as Record<string, unknown>,
        variables,
        timezone: dto.timezone,
      },
      userId,
    );
  }

  private normalizeSegmentForMode(
    kind: MessagingCampaignKind,
    segment: MessagingSegmentConfig,
    oaAccountRef: string,
  ): MessagingSegmentConfig {
    const scopeKey = buildIntegrationScopeKey({
      channel: ZALO_CHANNEL,
      channelAccountRef: oaAccountRef,
    });
    const base: MessagingSegmentConfig = {
      ...segment,
      integrationScopeKey: segment.integrationScopeKey || scopeKey,
      excludeSuppressed: segment.excludeSuppressed !== false,
    };
    if (kind === MessagingCampaignKind.BROADCAST) {
      return {
        ...base,
        followStatuses: ['FOLLOWING'],
        requireOptIn: false,
      };
    }
    if (kind === MessagingCampaignKind.TRANSACTIONAL) {
      return {
        ...base,
        requireOptIn: true,
        // Eligibility 48h cửa sổ tư vấn được worker/API kiểm tra trước enqueue
      };
    }
    return base;
  }

  async updateCampaign(
    organizationId: string,
    id: string,
    dto: UpdateZaloCampaignDto,
    userId: string,
  ) {
    const existing = await this.getCampaign(organizationId, id);
    if (dto.channelConnectionId) {
      await this.ensureZaloConnection(organizationId, dto.channelConnectionId);
    }
    if (dto.zbsConnectionId) {
      await this.ensureZbsConnection(organizationId, dto.zbsConnectionId);
    }

    const nextType = dto.campaignType ?? existing.campaignType;
    const oaId = dto.channelConnectionId ?? existing.channelConnectionId;
    let segmentConfig = dto.segmentConfig as MessagingSegmentConfig | undefined;
    if (oaId && (dto.segmentConfig || dto.campaignType)) {
      const oa = await this.ensureZaloConnection(organizationId, oaId);
      segmentConfig = this.normalizeSegmentForMode(
        nextType,
        (dto.segmentConfig ?? existing.segmentConfig ?? {}) as MessagingSegmentConfig,
        oa.accountRef,
      );
    }

    const variables = {
      ...((existing.variables ?? {}) as Record<string, string>),
      ...(dto.variables ?? {}),
      ...(dto.zbsConnectionId ? { zbsConnectionId: dto.zbsConnectionId } : {}),
    };

    return this.campaigns.update(
      organizationId,
      id,
      {
        name: dto.name,
        campaignType: dto.campaignType,
        channelConnectionId: dto.channelConnectionId ?? undefined,
        messageTemplateId: dto.messageTemplateId ?? undefined,
        segmentConfig: segmentConfig as Record<string, unknown> | undefined,
        variables,
        timezone: dto.timezone,
      },
      userId,
    );
  }

  async previewAudience(organizationId: string, dto: PreviewZaloAudienceDto) {
    const connectionId = dto.channelConnectionId;
    if (!connectionId) throw new BadRequestException('Chọn OA trước khi xem khách');
    const oa = await this.ensureZaloConnection(organizationId, connectionId);
    const kind = dto.campaignType ?? MessagingCampaignKind.BROADCAST;
    const segmentConfig = this.normalizeSegmentForMode(
      kind,
      (dto.segmentConfig ?? {}) as MessagingSegmentConfig,
      oa.accountRef,
    );
    const preview = await this.segment.preview(
      organizationId,
      ZALO_CHANNEL,
      segmentConfig,
      connectionId,
    );

    let eligible = 0;
    let ineligible = 0;
    let estimatedCost = 0;
    const reasonBreakdown: Record<string, number> = {};
    const sampleLimit = Math.min(preview.identityIds.length, 200);
    const eligibilityType = mapCampaignKindToEligibilityType(kind);

    for (const identityId of preview.identityIds.slice(0, sampleLimit)) {
      const result = await this.eligibility.check({
        organizationId,
        channel: ZALO_CHANNEL,
        campaignType: eligibilityType,
        identityId,
        connectionId,
      });
      if (result.eligible) {
        eligible += 1;
        estimatedCost += result.estimatedCost ?? 0;
      } else {
        ineligible += 1;
        const code = result.reasonCode ?? 'UNKNOWN';
        reasonBreakdown[code] = (reasonBreakdown[code] ?? 0) + 1;
      }
    }

    const conditions =
      kind === MessagingCampaignKind.BROADCAST
        ? 'Chỉ người đang Quan tâm OA; kiểm tra quota broadcast; loại opt-out/block'
        : kind === MessagingCampaignKind.TRANSACTIONAL
          ? 'Chỉ user đã tương tác/opt-in trong cửa sổ tư vấn 48h; quyền OA/tier'
          : 'Template ZBS đã duyệt; gửi theo UID/SĐT đủ điều kiện; trừ chi phí nếu API trả về';

    return {
      ...preview,
      campaignType: kind,
      conditions,
      oa: { id: oa.id, accountRef: oa.accountRef, displayName: oa.displayName },
      eligible,
      ineligible,
      estimatedCost,
      reasonBreakdown,
      scanned: sampleLimit,
      totalAudience: preview.total,
    };
  }

  async previewCampaign(organizationId: string, id: string, dto: PreviewZaloCampaignDto) {
    const campaign = await this.getCampaign(organizationId, id);
    const segmentConfig = (campaign.segmentConfig ?? {}) as MessagingSegmentConfig;
    const identityIds =
      dto.sampleIdentityIds?.length
        ? dto.sampleIdentityIds
        : segmentConfig.identityIds?.slice(0, 5) ?? [];

    const samples = await this.prisma.messagingContactIdentity.findMany({
      where: { organizationId, id: { in: identityIds } },
      take: 5,
    });

    const template = campaign.messageTemplateId
      ? await this.prisma.messageTemplate.findFirst({
          where: { id: campaign.messageTemplateId, organizationId },
        })
      : null;

    const campaignVars = (campaign.variables ?? {}) as Record<string, string>;
    const body = template?.body || campaignVars.body || '';

    return {
      campaignId: id,
      samples: samples.map((identity) => {
        const ctx: Record<string, string> = {
          ...pickCampaignRenderVariables(campaignVars),
          phone: identity.phoneNormalized ?? '',
          order_code: campaignVars.order_code ?? '',
          voucher: campaignVars.voucher ?? '',
        };
        const names = resolveMessagingDisplayNames(identity.displayName);
        ctx.full_name = names.full_name;
        ctx.first_name = names.first_name;
        ctx.customer_name = names.customer_name;
        ctx.name = names.full_name;
        const { rendered, missingKeys } = renderTemplateWithFallbacks(body, ctx, {
          ...MESSAGING_NAME_FALLBACKS,
          ...((template?.variableFallbacks ?? {}) as Record<string, string>),
        });
        return {
          identityId: identity.id,
          displayName: identity.displayName,
          phone: identity.phoneNormalized,
          externalUserId: identity.externalUserId,
          rendered,
          missingKeys,
        };
      }),
    };
  }

  async importAudience(
    organizationId: string,
    connectionId: string,
    file: Express.Multer.File | undefined,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('Thiếu file CSV/XLSX');
    const conn = await this.ensureZaloConnection(organizationId, connectionId);
    const scopeKey = buildIntegrationScopeKey({
      channel: ZALO_CHANNEL,
      channelAccountRef: conn.accountRef,
    });
    const rows = parseContactSpreadsheet(file);
    const identityIds: string[] = [];

    for (const row of rows) {
      const phone = (row.phone || '').replace(/\D/g, '');
      const uid = (row.uid || '').trim();
      const name = (row.name || '').trim() || 'Khách Zalo';
      if (!phone && !uid) continue;

      const externalUserId = uid || phone;
      const existing = await this.prisma.messagingContactIdentity.findFirst({
        where: {
          organizationId,
          channel: ZALO_CHANNEL,
          integrationScopeKey: scopeKey,
          externalUserId,
        },
      });
      if (existing) {
        await this.prisma.messagingContactIdentity.update({
          where: { id: existing.id },
          data: {
            displayName: name,
            phoneNormalized: phone || existing.phoneNormalized,
          },
        });
        identityIds.push(existing.id);
        continue;
      }
      const created = await this.prisma.messagingContactIdentity.create({
        data: {
          organizationId,
          channel: ZALO_CHANNEL,
          integrationScopeKey: scopeKey,
          externalUserId,
          displayName: name,
          phoneNormalized: phone || null,
          consentStatus: MessagingConsentStatus.UNKNOWN,
        },
      });
      identityIds.push(created.id);
    }

    return {
      imported: identityIds.length,
      identityIds,
      segmentConfig: { identityIds, integrationScopeKey: scopeKey } satisfies MessagingSegmentConfig,
    };
  }

  async testZbsSend(organizationId: string, dto: TestZaloZbsSendDto) {
    const conn = await this.ensureZbsConnection(organizationId, dto.connectionId);
    const credentials = this.channelConnections.decryptCredentials(conn.encryptedCredentials);
    const phone = dto.phone?.trim();
    const userId = dto.userId?.trim();
    if (!phone && !userId) throw new BadRequestException('Cần SĐT hoặc UID');
    const live =
      process.env.MESSAGING_LIVE_SEND === 'true' ||
      (process.env.MESSAGING_LIVE_OA_IDS ?? '')
        .split(',')
        .map((s) => s.trim())
        .includes(conn.accountRef);
    if (!live) {
      return {
        dryRun: true,
        message: 'Dry-run — bật MESSAGING_LIVE_SEND hoặc thêm OA vào MESSAGING_LIVE_OA_IDS',
      };
    }
    const result = await sendZbsTemplateHttp({
      accessToken: credentials.accessToken ?? '',
      phone,
      userId,
      templateId: dto.templateId,
      templateData: dto.templateData,
    });
    return result;
  }

  async reports(organizationId: string) {
    const campaigns = await this.prisma.messagingCampaign.findMany({
      where: { organizationId, channel: ZALO_CHANNEL },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        name: true,
        status: true,
        campaignType: true,
        totalRecipients: true,
        eligibleCount: true,
        excludedCount: true,
        queuedCount: true,
        sentCount: true,
        deliveredCount: true,
        failedCount: true,
        estimatedCost: true,
        actualCost: true,
        startedAt: true,
        completedAt: true,
        updatedAt: true,
        channelConnection: { select: { displayName: true, accountRef: true } },
      },
    });
    const totals = campaigns.reduce(
      (acc, c) => {
        acc.recipients += c.totalRecipients;
        acc.sent += c.sentCount;
        acc.delivered += c.deliveredCount;
        acc.failed += c.failedCount;
        acc.cost += Number(c.actualCost ?? c.estimatedCost ?? 0);
        return acc;
      },
      { recipients: 0, sent: 0, delivered: 0, failed: 0, cost: 0 },
    );
    return { totals, campaigns };
  }

  schedule(organizationId: string, id: string, dto: ScheduleZaloCampaignDto, userId: string) {
    return this.campaigns.schedule(organizationId, id, dto, userId);
  }

  start(organizationId: string, id: string, userId: string) {
    return this.campaigns.start(organizationId, id, userId);
  }

  pause(organizationId: string, id: string, userId: string) {
    return this.campaigns.pause(organizationId, id, userId);
  }

  previewSegment(organizationId: string, id: string) {
    return this.campaigns.previewSegment(organizationId, id);
  }

  previewEligibility(organizationId: string, id: string, body: { limit?: number; identityIds?: string[] }) {
    return this.campaigns.previewEligibility(organizationId, id, body);
  }

  dashboard(organizationId: string, id: string) {
    return this.campaigns.getDashboard(organizationId, id);
  }

  remove(organizationId: string, id: string, userId: string) {
    return this.campaigns.remove(organizationId, id, userId);
  }

  private assertZaloCampaign(channel: MessageChannel) {
    if (channel !== ZALO_CHANNEL) {
      throw new NotFoundException('Chiến dịch Zalo không tồn tại');
    }
  }

  private async ensureZaloConnection(organizationId: string, id: string) {
    return this.ensureZaloOaRow(organizationId, id);
  }

  private async ensureZaloOaRow(organizationId: string, id: string) {
    const row = await this.prisma.messagingChannelConnection.findFirst({
      where: {
        id,
        organizationId,
        channel: ZALO_CHANNEL,
        providerKind: MessagingProviderKind.ZALO_OA,
      },
    });
    if (!row) throw new NotFoundException('OA Zalo không tồn tại hoặc thuộc tenant khác');
    return row;
  }

  private async ensureZbsConnection(organizationId: string, id: string) {
    const row = await this.prisma.messagingChannelConnection.findFirst({
      where: {
        id,
        organizationId,
        channel: ZALO_CHANNEL,
        providerKind: MessagingProviderKind.ZBS_TEMPLATE,
      },
    });
    if (!row) throw new NotFoundException('Kết nối ZBS không tồn tại hoặc thuộc tenant khác');
    return row;
  }
}
