import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { AutoPostFacebookConnectionStatus, Prisma } from '@marketingspa/database';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { decryptSecret, encryptSecret } from '../common/utils/encryption.util';
import { assertEncryptionKeyConfigured } from '../common/utils/assert-encryption-key';
import { ConfigService } from '@nestjs/config';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { AutoPostMetaService } from './auto-post-meta.service';
import { FanpageDetailsRedisCache } from './auto-post-facebook-page-details.cache';
import {
  buildPermissionsFlags,
  classifyMetaGraphError,
  FANPAGE_DETAILS_PAGE_FIELDS,
  FANPAGE_DETAILS_SAFE_POST_FIELDS,
  formatHoChiMinhDateTime,
  hasPagesReadEngagement,
  mapMetaPageToDetails,
  mapMetaPosts,
  mergeConnectionScopes,
  PERMISSION_DECLINED_MESSAGE,
  snapshotHasTokenLeak,
  toLegacyErrorCode,
} from './auto-post-facebook-page-details.logic';
import {
  FANPAGE_DETAILS_POST_LIMIT,
  type FanpageDetailsResponse,
} from './auto-post-facebook-page-details.types';
import { metaGraphFetchJson, type MetaGraphHttpError } from './meta-graph-http';
import { MetaGraphUsageService } from './meta-graph-usage.service';
import { MetaGraphMetricsService } from './meta-graph-metrics.service';

