import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AutoPostFacebookConnectionStatus,
  AutoPostStatus,
} from '@marketingspa/database';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { encryptSecret, decryptSecret } from '../common/utils/encryption.util';
import { assertEncryptionKeyConfigured } from '../common/utils/assert-encryption-key';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AUTO_POST_QUEUE } from '../queue/queue.constants';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { AutoPostMetaService } from './auto-post-meta.service';
import {
  buildOAuthPagesListResult,
  mergeGrantedScopes,
  missingRequiredPageScopes,
  AUTO_POST_REQUIRED_PAGE_SCOPES,
  type OAuthPagesListResult,
} from './auto-post-meta-pages.util';
import { MetaFanpageService } from '../meta-fanpage/meta-fanpage.service';
import { ChannelConnectionsService } from '../messaging/channel-connections.service';
import { ChatbotCskhService } from '../chatbot-cskh/chatbot-cskh.service';
import {
  assertCanUseServerEnvFanpage,
  canUseServerEnvFanpage,
  parseMetaFanpageAllowedOrgIds,
} from '../meta-fanpage/meta-fanpage-access';
import {
  humanizeAutoPostFacebookError,
  humanizeOAuthPagesStatusMessage,
} from './auto-post-user-facing-errors';
import { assertMetaAppSecretMatchesAppId } from './assert-auto-post-meta-oauth';
import { MetaGraphUsageService } from './meta-graph-usage.service';
import { withRedisSingleFlight } from './meta-redis-cache';
import { AutoPostFacebookPageDetailsService } from './auto-post-facebook-page-details.service';
import { formatHoChiMinhDateTime } from './auto-post-facebook-page-details.logic';
import { MetaGraphMetricsService } from './meta-graph-metrics.service';
import { redactMetaSecrets } from './meta-graph-http';

const STATE_TTL_MS = 10 * 60 * 1000;

function toPublicFanpagePage(p: {
  id: string;
  pageId: string;
  pageName: string;
  pagePictureUrl: string | null;
  lastSyncedAt?: Date | null;
  lastPostCreatedAt?: Date | null;
  lastSyncError?: string | null;
}) {
  return {
    id: p.id,
    pageId: p.pageId,
    pageName: p.pageName,
    pagePictureUrl: p.pagePictureUrl,
    lastSyncedAt: p.lastSyncedAt?.toISOString() ?? null,
    lastPostCreatedAt: p.lastPostCreatedAt?.toISOString() ?? null,
    lastSyncedAtDisplay: formatHoChiMinhDateTime(p.lastSyncedAt),
    lastPostCreatedAtDisplay: formatHoChiMinhDateTime(p.lastPostCreatedAt),
    lastSyncError: p.lastSyncError ?? null,
  };
}

@Injectable()
export class AutoPostFacebookService {
  private readonly logger = new Logger(AutoPostFacebookService.name);
  /** In-flight /me/accounts — chống React double-mount / double-click cùng process */
  private readonly managedPagesInflight = new Map<
    string,
    Promise<Awaited<ReturnType<AutoPostMetaService['getManagedPages']>>>
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly meta: AutoPostMetaService,
    private readonly metaFanpage: MetaFanpageService,
    private readonly channelConnections: ChannelConnectionsService,
    @Inject(forwardRef(() => ChatbotCskhService))
    private readonly chatbotCskh: ChatbotCskhService,
    private readonly usage: MetaGraphUsageService,
    private readonly pageDetails: AutoPostFacebookPageDetailsService,
    private readonly metrics: MetaGraphMetricsService,
    @Inject(AUTO_POST_QUEUE) private readonly autoPostQueue: Queue,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  /**
   * Luôn mở OAuth Login for Business — không tự đồng bộ SERVER_ENV dù META_PAGE_* tồn tại.
   * SUPER_ADMIN chọn SERVER_ENV qua endpoint connectServerEnv riêng.
   */
  async getOAuthStartUrl(user: AuthUser): Promise<{ url: string; mode: 'oauth' }> {
    const advanced = this.isAdvancedDiagnosticsUser(user);
    const fail = (technical: string, friendly?: string) => {
      const msg = advanced
        ? technical
        : humanizeAutoPostFacebookError(friendly ?? technical) ?? technical;
      throw new BadRequestException(msg);
    };

    const oauthEnabled =
      (this.config.get<string>('OAUTH_CONNECTION') ?? process.env.OAUTH_CONNECTION ?? '')
        .trim()
        .toLowerCase() === 'true';

    if (!oauthEnabled) {
      fail(
        'Kết nối OAuth chưa bật cho tenant này. Vui lòng liên hệ hỗ trợ để bật OAUTH_CONNECTION hoặc dùng SERVER_ENV (admin/allowlist).',
      );
    }

    // Canary gate: khi AUTO_POST_OAUTH_CANARY=true chỉ SUPER_ADMIN hoặc org trong AUTO_POST_OAUTH_CANARY_ORG_IDS
    if (!this.canUseOAuthCanary(user)) {
      fail(
        'OAuth Fanpage đang chạy canary — chỉ SUPER_ADMIN hoặc tổ chức allowlist được kết nối. Chưa mở cho toàn bộ khách hàng.',
      );
    }

    if (!this.meta.loginConfigId) {
      fail(
        'Facebook Login for Business cần META_LOGIN_CONFIG_ID (META_LOGIN_CONFIG_ID/ FACEBOOOK_LOGIN_CONFIG_ID).',
      );
    }

    this.ensureMetaConfig();
    // Fail-fast: App ID / config_id / redirect domain MarketingAutoAZ (không SEOAuto)
    try {
      this.meta.assertProductionOAuthConfig();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'oauth_config_invalid';
      fail(msg);
    }
    try {
      await assertMetaAppSecretMatchesAppId({
        appId: this.meta.appId,
        appSecret: this.meta.appSecret,
        apiVersion: this.meta.apiVersion,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'meta_app_secret_mismatch';
      fail(msg);
    }
    // Luôn tạo phiên OAuth mới — không tái sử dụng pending/connection token cũ
    // (sau khi user gỡ Business Integration trên Facebook).
    await this.resetOAuthSessionForReconnect(user.id, user.organizationId);
    const { state } = await this.createOAuthState(user.id, user.organizationId);
    return { url: this.meta.buildOAuthUrl(state), mode: 'oauth' };
  }

  private isAdvancedDiagnosticsUser(user: AuthUser): boolean {
    const allowedOrgIds = parseMetaFanpageAllowedOrgIds(
      (k) => this.config.get<string>(k) ?? process.env[k],
    );
    return canUseServerEnvFanpage(
      { role: user.role, organizationId: user.organizationId },
      allowedOrgIds,
    );
  }

  private presentOAuthPagesList(
    result: OAuthPagesListResult,
    user?: AuthUser,
  ): OAuthPagesListResult {
    const friendly = humanizeOAuthPagesStatusMessage(result.status, result.message);
    const advanced = user ? this.isAdvancedDiagnosticsUser(user) : false;
    if (advanced) {
      return {
        ...result,
        message: result.message ?? friendly,
      };
    }
    return {
      status: result.status,
      facebookUserName: result.facebookUserName,
      pages: result.pages,
      message: friendly,
      grantedScopes: [],
      missingScopes: [],
      requiredScopes: [],
    };
  }

  /**
   * Xóa pending + state chưa dùng; vô hiệu hóa connection OAuth cũ của đúng user+org.
   * Không đụng connection env_page_token / user khác.
   */
  private async resetOAuthSessionForReconnect(userId: string, organizationId: string) {
    await this.prisma.autoPostFacebookOAuthPendingConnection.deleteMany({
      where: { userId, organizationId },
    });
    await this.prisma.autoPostFacebookOAuthState.deleteMany({
      where: { userId, organizationId, usedAt: null },
    });

    const conn = await this.prisma.autoPostFacebookConnection.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: { id: true, scopes: true },
    });
    if (!conn) return;
    if (conn.scopes?.includes('env_page_token')) return;

    // Vô hiệu hóa connection OAuth cũ — token cũ không còn dùng để publish/list.
    await this.prisma.autoPostFacebookConnection.update({
      where: { userId_organizationId: { userId, organizationId } },
      data: {
        status: AutoPostFacebookConnectionStatus.DISCONNECTED,
        lastError:
          'NEEDS_RECONNECT: Phiên OAuth mới đã bắt đầu — hoàn tất đăng nhập Facebook để cấp quyền lại',
        scopes: [],
      },
    });
  }

