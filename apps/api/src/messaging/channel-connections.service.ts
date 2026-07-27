import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AutoPostStatus,
  MessageChannel,
  MessagingCampaignStatus,
  MessagingChannelAccountStatus,
  MessagingProviderKind,
  Prisma,
} from '@marketingspa/database';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { encryptSecret, decryptSecret, maskSecret } from '../common/utils/encryption.util';
import { redactForAudit, sanitizePublicMetadata } from '../common/utils/token-security.util';
import { AUTO_POST_QUEUE } from '../queue/queue.constants';
import { MessagingProviderRegistry } from './providers/messaging-provider.registry';
import type {
  ConnectMessengerChannelDto,
  ConnectZaloChannelDto,
  ConnectZbsChannelDto,
  ReconnectChannelDto,
} from './dto/channel-connection.dto';

@Injectable()
export class ChannelConnectionsService {
  private readonly logger = new Logger(ChannelConnectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly providers: MessagingProviderRegistry,
    @Inject(AUTO_POST_QUEUE) private readonly autoPostQueue: Queue,
  ) {}

  list(organizationId: string) {
    return this.prisma.messagingChannelConnection
      .findMany({
        where: { organizationId },
        orderBy: [{ channel: 'asc' }, { displayName: 'asc' }],
      })
      .then((rows) => rows.map((r) => this.toPublic(r)));
  }

  async connectMessenger(organizationId: string, dto: ConnectMessengerChannelDto, userId?: string) {
    const credentials = {
      pageAccessToken: dto.pageAccessToken.trim(),
      pageId: dto.pageId.trim(),
    };
    return this.upsertConnection({
      organizationId,
      channel: MessageChannel.MESSENGER,
      providerKind: MessagingProviderKind.MESSENGER,
      accountRef: dto.pageId.trim(),
      displayName: dto.pageName,
      credentials,
      userId,
      webhookSubscribed: dto.subscribeWebhook ?? false,
    });
  }

  /**
   * Đồng bộ từ Chatbot — lưu connection kể cả khi Graph validate fail
   * (token có thể thiếu permission; vẫn dùng được cho dry-run / cấu hình).
   */
  async upsertMessengerFromChatbot(
    organizationId: string,
    dto: ConnectMessengerChannelDto,
    userId?: string,
  ) {
    const credentials = {
      pageAccessToken: dto.pageAccessToken.trim(),
      pageId: dto.pageId.trim(),
    };
    try {
      return await this.upsertConnection({
        organizationId,
        channel: MessageChannel.MESSENGER,
        providerKind: MessagingProviderKind.MESSENGER,
        accountRef: dto.pageId.trim(),
        displayName: dto.pageName,
        credentials,
        userId,
        webhookSubscribed: dto.subscribeWebhook ?? false,
      });
    } catch (e) {
      // Fallback: lưu credentials + REAUTH_REQUIRED nếu Meta reject token
      const encrypted = encryptSecret(JSON.stringify(credentials), this.getEncryptionKey());
      const row = await this.prisma.messagingChannelConnection.upsert({
        where: {
          organizationId_channel_accountRef: {
            organizationId,
            channel: MessageChannel.MESSENGER,
            accountRef: dto.pageId.trim(),
          },
        },
        create: {
          organizationId,
          channel: MessageChannel.MESSENGER,
          providerKind: MessagingProviderKind.MESSENGER,
          accountRef: dto.pageId.trim(),
          displayName: dto.pageName,
          encryptedCredentials: encrypted,
          status: MessagingChannelAccountStatus.REAUTH_REQUIRED,
          permissions: [],
          webhookSubscribed: dto.subscribeWebhook ?? false,
          lastTestedAt: new Date(),
        },
        update: {
          displayName: dto.pageName,
          encryptedCredentials: encrypted,
          status: MessagingChannelAccountStatus.REAUTH_REQUIRED,
          webhookSubscribed: dto.subscribeWebhook ?? undefined,
          lastTestedAt: new Date(),
          isPaused: false,
        },
      });
      await this.audit.log({
        organizationId,
        userId,
        action: 'MESSAGING_CHANNEL_CONNECTED',
        entityType: 'MESSAGING_CHANNEL_CONNECTION',
        entityId: row.id,
        metadata: redactForAudit({
          channel: MessageChannel.MESSENGER,
          accountRef: dto.pageId.trim(),
          reauthRequired: true,
          reason: e instanceof Error ? e.message : String(e),
        }) as Prisma.InputJsonValue,
      });
      return this.toPublic(row);
    }
  }