@Injectable()
export class AutoPostFacebookPageDetailsService {
  private readonly logger = new Logger(AutoPostFacebookPageDetailsService.name);
  private readonly cache: FanpageDetailsRedisCache;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly meta: AutoPostMetaService,
    private readonly usage: MetaGraphUsageService,
    private readonly metrics: MetaGraphMetricsService,
    @Optional() @Inject(REDIS_CLIENT) redis?: Redis,
  ) {
    this.cache = new FanpageDetailsRedisCache(redis);
  }

  /** Dùng khi reconnect / disconnect / đổi quyền — drop cache org. */
  async invalidateOrgCache(organizationId: string): Promise<void> {
    await this.cache.invalidateOrganization(organizationId);
  }

  async invalidateFanpageCache(organizationId: string, fanpageId: string): Promise<void> {
    await this.cache.invalidate(organizationId, fanpageId, { dropStale: true });
  }

  private getEncryptionKey(): string {
    return assertEncryptionKeyConfigured(this.config.get<string>('ENCRYPTION_KEY'));
  }

  /**
   * Xem chi tiết = snapshot lần đồng bộ Graph gần nhất (không gọi Facebook).
   * Query refresh=true vẫn live-fetch (tương thích test cũ) và persist nếu thành công.
   */
  async getPageDetails(
    userId: string,
    organizationId: string,
    fanpageId: string,
    options?: { refresh?: boolean },
  ): Promise<FanpageDetailsResponse> {
    const refresh = Boolean(options?.refresh);
    if (refresh) {
      return this.syncPageDetails(userId, organizationId, fanpageId);
    }

    const snapshot = await this.loadPersistedSnapshot(organizationId, fanpageId);
    if (snapshot) {
      this.metrics.cacheHit();
      return snapshot;
    }
    return this.buildUnsyncedStub(userId, organizationId, fanpageId);
  }

  /**
   * Đồng bộ live từ Graph bằng Page Access Token.
   * Thành công → lưu lastSyncedAt + snapshot. Lỗi → giữ dữ liệu cũ, trả lỗi rõ.
   */
  async syncPageDetails(
    userId: string,
    organizationId: string,
    fanpageId: string,
  ): Promise<FanpageDetailsResponse> {
    try {
      return await this.fetchAndBuild(userId, organizationId, fanpageId);
    } catch (err) {
      await this.recordSyncFailure(organizationId, fanpageId, err);
      this.rethrowAsHttp(err);
    }
  }

  private async fetchAndBuild(
    userId: string,
    organizationId: string,
    fanpageId: string,
  ): Promise<FanpageDetailsResponse> {
    const resolved = await this.resolvePageTokenForRead(userId, organizationId, fanpageId);
    const permissions = buildPermissionsFlags(resolved.scopes);
    const warnings: string[] = [];

    // Chỉ chặn sớm khi user từ chối tường minh — còn lại thử Graph (metadata luôn hữu ích)
    if (!resolved.isEnvToken && resolved.permissionDeclined) {
      throw new ForbiddenException({
        code: 'permission_declined',
        legacyCode: 'MISSING_PAGES_READ_ENGAGEMENT',
        message: PERMISSION_DECLINED_MESSAGE,
      });
    }

    let pageMeta: ReturnType<typeof mapMetaPageToDetails>;
    let recentPosts: ReturnType<typeof mapMetaPosts> = [];
    let postsError: string | null = null;

    try {
      pageMeta = await this.fetchPageMetadata(resolved);
    } catch (err) {
      this.rethrowAsHttp(err);
    }

    try {
      recentPosts = await this.fetchRecentPosts(resolved);
    } catch (err) {
      const classified = this.classifyThrown(err);
      if (
        classified.code === 'expired_token' ||
        classified.code === 'TOKEN_EXPIRED' ||
        classified.code === 'invalid_page_token' ||
        classified.code === 'wrong_page_id' ||
        classified.code === 'PAGE_ACCESS_REVOKED'
      ) {
        // Token/page sai ảnh hưởng cả metadata đã lấy — báo lỗi cứng
        this.rethrowAsHttp(err);
      }
      postsError = classified.message;
      warnings.push(
        classified.code === 'permission_missing' || classified.code === 'permission_declined'
          ? `Đã tải thông tin Fanpage. Không đọc được bài viết từ Facebook: ${classified.message}`
          : classified.code === 'rate_limited' || classified.code === 'META_RATE_LIMIT'
            ? `Không tải được bài đăng gần đây do giới hạn Facebook: ${classified.message}`
            : `Không tải được danh sách bài đăng gần đây: ${classified.message}`,
      );
      const previous = await this.loadPersistedSnapshot(organizationId, fanpageId);
      recentPosts = previous?.recentPosts ?? [];
    }

    const apiVersion = this.meta.apiVersion;
    const pageFields = FANPAGE_DETAILS_PAGE_FIELDS.join(',');
    const postFields = FANPAGE_DETAILS_SAFE_POST_FIELDS.join(',');
    const syncedAt = new Date();
    const latestPostAt = this.latestPostDate(recentPosts);
    const response: FanpageDetailsResponse = {
      page: pageMeta!,
      recentPosts,
      permissions: {
        ...permissions,
        pages_read_engagement: permissions.pages_read_engagement || resolved.isEnvToken,
      },
      refreshedAt: syncedAt.toISOString(),
      warnings,
      cached: false,
      stale: false,
      dataSource: 'live',
      pageTokenRefreshed: resolved.pageTokenRefreshed,
      syncStatus: 'Đồng bộ thành công từ Facebook',
      graphEndpoints: {
        page: `GET https://graph.facebook.com/${apiVersion}/{page-id}?fields=${pageFields}`,
        posts: `GET https://graph.facebook.com/${apiVersion}/{page-id}/published_posts?fields=${postFields}&limit=${FANPAGE_DETAILS_POST_LIMIT}`,
      },
      postsError,
      lastSyncedAt: syncedAt.toISOString(),
      lastPostCreatedAt: latestPostAt?.toISOString() ?? null,
      lastSyncedAtDisplay: formatHoChiMinhDateTime(syncedAt),
      lastPostCreatedAtDisplay: formatHoChiMinhDateTime(latestPostAt),
    };

    await this.persistSuccessfulSync(organizationId, fanpageId, response, syncedAt, latestPostAt);
    await this.cache.set(organizationId, fanpageId, response);
    return response;
  }

  private latestPostDate(posts: Array<{ createdTime: string | null }>): Date | null {
    for (const post of posts) {
      if (!post.createdTime) continue;
      const d = new Date(post.createdTime);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return null;
  }

  private async loadPersistedSnapshot(
    organizationId: string,
    fanpageId: string,
  ): Promise<FanpageDetailsResponse | null> {
    const row = await this.prisma.autoPostFacebookPage.findFirst({
      where: { id: fanpageId, connection: { organizationId } },
      select: {
        lastSyncSnapshot: true,
        lastSyncedAt: true,
        lastPostCreatedAt: true,
      },
    });
    if (!row?.lastSyncSnapshot || !row.lastSyncedAt) return null;
    const raw = row.lastSyncSnapshot;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const snap = raw as unknown as FanpageDetailsResponse;
    if (!snap.page || !Array.isArray(snap.recentPosts)) return null;
    if (snapshotHasTokenLeak(snap)) {
      this.logger.warn(`Dropped leaked snapshot org=${organizationId} fanpage=${fanpageId}`);
      return null;
    }
    return {
      ...snap,
      cached: true,
      stale: false,
      dataSource: 'sync',
      syncStatus: 'Đồng bộ thành công từ Facebook',
      lastSyncedAt: row.lastSyncedAt.toISOString(),
      lastPostCreatedAt: row.lastPostCreatedAt?.toISOString() ?? snap.lastPostCreatedAt ?? null,
      lastSyncedAtDisplay: formatHoChiMinhDateTime(row.lastSyncedAt),
      lastPostCreatedAtDisplay: formatHoChiMinhDateTime(
        row.lastPostCreatedAt ?? snap.lastPostCreatedAt,
      ),
    };
  }

  private async buildUnsyncedStub(
    _userId: string,
    organizationId: string,
    fanpageId: string,
  ): Promise<FanpageDetailsResponse> {
    const page = await this.prisma.autoPostFacebookPage.findFirst({
      where: { id: fanpageId, connection: { organizationId } },
      include: {
        connection: { select: { scopes: true, organizationId: true } },
      },
    });
    if (!page || page.connection.organizationId !== organizationId) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Fanpage không tồn tại hoặc không thuộc tổ chức của bạn.',
      });
    }
    const permissions = buildPermissionsFlags(page.connection.scopes ?? []);
    return {
      page: {
        id: page.id,
        pageId: page.pageId,
        name: page.pageName,
        pictureUrl: page.pagePictureUrl,
        coverUrl: null,
        category: null,
        about: null,
        description: null,
        website: null,
        link: null,
        username: null,
        phone: null,
        emails: null,
        location: null,
        followersCount: null,
        fanCount: null,
      },
      recentPosts: [],
      permissions,
      refreshedAt: '',
      warnings: [
        'Chưa đồng bộ từ Facebook. Bấm Đồng bộ thông tin Fanpage để lấy dữ liệu và bài viết mới nhất.',
      ],
      cached: false,
      stale: false,
      dataSource: 'none',
      syncStatus: null,
      postsError: null,
      lastSyncedAt: null,
      lastPostCreatedAt: null,
      lastSyncedAtDisplay: null,
      lastPostCreatedAtDisplay: null,
    };
  }

  private async persistSuccessfulSync(
    organizationId: string,
    fanpageId: string,
    response: FanpageDetailsResponse,
    syncedAt: Date,
    latestPostAt: Date | null,
  ): Promise<void> {
    if (snapshotHasTokenLeak(response)) {
      this.logger.error(`Refuse persist snapshot: token leak org=${organizationId}`);
      throw new HttpException(
        { code: 'META_API_ERROR', message: 'Không lưu được dữ liệu đồng bộ.' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    const stored: FanpageDetailsResponse = {
      ...response,
      cached: true,
      stale: false,
      dataSource: 'sync',
    };
    await this.prisma.autoPostFacebookPage.updateMany({
      where: { id: fanpageId, connection: { organizationId } },
      data: {
        lastSyncedAt: syncedAt,
        lastPostCreatedAt: latestPostAt,
        lastSyncSnapshot: stored as unknown as Prisma.InputJsonValue,
        lastSyncError: null,
        pageName: response.page.name || undefined,
        pagePictureUrl: response.page.pictureUrl,
      },
    });
  }

  private async recordSyncFailure(
    organizationId: string,
    fanpageId: string,
    err: unknown,
  ): Promise<void> {
    const classified = this.classifyThrown(err);
    await this.prisma.autoPostFacebookPage
      .updateMany({
        where: { id: fanpageId, connection: { organizationId } },
        data: { lastSyncError: classified.message.slice(0, 500) },
      })
      .catch(() => undefined);
  }

  private async resolvePageTokenForRead(
    userId: string,
    organizationId: string,
    fanpageId: string,
  ): Promise<{
    rowId: string;
    pageId: string;
    pageName: string;
    pagePictureUrl: string | null;
    accessToken: string;
    scopes: string[];
    isEnvToken: boolean;
    permissionDeclined: boolean;
    pageTokenRefreshed: boolean;
  }> {
    const page = await this.prisma.autoPostFacebookPage.findFirst({
      where: {
        id: fanpageId,
        connection: { organizationId },
      },
      include: {
        connection: {
          select: {
            id: true,
            userId: true,
            status: true,
            scopes: true,
            tokenExpiresAt: true,
            organizationId: true,
            encryptedAccessToken: true,
            updatedAt: true,
          },
        },
      },
    });

    // Ownership: page thuộc org; user phải là chủ connection hoặc cùng org (tenant guard đã gắn org)
    if (!page || page.connection.organizationId !== organizationId) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Fanpage không tồn tại hoặc không thuộc tổ chức của bạn.',
      });
    }
    if (page.userId !== userId && page.connection.userId !== userId) {
      // Vẫn cho phép nếu cùng org và connection của org — prefer org scope
      // Chặn khi page.userId khác và connection không thuộc org (đã check org ở trên)
    }

    const conn = page.connection;
    if (
      conn.status === AutoPostFacebookConnectionStatus.DISCONNECTED ||
      conn.status === AutoPostFacebookConnectionStatus.ERROR
    ) {
      throw new UnauthorizedException({
        code: 'expired_token',
        legacyCode: 'TOKEN_EXPIRED',
        message: 'Kết nối Facebook chưa sẵn sàng. Vui lòng kết nối lại Facebook.',
      });
    }

    if (
      conn.status === AutoPostFacebookConnectionStatus.TOKEN_EXPIRED ||
      (conn.tokenExpiresAt && conn.tokenExpiresAt.getTime() < Date.now())
    ) {
      await this.prisma.autoPostFacebookConnection.updateMany({
        where: { organizationId },
        data: {
          status: AutoPostFacebookConnectionStatus.TOKEN_EXPIRED,
          lastError: 'NEEDS_RECONNECT: Token Facebook đã hết hạn',
        },
      });
      throw new UnauthorizedException({
        code: 'expired_token',
        legacyCode: 'TOKEN_EXPIRED',
        message: 'Token Facebook đã hết hạn. Vui lòng kết nối lại Facebook.',
      });
    }

    let scopes = Array.isArray(conn.scopes) ? [...conn.scopes] : [];
    const isEnvToken = scopes.includes('env_page_token');
    let permissionDeclined = false;
    let pageTokenRefreshed = false;

    // Live /me/permissions + làm mới Page token từ /me/accounts (OAuth)
    if (!isEnvToken && conn.encryptedAccessToken) {
      let userToken: string | null = null;
      try {
        userToken = decryptSecret(conn.encryptedAccessToken, this.getEncryptionKey());
      } catch {
        throw new UnauthorizedException({
          code: 'invalid_page_token',
          legacyCode: 'TOKEN_EXPIRED',
          message: 'Không đọc được User Access Token. Vui lòng kết nối lại Facebook.',
        });
      }

      if (userToken?.trim()) {
        try {
          const diag = await this.meta.diagnoseUserPermissions(userToken);
          scopes = mergeConnectionScopes(scopes, diag.granted, diag.declined);
          permissionDeclined = diag.declined.includes('pages_read_engagement');
          // Cập nhật scopes đã kiểm tra — union, không thu hẹp (trừ declined)
          if (diag.granted.length || diag.declined.length) {
            await this.prisma.autoPostFacebookConnection.update({
              where: { id: conn.id },
              data: { scopes },
            });
          }
        } catch (err) {
          const classified = this.classifyThrown(err);
          if (
            classified.code === 'expired_token' ||
            classified.code === 'TOKEN_EXPIRED' ||
            classified.code === 'invalid_page_token'
          ) {
            this.rethrowAsHttp(err);
          }
          this.logger.warn(
            `Live /me/permissions failed org=${organizationId}: ${classified.message}`,
          );
        }

        // Làm mới Page Access Token đúng fanpageId — không giữ token cũ nếu Meta trả mới
        if (hasPagesReadEngagement(scopes) || scopes.includes('pages_show_list')) {
          try {
            const managed = await this.meta.getManagedPages(userToken);
            const match = managed.find((p) => p.id === page.pageId);
            if (!match) {
              throw new ForbiddenException({
                code: 'wrong_page_id',
                legacyCode: 'PAGE_ACCESS_REVOKED',
                message:
                  'Fanpage không còn trong /me/accounts của kết nối hiện tại. Chọn lại Fanpage hoặc kết nối lại Facebook.',
              });
            }
            if (!match.access_token?.trim()) {
              throw new UnauthorizedException({
                code: 'invalid_page_token',
                legacyCode: 'TOKEN_EXPIRED',
                message: 'Meta không trả Page Access Token cho Fanpage này.',
              });
            }
            const encrypted = encryptSecret(match.access_token, this.getEncryptionKey());
            await this.prisma.autoPostFacebookPage.update({
              where: { id: page.id },
              data: {
                encryptedPageAccessToken: encrypted,
                pageName: match.name || page.pageName,
                pagePictureUrl: match.picture?.data?.url ?? page.pagePictureUrl,
              },
            });
            pageTokenRefreshed = true;
            // Dùng token mới ngay — không đọc lại bản cũ
            return {
              rowId: page.id,
              pageId: page.pageId,
              pageName: match.name || page.pageName,
              pagePictureUrl: match.picture?.data?.url ?? page.pagePictureUrl,
              accessToken: match.access_token,
              scopes,
              isEnvToken,
              permissionDeclined,
              pageTokenRefreshed,
            };
          } catch (err) {
            if (err instanceof HttpException) throw err;
            const classified = this.classifyThrown(err);
            this.logger.warn(
              `Refresh page token failed org=${organizationId} pageId=${page.pageId}: ${classified.message}`,
            );
            // Fallback stored token nếu refresh fail không phải wrong_page / auth
            if (
              classified.code === 'wrong_page_id' ||
              classified.code === 'expired_token' ||
              classified.code === 'TOKEN_EXPIRED' ||
              classified.code === 'invalid_page_token' ||
              classified.code === 'rate_limited'
            ) {
              this.rethrowAsHttp(err);
            }
          }
        }
      }
    }

    let accessToken: string;
    try {
      accessToken = decryptSecret(page.encryptedPageAccessToken, this.getEncryptionKey());
    } catch {
      throw new UnauthorizedException({
        code: 'invalid_page_token',
        legacyCode: 'TOKEN_EXPIRED',
        message: 'Không đọc được token Fanpage. Vui lòng kết nối lại Facebook.',
      });
    }

    if (!accessToken?.trim()) {
      throw new UnauthorizedException({
        code: 'invalid_page_token',
        legacyCode: 'TOKEN_EXPIRED',
        message: 'Token Fanpage trống. Vui lòng kết nối lại Facebook.',
      });
    }

    return {
      rowId: page.id,
      pageId: page.pageId,
      pageName: page.pageName,
      pagePictureUrl: page.pagePictureUrl,
      accessToken,
      scopes,
      isEnvToken,
      permissionDeclined,
      pageTokenRefreshed,
    };
  }

  private async fetchPageMetadata(resolved: {
    rowId: string;
    pageId: string;
    pageName: string;
    pagePictureUrl: string | null;
    accessToken: string;
  }) {
    const fields = FANPAGE_DETAILS_PAGE_FIELDS.join(',');

    const url =
      `https://graph.facebook.com/${this.meta.apiVersion}/${encodeURIComponent(resolved.pageId)}` +
      `?fields=${encodeURIComponent(fields)}`;

    const raw = await this.graphGet<Record<string, unknown>>(
      url,
      resolved.accessToken,
      'page_metadata',
    );
    return mapMetaPageToDetails(raw as Parameters<typeof mapMetaPageToDetails>[0], {
      id: resolved.rowId,
      pageId: resolved.pageId,
      pageName: resolved.pageName,
      pagePictureUrl: resolved.pagePictureUrl,
    });
  }

  private async fetchRecentPosts(resolved: { pageId: string; accessToken: string }) {
    const fields = FANPAGE_DETAILS_SAFE_POST_FIELDS.join(',');

    const url =
      `https://graph.facebook.com/${this.meta.apiVersion}/${encodeURIComponent(resolved.pageId)}/published_posts` +
      `?fields=${encodeURIComponent(fields)}&limit=${FANPAGE_DETAILS_POST_LIMIT}`;

    try {
      const body = await this.graphGet<{ data?: unknown[] }>(
        url,
        resolved.accessToken,
        'published_posts',
      );
      return mapMetaPosts(
        body.data as Parameters<typeof mapMetaPosts>[0],
        FANPAGE_DETAILS_POST_LIMIT,
      );
    } catch (err) {
      const classified = this.classifyThrown(err);
      if (classified.code === 'META_API_ERROR' || classified.code === 'PAGE_ACCESS_REVOKED') {
        const fallback =
          `https://graph.facebook.com/${this.meta.apiVersion}/${encodeURIComponent(resolved.pageId)}/posts` +
          `?fields=${encodeURIComponent(fields)}&limit=${FANPAGE_DETAILS_POST_LIMIT}`;
        const body = await this.graphGet<{ data?: unknown[] }>(
          fallback,
          resolved.accessToken,
          'posts',
        );
        return mapMetaPosts(
          body.data as Parameters<typeof mapMetaPosts>[0],
          FANPAGE_DETAILS_POST_LIMIT,
        );
      }
      throw err;
    }
  }

  private async graphGet<T>(url: string, accessToken: string, endpoint: string): Promise<T> {
    try {
      this.metrics.graphRequest(endpoint);
      const result = await metaGraphFetchJson<T>(url, {
        accessToken,
        maxRetries: 2,
        onUsage: (u) => {
          void this.usage.record(u);
          if (u.nearLimit) this.metrics.rateLimit();
        },
        onRetry: () => this.metrics.retry(),
        logger: this.logger,
      });
      return result.data;
    } catch (err) {
      const httpErr = err as MetaGraphHttpError;
      if (httpErr?.rateLimited) this.metrics.rateLimit();
      throw err;
    }
  }

  private classifyThrown(err: unknown) {
    const httpErr = err as MetaGraphHttpError;
    if (httpErr?.network) {
      return classifyMetaGraphError({ message: httpErr.message || 'network' });
    }
    if (httpErr?.metaError) return classifyMetaGraphError(httpErr.metaError);
    if (err instanceof Error) return classifyMetaGraphError({ message: err.message });
    return classifyMetaGraphError({ message: 'unknown' });
  }

  private rethrowAsHttp(err: unknown): never {
    if (err instanceof HttpException) throw err;
    const classified = this.classifyThrown(err);
    const legacy = toLegacyErrorCode(classified.code);
    throw new HttpException(
      {
        code: classified.code,
        legacyCode: legacy !== classified.code ? legacy : undefined,
        message: classified.message,
      },
      classified.httpStatus === 429
        ? HttpStatus.TOO_MANY_REQUESTS
        : classified.httpStatus === 401
          ? HttpStatus.UNAUTHORIZED
          : classified.httpStatus === 403
            ? HttpStatus.FORBIDDEN
            : classified.httpStatus === 503
              ? HttpStatus.SERVICE_UNAVAILABLE
              : HttpStatus.BAD_GATEWAY,
    );
  }
}