  /** Vô hiệu hóa connection OAuth (không phải SERVER_ENV) của đúng user+org. */
  private async invalidateOAuthConnectionIfPresent(
    userId: string,
    organizationId: string,
    lastError: string,
  ) {
    const conn = await this.prisma.autoPostFacebookConnection.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: { scopes: true },
    });
    if (!conn || conn.scopes?.includes('env_page_token')) return;
    await this.prisma.autoPostFacebookConnection.update({
      where: { userId_organizationId: { userId, organizationId } },
      data: {
        status: AutoPostFacebookConnectionStatus.DISCONNECTED,
        lastError: lastError.slice(0, 500),
        scopes: [],
      },
    });
    await this.pageDetails.invalidateOrgCache(organizationId);
  }

  /**
   * Đồng bộ Fanpage từ META_PAGE_* (.env) — chỉ SUPER_ADMIN / org allowlist, gọi chủ động.
   * Không xóa / không trả META_PAGE_ACCESS_TOKEN ra API.
   */
  async connectServerEnv(user: AuthUser) {
    assertCanUseServerEnvFanpage(user, (k) => this.config.get<string>(k) ?? process.env[k]);
    await this.syncEnvPageConnection(user);
    const appUrl = this.config.get<string>('APP_URL') ?? 'http://localhost:3000';
    return {
      mode: 'env' as const,
      url: `${appUrl}/content?tab=channels&facebook=connected&mode=env`,
      connected: true,
    };
  }

  /** Đồng bộ Fanpage từ META_PAGE_* (.env) vào DB — token mã hóa, không trả ra API. */
  async syncEnvPageConnection(user: AuthUser) {
    assertCanUseServerEnvFanpage(user, (k) => this.config.get<string>(k) ?? process.env[k]);

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
    await this.syncPagesToMessaging(user.organizationId, user.id, [
      {
        pageId: creds.pageId,
        pageName,
        encryptedPageAccessToken: encryptedPageToken,
        scopes: ['pages_manage_posts', 'env_page_token'],
      },
    ]);
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
      const safe = redactMetaSecrets(error).slice(0, 180);
      return {
        redirectUrl: `${base}error&message=${encodeURIComponent(
          humanizeAutoPostFacebookError(safe) ?? 'Kết nối Facebook bị hủy hoặc thất bại.',
        )}`,
      };
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
      const diag = await this.meta.diagnoseUserPermissions(accessToken);
      const grantedScopes = diag.granted;
      const missingPageScopes = diag.missingRequired;

      // pages_read_engagement bị từ chối tường minh
      if (diag.declined.includes('pages_read_engagement')) {
        const hint =
          'Bạn đã từ chối quyền pages_read_engagement. Vui lòng Kết nối lại Facebook và chấp nhận quyền đọc thông tin Fanpage.';
        await this.prisma.autoPostFacebookOAuthPendingConnection.deleteMany({
          where: { userId, organizationId },
        });
        await this.invalidateOAuthConnectionIfPresent(
          userId,
          organizationId,
          'PERMISSION_DECLINED:pages_read_engagement',
        );
        await this.pageDetails.invalidateOrgCache(organizationId);
        return { redirectUrl: `${base}error&message=${encodeURIComponent(hint)}` };
      }

      if (missingPageScopes.length > 0) {
        const configId = this.meta.loginConfigId ?? 'META_LOGIN_CONFIG_ID';
        const hintTechnical =
          `Facebook (${me.name ?? me.id}) chưa cấp quyền Fanpage. ` +
          `Hiện có: ${grantedScopes.join(', ') || 'public_profile'}. ` +
          `Thiếu: ${missingPageScopes.join(', ')}. ` +
          (diag.declined.length ? `Đã từ chối: ${diag.declined.join(', ')}. ` : '') +
          `Cập nhật Login Configuration ${configId} trên Meta Developer (thêm pages_show_list, pages_read_engagement, pages_manage_posts) rồi bấm Kết nối lại Facebook trên MarketingAutoAZ.`;
        const hint = humanizeAutoPostFacebookError(hintTechnical) ?? hintTechnical;
        await this.prisma.autoPostFacebookOAuthPendingConnection.deleteMany({
          where: { userId, organizationId },
        });
        // Không lưu token thiếu quyền làm connection hoạt động
        await this.invalidateOAuthConnectionIfPresent(
          userId,
          organizationId,
          `MISSING_PERMISSION: ${missingPageScopes.join(',')}`,
        );
        await this.pageDetails.invalidateOrgCache(organizationId);
        return { redirectUrl: `${base}error&message=${encodeURIComponent(hint)}` };
      }

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
          scopes: grantedScopes,
          lastError: null,
        },
        update: {
          encryptedAccessToken,
          tokenExpiresAt: expiresAt,
          facebookUserId: me.id,
          facebookUserName: me.name ?? null,
          scopes: grantedScopes,
          lastError: null,
        },
      });

      // OAuth reconnect — cache chi tiết Fanpage cũ không còn tin cậy
      await this.pageDetails.invalidateOrgCache(organizationId);

      return { redirectUrl: `${base}oauth_connected&mode=oauth` };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'oauth_failed';
      const safeMsg = redactMetaSecrets(msg).slice(0, 300);

      this.logger.warn(
        `Auto Post OAuth failed for user ${userId}: ${redactMetaSecrets(msg).slice(0, 180)}`,
      );

      return {
        redirectUrl: `${base}error&message=${encodeURIComponent(
          humanizeAutoPostFacebookError(safeMsg) ??
            'Đã xảy ra lỗi khi kết nối Facebook. Vui lòng thử lại hoặc liên hệ hỗ trợ.',
        )}`,
      };
    }
  }

  /**
   * Chẩn đoán quyền Fanpage — Configuration ID, granted/declined, Page ID, token type, updatedAt.
   * Không trả token.
   */
  async getPermissionsDiagnostics(userId: string, organizationId: string) {
    const conn = await this.prisma.autoPostFacebookConnection.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      include: {
        pages: {
          select: {
            id: true,
            pageId: true,
            pageName: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    const loginConfigId = this.meta.loginConfigId ?? null;
    const appId = (() => {
      try {
        return this.meta.appId;
      } catch {
        return null;
      }
    })();

    if (!conn) {
      return {
        loginConfigId,
        appId,
        connectionStatus: null,
        facebookUserId: null,
        facebookUserName: null,
        tokenType: 'none' as const,
        tokenUpdatedAt: null,
        tokenExpiresAt: null,
        scopesStored: [] as string[],
        permissions: [] as Array<{ permission: string; status: string }>,
        granted: [] as string[],
        declined: [] as string[],
        missingRequired: [...AUTO_POST_REQUIRED_PAGE_SCOPES],
        pages: [],
        pagesReadEngagement: 'unknown' as const,
        checkedAt: new Date().toISOString(),
        source: 'none' as const,
      };
    }

    const scopesStored = Array.isArray(conn.scopes) ? conn.scopes : [];
    const isEnv = scopesStored.includes('env_page_token');
    let permissions: Array<{
      permission: string;
      status: 'granted' | 'declined' | 'expired' | 'unknown';
    }> = [];
    let granted = scopesStored.filter((s) => s !== 'env_page_token');
    let declined: string[] = [];
    let source: 'live' | 'stored' | 'none' = 'stored';

    if (!isEnv && conn.encryptedAccessToken && conn.status !== 'DISCONNECTED') {
      try {
        const userToken = decryptSecret(conn.encryptedAccessToken, this.getEncryptionKey());
        const diag = await this.meta.diagnoseUserPermissions(userToken);
        permissions = diag.permissions;
        granted = mergeGrantedScopes(scopesStored, diag.granted).filter(
          (s) => !diag.declined.includes(s),
        );
        declined = diag.declined;
        source = 'live';
        // Union scopes — không ghi đè làm mất quyền đã lưu
        await this.prisma.autoPostFacebookConnection.update({
          where: { id: conn.id },
          data: {
            scopes: mergeGrantedScopes(scopesStored, diag.granted).filter(
              (s) => !diag.declined.includes(s),
            ),
          },
        });
        await this.pageDetails.invalidateOrgCache(organizationId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'diag_failed';
        this.logger.warn(
          `permissions diagnostics live failed org=${organizationId}: ${msg.slice(0, 180)}`,
        );
      }
    } else if (isEnv) {
      granted = ['env_page_token', 'pages_show_list', 'pages_read_engagement', 'pages_manage_posts'];
      permissions = granted.map((p) => ({ permission: p, status: 'granted' as const }));
      source = 'stored';
    }

    const missingRequired = missingRequiredPageScopes(granted);
    let pagesReadEngagement: 'granted' | 'declined' | 'missing' | 'unknown' = 'unknown';
    if (declined.includes('pages_read_engagement')) pagesReadEngagement = 'declined';
    else if (granted.includes('pages_read_engagement') || isEnv) pagesReadEngagement = 'granted';
    else if (missingRequired.includes('pages_read_engagement')) pagesReadEngagement = 'missing';

    const payload = {
      loginConfigId,
      appId,
      connectionStatus: conn.status,
      facebookUserId: conn.facebookUserId,
      facebookUserName: conn.facebookUserName,
      tokenType: isEnv ? ('env' as const) : ('user' as const),
      tokenUpdatedAt: conn.updatedAt?.toISOString?.() ?? null,
      tokenExpiresAt: conn.tokenExpiresAt?.toISOString?.() ?? null,
      scopesStored,
      permissions,
      granted,
      declined,
      missingRequired,
      pages: conn.pages.map((p) => ({
        id: p.id,
        pageId: p.pageId,
        pageName: p.pageName,
        tokenUpdatedAt: p.updatedAt?.toISOString?.() ?? null,
      })),
      pagesReadEngagement,
      checkedAt: new Date().toISOString(),
      source,
    };
    // Không bao giờ trả token
    const json = JSON.stringify(payload);
    if (/access_token|encrypted|EAAG|EAA[A-Z]/i.test(json)) {
      throw new BadRequestException('Diagnostics payload chứa credential — từ chối');
    }
    return payload;
  }

  async getConnectionStatus(userId: string, organizationId: string, user?: AuthUser) {
    // Không auto-sync SERVER_ENV — admin phải bấm «Dùng Fanpage nội bộ» trong khu vực nâng cao.
    const conn = await this.prisma.autoPostFacebookConnection.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      include: { pages: { orderBy: { pageName: 'asc' } } },
    });

    const advanced = user ? this.isAdvancedDiagnosticsUser(user) : false;

    if (!conn) {
      return {
        connected: false,
        status: 'DISCONNECTED' as const,
        needsReconnect: false,
        facebookUserName: null,
        pages: [] as Array<ReturnType<typeof toPublicFanpagePage>>,
        tokenExpiresAt: null,
        lastError: null,
        connectionMode: 'oauth' as const,
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

    const publicPayload = {
      connected: status === AutoPostFacebookConnectionStatus.CONNECTED,
      status,
      needsReconnect: status === 'NEEDS_RECONNECT',
      facebookUserName: conn.facebookUserName,
      tokenExpiresAt: conn.tokenExpiresAt?.toISOString() ?? null,
      // Không humanize(null) → chuỗi lỗi giả "Đã xảy ra lỗi khi kết nối Facebook"
      lastError: lastError ? humanizeAutoPostFacebookError(lastError) : null,
      connectionMode: conn.scopes?.includes('env_page_token')
        ? ('env' as const)
        : ('oauth' as const),
      pages: conn.pages.map((p) => toPublicFanpagePage(p)),
    };

    if (!advanced) {
      // USER: không lộ connectionMode kỹ thuật / raw error / scopes
      return {
        connected: publicPayload.connected,
        status: publicPayload.status,
        needsReconnect: publicPayload.needsReconnect,
        facebookUserName: publicPayload.facebookUserName,
        tokenExpiresAt: publicPayload.tokenExpiresAt,
        lastError: publicPayload.lastError,
        pages: publicPayload.pages,
      };
    }

    return {
      ...publicPayload,
      lastErrorRaw: lastError,
      scopes: conn.scopes ?? [],
    };
  }

  /** OAuth (Login for Business) — liệt kê Fanpage từ user token OAuth mới (không dùng ENV token). */
  async listOAuthManagedPages(
    userId: string,
    organizationId: string,
    user?: AuthUser,
  ): Promise<OAuthPagesListResult> {
    const finish = (result: OAuthPagesListResult) =>
      this.presentOAuthPagesList(result, user);

    let oauthUser: Awaited<ReturnType<AutoPostFacebookService['resolveOAuthUserAccess']>>;
    try {
      oauthUser = await this.resolveOAuthUserAccess(userId, organizationId);
    } catch {
      return finish(
        buildOAuthPagesListResult({
          status: 'NO_PENDING_OAUTH',
          message: 'Chưa có phiên OAuth — bấm Kết nối Facebook OAuth trên MarketingAutoAZ.',
        }),
      );
    }

    if (oauthUser.tokenExpiresAt && oauthUser.tokenExpiresAt.getTime() < Date.now()) {
      if (oauthUser.source === 'pending') {
        await this.prisma.autoPostFacebookOAuthPendingConnection.deleteMany({
          where: { userId, organizationId },
        });
      }
      return finish(
        buildOAuthPagesListResult({
          status: 'TOKEN_EXPIRED',
          facebookUserName: oauthUser.facebookUserName,
          grantedScopes: oauthUser.scopes ?? [],
          message: 'Token Facebook đã hết hạn — bấm Kết nối lại Facebook để cấp quyền mới.',
        }),
      );
    }

    const accessToken = decryptSecret(oauthUser.encryptedAccessToken, this.getEncryptionKey());
    const pendingName = oauthUser.facebookUserName;
    const pendingId = oauthUser.facebookUserId;

    let grantedScopes: string[];
    try {
      grantedScopes = await this.meta.resolveGrantedScopes(accessToken);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'meta_api_error';
      // Token bị thu hồi / hết hạn sau khi gỡ Business Integration
      if (/session|expired|invalid|OAuthException|190|467/i.test(msg)) {
        if (oauthUser.source === 'pending') {
          await this.prisma.autoPostFacebookOAuthPendingConnection.deleteMany({
            where: { userId, organizationId },
          });
        }
        await this.invalidateOAuthConnectionIfPresent(
          userId,
          organizationId,
          'TOKEN_EXPIRED: Meta thu hồi hoặc hết hạn token',
        );
        return finish(
          buildOAuthPagesListResult({
            status: 'TOKEN_EXPIRED',
            facebookUserName: pendingName,
            message:
              'Token Facebook không còn hợp lệ (đã gỡ tích hợp hoặc hết hạn). Bấm Kết nối lại Facebook để cấp quyền mới.',
          }),
        );
      }
      return finish(
        buildOAuthPagesListResult({
          status: 'META_API_ERROR',
          facebookUserName: pendingName,
          message: msg.slice(0, 300),
        }),
      );
    }

    const mergedScopes = [...new Set([...grantedScopes, ...oauthUser.scopes])];
    const missingScopes = missingRequiredPageScopes(mergedScopes);
    // Chỉ fail cứng missing scopes khi đang ở phiên pending mới; connection cũ vẫn cho liệt kê để thêm Page
    if (missingScopes.length > 0 && oauthUser.source === 'pending') {
      await this.prisma.autoPostFacebookOAuthPendingConnection.deleteMany({
        where: { userId, organizationId },
      });
      await this.invalidateOAuthConnectionIfPresent(
        userId,
        organizationId,
        `MISSING_PERMISSION: ${missingScopes.join(',')}`,
      );
      return finish(
        buildOAuthPagesListResult({
          status: 'MISSING_PERMISSION',
          facebookUserName: pendingName,
          grantedScopes: mergedScopes,
          missingScopes,
          message:
            `Facebook chưa cấp quyền liệt kê Fanpage. Thiếu: ${missingScopes.join(', ')}. ` +
            `Bấm Kết nối lại Facebook và chấp thuận đủ quyền trên Meta.`,
        }),
      );
    }

    let pages;
    try {
      pages = await this.getManagedPagesCoalesced(userId, organizationId, accessToken);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'meta_api_error';
      if (/session|expired|invalid|OAuthException|190|467/i.test(msg)) {
        if (oauthUser.source === 'pending') {
          await this.prisma.autoPostFacebookOAuthPendingConnection.deleteMany({
            where: { userId, organizationId },
          });
        }
        return finish(
          buildOAuthPagesListResult({
            status: 'TOKEN_EXPIRED',
            facebookUserName: pendingName,
            grantedScopes: mergedScopes,
            message:
              'Token Facebook không còn hợp lệ khi lấy Fanpage. Bấm Kết nối lại Facebook để cấp quyền mới.',
          }),
        );
      }
      return finish(
        buildOAuthPagesListResult({
          status: 'META_API_ERROR',
          facebookUserName: pendingName,
          grantedScopes: mergedScopes,
          message: msg.slice(0, 300),
        }),
      );
    }

    if (pages.length === 0) {
      return finish(
        buildOAuthPagesListResult({
          status: 'NO_PAGES',
          facebookUserName: pendingName,
          grantedScopes: mergedScopes,
          message:
            `Tài khoản "${pendingName ?? pendingId}" không có Fanpage nào ` +
            `hoặc bạn chưa được Meta cấp quyền quản trị Page.`,
        }),
      );
    }

    return finish(
      buildOAuthPagesListResult({
        status: 'OK',
        facebookUserName: pendingName,
        grantedScopes: mergedScopes,
        pages,
        message: null,
      }),
    );
  }

  /** OAuth — chọn nhiều Fanpage: verify ownership + pages_manage_posts, upsert, không xóa page vẫn giữ. */
  async selectOAuthPage(userId: string, organizationId: string, pageId: string) {
    return this.selectOAuthPages(userId, organizationId, [pageId]);
  }

  async selectOAuthPages(userId: string, organizationId: string, pageIds: string[]) {
    const uniqueIds = [
      ...new Set((pageIds ?? []).map((id) => String(id || '').trim()).filter(Boolean)),
    ];
    if (uniqueIds.length === 0) throw new BadRequestException('pageIds is required');

    const oauthUser = await this.resolveOAuthUserAccess(userId, organizationId);
    if (oauthUser.tokenExpiresAt && oauthUser.tokenExpiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Token Facebook đã hết hạn — vui lòng kết nối lại');
    }

    const accessToken = decryptSecret(oauthUser.encryptedAccessToken, this.getEncryptionKey());
    const managed = await this.getManagedPagesCoalesced(userId, organizationId, accessToken);
    const managedById = new Map(managed.map((p) => [p.id, p]));

    const failed: Array<{ pageId: string; reason: string }> = [];
    const accepted: Array<{
      page: (typeof managed)[number];
      scopes: string[];
      tokenExpiresAt: Date | null;
      encryptedPageAccessToken: string;
    }> = [];

    for (const pageId of uniqueIds) {
      const chosen = managedById.get(pageId);
      if (!chosen) {
        failed.push({ pageId, reason: 'Fanpage không thuộc quyền của bạn' });
        continue;
      }

      if (!chosen.access_token?.trim()) {
        failed.push({ pageId, reason: 'Fanpage không có page access token — thử Kết nối lại' });
        continue;
      }

      try {
        // Soft-skip debug_token CHỈ khi page token vừa lấy trực tiếp từ /me/accounts
        // trong cùng request (managed ở trên). Token cũ / reconnect / quyền không rõ → debug đầy đủ.
        const softOk = this.pageTokenAllowsManagePosts({
          debugScopes: oauthUser.scopes,
          userScopes: oauthUser.scopes,
          pageTasks: chosen.tasks ?? [],
          hasPageToken: true,
          isValid: true,
        });

        let grantedScopes = oauthUser.scopes.filter((s) => s.startsWith('pages_'));
        let tokenExpiresAt = oauthUser.tokenExpiresAt;

        if (!softOk) {
          const debug = await this.meta.debugToken(chosen.access_token);
          grantedScopes = debug.scopes ?? [];
          if (!debug.is_valid) {
            failed.push({ pageId, reason: 'Token Facebook đã hết hạn — vui lòng kết nối lại' });
            continue;
          }
          if (debug.expires_at && debug.expires_at * 1000 < Date.now()) {
            failed.push({ pageId, reason: 'Token Facebook đã hết hạn — vui lòng kết nối lại' });
            continue;
          }
          if (
            !this.pageTokenAllowsManagePosts({
              debugScopes: grantedScopes,
              userScopes: oauthUser.scopes,
              pageTasks: chosen.tasks ?? [],
              hasPageToken: true,
              isValid: debug.is_valid,
            })
          ) {
            failed.push({ pageId, reason: 'MISSING_PERMISSION: pages_manage_posts' });
            continue;
          }
          tokenExpiresAt = debug.expires_at
            ? new Date(debug.expires_at * 1000)
            : oauthUser.tokenExpiresAt;
        }

        const effectiveScopes = [
          ...new Set([
            ...grantedScopes,
            ...oauthUser.scopes.filter((s) => s.startsWith('pages_')),
          ]),
        ];

        accepted.push({
          page: chosen,
          scopes: effectiveScopes.length ? effectiveScopes : ['pages_manage_posts'],
          tokenExpiresAt,
          encryptedPageAccessToken: encryptSecret(chosen.access_token, this.getEncryptionKey()),
        });
      } catch (e) {
        const reason = e instanceof Error ? e.message : 'verify_failed';
        this.logger.warn(
          `selectOAuthPages verify failed pageId=${pageId}: ${reason.slice(0, 180)}`,
        );
        failed.push({ pageId, reason });
      }
    }

    if (accepted.length === 0) {
      const first = failed[0];
      this.logger.warn(
        `selectOAuthPages all failed user=${userId} source=${oauthUser.source} reasons=${failed
          .map((f) => f.reason)
          .join('|')
          .slice(0, 300)}`,
      );
      if (first?.reason?.includes('MISSING_PERMISSION')) {
        throw new BadRequestException('MISSING_PERMISSION: pages_manage_posts');
      }
      if (first?.reason?.includes('hết hạn')) {
        throw new UnauthorizedException(first.reason);
      }
      throw new BadRequestException(first?.reason || 'Không thể lưu Fanpage đã chọn');
    }

    const unionScopes = [
      ...new Set([...accepted.flatMap((a) => a.scopes), ...oauthUser.scopes]),
    ];
    const latestExpiry = accepted.reduce<Date | null>((acc, a) => {
      if (!a.tokenExpiresAt) return acc;
      if (!acc || a.tokenExpiresAt.getTime() > acc.getTime()) return a.tokenExpiresAt;
      return acc;
    }, oauthUser.tokenExpiresAt ?? null);

    await this.prisma.$transaction(async (tx) => {
      const newConn = await tx.autoPostFacebookConnection.upsert({
        where: { userId_organizationId: { userId, organizationId } },
        create: {
          userId,
          organizationId,
          encryptedAccessToken: oauthUser.encryptedAccessToken,
          tokenExpiresAt: latestExpiry,
          facebookUserId: oauthUser.facebookUserId,
          facebookUserName: oauthUser.facebookUserName,
          status: AutoPostFacebookConnectionStatus.CONNECTED,
          scopes: unionScopes,
          lastError: null,
        },
        update: {
          encryptedAccessToken: oauthUser.encryptedAccessToken,
          tokenExpiresAt: latestExpiry,
          facebookUserId: oauthUser.facebookUserId,
          facebookUserName: oauthUser.facebookUserName,
          status: AutoPostFacebookConnectionStatus.CONNECTED,
          scopes: unionScopes,
          lastError: null,
        },
      });

      for (const item of accepted) {
        await tx.autoPostFacebookPage.upsert({
          where: {
            connectionId_pageId: { connectionId: newConn.id, pageId: item.page.id },
          },
          create: {
            userId,
            connectionId: newConn.id,
            pageId: item.page.id,
            pageName: item.page.name,
            pagePictureUrl: item.page.picture?.data?.url ?? null,
            encryptedPageAccessToken: item.encryptedPageAccessToken,
          },
          update: {
            pageName: item.page.name,
            pagePictureUrl: item.page.picture?.data?.url ?? null,
            encryptedPageAccessToken: item.encryptedPageAccessToken,
          },
        });
      }

      // Xóa pending sau khi đã lưu connection (idempotent). Lần chọn Fanpage sau dùng connection token.
      await tx.autoPostFacebookOAuthPendingConnection.deleteMany({
        where: { userId, organizationId },
      });
    });

    // Chọn lại Fanpage / đổi token — invalidate cache org
    await this.pageDetails.invalidateOrgCache(organizationId);

    await this.syncPagesToMessaging(
      organizationId,
      userId,
      accepted.map((a) => ({
        pageId: a.page.id,
        pageName: a.page.name,
        encryptedPageAccessToken: a.encryptedPageAccessToken,
        scopes: a.scopes,
      })),
    );

    const status = await this.getConnectionStatus(userId, organizationId);
    const connectedPages = accepted.map((a) => ({
      pageId: a.page.id,
      pageName: a.page.name,
    }));
    const failedPages = failed.map((f) => ({
      pageId: f.pageId,
      reason:
        humanizeAutoPostFacebookError(f.reason) ??
        'Không thể lưu Fanpage này',
    }));
    const warning =
      failedPages.length > 0
        ? `Đã lưu ${connectedPages.length} Fanpage; ${failedPages.length} trang thất bại.`
        : null;

    return {
      success: true as const,
      connectedPages,
      failedPages,
      warning,
      // backward-compatible fields
      ...status,
      selectedPageIds: connectedPages.map((p) => p.pageId),
      failed: failedPages,
    };
  }

  /**
   * Source of truth Auto Post → MessagingChannelConnection (idempotent upsert).
   * Không log Page Token.
   */
  private async syncPagesToMessaging(
    organizationId: string,
    userId: string,
    pages: Array<{
      pageId: string;
      pageName: string;
      encryptedPageAccessToken: string;
      scopes?: string[];
    }>,
  ) {
    for (const page of pages) {
      try {
        const token = decryptSecret(page.encryptedPageAccessToken, this.getEncryptionKey());
        if (!token?.trim()) continue;
        await this.channelConnections.upsertMessengerFromChatbot(
          organizationId,
          {
            pageId: page.pageId,
            pageAccessToken: token,
            pageName: page.pageName,
            subscribeWebhook: true,
          },
          userId,
          { grantedScopes: page.scopes },
        );
      } catch (e) {
        this.logger.warn(
          `syncPagesToMessaging failed pageId=${page.pageId}: ${
            e instanceof Error ? e.message : String(e)
          }`.slice(0, 220),
        );
      }
    }

    try {
      await this.chatbotCskh.ensureChatbotPagesFromAutoPost(organizationId, userId);
    } catch (e) {
      this.logger.warn(
        `ensureChatbotPagesFromAutoPost failed: ${
          e instanceof Error ? e.message : String(e)
        }`.slice(0, 220),
      );
    }
  }

  /** Ngắt riêng một Fanpage (DB row id) — không xóa toàn bộ connection nếu còn page khác. */
  async disconnectPage(userId: string, organizationId: string, fanpageRowId: string) {
    const page = await this.prisma.autoPostFacebookPage.findFirst({
      where: { id: fanpageRowId, userId, connection: { organizationId } },
      include: { connection: true },
    });
    if (!page) throw new NotFoundException('Fanpage không tồn tại');

    const scheduled = await this.prisma.autoPost.findMany({
      where: {
        userId,
        organizationId,
        fanpageId: page.id,
        status: AutoPostStatus.SCHEDULED,
      },
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
        where: {
          userId,
          organizationId,
          fanpageId: page.id,
          status: AutoPostStatus.SCHEDULED,
        },
        data: {
          status: AutoPostStatus.CANCELLED,
          scheduledAt: null,
          errorMessage: 'Cancelled: Fanpage disconnected',
        },
      });
    }

    await this.prisma.autoPostFacebookPage.delete({ where: { id: page.id } });

    await this.pageDetails.invalidateFanpageCache(organizationId, page.id);

    await this.channelConnections.disableMessengerPageAccess(page.pageId, {
      organizationId,
      reason: 'Auto Post Fanpage disconnected',
    });

    const remaining = await this.prisma.autoPostFacebookPage.count({
      where: { connectionId: page.connectionId },
    });
    if (remaining === 0) {
      await this.prisma.autoPostFacebookConnection.deleteMany({
        where: { id: page.connectionId, userId, organizationId },
      });
    }

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
    await this.pageDetails.invalidateOrgCache(organizationId);
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
    // Gần Meta rate limit — không storm /me/accounts; trả status hiện có + warning
    if (await this.usage.shouldThrottleBackground()) {
      const status = await this.getConnectionStatus(userId, organizationId, user);
      return {
        success: false as const,
        connectedPages: (status.pages ?? []).map((p) => ({
          pageId: p.pageId,
          pageName: p.pageName,
        })),
        failedPages: [] as Array<{ pageId: string; reason: string }>,
        warning:
          'Facebook đang gần giới hạn gọi API — tạm hoãn làm mới danh sách. Thử lại sau ít phút.',
        ...status,
      };
    }

    const conn = await this.prisma.autoPostFacebookConnection.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });

    // Không fallback OAuth → SERVER_ENV: chỉ sync env khi connection là env_page_token
    // hoặc chưa có connection và user thuộc allowlist.
    const isEnvConnection = Boolean(conn?.scopes?.includes('env_page_token'));

    if (isEnvConnection) {
      const orgUser =
        user ??
        (await this.prisma.user.findUnique({
          where: { id: userId },
          include: { role: { select: { code: true } } },
        }).then((u) =>
          u
            ? {
                id: u.id,
                email: u.email,
                name: u.name,
                role: u.role.code,
                organizationId: u.organizationId,
              }
            : null,
        ));
      if (!orgUser) throw new NotFoundException('User không tồn tại');
      return this.syncEnvPageConnection(orgUser);
    }

    if (conn) {
      const required = await this.requireConnection(userId, organizationId);
      // OAuth: chỉ refresh token/meta cho Page đã chọn — không thay bằng toàn bộ danh sách Graph
      try {
        const accessToken = decryptSecret(required.encryptedAccessToken, this.getEncryptionKey());
        const managed = await this.getManagedPagesCoalesced(userId, organizationId, accessToken);
        const managedById = new Map(managed.map((p) => [p.id, p]));
        const existing = await this.prisma.autoPostFacebookPage.findMany({
          where: { connectionId: required.id, userId },
        });

        for (const page of existing) {
          const match = managedById.get(page.pageId);
          if (!match) continue;
          await this.prisma.autoPostFacebookPage.update({
            where: { id: page.id },
            data: {
              pageName: match.name,
              pagePictureUrl: match.picture?.data?.url ?? null,
              encryptedPageAccessToken: encryptSecret(match.access_token, this.getEncryptionKey()),
            },
          });
          await this.pageDetails.invalidateFanpageCache(organizationId, page.id);
        }

        const status = await this.getConnectionStatus(userId, organizationId, user);
        return {
          success: true as const,
          connectedPages: (status.pages ?? []).map((p: { pageId: string; pageName: string }) => ({
            pageId: p.pageId,
            pageName: p.pageName,
          })),
          failedPages: [] as Array<{ pageId: string; reason: string }>,
          warning: null as string | null,
          ...status,
        };
      } catch (e) {
        // Connection cũ vẫn giữ — không trả 4xx/5xx như “kết nối thất bại”
        const technical = e instanceof Error ? e.message : 'refresh_failed';
        this.logger.warn(
          `refreshPages failed for org=${organizationId}: ${technical.slice(0, 200)}`,
        );
        const status = await this.getConnectionStatus(userId, organizationId, user);
        return {
          success: false as const,
          connectedPages: (status.pages ?? []).map((p: { pageId: string; pageName: string }) => ({
            pageId: p.pageId,
            pageName: p.pageName,
          })),
          failedPages: [] as Array<{ pageId: string; reason: string }>,
          warning: 'Không thể làm mới danh sách Fanpage',
          ...status,
        };
      }
    }

    // Không auto-sync SERVER_ENV khi chưa có connection — dùng POST facebook/connect/server-env
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

  private canUseOAuthCanary(user: AuthUser): boolean {
    const canaryOn =
      (this.config.get<string>('AUTO_POST_OAUTH_CANARY') ?? process.env.AUTO_POST_OAUTH_CANARY ?? '')
        .trim()
        .toLowerCase() === 'true';
    // Canary tắt → OAuth mở theo OAUTH_CONNECTION (sau khi smoke PASS mới tắt canary).
    if (!canaryOn) return true;

    if (user.role === 'SUPER_ADMIN') return true;

    const raw =
      this.config.get<string>('AUTO_POST_OAUTH_CANARY_ORG_IDS') ??
      process.env.AUTO_POST_OAUTH_CANARY_ORG_IDS ??
      '';
    const orgs = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return Boolean(user.organizationId && orgs.includes(user.organizationId));
  }

  private async requireConnection(userId: string, organizationId: string) {
    const conn = await this.prisma.autoPostFacebookConnection.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    if (!conn) throw new NotFoundException('Chưa kết nối Facebook');
    return conn;
  }

  /**
   * Coalesce /me/accounts: cùng org+user chỉ 1 Meta call (in-process + Redis lock).
   * Không cache token vào Redis.
   */
  private async getManagedPagesCoalesced(
    userId: string,
    organizationId: string,
    accessToken: string,
  ) {
    const key = `${organizationId}:${userId}`;
    const existing = this.managedPagesInflight.get(key);
    if (existing) return existing;

    const promise = (async () => {
      const { value } = await withRedisSingleFlight(
        this.redis,
        `meta:lock:me_accounts:${key}`,
        { ttlMs: 30_000, waitMs: 12_000 },
        () => {
          this.metrics.graphRequest('me_accounts');
          return this.meta.getManagedPages(accessToken);
        },
      );
      return value;
    })().finally(() => {
      this.managedPagesInflight.delete(key);
    });

    this.managedPagesInflight.set(key, promise);
    return promise;
  }

  /** OAuth user token: ưu tiên pending phiên mới; fallback connection OAuth đã lưu (không dùng SERVER_ENV). */
  private async resolveOAuthUserAccess(
    userId: string,
    organizationId: string,
  ): Promise<{
    encryptedAccessToken: string;
    tokenExpiresAt: Date | null;
    facebookUserId: string | null;
    facebookUserName: string | null;
    scopes: string[];
    source: 'pending' | 'connection';
  }> {
    const pending = await this.prisma.autoPostFacebookOAuthPendingConnection.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    if (pending) {
      if (pending.tokenExpiresAt && pending.tokenExpiresAt.getTime() < Date.now()) {
        await this.prisma.autoPostFacebookOAuthPendingConnection.deleteMany({
          where: { userId, organizationId },
        });
      } else {
        return {
          encryptedAccessToken: pending.encryptedAccessToken,
          tokenExpiresAt: pending.tokenExpiresAt,
          facebookUserId: pending.facebookUserId,
          facebookUserName: pending.facebookUserName,
          scopes: pending.scopes ?? [],
          source: 'pending',
        };
      }
    }

    const conn = await this.prisma.autoPostFacebookConnection.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    if (
      conn &&
      !conn.scopes?.includes('env_page_token') &&
      conn.status !== AutoPostFacebookConnectionStatus.DISCONNECTED
    ) {
      return {
        encryptedAccessToken: conn.encryptedAccessToken,
        tokenExpiresAt: conn.tokenExpiresAt,
        facebookUserId: conn.facebookUserId,
        facebookUserName: conn.facebookUserName,
        scopes: conn.scopes ?? [],
        source: 'connection',
      };
    }

    throw new NotFoundException('Chưa có OAuth pending — vui lòng kết nối lại');
  }

  /**
   * Page token từ /me/accounts: debug_token đôi khi không liệt kê scopes (System User / L4B).
   * Chấp nhận khi token valid + có page token + (scope user/page hoặc tasks CREATE_CONTENT/MANAGE).
   */
  private pageTokenAllowsManagePosts(input: {
    debugScopes: string[];
    userScopes: string[];
    pageTasks: string[];
    hasPageToken: boolean;
    isValid: boolean;
  }): boolean {
    if (!input.isValid || !input.hasPageToken) return false;
    if (input.debugScopes.includes('pages_manage_posts')) return true;
    if (input.userScopes.includes('pages_manage_posts')) return true;
    if (input.pageTasks.includes('CREATE_CONTENT') || input.pageTasks.includes('MANAGE')) {
      return true;
    }
    // Token page từ /me/accounts sau khi user đã cấp đủ quyền ở bước list
    return input.userScopes.some((s) =>
      ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'].includes(s),
    );
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
    return assertEncryptionKeyConfigured(this.config.get<string>('ENCRYPTION_KEY'));
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
