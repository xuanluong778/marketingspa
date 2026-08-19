import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AutoPostFacebookConnectionStatus,
  AutoPostStatus,
  IntegrationProvider,
  IntegrationStatus,
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
import {
  decodeStoredSecret,
  redactForAudit,
  sanitizePublicMetadata,
} from '../common/utils/token-security.util';
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

  async list(organizationId: string) {
    try {
      await this.hydrateMissingFromOrgSources(organizationId);
    } catch (e) {
      this.logger.warn(
        `Auto-hydrate channel connections failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    const rows = await this.prisma.messagingChannelConnection.findMany({
      where: { organizationId },
      orderBy: [{ channel: 'asc' }, { displayName: 'asc' }],
    });
    return rows.map((r) => this.toPublic(r));
  }

  /**
   * Đồng bộ khi Messaging thiếu Fanpage đã có ở Auto Post / Chatbot (idempotent).
   * Không chỉ hydrate khi list rỗng — tránh bỏ sót sau khi đã có Zalo hoặc kết nối cũ.
   */
  private async hydrateMissingFromOrgSources(organizationId: string) {
    const existing = await this.prisma.messagingChannelConnection.findMany({
      where: { organizationId, channel: MessageChannel.MESSENGER },
      select: { accountRef: true },
    });
    const have = new Set(existing.map((r) => r.accountRef));

    const [chatbotPages, autoPostPages] = await Promise.all([
      this.prisma.chatbotFacebookPage.findMany({
        where: {
          organizationId,
          OR: [
            { status: 'connected' },
            { status: 'CONNECTED' },
            { pageAccessTokenEncrypted: { not: '' } },
          ],
        },
        select: { pageId: true },
      }),
      this.prisma.autoPostFacebookPage.findMany({
        where: {
          connection: {
            organizationId,
            status: AutoPostFacebookConnectionStatus.CONNECTED,
          },
        },
        select: { pageId: true },
      }),
    ]);

    const sourceIds = [
      ...new Set([
        ...chatbotPages.map((p) => p.pageId),
        ...autoPostPages.map((p) => p.pageId),
      ]),
    ];
    if (sourceIds.length === 0) return;
    const missing = sourceIds.some((id) => !have.has(id));
    if (!missing) return;

    await this.syncFromOrgSources(organizationId);
  }

  /**
   * Đồng bộ Fanpage/OA đã kết nối (Chatbot + Content Auto Post) → MessagingChannelConnection.
   * Idempotent upsert; không ghi đè token hợp lệ bằng chuỗi rỗng.
   */
  async syncFromOrgSources(organizationId: string, userId?: string) {
    const results: Array<{
      pageId: string;
      pageName: string | null;
      source: 'chatbot' | 'auto_post' | 'integration_zalo';
      ok: boolean;
      error?: string;
      connectionId?: string;
    }> = [];

    const chatbotPages = await this.prisma.chatbotFacebookPage.findMany({
      where: {
        organizationId,
        OR: [{ status: 'connected' }, { status: 'CONNECTED' }, { pageAccessTokenEncrypted: { not: '' } }],
      },
      orderBy: { updatedAt: 'desc' },
    });

    for (const page of chatbotPages) {
      try {
        const token = this.decodeFlexibleSecret(page.pageAccessTokenEncrypted);
        if (!token) {
          results.push({
            pageId: page.pageId,
            pageName: page.pageName,
            source: 'chatbot',
            ok: false,
            error: 'Thiếu Page Access Token',
          });
          continue;
        }
        const connection = await this.upsertMessengerFromChatbot(
          organizationId,
          {
            pageId: page.pageId,
            pageAccessToken: token,
            pageName: page.pageName ?? undefined,
            subscribeWebhook: page.webhookSubscribed,
          },
          userId,
        );
        results.push({
          pageId: page.pageId,
          pageName: page.pageName,
          source: 'chatbot',
          ok: true,
          connectionId: connection.id,
        });
      } catch (e) {
        results.push({
          pageId: page.pageId,
          pageName: page.pageName,
          source: 'chatbot',
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const autoPostPages = await this.prisma.autoPostFacebookPage.findMany({
      where: {
        connection: {
          organizationId,
          status: AutoPostFacebookConnectionStatus.CONNECTED,
        },
      },
      include: {
        connection: { select: { organizationId: true, status: true, scopes: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    for (const page of autoPostPages) {
      try {
        const token = this.decryptCredentialsOrRaw(page.encryptedPageAccessToken);
        if (!token) {
          results.push({
            pageId: page.pageId,
            pageName: page.pageName,
            source: 'auto_post',
            ok: false,
            error: 'Thiếu Page Access Token (Auto Post)',
          });
          continue;
        }
        const connection = await this.upsertMessengerFromChatbot(
          organizationId,
          {
            pageId: page.pageId,
            pageAccessToken: token,
            pageName: page.pageName ?? undefined,
            subscribeWebhook: true,
          },
          userId,
          { grantedScopes: page.connection.scopes ?? [] },
        );
        results.push({
          pageId: page.pageId,
          pageName: page.pageName,
          source: 'auto_post',
          ok: true,
          connectionId: connection.id,
        });
      } catch (e) {
        results.push({
          pageId: page.pageId,
          pageName: page.pageName,
          source: 'auto_post',
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // Zalo OA từ Integration legacy (nếu có credential)
    const zaloIntegrations = await this.prisma.integration.findMany({
      where: {
        organizationId,
        provider: IntegrationProvider.ZALO_OA,
        status: {
          in: [
            IntegrationStatus.ACTIVE,
            IntegrationStatus.REAUTH_REQUIRED,
            IntegrationStatus.EXPIRED,
          ],
        },
      },
    });
    for (const row of zaloIntegrations) {
      try {
        const creds = this.decryptCredentials(row.encryptedCredentials);
        const oaId = (creds.oaId || creds.accountId || creds.id || '').trim();
        const accessToken = (creds.accessToken || creds.token || '').trim();
        if (!oaId || !accessToken) {
          results.push({
            pageId: oaId || row.id,
            pageName: null,
            source: 'integration_zalo',
            ok: false,
            error: 'Integration Zalo thiếu oaId/token',
          });
          continue;
        }
        const connection = await this.connectZaloOa(
          organizationId,
          {
            oaId,
            accessToken,
            oaName: typeof row.metadata === 'object' && row.metadata && 'name' in row.metadata
              ? String((row.metadata as { name?: string }).name ?? oaId)
              : oaId,
          },
          userId,
        );
        results.push({
          pageId: oaId,
          pageName: connection.displayName ?? oaId,
          source: 'integration_zalo',
          ok: true,
          connectionId: connection.id,
        });
      } catch (e) {
        results.push({
          pageId: row.id,
          pageName: null,
          source: 'integration_zalo',
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return {
      synced: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
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
   * Đồng bộ từ Chatbot / Auto Post — lưu connection kể cả khi Graph validate fail
   * (token có thể thiếu permission; vẫn dùng được cho dry-run / cấu hình).
   * Không ghi đè token hợp lệ bằng chuỗi rỗng.
   */
  async upsertMessengerFromChatbot(
    organizationId: string,
    dto: ConnectMessengerChannelDto,
    userId?: string,
    opts?: { grantedScopes?: string[] },
  ) {
    const pageId = dto.pageId.trim();
    const incomingToken = dto.pageAccessToken.trim();
    const existing = await this.prisma.messagingChannelConnection.findUnique({
      where: {
        organizationId_channel_accountRef: {
          organizationId,
          channel: MessageChannel.MESSENGER,
          accountRef: pageId,
        },
      },
    });

    let pageAccessToken = incomingToken;
    if (!pageAccessToken && existing?.encryptedCredentials) {
      const prev = this.decryptCredentials(existing.encryptedCredentials);
      pageAccessToken = prev.pageAccessToken?.trim() || prev.accessToken?.trim() || '';
    }
    if (!pageAccessToken) {
      throw new BadRequestException('Thiếu Page Access Token để đồng bộ');
    }

    // Giữ token cũ nếu token mới trùng hoặc token mới rỗng (đã xử lý ở trên)
    if (
      existing?.encryptedCredentials &&
      existing.status === MessagingChannelAccountStatus.ACTIVE &&
      incomingToken
    ) {
      const prev = this.decryptCredentials(existing.encryptedCredentials);
      const prevToken = prev.pageAccessToken?.trim() || '';
      if (prevToken && prevToken === incomingToken) {
        // Same token — only refresh metadata/timestamps
        const updated = await this.prisma.messagingChannelConnection.update({
          where: { id: existing.id },
          data: {
            displayName: dto.pageName ?? existing.displayName,
            webhookSubscribed: dto.subscribeWebhook ?? existing.webhookSubscribed,
            lastSyncedAt: new Date(),
            isPaused: false,
            metadata: this.mergeMessengerScopeMetadata(existing.metadata, opts?.grantedScopes),
          },
        });
        return this.toPublic(updated);
      }
    }

    const credentials = {
      pageAccessToken,
      pageId,
    };
    try {
      const row = await this.upsertConnection({
        organizationId,
        channel: MessageChannel.MESSENGER,
        providerKind: MessagingProviderKind.MESSENGER,
        accountRef: pageId,
        displayName: dto.pageName,
        credentials,
        userId,
        webhookSubscribed: dto.subscribeWebhook ?? false,
      });
      const withMeta = await this.prisma.messagingChannelConnection.update({
        where: { id: row.id },
        data: {
          lastSyncedAt: new Date(),
          metadata: this.mergeMessengerScopeMetadata(
            (row as { metadata?: unknown }).metadata,
            opts?.grantedScopes,
          ),
        },
      });
      return this.toPublic(withMeta);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      const lower = reason.toLowerCase();
      const missingPerm =
        lower.includes('permission') ||
        lower.includes('thiếu quyền') ||
        lower.includes('(#10)');
      // Fallback: lưu credentials + REAUTH_REQUIRED nếu Meta reject token
      // Thiếu quyền Messenger → báo bổ sung quyền, không coi như mất toàn bộ kết nối.
      const encrypted = encryptSecret(JSON.stringify(credentials), this.getEncryptionKey());
      const row = await this.prisma.messagingChannelConnection.upsert({
        where: {
          organizationId_channel_accountRef: {
            organizationId,
            channel: MessageChannel.MESSENGER,
            accountRef: pageId,
          },
        },
        create: {
          organizationId,
          channel: MessageChannel.MESSENGER,
          providerKind: MessagingProviderKind.MESSENGER,
          accountRef: pageId,
          displayName: dto.pageName,
          encryptedCredentials: encrypted,
          status: MessagingChannelAccountStatus.REAUTH_REQUIRED,
          permissions: [],
          webhookSubscribed: dto.subscribeWebhook ?? false,
          lastTestedAt: new Date(),
          lastSyncedAt: new Date(),
          metadata: sanitizePublicMetadata({
            missingMessengerPermission: missingPerm,
            hint: missingPerm
              ? 'Thiếu quyền Messenger (pages_messaging) — bổ sung quyền trên Meta, không cần kết nối lại toàn bộ.'
              : reason.slice(0, 200),
          }) as Prisma.InputJsonValue,
        },
        update: {
          displayName: dto.pageName,
          encryptedCredentials: encrypted,
          status: MessagingChannelAccountStatus.REAUTH_REQUIRED,
          webhookSubscribed: dto.subscribeWebhook ?? undefined,
          lastTestedAt: new Date(),
          lastSyncedAt: new Date(),
          isPaused: false,
          metadata: sanitizePublicMetadata({
            missingMessengerPermission: missingPerm,
            hint: missingPerm
              ? 'Thiếu quyền Messenger (pages_messaging) — bổ sung quyền trên Meta, không cần kết nối lại toàn bộ.'
              : reason.slice(0, 200),
          }) as Prisma.InputJsonValue,
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
          accountRef: pageId,
          reauthRequired: true,
          missingMessengerPermission: missingPerm,
          reason: reason.slice(0, 200),
        }) as Prisma.InputJsonValue,
      });
      return this.toPublic(row);
    }
  }

  /** Gắn metadata thiếu pages_messaging khi sync từ Auto Post (không log token). */
  private mergeMessengerScopeMetadata(
    existing: unknown,
    grantedScopes?: string[],
  ): Prisma.InputJsonValue | undefined {
    if (!grantedScopes?.length) {
      return existing && typeof existing === 'object'
        ? (existing as Prisma.InputJsonValue)
        : undefined;
    }
    const hasMessaging = grantedScopes.some(
      (s) => s === 'pages_messaging' || s === 'pages_manage_metadata',
    );
    const base =
      existing && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {};
    return sanitizePublicMetadata({
      ...base,
      missingMessengerPermission: !hasMessaging,
      hint: hasMessaging
        ? undefined
        : 'Thiếu quyền Messenger (pages_messaging) — bổ sung quyền trên Meta App Review / Login, không cần OAuth lại toàn bộ.',
      sourceScopes: grantedScopes.filter((s) => s.startsWith('pages_')).slice(0, 20),
    }) as Prisma.InputJsonValue;
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

  /** OAuth Zalo OA — lưu refresh token (mã hóa), không log secret. */
  async upsertZaloOaOAuth(
    organizationId: string,
    params: {
      oaId: string;
      oaName?: string;
      accessToken: string;
      refreshToken?: string;
      tokenExpiresAt?: Date | null;
      userId?: string;
    },
  ) {
    const credentials: Record<string, string> = {
      accessToken: params.accessToken.trim(),
      oaId: params.oaId.trim(),
      oaName: params.oaName?.trim() ?? params.oaId.trim(),
    };
    if (params.refreshToken?.trim()) {
      credentials.refreshToken = params.refreshToken.trim();
    }
    return this.upsertConnection({
      organizationId,
      channel: MessageChannel.ZALO,
      providerKind: MessagingProviderKind.ZALO_OA,
      accountRef: params.oaId.trim(),
      displayName: params.oaName,
      credentials,
      userId: params.userId,
    }).then(async (conn) => {
      if (params.tokenExpiresAt) {
        await this.prisma.messagingChannelConnection.update({
          where: { id: conn.id },
          data: { tokenExpiresAt: params.tokenExpiresAt },
        });
      }
      return conn;
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
      : this.mapInvalidStatus(result.message ?? 'Connection invalid');

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

  /** Auto Post page tokens are encryptSecret(plainToken); Chatbot may use encodeStoredSecret. */
  private decryptCredentialsOrRaw(encrypted: string | null | undefined): string {
    if (!encrypted?.trim()) return '';
    try {
      return decryptSecret(encrypted, this.getEncryptionKey()).trim();
    } catch {
      try {
        return decodeStoredSecret(encrypted, this.getEncryptionKey()).trim();
      } catch {
        return '';
      }
    }
  }

  private decodeFlexibleSecret(stored: string | null | undefined): string {
    if (!stored?.trim()) return '';
    try {
      return decodeStoredSecret(stored, this.getEncryptionKey()).trim();
    } catch {
      try {
        return decryptSecret(stored, this.getEncryptionKey()).trim();
      } catch {
        return '';
      }
    }
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
        lastSyncedAt: new Date(),
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
        lastSyncedAt: new Date(),
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
