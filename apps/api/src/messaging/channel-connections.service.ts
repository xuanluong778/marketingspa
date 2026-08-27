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

  async getPublic(organizationId: string, id: string) {
    const row = await this.ensureConnection(organizationId, id);
    return this.toPublic(row);
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

  async upsertZaloOaOAuth(
    organizationId: string,
    params: {
      oaId: string;
      oaName?: string;
      accessToken: string;
      refreshToken?: string;
      tokenExpiresAt?: Date | null;
      refreshTokenExpiresAt?: Date | null;
      webhookSecret?: string;
      userId?: string;
    },
  ) {
    const oaId = params.oaId.trim();
    const existing = await this.prisma.messagingChannelConnection.findFirst({
      where: {
        organizationId,
        channel: MessageChannel.ZALO,
        accountRef: oaId,
      },
    });
    const prev = existing?.encryptedCredentials
      ? this.decryptCredentials(existing.encryptedCredentials)
      : {};

    const credentials: Record<string, string> = {
      ...prev,
      accessToken: params.accessToken.trim(),
      oaId: params.oaId.trim(),
      oaName: params.oaName?.trim() ?? prev.oaName ?? params.oaId.trim(),
    };
    if (params.refreshToken?.trim()) {
      credentials.refreshToken = params.refreshToken.trim();
    }
    if (params.webhookSecret?.trim()) {
      credentials.webhookSecret = params.webhookSecret.trim();
      credentials.oaSecretKey = params.webhookSecret.trim();
    }
    if (params.tokenExpiresAt) {
      credentials.accessTokenExpiresAt = params.tokenExpiresAt.toISOString();
    }
    if (params.refreshTokenExpiresAt) {
      credentials.refreshTokenExpiresAt = params.refreshTokenExpiresAt.toISOString();
    }

    return this.upsertConnection({
      organizationId,
      channel: MessageChannel.ZALO,
      providerKind: MessagingProviderKind.ZALO_OA,
      accountRef: oaId,
      displayName: params.oaName,
      credentials,
      userId: params.userId,
    });
  }

  /**
   * Ngắt kết nối Zalo OA — giữ row + lịch sử; gỡ OAuth token; giữ webhook secret nếu có.
   * Idempotent; advisory lock theo connection id.
   */
  async disconnectZaloOa(organizationId: string, id: string, userId?: string) {
    const lockKey = `zalo_oa_disconnect:${id}`;
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, lockKey);

      const row = await tx.messagingChannelConnection.findFirst({
        where: {
          id,
          organizationId,
          channel: MessageChannel.ZALO,
          providerKind: MessagingProviderKind.ZALO_OA,
        },
      });
      if (!row) {
        throw new NotFoundException('Kết nối Zalo OA không tồn tại');
      }

      if (row.status === MessagingChannelAccountStatus.DISCONNECTED) {
        return { row, idempotent: true as const };
      }

      const prev = row.encryptedCredentials
        ? this.decryptCredentials(row.encryptedCredentials)
        : {};
      const preserved: Record<string, string> = {
        oaId: row.accountRef,
        oaName: (prev.oaName || row.displayName || row.accountRef).trim(),
        _oauthDisabled: '1',
      };
      if (prev.webhookSecret?.trim()) preserved.webhookSecret = prev.webhookSecret.trim();
      if (prev.oaSecretKey?.trim()) preserved.oaSecretKey = prev.oaSecretKey.trim();

      const baseMeta =
        row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
          ? { ...(row.metadata as Record<string, unknown>) }
          : {};
      const metadata = sanitizePublicMetadata({
        ...baseMeta,
        disconnectedAt: new Date().toISOString(),
        credentialsDisabled: true,
      });

      const updated = await tx.messagingChannelConnection.update({
        where: { id: row.id },
        data: {
          status: MessagingChannelAccountStatus.DISCONNECTED,
          encryptedCredentials: encryptSecret(
            JSON.stringify(preserved),
            this.getEncryptionKey(),
          ),
          tokenExpiresAt: null,
          isPaused: false,
          permissions: [],
          metadata: metadata as Prisma.InputJsonValue,
        },
      });

      return { row: updated, idempotent: false as const };
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'MESSAGING_CHANNEL_DISCONNECTED',
      entityType: 'MESSAGING_CHANNEL_CONNECTION',
      entityId: id,
      metadata: redactForAudit({
        channel: MessageChannel.ZALO,
        providerKind: MessagingProviderKind.ZALO_OA,
        accountRef: result.row.accountRef,
        idempotent: result.idempotent,
      }) as Prisma.InputJsonValue,
    });

    return {
      idempotent: result.idempotent,
      connection: this.toPublic(result.row),
    };
  }

  /**
   * Refresh OA access token trước khi hết hạn.
   * Lưu cả access token + refresh token mới (encrypted). Không log secret.
   */
  async refreshZaloOaToken(organizationId: string, id: string, userId?: string) {
    const row = await this.ensureConnection(organizationId, id);
    if (row.channel !== MessageChannel.ZALO || row.providerKind !== MessagingProviderKind.ZALO_OA) {
      throw new BadRequestException('Chỉ hỗ trợ refresh token cho Zalo OA');
    }
    if (row.status === MessagingChannelAccountStatus.DISCONNECTED) {
      throw new BadRequestException('OA đã ngắt kết nối — hãy Kết nối lại qua OAuth');
    }
    const credentials = this.decryptCredentials(row.encryptedCredentials);
    const refreshToken = credentials.refreshToken?.trim();
    if (!refreshToken) {
      throw new BadRequestException('Chưa có refresh token — kết nối lại OA qua OAuth');
    }

    const appId = (this.config.get<string>('ZALO_APP_ID') ?? '').trim();
    const appSecret = (this.config.get<string>('ZALO_APP_SECRET') ?? '').trim();
    if (!appId || !appSecret) {
      throw new BadRequestException('Chưa cấu hình ZALO_APP_ID / ZALO_APP_SECRET');
    }

    const { refreshZaloOaAccessToken } = await import('@marketingspa/shared');
    let refreshed: {
      accessToken: string;
      refreshToken?: string;
      expiresAt: Date | null;
    };
    try {
      refreshed = await refreshZaloOaAccessToken({
        appId,
        appSecret,
        refreshToken,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Refresh token thất bại';
      await this.prisma.messagingChannelConnection.update({
        where: { id: row.id },
        data: {
          status: MessagingChannelAccountStatus.REFRESH_FAILED,
        },
      });
      this.logger.warn(
        `Zalo refresh failed connection=${row.id.slice(0, 8)}… oa=••••${row.accountRef.slice(-4)}`,
      );
      throw new BadRequestException(message);
    }

    const nextCreds: Record<string, string> = {
      ...credentials,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? refreshToken,
    };
    if (refreshed.expiresAt) {
      nextCreds.accessTokenExpiresAt = refreshed.expiresAt.toISOString();
    }

    const encrypted = encryptSecret(JSON.stringify(nextCreds), this.getEncryptionKey());
    const updated = await this.prisma.messagingChannelConnection.update({
      where: { id: row.id },
      data: {
        encryptedCredentials: encrypted,
        tokenExpiresAt: refreshed.expiresAt,
        status: MessagingChannelAccountStatus.ACTIVE,
        lastSyncedAt: new Date(),
        isPaused: false,
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'MESSAGING_CHANNEL_TOKEN_REFRESHED',
      entityType: 'MESSAGING_CHANNEL_CONNECTION',
      entityId: id,
      metadata: redactForAudit({
        oaId: row.accountRef,
        accessTokenExpiresAt: refreshed.expiresAt?.toISOString() ?? null,
      }) as Prisma.InputJsonValue,
    });

    return this.toZaloPublic(updated);
  }

  /**
   * Đảm bảo access token còn hạn (refresh nếu sắp hết).
   * Trả access token plaintext chỉ cho caller nội bộ — không log.
   */
  async ensureFreshZaloAccessToken(
    organizationId: string,
    connectionId: string,
  ): Promise<{ accessToken: string; connectionId: string; refreshed: boolean }> {
    const row = await this.ensureConnection(organizationId, connectionId);
    if (row.status === MessagingChannelAccountStatus.DISCONNECTED) {
      throw new BadRequestException('OA đã ngắt kết nối');
    }
    const credentials = this.decryptCredentials(row.encryptedCredentials);
    if (credentials._oauthDisabled === '1' || !credentials.accessToken?.trim()) {
      throw new BadRequestException('OA đã ngắt kết nối — thiếu access token');
    }
    const expiresAt =
      row.tokenExpiresAt ??
      this.parseOptionalDate(credentials.accessTokenExpiresAt) ??
      null;
    const needsRefresh =
      Boolean(credentials.refreshToken?.trim()) &&
      (!expiresAt || expiresAt.getTime() - Date.now() < 45 * 60_000);

    if (needsRefresh) {
      await this.refreshZaloOaToken(organizationId, connectionId);
      const again = await this.ensureConnection(organizationId, connectionId);
      const creds = this.decryptCredentials(again.encryptedCredentials);
      return {
        accessToken: creds.accessToken ?? '',
        connectionId,
        refreshed: true,
      };
    }

    return {
      accessToken: credentials.accessToken ?? '',
      connectionId,
      refreshed: false,
    };
  }

  toZaloPublic(row: {
    id: string;
    organizationId: string;
    accountRef: string;
    displayName: string | null;
    status: MessagingChannelAccountStatus;
    tokenExpiresAt: Date | null;
    encryptedCredentials: string | null;
    lastTestedAt: Date | null;
    lastSyncedAt: Date | null;
    isPaused: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const creds = this.decryptCredentials(row.encryptedCredentials);
    const refreshExpires = this.parseOptionalDate(creds.refreshTokenExpiresAt);
    return {
      id: row.id,
      organizationId: row.organizationId,
      oaId: row.accountRef,
      oaName: row.displayName || creds.oaName || row.accountRef,
      accessTokenEncrypted: Boolean(creds.accessToken),
      refreshTokenEncrypted: Boolean(creds.refreshToken),
      webhookSecret: Boolean(creds.webhookSecret || creds.oaSecretKey),
      accessTokenExpiresAt: row.tokenExpiresAt ?? this.parseOptionalDate(creds.accessTokenExpiresAt),
      refreshTokenExpiresAt: refreshExpires,
      status: row.isPaused ? MessagingChannelAccountStatus.PAUSED : row.status,
      lastTestedAt: row.lastTestedAt,
      lastSyncedAt: row.lastSyncedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private parseOptionalDate(raw?: string | null): Date | null {
    if (!raw?.trim()) return null;
    const asNum = Number(raw);
    if (Number.isFinite(asNum) && asNum > 1e11) return new Date(asNum);
    if (Number.isFinite(asNum) && asNum > 1e9 && asNum < 1e11) return new Date(asNum * 1000);
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
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
