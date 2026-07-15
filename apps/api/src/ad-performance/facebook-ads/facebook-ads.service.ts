import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FacebookAdsConnectionStatus, FacebookAdsSyncStatus, Prisma } from '@marketingspa/database';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { encryptSecret, decryptSecret } from '../../common/utils/encryption.util';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { MetaGraphApiService } from './meta-graph-api.service';
import { mapMetaInsightToCampaign, type MappedFacebookCampaign } from './facebook-ads.mapper';
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
  ) {}

  getOAuthStartUrl(user: AuthUser, returnTo?: string): { url: string } {
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

      const encryptedAccessToken = encryptSecret(accessToken, this.getEncryptionKey());

      await this.prisma.facebookAdsConnection.upsert({
        where: { userId },
        create: {
          userId,
          organizationId,
          encryptedAccessToken,
          tokenExpiresAt: expiresAt,
          facebookUserId: me.id,
          status: FacebookAdsConnectionStatus.CONNECTED,
          scopes: this.meta.getOAuthScopes(),
        },
        update: {
          encryptedAccessToken,
          tokenExpiresAt: expiresAt,
          facebookUserId: me.id,
          status: FacebookAdsConnectionStatus.CONNECTED,
          scopes: this.meta.getOAuthScopes(),
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

  async getStatus(userId: string) {
    const row = await this.prisma.facebookAdsConnection.findUnique({ where: { userId } });
    if (!row?.encryptedAccessToken) {
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

    let status = this.toPublicStatus(row.status);
    if (row.tokenExpiresAt && row.tokenExpiresAt.getTime() < Date.now()) {
      status = 'TOKEN_EXPIRED';
      await this.prisma.facebookAdsConnection.update({
        where: { userId },
        data: { status: FacebookAdsConnectionStatus.TOKEN_EXPIRED },
      });
    }

    return {
      status,
      connected: status === 'CONNECTED' || status === 'SYNCING',
      selectedAdAccountId: row.selectedAdAccountId,
      selectedAdAccountName: row.selectedAdAccountName,
      lastSyncAt: row.lastSyncAt,
      lastSyncStatus: row.lastSyncStatus,
      lastSyncError: row.lastSyncError,
      tokenExpiresAt: row.tokenExpiresAt,
      facebookUserId: row.facebookUserId,
    };
  }

  async listAdAccounts(userId: string) {
    const accessToken = await this.getValidAccessToken(userId);
    try {
      const accounts = await this.meta.getAdAccounts(accessToken);
      const active = accounts.filter(
        (a) => a.account_status === undefined || a.account_status === 1,
      );
      if (active.length === 0 && accounts.length === 0) {
        await this.prisma.facebookAdsConnection.update({
          where: { userId },
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
      await this.handleTokenError(userId, e);
      throw e;
    }
  }

  async selectAdAccount(userId: string, dto: SelectAdAccountDto) {
    await this.ensureConnection(userId);
    await this.prisma.facebookAdsConnection.update({
      where: { userId },
      data: {
        selectedAdAccountId: dto.adAccountId,
        selectedAdAccountName: dto.adAccountName ?? dto.adAccountId,
        status: FacebookAdsConnectionStatus.CONNECTED,
      },
    });
    return { message: 'Đã chọn tài khoản quảng cáo', adAccountId: dto.adAccountId };
  }

  async sync(userId: string, dto: SyncFacebookAdsDto) {
    const conn = await this.ensureConnection(userId);
    if (!conn.selectedAdAccountId) {
      throw new BadRequestException('Vui lòng chọn tài khoản quảng cáo trước khi đồng bộ');
    }

    const dateFrom = this.parseDate(dto.dateFrom);
    const dateTo = this.parseDate(dto.dateTo);
    if (dateFrom > dateTo) {
      throw new BadRequestException('Từ ngày phải trước đến ngày');
    }

    const log = await this.prisma.facebookAdsSyncLog.create({
      data: {
        userId,
        adAccountId: conn.selectedAdAccountId,
        dateFrom,
        dateTo,
        syncStartedAt: new Date(),
        status: FacebookAdsSyncStatus.RUNNING,
      },
    });

    await this.prisma.facebookAdsConnection.update({
      where: { userId },
      data: {
        status: FacebookAdsConnectionStatus.SYNCING,
        lastSyncStatus: FacebookAdsSyncStatus.RUNNING,
      },
    });

    try {
      const accessToken = await this.getValidAccessToken(userId);
      const insights = await this.meta.getCampaignInsights(
        accessToken,
        conn.selectedAdAccountId,
        dto.dateFrom,
        dto.dateTo,
        dto.campaignId,
      );

      const mapped = insights.map(mapMetaInsightToCampaign).filter((c) => c.campaignId);
      const syncedAt = new Date();

      for (const c of mapped) {
        await this.prisma.facebookAdsCampaignSnapshot.upsert({
          where: {
            userId_campaignId_dateFrom_dateTo: {
              userId,
              campaignId: c.campaignId,
              dateFrom,
              dateTo,
            },
          },
          create: this.snapshotCreate(
            userId,
            conn.selectedAdAccountId,
            dateFrom,
            dateTo,
            c,
            syncedAt,
          ),
          update: this.snapshotUpdate(c, syncedAt),
        });
      }

      await this.prisma.facebookAdsSyncLog.update({
        where: { id: log.id },
        data: {
          syncFinishedAt: new Date(),
          status: FacebookAdsSyncStatus.SUCCESS,
          campaignsSynced: mapped.length,
        },
      });

      await this.prisma.facebookAdsConnection.update({
        where: { userId },
        data: {
          status: FacebookAdsConnectionStatus.CONNECTED,
          lastSyncAt: syncedAt,
          lastSyncStatus: FacebookAdsSyncStatus.SUCCESS,
          lastSyncError: null,
        },
      });

      return {
        message: `Đồng bộ thành công ${mapped.length} chiến dịch`,
        campaignsSynced: mapped.length,
        status: 'SUCCESS' as const,
      };
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Sync failed';
      this.logger.warn(`Facebook sync failed for user ${userId}: ${errorMessage}`);

      await this.prisma.facebookAdsSyncLog.update({
        where: { id: log.id },
        data: {
          syncFinishedAt: new Date(),
          status: FacebookAdsSyncStatus.FAILED,
          errorMessage,
        },
      });

      await this.handleTokenError(userId, e);

      await this.prisma.facebookAdsConnection.update({
        where: { userId },
        data: {
          lastSyncStatus: FacebookAdsSyncStatus.FAILED,
          lastSyncError: errorMessage,
        },
      });

      throw new BadRequestException(errorMessage);
    }
  }

  async getCampaigns(userId: string, query: FacebookCampaignsQueryDto) {
    const conn = await this.prisma.facebookAdsConnection.findUnique({ where: { userId } });
    const adAccountId = query.adAccountId ?? conn?.selectedAdAccountId;
    if (!adAccountId) {
      return { items: [], adAccountId: null };
    }

    const dateFrom = this.parseDate(query.dateFrom);
    const dateTo = this.parseDate(query.dateTo);

    const rows = await this.prisma.facebookAdsCampaignSnapshot.findMany({
      where: {
        userId,
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

  async listSyncLogs(userId: string, limit = 10) {
    const items = await this.prisma.facebookAdsSyncLog.findMany({
      where: { userId },
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

  async disconnect(userId: string) {
    await this.prisma.facebookAdsCampaignSnapshot.deleteMany({ where: { userId } });
    await this.prisma.facebookAdsSyncLog.deleteMany({ where: { userId } });
    await this.prisma.facebookAdsConnection.deleteMany({ where: { userId } });
    return { message: 'Đã ngắt kết nối Facebook Ads' };
  }

  private snapshotCreate(
    userId: string,
    adAccountId: string,
    dateFrom: Date,
    dateTo: Date,
    c: MappedFacebookCampaign,
    syncedAt: Date,
  ): Prisma.FacebookAdsCampaignSnapshotCreateInput {
    return {
      connection: { connect: { userId } },
      adAccountId,
      campaignId: c.campaignId,
      campaignName: c.campaignName,
      objective: c.objective,
      campaignType: c.campaignType,
      dateFrom,
      dateTo,
      spend: c.spend,
      impressions: c.impressions,
      reach: c.reach,
      frequency: c.frequency,
      cpm: c.cpm,
      cpc: c.cpc,
      ctr: c.ctr,
      clicks: c.clicks,
      results: c.results,
      costPerResult: c.costPerResult,
      purchaseRoas: c.purchaseRoas,
      resultRate: c.resultRate,
      syncedAt,
    };
  }

  private snapshotUpdate(
    c: MappedFacebookCampaign,
    syncedAt: Date,
  ): Prisma.FacebookAdsCampaignSnapshotUpdateInput {
    return {
      campaignName: c.campaignName,
      objective: c.objective,
      campaignType: c.campaignType,
      spend: c.spend,
      impressions: c.impressions,
      reach: c.reach,
      frequency: c.frequency,
      cpm: c.cpm,
      cpc: c.cpc,
      ctr: c.ctr,
      clicks: c.clicks,
      results: c.results,
      costPerResult: c.costPerResult,
      purchaseRoas: c.purchaseRoas,
      resultRate: c.resultRate,
      syncedAt,
    };
  }

  private async ensureConnection(userId: string) {
    const row = await this.prisma.facebookAdsConnection.findUnique({ where: { userId } });
    if (!row?.encryptedAccessToken) {
      throw new BadRequestException('Chưa kết nối Facebook Ads');
    }
    return row;
  }

  private async getValidAccessToken(userId: string): Promise<string> {
    const row = await this.ensureConnection(userId);
    if (row.tokenExpiresAt && row.tokenExpiresAt.getTime() < Date.now()) {
      await this.prisma.facebookAdsConnection.update({
        where: { userId },
        data: { status: FacebookAdsConnectionStatus.TOKEN_EXPIRED },
      });
      throw new UnauthorizedException('Token Facebook đã hết hạn, vui lòng kết nối lại');
    }
    return decryptSecret(row.encryptedAccessToken, this.getEncryptionKey());
  }

  private async handleTokenError(userId: string, error: unknown) {
    const msg = error instanceof Error ? error.message.toLowerCase() : '';
    if (
      msg.includes('expired') ||
      msg.includes('invalid oauth') ||
      msg.includes('session has expired') ||
      msg.includes('error validating access token')
    ) {
      await this.prisma.facebookAdsConnection.update({
        where: { userId },
        data: { status: FacebookAdsConnectionStatus.TOKEN_EXPIRED },
      });
    }
  }

  private getEncryptionKey(): string {
    const key = this.config.get<string>('ENCRYPTION_KEY');
    if (!key) throw new BadRequestException('ENCRYPTION_KEY chưa được cấu hình');
    return key;
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
