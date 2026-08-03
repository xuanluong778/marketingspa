import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AdConnectionProvider,
  AdConnectionStatus,
  FacebookAdsConnectionStatus,
} from '@marketingspa/database';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { AdConnectionFacade } from '../ad-connection.facade';
import { AdsSyncQueueService } from '../ads-sync-queue.service';
import { MetaGraphApiService } from './meta-graph-api.service';
import type {
  FacebookCampaignsQueryDto,
  SelectAdAccountDto,
  SyncFacebookAdsDto,
} from './dto/facebook-ads.dto';

const STATE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class FacebookAdsService {
  private readonly logger = new Logger(FacebookAdsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly meta: MetaGraphApiService,
    private readonly connections: AdConnectionFacade,
    private readonly adsSyncQueue: AdsSyncQueueService,
  ) {}

  async getOAuthStartUrl(user: AuthUser, returnTo?: string): Promise<{ url: string }> {
    this.ensureMetaConfig();
    const state = this.signState(user.id, user.organizationId, returnTo);
    return { url: this.meta.buildOAuthUrl(state) };
  }

  async handleOAuthCallback(
    code: string | undefined,
    state: string | undefined,
    error?: string,
  ): Promise<{ redirectUrl: string }> {
    const appUrl = this.config.get<string>('APP_URL') ?? 'http://localhost:3000';

    let returnTo: string | undefined;
    if (state) {
      try {
        ({ returnTo } = this.verifyState(state));
      } catch {
        /* handled below */
      }
    }

    const base =
      returnTo === 'ads'
        ? `${appUrl}/ads`
        : `${appUrl}/business-goals?tab=ad-performance`;

    if (error) {
      return {
        redirectUrl: `${base}${returnTo === 'ads' ? '?' : '&'}facebook=error&message=${encodeURIComponent(error)}`,
      };
    }
    if (!code || !state) {
      return {
        redirectUrl: `${base}${returnTo === 'ads' ? '?' : '&'}facebook=error&message=missing_code`,
      };
    }

    let userId: string;
    let organizationId: string;
    try {
      ({ userId, organizationId, returnTo } = this.verifyState(state));
    } catch {
      return {
        redirectUrl: `${base}${returnTo === 'ads' ? '?' : '&'}facebook=error&message=invalid_state`,
      };
    }

    const successBase =
      returnTo === 'ads'
        ? `${appUrl}/ads?facebook=connected`
        : `${appUrl}/business-goals?tab=ad-performance&facebook=connected`;

    try {
      const short = await this.meta.exchangeCodeForToken(code);
      const longLived = await this.meta.exchangeForLongLivedToken(short.access_token);
      const accessToken = longLived.access_token;
      const me = await this.meta.getMe(accessToken);
      const expiresAt = longLived.expires_in
        ? new Date(Date.now() + longLived.expires_in * 1000)
        : null;
      const scopes = this.meta.getOAuthScopes();

      await this.connections.upsertEncryptedCredentials({
        organizationId,
        userId,
        provider: AdConnectionProvider.META,
        plaintextPayload: accessToken,
        status: AdConnectionStatus.CONNECTED,
        scopes,
        tokenExpiresAt: expiresAt,
      });

      await this.prisma.facebookAdsConnection.upsert({
        where: { organizationId },
        create: {
          organizationId,
          connectedByUserId: userId,
          facebookUserId: me.id,
          status: FacebookAdsConnectionStatus.CONNECTED,
          scopes,
        },
        update: {
          connectedByUserId: userId,
          facebookUserId: me.id,
          status: FacebookAdsConnectionStatus.CONNECTED,
          scopes,
          lastSyncError: null,
        },
      });

      return { redirectUrl: successBase };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'oauth_failed';
      this.logger.warn(`Facebook OAuth callback failed for user ${userId}: ${message}`);
      const errSep = returnTo === 'ads' ? '?' : '&';
      return {
        redirectUrl: `${base}${errSep}facebook=error&message=${encodeURIComponent(message)}`,
      };
    }
  }

  async getStatus(user: AuthUser) {
    const organizationId = user.organizationId;
    const row = await this.prisma.facebookAdsConnection.findUnique({
      where: { organizationId },
    });
    const adConn = await this.connections.getPublic(organizationId, AdConnectionProvider.META);

    if (!adConn.hasCredentials) {
      return {
        status: 'DISCONNECTED' as const,
        connected: false,
        selectedAdAccountId: null,
        selectedAdAccountName: null,
        lastSyncAt: null,
        lastSyncStatus: null,
        lastSyncError: null,
        tokenExpiresAt: null,
      };
    }

    let status = this.toPublicStatus(row?.status ?? FacebookAdsConnectionStatus.CONNECTED);
    if (adConn.tokenExpiresAt && adConn.tokenExpiresAt.getTime() < Date.now()) {
      status = 'TOKEN_EXPIRED';
      if (row) {
        await this.prisma.facebookAdsConnection.update({
          where: { organizationId },
          data: { status: FacebookAdsConnectionStatus.TOKEN_EXPIRED },
        });
      }
    }

    return {
      status,
      connected: status === 'CONNECTED' || status === 'SYNCING',
      selectedAdAccountId: row?.selectedAdAccountId ?? null,
      selectedAdAccountName: row?.selectedAdAccountName ?? null,
      lastSyncAt: row?.lastSyncAt ?? null,
      lastSyncStatus: row?.lastSyncStatus ?? null,
      lastSyncError: row?.lastSyncError ?? null,
      tokenExpiresAt: adConn.tokenExpiresAt,
      facebookUserId: row?.facebookUserId ?? null,
    };
  }

  async listAdAccounts(user: AuthUser) {
    const organizationId = user.organizationId;
    const accessToken = await this.getValidAccessToken(organizationId);
    try {
      const accounts = await this.meta.getAdAccounts(accessToken);
      const active = accounts.filter(
        (a) => a.account_status === undefined || a.account_status === 1,
      );
      if (active.length === 0 && accounts.length === 0) {
        await this.prisma.facebookAdsConnection.update({
          where: { organizationId },
          data: { status: FacebookAdsConnectionStatus.NO_AD_ACCOUNT_ACCESS },
        });
        throw new BadRequestException('Không có quyền truy cập tài khoản quảng cáo nào');
      }
      return {
        items: accounts.map((a) => ({
          id: a.id,
          accountId: a.account_id,
          name: a.name,
          currency: a.currency ?? 'USD',
          accountStatus: a.account_status,
        })),
      };
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      await this.handleTokenError(organizationId, e);
      throw e;
    }
  }

  async selectAdAccount(user: AuthUser, dto: SelectAdAccountDto) {
    const organizationId = user.organizationId;
    await this.ensureConnection(organizationId);
    await this.prisma.facebookAdsConnection.update({
      where: { organizationId },
      data: {
        selectedAdAccountId: dto.adAccountId,
        selectedAdAccountName: dto.adAccountName ?? dto.adAccountId,
        status: FacebookAdsConnectionStatus.CONNECTED,
      },
    });
    await this.prisma.adConnection.updateMany({
      where: { organizationId, provider: AdConnectionProvider.META },
      data: {
        externalAccountId: dto.adAccountId,
        externalAccountName: dto.adAccountName ?? dto.adAccountId,
      },
    });
    return { message: 'Đã chọn tài khoản quảng cáo', adAccountId: dto.adAccountId };
  }

  /**
   * API chỉ enqueue BullMQ — không đọc token vào queue (AdsSyncQueueService).
   */
  async sync(user: AuthUser, dto: SyncFacebookAdsDto) {
    return this.adsSyncQueue.enqueueMetaSync(user, {
      dateFrom: dto.dateFrom,
      dateTo: dto.dateTo,
      campaignId: dto.campaignId,
    });
  }

  async getCampaigns(user: AuthUser, query: FacebookCampaignsQueryDto) {
    const organizationId = user.organizationId;
    const conn = await this.prisma.facebookAdsConnection.findUnique({
      where: { organizationId },
    });
    const adAccountId = query.adAccountId ?? conn?.selectedAdAccountId;
    if (!adAccountId) {
      return { items: [], adAccountId: null };
    }

    const dateFrom = this.parseDate(query.dateFrom);
    const dateTo = this.parseDate(query.dateTo);

    const rows = await this.prisma.facebookAdsCampaignSnapshot.findMany({
      where: {
        organizationId,
        adAccountId,
        dateFrom,
        dateTo,
        ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      },
      orderBy: { spend: 'desc' },
    });

    return {
      adAccountId,
      items: rows.map((r) => ({
        campaignId: r.campaignId,
        campaignName: r.campaignName,
        campaignType: r.campaignType,
        objective: r.objective,
        spend: Number(r.spend),
        impressions: r.impressions,
        reach: r.reach,
        frequency: Number(r.frequency),
        cpm: Number(r.cpm),
        cpc: Number(r.cpc),
        ctr: Number(r.ctr),
        clicks: r.clicks,
        results: Number(r.results),
        costPerResult: Number(r.costPerResult),
        purchaseRoas: r.purchaseRoas ? Number(r.purchaseRoas) : null,
        resultRate: Number(r.resultRate),
        syncedAt: r.syncedAt,
      })),
    };
  }

  async listSyncLogs(user: AuthUser, limit = 10) {
    const items = await this.prisma.facebookAdsSyncLog.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { syncStartedAt: 'desc' },
      take: limit,
    });
    return {
      items: items.map((l) => ({
        id: l.id,
        adAccountId: l.adAccountId,
        dateFrom: l.dateFrom,
        dateTo: l.dateTo,
        syncStartedAt: l.syncStartedAt,
        syncFinishedAt: l.syncFinishedAt,
        status: l.status,
        errorMessage: l.errorMessage,
        campaignsSynced: l.campaignsSynced,
      })),
    };
  }

  async disconnect(user: AuthUser) {
    const organizationId = user.organizationId;
    await this.prisma.facebookAdsCampaignSnapshot.deleteMany({ where: { organizationId } });
    await this.prisma.facebookAdsSyncLog.deleteMany({ where: { organizationId } });
    await this.prisma.facebookAdsConnection.deleteMany({ where: { organizationId } });
    try {
      await this.connections.clearCredentials(organizationId, AdConnectionProvider.META, user.id);
    } catch (e) {
      // Không có AdConnection — vẫn coi disconnect FacebookAds* thành công
      if (!(e instanceof NotFoundException)) throw e;
    }
    return { message: 'Đã ngắt kết nối Facebook Ads' };
  }

  async setCampaignActive(
    organizationId: string,
    campaignId: string,
    active: boolean,
  ): Promise<void> {
    const accessToken = await this.getValidAccessToken(organizationId);
    await this.meta.updateCampaignStatus(accessToken, campaignId, active);
  }

  private async ensureConnection(organizationId: string) {
    const row = await this.prisma.facebookAdsConnection.findUnique({
      where: { organizationId },
    });
    const adConn = await this.connections.getPublic(organizationId, AdConnectionProvider.META);
    if (!row || !adConn.hasCredentials) {
      throw new BadRequestException('Chưa kết nối Facebook Ads');
    }
    return row;
  }

  private async getValidAccessToken(organizationId: string): Promise<string> {
    await this.ensureConnection(organizationId);
    try {
      return await this.connections.getMetaAccessToken(organizationId);
    } catch (e) {
      await this.handleTokenError(organizationId, e);
      throw e;
    }
  }

  private async handleTokenError(organizationId: string, error: unknown) {
    const msg = error instanceof Error ? error.message.toLowerCase() : '';
    if (
      msg.includes('expired') ||
      msg.includes('invalid oauth') ||
      msg.includes('session has expired') ||
      msg.includes('error validating access token') ||
      msg.includes('token đã hết hạn')
    ) {
      await this.prisma.facebookAdsConnection.updateMany({
        where: { organizationId },
        data: { status: FacebookAdsConnectionStatus.TOKEN_EXPIRED },
      });
    }
  }

  private ensureMetaConfig() {
    this.meta.appId;
    this.meta.appSecret;
  }

  private parseDate(iso: string): Date {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) throw new BadRequestException('Ngày không hợp lệ');
    return d;
  }

  private toPublicStatus(status: FacebookAdsConnectionStatus): string {
    return status;
  }

  private signState(userId: string, organizationId: string, returnTo?: string): string {
    const payload = `${userId}:${organizationId}:${returnTo ?? ''}:${Date.now() + STATE_TTL_MS}`;
    const sig = createHmac('sha256', this.getStateSecret()).update(payload).digest('hex');
    return Buffer.from(`${payload}:${sig}`).toString('base64url');
  }

  private verifyState(state: string): {
    userId: string;
    organizationId: string;
    returnTo?: string;
  } {
    try {
      const decoded = Buffer.from(state, 'base64url').toString('utf8');
      const lastColon = decoded.lastIndexOf(':');
      const sig = decoded.slice(lastColon + 1);
      const payload = decoded.slice(0, lastColon);
      const expected = createHmac('sha256', this.getStateSecret()).update(payload).digest('hex');
      const sigBuf = Buffer.from(sig, 'hex');
      const expBuf = Buffer.from(expected, 'hex');
      if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
        throw new Error('bad sig');
      }
      const [userId, organizationId, returnTo, expStr] = payload.split(':');
      if (!userId || !organizationId || !expStr) throw new Error('bad payload');
      if (Date.now() > parseInt(expStr, 10)) throw new Error('expired');
      return { userId, organizationId, returnTo: returnTo || undefined };
    } catch {
      throw new UnauthorizedException('State OAuth không hợp lệ');
    }
  }

  private getStateSecret(): string {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) throw new BadRequestException('JWT_SECRET chưa được cấu hình');
    return secret;
  }
}
