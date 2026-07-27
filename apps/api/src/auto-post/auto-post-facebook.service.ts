import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AutoPostFacebookConnectionStatus,
  AutoPostStatus,
} from '@marketingspa/database';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { encryptSecret, decryptSecret } from '../common/utils/encryption.util';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AUTO_POST_QUEUE } from '../queue/queue.constants';
import { AutoPostMetaService } from './auto-post-meta.service';
import { MetaFanpageService } from '../meta-fanpage/meta-fanpage.service';
import { ChannelConnectionsService } from '../messaging/channel-connections.service';
import {
  canUseServerEnvFanpage,
  parseMetaFanpageAllowedOrgIds,
} from '../meta-fanpage/meta-fanpage-access';

const STATE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class AutoPostFacebookService {
  private readonly logger = new Logger(AutoPostFacebookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly meta: AutoPostMetaService,
    private readonly metaFanpage: MetaFanpageService,
    private readonly channelConnections: ChannelConnectionsService,
    @Inject(AUTO_POST_QUEUE) private readonly autoPostQueue: Queue,
  ) {}

  /**
   * App Business báo Invalid Scopes với OAuth cổ điển.
   * Nếu đã có META_PAGE_ID + Page Token trên server → đồng bộ Fanpage, không mở dialog OAuth.
   */
  async getOAuthStartUrl(user: AuthUser): Promise<{ url: string; mode: 'env' | 'oauth' }> {
    const envCreds = this.metaFanpage.getEnvCredentials();
    const oauthEnabled =
      (this.config.get<string>('OAUTH_CONNECTION') ?? process.env.OAUTH_CONNECTION ?? '')
        .trim()
        .toLowerCase() === 'true';

    const allowedOrgIds = parseMetaFanpageAllowedOrgIds((k) => this.config.get<string>(k) ?? process.env[k]);
    const canUseServerEnv = canUseServerEnvFanpage(
      { role: user.role, organizationId: user.organizationId },
      allowedOrgIds,
    );

    // SERVER_ENV luôn chỉ dành cho admin allowlist (Phase 1). Không cho SaaS fallback nếu không đủ điều kiện.
    if (envCreds && canUseServerEnv) {
      await this.syncEnvPageConnection(user);
      const appUrl = this.config.get<string>('APP_URL') ?? 'http://localhost:3000';
      return {
        mode: 'env',
        url: `${appUrl}/content?tab=channels&facebook=connected&mode=env`,
      };
    }

    if (!oauthEnabled) {
      throw new BadRequestException(
        'Kết nối OAuth chưa bật cho tenant này. Vui lòng liên hệ hỗ trợ để bật OAUTH_CONNECTION hoặc dùng SERVER_ENV (admin/allowlist).',
      );
    }

    if (!this.meta.loginConfigId) {
      throw new BadRequestException(
        'Facebook Login for Business cần META_LOGIN_CONFIG_ID (META_LOGIN_CONFIG_ID/ FACEBOOOK_LOGIN_CONFIG_ID).',
      );
    }

    this.ensureMetaConfig();
    const { state } = await this.createOAuthState(user.id, user.organizationId);
    return { url: this.meta.buildOAuthUrl(state), mode: 'oauth' };
  }

  /** Đồng bộ Fanpage từ META_PAGE_* (.env) vào DB — token mã hóa, không trả ra API. */
  async syncEnvPageConnection(user: AuthUser) {
    const creds = this.metaFanpage.getEnvCredentials();
    if (!creds) {
      throw new BadRequestException('Chưa cấu hình META_PAGE_ID / Page Token trên server');
    }

    const status = await this.metaFanpage.getStatus();
    if (!status.connected) {
      throw new BadRequestException(
        status.message || 'Page Token không hợp lệ — không thể kết nối Fanpage',
      );
    }

    const pageName = status.pageName || 'Fanpage';
    const encryptedPageToken = encryptSecret(creds.accessToken, this.getEncryptionKey());
    // User token slot: dùng cùng page token đã mã hóa (env mode không có user token riêng)
    const encryptedUserToken = encryptedPageToken;

    const connection = await this.prisma.autoPostFacebookConnection.upsert({
      where: { userId_organizationId: { userId: user.id, organizationId: user.organizationId } },
      create: {
        userId: user.id,
        organizationId: user.organizationId,
        encryptedAccessToken: encryptedUserToken,
        tokenExpiresAt: null,
        facebookUserId: creds.pageId,
        facebookUserName: pageName,
        status: AutoPostFacebookConnectionStatus.CONNECTED,
        scopes: ['pages_manage_posts', 'env_page_token'],
        lastError: null,
      },
      update: {
        encryptedAccessToken: encryptedUserToken,
        tokenExpiresAt: null,
        facebookUserId: creds.pageId,
        facebookUserName: pageName,
        status: AutoPostFacebookConnectionStatus.CONNECTED,
        scopes: ['pages_manage_posts', 'env_page_token'],
        lastError: null,
      },
    });

    await this.prisma.autoPostFacebookPage.deleteMany({
      where: { userId: user.id, connectionId: connection.id },
    });

    await this.prisma.autoPostFacebookPage.create({
      data: {
        userId: user.id,
        connectionId: connection.id,
        pageId: creds.pageId,
        pageName,
        pagePictureUrl: null,
        encryptedPageAccessToken: encryptedPageToken,
      },
    });

    this.logger.log(`Synced env Fanpage ${creds.pageId} for user ${user.id}`);
    return this.getConnectionStatus(user.id, user.organizationId);
  }

  async handleOAuthCallback(
    code: string | undefined,
    state: string | undefined,
    error?: string,
  ): Promise<{ redirectUrl: string }> {
    const appUrl = this.config.get<string>('APP_URL') ?? 'http://localhost:3000';
    const base = `${appUrl}/content?tab=channels&facebook=`;

    if (error) {
      return { redirectUrl: `${base}error&message=${encodeURIComponent(error)}` };
    }
    if (!code || !state) {
      return { redirectUrl: `${base}error&message=missing_code` };
    }

    let userId: string;
    let organizationId: string;
    let nonce: string | undefined;
    try {
      ({ userId, organizationId, nonce } = this.verifyState(state));
    } catch {
      return { redirectUrl: `${base}error&message=invalid_state` };
    }

    try {
      const consumed = await this.prisma.autoPostFacebookOAuthState.updateMany({
        where: {
          stateHash: createHash('sha256').update(nonce!).digest('hex'),
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new UnauthorizedException('oauth_state_used_or_expired');
      }

      const short = await this.meta.exchangeCodeForToken(code);
      const longLived = await this.meta.exchangeForLongLivedToken(short.access_token);
      const accessToken = longLived.access_token;
      const me = await this.meta.getMe(accessToken);
      const expiresAt = longLived.expires_in
        ? new Date(Date.now() + longLived.expires_in * 1000)
        : null;
      const encryptedAccessToken = encryptSecret(accessToken, this.getEncryptionKey());

      // Phase 3: chỉ lưu pending, KHÔNG ghi đè connection/page active.
      await this.prisma.autoPostFacebookOAuthPendingConnection.upsert({
        where: {
          userId_organizationId: {
            userId,
            organizationId,
          },
        },
        create: {
          userId,
          organizationId,
          encryptedAccessToken,
          tokenExpiresAt: expiresAt,
          facebookUserId: me.id,
          facebookUserName: me.name ?? null,
          scopes: this.meta.getOAuthScopes(),
          lastError: null,
        },
        update: {
          encryptedAccessToken,
          tokenExpiresAt: expiresAt,
          facebookUserId: me.id,
          facebookUserName: me.name ?? null,
          scopes: this.meta.getOAuthScopes(),
          lastError: null,
        },
      });

      return { redirectUrl: `${base}oauth_connected&mode=oauth` };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'oauth_failed';
      const safeMsg = msg
        .replace(/access_token\\s*=\\s*[^\\s&]+/gi, 'access_token=[redacted]')
        // Meta tokens thường bắt đầu bằng EAAG/EAA* và có độ dài lớn.
        .replace(/\\b(?:EAAG|EAAD|EAA|EBA|EAAE)[A-Za-z0-9_-]{10,}\\b/g, '[meta_token]')
        .slice(0, 300);

      this.logger.warn(`Auto Post OAuth failed for user ${userId}`); // Không log token/secret

      return { redirectUrl: `${base}error&message=${encodeURIComponent(safeMsg)}` };
    }
  }

  async getConnectionStatus(userId: string, organizationId: string) {
    // Tự đồng bộ nếu đã có Page Token trên server mà user chưa có page trong DB
    const envCreds = this.metaFanpage.getEnvCredentials();
    if (envCreds) {
      const allowedOrgIds = parseMetaFanpageAllowedOrgIds(
        (k) => this.config.get<string>(k) ?? process.env[k],
      );
      const existingConn = await this.prisma.autoPostFacebookConnection.findUnique({
        where: { userId_organizationId: { userId, organizationId } },
        select: { scopes: true },
      });

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          organizationId: true,
          role: { select: { code: true } },
        },
      });

      const canUseServerEnv = user
        ? canUseServerEnvFanpage(
            { role: user.role.code, organizationId: user.organizationId },
            allowedOrgIds,
          )
        : false;

      // Không tự động đồng bộ SERVER_ENV nếu user không thuộc allowlist (Phase 1)
      // hoặc nếu user đã có connection OAuth (scopes không phải env_page_token).
      if (canUseServerEnv && (!existingConn || existingConn.scopes?.includes('env_page_token'))) {
        const existing = await this.prisma.autoPostFacebookPage.findFirst({
          where: { userId, pageId: envCreds.pageId },
        });
        if (!existing && user) {
          try {
            await this.syncEnvPageConnection({
              id: user.id,
              email: user.email,
              name: user.name,
              role: 'OWNER',
              organizationId: user.organizationId,
            });
          } catch (e) {
            this.logger.warn(
              `Auto-sync env Fanpage failed: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }
      }
    }

    const conn = await this.prisma.autoPostFacebookConnection.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      include: { pages: { orderBy: { pageName: 'asc' } } },
    });

    if (!conn) {
      return {
        connected: false,
        status: 'DISCONNECTED' as const,
        needsReconnect: false,
        facebookUserName: null,
        pages: [] as Array<{
          id: string;
          pageId: string;
          pageName: string;
          pagePictureUrl: string | null;
        }>,
        tokenExpiresAt: null,
        lastError: null,
        connectionMode: envCreds ? ('env' as const) : ('oauth' as const),
      };
    }

    const isTokenExpired =
      (conn.status === AutoPostFacebookConnectionStatus.CONNECTED ||
        conn.status === AutoPostFacebookConnectionStatus.TOKEN_EXPIRED) &&
      conn.tokenExpiresAt &&
      conn.tokenExpiresAt.getTime() < Date.now();

    const missingManagePosts =
      !conn.scopes?.includes('env_page_token') &&
      !conn.scopes?.includes('pages_manage_posts') &&
      conn.status === AutoPostFacebookConnectionStatus.CONNECTED;

    // API surface: TOKEN_EXPIRED / thiếu quyền → NEEDS_RECONNECT hoặc MISSING_PERMISSION
    let status: string = conn.status;
    let lastError = conn.lastError;
    if (isTokenExpired) {
      status = 'NEEDS_RECONNECT';
      lastError = lastError ?? 'NEEDS_RECONNECT: Token Facebook đã hết hạn — vui lòng kết nối lại';
      if (conn.status !== AutoPostFacebookConnectionStatus.TOKEN_EXPIRED) {
        await this.prisma.autoPostFacebookConnection
          .update({
            where: { userId_organizationId: { userId, organizationId } },
            data: {
              status: AutoPostFacebookConnectionStatus.TOKEN_EXPIRED,
              lastError,
            },
          })
          .catch(() => undefined);
      }
    } else if (missingManagePosts) {
      status = 'MISSING_PERMISSION';
      lastError = lastError ?? 'MISSING_PERMISSION: pages_manage_posts';
    }

    return {
      connected: status === AutoPostFacebookConnectionStatus.CONNECTED,
      status,
      needsReconnect: status === 'NEEDS_RECONNECT',
      facebookUserName: conn.facebookUserName,
      tokenExpiresAt: conn.tokenExpiresAt?.toISOString() ?? null,
      lastError,
      connectionMode: conn.scopes?.includes('env_page_token')
        ? ('env' as const)
        : ('oauth' as const),
      pages: conn.pages.map((p) => ({
        id: p.id,
        pageId: p.pageId,
        pageName: p.pageName,
        pagePictureUrl: p.pagePictureUrl,
      })),
    };
  }

  /** OAuth (Login for Business) — chỉ dùng để liệt kê pages để người dùng chọn. */
  async listOAuthManagedPages(userId: string, organizationId: string) {
    const pending = await this.requireOAuthPending(userId, organizationId);
    if (pending.tokenExpiresAt && pending.tokenExpiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Token Facebook đã hết hạn — vui lòng kết nối lại');
    }

    const accessToken = decryptSecret(pending.encryptedAccessToken, this.getEncryptionKey());
    const pages = await this.meta.getManagedPages(accessToken);
    return pages.map((p) => ({
      id: p.id,
      pageId: p.id,
      pageName: p.name,
      pagePictureUrl: p.picture?.data?.url ?? null,
    }));
  }

  /** OAuth (Login for Business) — xác minh ownership trên backend rồi lưu token đã mã hóa. */
  async selectOAuthPage(userId: string, organizationId: string, pageId: string) {
    const trimmed = pageId?.trim();
    if (!trimmed) throw new BadRequestException('pageId is required');

    const pending = await this.requireOAuthPending(userId, organizationId);
    if (pending.tokenExpiresAt && pending.tokenExpiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Token Facebook đã hết hạn — vui lòng kết nối lại');
    }

    const accessToken = decryptSecret(pending.encryptedAccessToken, this.getEncryptionKey());
    const pages = await this.meta.getManagedPages(accessToken);
    const chosen = pages.find((p) => p.id === trimmed);
    if (!chosen) {
      throw new BadRequestException('Fanpage không thuộc quyền của bạn');
    }

    // Verify token + granted permissions before replacing active connection/page.
    const debug = await this.meta.debugToken(chosen.access_token);
    const grantedScopes = debug.scopes ?? [];
    const required = 'pages_manage_posts';

    if (!debug.is_valid) {
      throw new UnauthorizedException('Token Facebook đã hết hạn — vui lòng kết nối lại');
    }

    // Some tokens might be valid but already expired on Meta side
    if (debug.expires_at && debug.expires_at * 1000 < Date.now()) {
      throw new UnauthorizedException('Token Facebook đã hết hạn — vui lòng kết nối lại');
    }

    if (!grantedScopes.includes(required)) {
      // UI/FE sẽ hiển thị đúng code
      throw new BadRequestException('MISSING_PERMISSION: pages_manage_posts');
    }

    const tokenExpiresAt = debug.expires_at ? new Date(debug.expires_at * 1000) : pending.tokenExpiresAt;
    const encryptedPageAccessToken = encryptSecret(chosen.access_token, this.getEncryptionKey());

    await this.prisma.$transaction(async (tx) => {
      const newConn = await tx.autoPostFacebookConnection.upsert({
        where: { userId_organizationId: { userId, organizationId } },
        create: {
          userId,
          organizationId,
          encryptedAccessToken: pending.encryptedAccessToken,
          tokenExpiresAt: tokenExpiresAt ?? null,
          facebookUserId: pending.facebookUserId,
          facebookUserName: pending.facebookUserName,
          status: AutoPostFacebookConnectionStatus.CONNECTED,
          scopes: grantedScopes,
          lastError: null,
        },
        update: {
          encryptedAccessToken: pending.encryptedAccessToken,
          tokenExpiresAt: tokenExpiresAt ?? null,
          facebookUserId: pending.facebookUserId,
          facebookUserName: pending.facebookUserName,
          status: AutoPostFacebookConnectionStatus.CONNECTED,
          scopes: grantedScopes,
          lastError: null,
        },
      });

      // Replace pages only after token+permission verified
      await tx.autoPostFacebookPage.deleteMany({ where: { connectionId: newConn.id } });

      await tx.autoPostFacebookPage.create({
        data: {
          userId,
          connectionId: newConn.id,
          pageId: chosen.id,
          pageName: chosen.name,
          pagePictureUrl: chosen.picture?.data?.url ?? null,
          encryptedPageAccessToken: encryptedPageAccessToken,
        },
      });

      await tx.autoPostFacebookOAuthPendingConnection.delete({
        where: { userId_organizationId: { userId, organizationId } },
      });
    });

    return this.getConnectionStatus(userId, organizationId);
  }

  async disconnect(userId: string, organizationId: string) {
    const pages = await this.prisma.autoPostFacebookPage.findMany({
      where: { userId, connection: { organizationId } },
      select: { pageId: true },
    });
    const userOrgId = organizationId;

    await this.prisma.autoPostFacebookPage.deleteMany({
      where: { userId, connection: { organizationId } },
    });
    await this.prisma.autoPostFacebookConnection.deleteMany({
      where: { userId, organizationId },
    });
    await this.prisma.autoPostFacebookOAuthPendingConnection.deleteMany({
      where: { userId, organizationId },
    });

    for (const page of pages) {
      await this.channelConnections.disableMessengerPageAccess(page.pageId, {
        organizationId: userOrgId,
        reason: 'Auto Post Facebook disconnected',
      });
    }

    const scheduled = await this.prisma.autoPost.findMany({
      where: { userId, organizationId, status: AutoPostStatus.SCHEDULED },
      select: { id: true },
    });
    for (const post of scheduled) {
      try {
        const job = await this.autoPostQueue.getJob(`auto-post-${post.id}`);
        if (job) await job.remove();
      } catch (e) {
        this.logger.warn(
          `Failed to cancel auto-post job ${post.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    if (scheduled.length > 0) {
      await this.prisma.autoPost.updateMany({
        where: { userId, organizationId, status: AutoPostStatus.SCHEDULED },
        data: {
          status: AutoPostStatus.CANCELLED,
          scheduledAt: null,
          errorMessage: 'Cancelled: Facebook disconnected',
        },
      });
    }

    return { ok: true };
  }

  async refreshPages(userId: string, organizationId: string, user?: AuthUser) {
    const conn = await this.prisma.autoPostFacebookConnection.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });

    // Không fallback OAuth → SERVER_ENV: chỉ sync env khi connection là env_page_token
    // hoặc chưa có connection và user thuộc allowlist.
    const isEnvConnection = Boolean(conn?.scopes?.includes('env_page_token'));

    if (isEnvConnection) {
      const orgUser =
        user ??
        (await this.prisma.user.findUnique({ where: { id: userId } }).then((u) =>
          u
            ? {
                id: u.id,
                email: u.email,
                name: u.name,
                role: 'OWNER' as const,
                organizationId: u.organizationId,
              }
            : null,
        ));
      if (!orgUser) throw new NotFoundException('User không tồn tại');
      return this.syncEnvPageConnection(orgUser);
    }

    if (conn) {
      const required = await this.requireConnection(userId, organizationId);
      const accessToken = decryptSecret(required.encryptedAccessToken, this.getEncryptionKey());
      const pages = await this.meta.getManagedPages(accessToken);

      await this.prisma.autoPostFacebookPage.deleteMany({
        where: { userId, connectionId: required.id },
      });

      if (pages.length > 0) {
        await this.prisma.autoPostFacebookPage.createMany({
          data: pages.map((p) => ({
            userId,
            connectionId: required.id,
            pageId: p.id,
            pageName: p.name,
            pagePictureUrl: p.picture?.data?.url ?? null,
            encryptedPageAccessToken: encryptSecret(p.access_token, this.getEncryptionKey()),
          })),
        });
      }

      return this.getConnectionStatus(userId, organizationId);
    }

    // Chưa có connection: chỉ allowlist mới được sync SERVER_ENV
    const envCreds = this.metaFanpage.getEnvCredentials();
    if (envCreds && user) {
      const allowedOrgIds = parseMetaFanpageAllowedOrgIds(
        (k) => this.config.get<string>(k) ?? process.env[k],
      );
      if (canUseServerEnvFanpage({ role: user.role, organizationId }, allowedOrgIds)) {
        return this.syncEnvPageConnection(user);
      }
    }

    throw new NotFoundException('Chưa kết nối Facebook');
  }

  /** Preflight trước schedule/publish — không trả token. */
  async assertCanPublish(userId: string, organizationId: string, fanpageId: string) {
    await this.getPageAccessToken(userId, organizationId, fanpageId);
  }

  async getPageAccessToken(
    userId: string,
    organizationId: string,
    fanpageId: string,
  ): Promise<{
    pageId: string;
    pageName: string;
    accessToken: string;
  }> {
    const page = await this.prisma.autoPostFacebookPage.findFirst({
      where: { id: fanpageId, userId, connection: { organizationId } },
    });
    if (!page) throw new NotFoundException('Fanpage không tồn tại');

    const conn = await this.requireConnection(userId, organizationId);
    if (
      conn.status === AutoPostFacebookConnectionStatus.DISCONNECTED ||
      conn.status === AutoPostFacebookConnectionStatus.ERROR
    ) {
      throw new UnauthorizedException('NEEDS_RECONNECT: Kết nối Facebook chưa sẵn sàng');
    }

    if (
      conn.status === AutoPostFacebookConnectionStatus.TOKEN_EXPIRED ||
      (conn.tokenExpiresAt && conn.tokenExpiresAt.getTime() < Date.now())
    ) {
      await this.prisma.autoPostFacebookConnection.update({
        where: { userId_organizationId: { userId, organizationId } },
        data: {
          status: AutoPostFacebookConnectionStatus.TOKEN_EXPIRED,
          lastError: 'NEEDS_RECONNECT: Token Facebook đã hết hạn',
        },
      });
      throw new UnauthorizedException(
        'NEEDS_RECONNECT: Token Facebook đã hết hạn — vui lòng kết nối lại',
      );
    }

    const isEnv = conn.scopes?.includes('env_page_token');
    if (!isEnv && !conn.scopes?.includes('pages_manage_posts')) {
      throw new BadRequestException('MISSING_PERMISSION: pages_manage_posts');
    }

    return {
      pageId: page.pageId,
      pageName: page.pageName,
      accessToken: decryptSecret(page.encryptedPageAccessToken, this.getEncryptionKey()),
    };
  }

  async logApiError(
    userId: string,
    action: string,
    message: string,
    postId?: string,
    statusCode?: number,
    errorCode?: string,
  ) {
    await this.prisma.autoPostApiLog.create({
      data: { userId, postId, action, message, statusCode, errorCode },
    });
  }

  private async requireConnection(userId: string, organizationId: string) {
    const conn = await this.prisma.autoPostFacebookConnection.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    if (!conn) throw new NotFoundException('Chưa kết nối Facebook');
    return conn;
  }

  private async requireOAuthPending(userId: string, organizationId: string) {
    const pending = await this.prisma.autoPostFacebookOAuthPendingConnection.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    if (!pending) throw new NotFoundException('Chưa có OAuth pending — vui lòng kết nối lại');
    return pending;
  }

  private ensureMetaConfig() {
    try {
      // Resolve META_* / FACEBOOK_* aliases
      void this.meta.appId;
      void this.meta.appSecret;
    } catch {
      throw new BadRequestException('META_APP_ID / META_APP_SECRET chưa cấu hình');
    }
    if (!this.meta.loginConfigId) {
      this.logger.warn(
        'META_LOGIN_CONFIG_ID chưa có — app Business (Facebook Login for Business) sẽ báo Invalid Scopes nếu chỉ dùng scope=pages_*.',
      );
    }
    const key = this.config.get<string>('ENCRYPTION_KEY');
    if (!key || key.length < 16) {
      throw new BadRequestException('ENCRYPTION_KEY chưa cấu hình');
    }
  }

  private getEncryptionKey(): string {
    const key = this.config.get<string>('ENCRYPTION_KEY');
    if (!key || key.length < 16) throw new Error('ENCRYPTION_KEY chưa cấu hình');
    return key;
  }

  private async createOAuthState(
    userId: string,
    organizationId: string,
  ): Promise<{ state: string }> {
    const ts = Date.now();
    const nonce = randomBytes(16).toString('hex');
    const stateHash = createHash('sha256').update(nonce).digest('hex');
    const payload = `${userId}:${organizationId}:${ts}:${nonce}`;
    const sig = createHmac('sha256', this.getEncryptionKey()).update(payload).digest('hex');

    const expiresAt = new Date(ts + STATE_TTL_MS);
    const state = Buffer.from(`${payload}:${sig}`).toString('base64url');

    await this.prisma.autoPostFacebookOAuthState.create({
      data: {
        stateHash,
        userId,
        organizationId,
        nonce,
        expiresAt,
      },
    });

    return { state };
  }

  private verifyState(state: string): {
    userId: string;
    organizationId: string;
    nonce: string;
    ts: number;
  } {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 5) throw new UnauthorizedException('State không hợp lệ');
    const [userId, organizationId, tsStr, nonce, sig] = parts;
    const ts = Number(tsStr);
    if (!userId || !organizationId || !nonce || !Number.isFinite(ts) || !sig) {
      throw new UnauthorizedException('State không hợp lệ');
    }
    if (Date.now() - ts > STATE_TTL_MS) {
      throw new UnauthorizedException('State đã hết hạn');
    }
    const payload = `${userId}:${organizationId}:${tsStr}:${nonce}`;
    const expected = createHmac('sha256', this.getEncryptionKey()).update(payload).digest('hex');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('State không hợp lệ');
    }
    return { userId, organizationId, nonce, ts };
  }
}