  async connectZaloOa(organizationId: string, dto: ConnectZaloChannelDto, userId?: string) {
    const credentials = {
      accessToken: dto.accessToken.trim(),
      oaId: dto.oaId.trim(),
      webhookSecret: dto.webhookSecret?.trim() ?? '',
    };
    return this.upsertConnection({
      organizationId,
      channel: MessageChannel.ZALO,
      providerKind: MessagingProviderKind.ZALO_OA,
      accountRef: dto.oaId.trim(),
      displayName: dto.oaName,
      credentials,
      userId,
    });
  }

  async connectZbs(organizationId: string, dto: ConnectZbsChannelDto, userId?: string) {
    const credentials = {
      appId: dto.appId.trim(),
      secretKey: dto.secretKey.trim(),
      accessToken: dto.accessToken.trim(),
    };
    return this.upsertConnection({
      organizationId,
      channel: MessageChannel.ZALO,
      providerKind: MessagingProviderKind.ZBS_TEMPLATE,
      accountRef: dto.accountRef.trim(),
      displayName: dto.displayName,
      credentials,
      userId,
    });
  }

  async test(organizationId: string, id: string, userId?: string) {
    const row = await this.ensureConnection(organizationId, id);
    const credentials = this.decryptCredentials(row.encryptedCredentials);
    const provider = this.providers.get(row.providerKind);
    const result = await provider.validateConnection({
      organizationId,
      accountRef: row.accountRef,
      credentials,
    });

    const status = result.valid
      ? MessagingChannelAccountStatus.ACTIVE
      : this.mapInvalidStatus(result.message);

    const updated = await this.prisma.messagingChannelConnection.update({
      where: { id: row.id },
      data: {
        status,
        displayName: result.displayName ?? row.displayName,
        permissions: (result.permissions ?? []) as Prisma.InputJsonValue,
        tokenExpiresAt: result.tokenExpiresAt,
        lastTestedAt: new Date(),
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'MESSAGING_CHANNEL_TESTED',
      entityType: 'MESSAGING_CHANNEL_CONNECTION',
      entityId: id,
      metadata: redactForAudit({ valid: result.valid, status }) as Prisma.InputJsonValue,
    });

    return { ...result, connection: this.toPublic(updated) };
  }

  async reconnect(
    organizationId: string,
    id: string,
    dto: ReconnectChannelDto,
    userId?: string,
  ) {
    const row = await this.ensureConnection(organizationId, id);
    const encrypted = encryptSecret(JSON.stringify(dto.credentials), this.getEncryptionKey());
    const provider = this.providers.get(row.providerKind);
    const validated = await provider.validateConnection({
      organizationId,
      accountRef: row.accountRef,
      credentials: dto.credentials,
    });
    if (!validated.valid) {
      throw new BadRequestException(validated.message);
    }

    const updated = await this.prisma.messagingChannelConnection.update({
      where: { id: row.id },
      data: {
        encryptedCredentials: encrypted,
        status: MessagingChannelAccountStatus.ACTIVE,
        displayName: validated.displayName ?? row.displayName,
        permissions: (validated.permissions ?? []) as Prisma.InputJsonValue,
        tokenExpiresAt: validated.tokenExpiresAt,
        lastTestedAt: new Date(),
        isPaused: false,
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'MESSAGING_CHANNEL_RECONNECTED',
      entityType: 'MESSAGING_CHANNEL_CONNECTION',
      entityId: id,
    });

    return this.toPublic(updated);
  }

  async setPaused(organizationId: string, id: string, isPaused: boolean, userId?: string) {
    const row = await this.ensureConnection(organizationId, id);
    const updated = await this.prisma.messagingChannelConnection.update({
      where: { id: row.id },
      data: {
        isPaused,
        status: isPaused ? MessagingChannelAccountStatus.PAUSED : row.status,
      },
    });
    await this.audit.log({
      organizationId,
      userId,
      action: isPaused ? 'MESSAGING_CHANNEL_PAUSED' : 'MESSAGING_CHANNEL_RESUMED',
      entityType: 'MESSAGING_CHANNEL_CONNECTION',
      entityId: id,
    });
    return this.toPublic(updated);
  }

  async remove(organizationId: string, id: string, userId?: string) {
    const row = await this.ensureConnection(organizationId, id);
    if (row.channel === MessageChannel.MESSENGER) {
      await this.disableMessengerPageAccess(row.accountRef, {
        organizationId,
        reason: 'Channel connection removed',
      });
      const updated = await this.prisma.messagingChannelConnection.findUnique({ where: { id } });
      await this.audit.log({
        organizationId,
        userId,
        action: 'MESSAGING_CHANNEL_REMOVED',
        entityType: 'MESSAGING_CHANNEL_CONNECTION',
        entityId: id,
      });
      return {
        message: 'Đã xóa kết nối',
        connection: updated ? this.toPublic(updated) : null,
      };
    }
    const updated = await this.prisma.messagingChannelConnection.update({
      where: { id: row.id },
      data: {
        status: MessagingChannelAccountStatus.DISCONNECTED,
        encryptedCredentials: null,
        isPaused: true,
        webhookSubscribed: false,
        permissions: [],
        tokenExpiresAt: null,
      },
    });
    await this.audit.log({
      organizationId,
      userId,
      action: 'MESSAGING_CHANNEL_REMOVED',
      entityType: 'MESSAGING_CHANNEL_CONNECTION',
      entityId: id,
    });
    return { message: 'Đã xóa kết nối', connection: this.toPublic(updated) };
  }

  async findByAccountRef(channel: MessageChannel, accountRef: string) {
    return this.prisma.messagingChannelConnection.findFirst({
      where: { channel, accountRef },
    });
  }

  /**
   * Disconnect / deauthorize Fanpage:
   * - vô hiệu MessagingChannelConnection (clear token, pause)
   * - pause campaign liên quan (SCHEDULED/PLANNING/RUNNING)
   * - hủy Auto Post lịch đăng theo pageId
   * Không log token.
   */
  async disableMessengerPageAccess(
    pageId: string,
    opts?: { organizationId?: string; reason?: string },
  ): Promise<{
    connectionsDisabled: number;
    campaignsPaused: number;
    autoPostsCancelled: number;
  }> {
    const pageIdTrim = pageId?.trim();
    if (!pageIdTrim) {
      return { connectionsDisabled: 0, campaignsPaused: 0, autoPostsCancelled: 0 };
    }

    const whereConn: Prisma.MessagingChannelConnectionWhereInput = {
      channel: MessageChannel.MESSENGER,
      accountRef: pageIdTrim,
      ...(opts?.organizationId ? { organizationId: opts.organizationId } : {}),
    };

    const connections = await this.prisma.messagingChannelConnection.findMany({
      where: whereConn,
      select: { id: true, organizationId: true },
    });

    if (connections.length > 0) {
      await this.prisma.messagingChannelConnection.updateMany({
        where: { id: { in: connections.map((c) => c.id) } },
        data: {
          status: MessagingChannelAccountStatus.DISCONNECTED,
          encryptedCredentials: null,
          isPaused: true,
          webhookSubscribed: false,
          permissions: [],
          tokenExpiresAt: null,
        },
      });
    }

    const connectionIds = connections.map((c) => c.id);
    let campaignsPaused = 0;
    if (connectionIds.length > 0) {
      const paused = await this.prisma.messagingCampaign.updateMany({
        where: {
          channelConnectionId: { in: connectionIds },
          status: {
            in: [
              MessagingCampaignStatus.SCHEDULED,
              MessagingCampaignStatus.PLANNING,
              MessagingCampaignStatus.RUNNING,
            ],
          },
        },
        data: { status: MessagingCampaignStatus.PAUSED },
      });
      campaignsPaused = paused.count;
    }

    const scheduledPosts = await this.prisma.autoPost.findMany({
      where: {
        fanpagePageId: pageIdTrim,
        status: AutoPostStatus.SCHEDULED,
        ...(opts?.organizationId ? { organizationId: opts.organizationId } : {}),
      },
      select: { id: true },
    });

    let autoPostsCancelled = 0;
    for (const post of scheduledPosts) {
      try {
        const job = await this.autoPostQueue.getJob(`auto-post-${post.id}`);
        if (job) await job.remove();
      } catch (e) {
        this.logger.warn(
          `Failed to remove auto-post job ${post.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    if (scheduledPosts.length > 0) {
      const cancelled = await this.prisma.autoPost.updateMany({
        where: { id: { in: scheduledPosts.map((p) => p.id) } },
        data: {
          status: AutoPostStatus.CANCELLED,
          scheduledAt: null,
          errorMessage: opts?.reason?.slice(0, 500) || 'Cancelled: Fanpage disconnected',
        },
      });
      autoPostsCancelled = cancelled.count;
    }

    for (const orgId of [...new Set(connections.map((c) => c.organizationId))]) {
      void this.audit
        .log({
          organizationId: orgId,
          action: 'MESSAGING_CHANNEL_DISABLED_BY_FANPAGE_DISCONNECT',
          entityType: 'MESSAGING_CHANNEL_CONNECTION',
          entityId: `••••${pageIdTrim.slice(-4)}`,
          metadata: {
            pageIdMasked: `••••${pageIdTrim.slice(-4)}`,
            connectionsDisabled: connections.length,
            campaignsPaused,
            autoPostsCancelled,
            reason: opts?.reason,
          },
        })
        .catch(() => undefined);
    }

    this.logger.log(
      `Disabled Messenger page ••••${pageIdTrim.slice(-4)} connections=${connections.length} campaigns=${campaignsPaused} autoPosts=${autoPostsCancelled}`,
    );

    return {
      connectionsDisabled: connections.length,
      campaignsPaused,
      autoPostsCancelled,
    };
  }

  decryptCredentials(encrypted: string | null): Record<string, string> {
    if (!encrypted) return {};
    return JSON.parse(decryptSecret(encrypted, this.getEncryptionKey())) as Record<string, string>;
  }

  private async upsertConnection(params: {
    organizationId: string;
    channel: MessageChannel;
    providerKind: MessagingProviderKind;
    accountRef: string;
    displayName?: string;
    credentials: Record<string, string>;
    userId?: string;
    webhookSubscribed?: boolean;
  }) {
    const provider = this.providers.get(params.providerKind);
    const validated = await provider.validateConnection({
      organizationId: params.organizationId,
      accountRef: params.accountRef,
      credentials: params.credentials,
    });
    if (!validated.valid) {
      throw new BadRequestException(validated.message);
    }

    const encrypted = encryptSecret(JSON.stringify(params.credentials), this.getEncryptionKey());
    const hint = Object.values(params.credentials).find((v) => v?.trim());
    const metadata = sanitizePublicMetadata({
      accountHint: hint ? maskSecret(hint) : undefined,
    });

    const existingGlobal = await this.prisma.messagingChannelConnection.findFirst({
      where: { channel: params.channel, accountRef: params.accountRef },
    });
    if (existingGlobal && existingGlobal.organizationId !== params.organizationId) {
      throw new NotFoundException('Kết nối kênh không tồn tại');
    }

    const row = await this.prisma.messagingChannelConnection.upsert({
      where: {
        organizationId_channel_accountRef: {
          organizationId: params.organizationId,
          channel: params.channel,
          accountRef: params.accountRef,
        },
      },
      create: {
        organizationId: params.organizationId,
        channel: params.channel,
        providerKind: params.providerKind,
        accountRef: params.accountRef,
        displayName: validated.displayName ?? params.displayName,
        encryptedCredentials: encrypted,
        status: MessagingChannelAccountStatus.ACTIVE,
        permissions: (validated.permissions ?? []) as Prisma.InputJsonValue,
        tokenExpiresAt: validated.tokenExpiresAt,
        lastTestedAt: new Date(),
        webhookSubscribed: params.webhookSubscribed ?? false,
        metadata: metadata as Prisma.InputJsonValue,
      },
      update: {
        displayName: validated.displayName ?? params.displayName,
        encryptedCredentials: encrypted,
        status: MessagingChannelAccountStatus.ACTIVE,
        permissions: (validated.permissions ?? []) as Prisma.InputJsonValue,
        tokenExpiresAt: validated.tokenExpiresAt,
        lastTestedAt: new Date(),
        isPaused: false,
        webhookSubscribed: params.webhookSubscribed ?? undefined,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });

    await this.audit.log({
      organizationId: params.organizationId,
      userId: params.userId,
      action: 'MESSAGING_CHANNEL_CONNECTED',
      entityType: 'MESSAGING_CHANNEL_CONNECTION',
      entityId: row.id,
      metadata: redactForAudit({
        channel: params.channel,
        providerKind: params.providerKind,
        accountRef: params.accountRef,
      }) as Prisma.InputJsonValue,
    });

    return this.toPublic(row);
  }

  private async ensureConnection(organizationId: string, id: string) {
    const row = await this.prisma.messagingChannelConnection.findFirst({
      where: { id, organizationId },
    });
    if (!row) throw new NotFoundException('Kết nối kênh không tồn tại');
    return row;
  }

  private getEncryptionKey(): string {
    const key = this.config.get<string>('ENCRYPTION_KEY');
    if (!key || key.length < 16) {
      throw new BadRequestException('ENCRYPTION_KEY chưa được cấu hình');
    }
    return key;
  }

  private mapInvalidStatus(message: string): MessagingChannelAccountStatus {
    const lower = message.toLowerCase();
    if (lower.includes('expired') || lower.includes('hết hạn')) {
      return MessagingChannelAccountStatus.EXPIRED;
    }
    if (lower.includes('oauth') || lower.includes('reauth') || lower.includes('permission')) {
      return MessagingChannelAccountStatus.REAUTH_REQUIRED;
    }
    return MessagingChannelAccountStatus.ERROR;
  }

  private toPublic(row: {
    id: string;
    organizationId: string;
    channel: MessageChannel;
    providerKind: MessagingProviderKind;
    accountRef: string;
    displayName: string | null;
    status: MessagingChannelAccountStatus;
    permissions: unknown;
    tokenExpiresAt: Date | null;
    lastSyncedAt: Date | null;
    lastTestedAt: Date | null;
    webhookSubscribed: boolean;
    isPaused: boolean;
    metadata: unknown;
    encryptedCredentials: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      channel: row.channel,
      providerKind: row.providerKind,
      accountRef: row.accountRef,
      displayName: row.displayName,
      status: row.status,
      permissions: row.permissions,
      tokenExpiresAt: row.tokenExpiresAt,
      lastSyncedAt: row.lastSyncedAt,
      lastTestedAt: row.lastTestedAt,
      webhookSubscribed: row.webhookSubscribed,
      isPaused: row.isPaused,
      hasCredentials: Boolean(row.encryptedCredentials),
      metadata: sanitizePublicMetadata(row.metadata),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
