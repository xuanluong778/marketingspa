import {
  BadRequestException,
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
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { encryptSecret, decryptSecret } from '../common/utils/encryption.util';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AutoPostMetaService } from './auto-post-meta.service';
import { MetaFanpageService } from '../meta-fanpage/meta-fanpage.service';

const STATE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class AutoPostFacebookService {
  private readonly logger = new Logger(AutoPostFacebookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly meta: AutoPostMetaService,
    private readonly metaFanpage: MetaFanpageService,
  ) {}

  /**
   * App Business báo Invalid Scopes với OAuth cổ điển.
   * Nếu đã có META_PAGE_ID + Page Token trên server → đồng bộ Fanpage, không mở dialog OAuth.
   */
  async getOAuthStartUrl(user: AuthUser): Promise<{ url: string; mode: 'env' | 'oauth' }> {
    const envCreds = this.metaFanpage.getEnvCredentials();
    if (envCreds) {
      await this.syncEnvPageConnection(user);
      const appUrl = this.config.get<string>('APP_URL') ?? 'http://localhost:3000';
      return {
        mode: 'env',
        url: `${appUrl}/content?tab=channels&facebook=connected&mode=env`,
      };
    }

    if (!this.meta.loginConfigId) {
      throw new BadRequestException(
        'Facebook Login for Business cần META_LOGIN_CONFIG_ID, hoặc cấu hình META_PAGE_ID + Page Token trên server để kết nối không qua OAuth.',
      );
    }

    this.ensureMetaConfig();
    const state = this.signState(user.id, user.organizationId);
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
      where: { userId: user.id },
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
    return this.getConnectionStatus(user.id);
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
    try {
      ({ userId, organizationId } = this.verifyState(state));
    } catch {
      return { redirectUrl: `${base}error&message=invalid_state` };
    }

    try {
      const short = await this.meta.exchangeCodeForToken(code);
      const longLived = await this.meta.exchangeForLongLivedToken(short.access_token);
      const accessToken = longLived.access_token;
      const me = await this.meta.getMe(accessToken);
      const expiresAt = longLived.expires_in
        ? new Date(Date.now() + longLived.expires_in * 1000)
        : null;
      const encryptedAccessToken = encryptSecret(accessToken, this.getEncryptionKey());

      const connection = await this.prisma.autoPostFacebookConnection.upsert({
        where: { userId },
        create: {
          userId,
          organizationId,
          encryptedAccessToken,
          tokenExpiresAt: expiresAt,
          facebookUserId: me.id,
          facebookUserName: me.name ?? null,
          status: AutoPostFacebookConnectionStatus.CONNECTED,
          scopes: this.meta.getOAuthScopes(),
          lastError: null,
        },
        update: {
          encryptedAccessToken,
          tokenExpiresAt: expiresAt,
          facebookUserId: me.id,
          facebookUserName: me.name ?? null,
          status: AutoPostFacebookConnectionStatus.CONNECTED,
          scopes: this.meta.getOAuthScopes(),
          lastError: null,
        },
      });

      const pages = await this.meta.getManagedPages(accessToken);
      await this.prisma.autoPostFacebookPage.deleteMany({
        where: { userId, connectionId: connection.id },
      });

      if (pages.length > 0) {
        await this.prisma.autoPostFacebookPage.createMany({
          data: pages.map((p) => ({
            userId,
            connectionId: connection.id,
            pageId: p.id,
            pageName: p.name,
            pagePictureUrl: p.picture?.data?.url ?? null,
            encryptedPageAccessToken: encryptSecret(p.access_token, this.getEncryptionKey()),
          })),
        });
      }

      return { redirectUrl: `${base}connected` };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'oauth_failed';
      this.logger.warn(`Auto Post OAuth failed for user ${userId}: ${msg}`);
      await this.prisma.autoPostFacebookConnection
        .update({
          where: { userId },
          data: {
            status: AutoPostFacebookConnectionStatus.ERROR,
            lastError: msg,
          },
        })
        .catch(() => undefined);
      return { redirectUrl: `${base}error&message=${encodeURIComponent(msg)}` };
    }
  }

  async getConnectionStatus(userId: string) {
    // Tự đồng bộ nếu đã có Page Token trên server mà user chưa có page trong DB
    const envCreds = this.metaFanpage.getEnvCredentials();
    if (envCreds) {
      const existing = await this.prisma.autoPostFacebookPage.findFirst({
        where: { userId, pageId: envCreds.pageId },
      });
      if (!existing) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (user) {
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
      where: { userId },
      include: { pages: { orderBy: { pageName: 'asc' } } },
    });

    if (!conn) {
      return {
        connected: false,
        status: 'DISCONNECTED' as const,
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

    return {
      connected: conn.status === AutoPostFacebookConnectionStatus.CONNECTED,
      status: conn.status,
      facebookUserName: conn.facebookUserName,
      tokenExpiresAt: conn.tokenExpiresAt?.toISOString() ?? null,
      lastError: conn.lastError,
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

  async disconnect(userId: string) {
    await this.prisma.autoPostFacebookPage.deleteMany({ where: { userId } });
    await this.prisma.autoPostFacebookConnection.deleteMany({ where: { userId } });
    return { ok: true };
  }

  async refreshPages(userId: string, user?: AuthUser) {
    const conn = await this.prisma.autoPostFacebookConnection.findUnique({
      where: { userId },
    });
    const isEnv = conn?.scopes?.includes('env_page_token') || this.metaFanpage.getEnvCredentials();

    if (isEnv) {
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

    const required = await this.requireConnection(userId);
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

    return this.getConnectionStatus(userId);
  }

  async getPageAccessToken(userId: string, fanpageId: string): Promise<{
    pageId: string;
    pageName: string;
    accessToken: string;
  }> {
    const page = await this.prisma.autoPostFacebookPage.findFirst({
      where: { id: fanpageId, userId },
    });
    if (!page) throw new NotFoundException('Fanpage không tồn tại');

    const conn = await this.requireConnection(userId);
    if (conn.status !== AutoPostFacebookConnectionStatus.CONNECTED) {
      throw new UnauthorizedException('Kết nối Facebook chưa sẵn sàng');
    }

    if (conn.tokenExpiresAt && conn.tokenExpiresAt.getTime() < Date.now()) {
      await this.prisma.autoPostFacebookConnection.update({
        where: { userId },
        data: { status: AutoPostFacebookConnectionStatus.TOKEN_EXPIRED },
      });
      throw new UnauthorizedException('Token Facebook đã hết hạn — vui lòng kết nối lại');
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

  private async requireConnection(userId: string) {
    const conn = await this.prisma.autoPostFacebookConnection.findUnique({ where: { userId } });
    if (!conn) throw new NotFoundException('Chưa kết nối Facebook');
    return conn;
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

  private signState(userId: string, organizationId: string): string {
    const ts = Date.now();
    const payload = `${userId}:${organizationId}:${ts}`;
    const sig = createHmac('sha256', this.getEncryptionKey()).update(payload).digest('hex');
    return Buffer.from(`${payload}:${sig}`).toString('base64url');
  }

  private verifyState(state: string): { userId: string; organizationId: string } {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 4) throw new UnauthorizedException('State không hợp lệ');
    const [userId, organizationId, tsStr, sig] = parts;
    const ts = Number(tsStr);
    if (!userId || !organizationId || !Number.isFinite(ts) || !sig) {
      throw new UnauthorizedException('State không hợp lệ');
    }
    if (Date.now() - ts > STATE_TTL_MS) {
      throw new UnauthorizedException('State đã hết hạn');
    }
    const payload = `${userId}:${organizationId}:${tsStr}`;
    const expected = createHmac('sha256', this.getEncryptionKey()).update(payload).digest('hex');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('State không hợp lệ');
    }
    return { userId, organizationId };
  }
}
