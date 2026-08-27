import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AdConnectionProvider,
  AdConnectionStatus,
  AdPlatform,
  Prisma,
} from '@marketingspa/database';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { redactForAudit } from '../../common/utils/token-security.util';
import { AdConnectionFacade } from '../ad-connection.facade';
import { AdsSyncQueueService } from '../ads-sync-queue.service';
import {
  GoogleAdsApiService,
  GoogleAdsPermissionError,
  GoogleAdsRateLimitError,
  GoogleAdsRequestError,
  GoogleAdsTokenExpiredError,
  GoogleAdsTwoFactorError,
} from './google-ads-api.service';
import type { SelectGoogleAccountsDto, SelectGoogleCustomerDto, SyncGoogleAdsDto } from './dto/google-ads.dto';
import {
  mergeGoogleAdsHierarchy,
  normalizeGoogleCustomerId,
  type GoogleAdsDiscoveredAccount,
  type GoogleAdsParsedError,
} from '@marketingspa/shared';

const STATE_TTL_SEC = 600;
const STATE_PREFIX = 'oauth:google-ads:state:';
const ADWORDS_SCOPE = 'https://www.googleapis.com/auth/adwords';

type OAuthStatePayload = {
  userId: string;
  organizationId: string;
  returnTo?: string;
};

@Injectable()
export class GoogleAdsService {
  private readonly logger = new Logger(GoogleAdsService.name);
  /** Dev fallback when Redis unavailable — not for production scale. */
  private readonly memoryStates = new Map<string, { payload: OAuthStatePayload; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly googleApi: GoogleAdsApiService,
    private readonly connections: AdConnectionFacade,
    private readonly adsSyncQueue: AdsSyncQueueService,
    private readonly audit: AuditService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  async getOAuthStartUrl(user: AuthUser, returnTo?: string): Promise<{ url: string }> {
    this.ensureGoogleConfig();
    const state = await this.createOneTimeState({
      userId: user.id,
      organizationId: user.organizationId,
      returnTo: returnTo ?? 'ads',
    });
    const url = this.googleApi.buildOAuthUrl(state);
    this.logger.log(
      `Google Ads OAuth start org=…${user.organizationId.slice(-6)} redirectUri=${this.config.get('GOOGLE_ADS_REDIRECT_URI')?.trim()?.replace(/\/+$/, '')}`,
    );
    return { url };
  }

  async handleOAuthCallback(
    code: string | undefined,
    state: string | undefined,
    error?: string,
  ): Promise<{ redirectUrl: string }> {
    const appUrl = this.config.get<string>('APP_URL') ?? 'http://localhost:3000';
    const base = `${appUrl}/ads`;

    if (error) {
      return {
        redirectUrl: `${base}?google=error&message=${encodeURIComponent(error)}`,
      };
    }
    if (!code || !state) {
      return { redirectUrl: `${base}?google=error&message=missing_code` };
    }

    let payload: OAuthStatePayload;
    try {
      payload = await this.consumeOneTimeState(state);
    } catch {
      return { redirectUrl: `${base}?google=error&message=invalid_state` };
    }

    try {
      const tokens = await this.googleApi.exchangeCodeForTokens(code);
      if (!tokens.refreshToken) {
        throw new BadRequestException(
          'Google không trả refresh token — thử ngắt kết nối app trong Google Account và kết nối lại',
        );
      }

      const existingBefore = await this.prisma.adConnection.findUnique({
        where: {
          organizationId_provider: {
            organizationId: payload.organizationId,
            provider: AdConnectionProvider.GOOGLE,
          },
        },
      });
      const prevCustomerId = normalizeGoogleCustomerId(existingBefore?.externalAccountId);
      const prevMeta = (existingBefore?.metadata ?? {}) as Record<string, unknown>;
      const grantedScopes = (tokens.scope ?? ADWORDS_SCOPE)
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (!grantedScopes.some((s) => s.includes('adwords'))) {
        grantedScopes.push(ADWORDS_SCOPE);
      }

      await this.connections.upsertEncryptedCredentials({
        organizationId: payload.organizationId,
        userId: payload.userId,
        provider: AdConnectionProvider.GOOGLE,
        plaintextPayload: JSON.stringify({ refreshToken: tokens.refreshToken }),
        status: AdConnectionStatus.CONNECTED,
        scopes: grantedScopes,
        tokenExpiresAt: null,
        metadata: {
          ...prevMeta,
          pendingCustomerSelection: !prevCustomerId,
          oauthReconnectedAt: new Date().toISOString(),
          oauthScopes: grantedScopes,
        } as Prisma.InputJsonValue,
      });

      await this.audit.log({
        organizationId: payload.organizationId,
        userId: payload.userId,
        action: 'GOOGLE_ADS_OAUTH_CONNECTED',
        entityType: 'AD_CONNECTION',
        entityId: payload.organizationId,
        metadata: redactForAudit({ provider: 'GOOGLE' }) as Prisma.InputJsonValue,
      });

      const customers = await this.discoverCustomers(payload.organizationId);
      const previouslySelected = await this.prisma.adGoogleAdsAccount.findMany({
        where: { organizationId: payload.organizationId, isSelected: true },
        select: { customerId: true },
      });
      const restoreIds = new Set(previouslySelected.map((a) => a.customerId));
      if (prevCustomerId) restoreIds.add(prevCustomerId);
      const restored = customers.filter((c) => restoreIds.has(c.customerId));
      if (restored.length > 0) {
        let i = 0;
        for (const acc of restored) {
          await this.applyCustomerSelection(
            payload.organizationId,
            payload.userId,
            {
              customerId: acc.customerId,
              customerName: acc.name,
              loginCustomerId: acc.loginCustomerId ?? undefined,
            },
            {
              autoSync: i === 0,
              keepOthers: true,
              setPrimary: i === 0,
              discovered: customers,
            },
          );
          i += 1;
        }
        return { redirectUrl: `${base}?google=connected&sync=started&reconnected=1` };
      }
      if (customers.length === 1) {
        const only = customers[0]!;
        await this.applyCustomerSelection(
          payload.organizationId,
          payload.userId,
          {
            customerId: only.customerId,
            customerName: only.name,
            loginCustomerId: only.loginCustomerId ?? undefined,
          },
          { autoSync: true },
        );
        return { redirectUrl: `${base}?google=connected&sync=started` };
      }

      if (customers.length === 0) {
        return {
          redirectUrl: `${base}?google=error&message=${encodeURIComponent('Không tìm thấy tài khoản Google Ads')}`,
        };
      }

      return { redirectUrl: `${base}?google=select_account` };
    } catch (e) {
      await this.handleTokenError(payload.organizationId, e);
      const message = e instanceof Error ? e.message : 'oauth_failed';
      this.logger.warn(
        `Google OAuth callback failed org=…${payload.organizationId.slice(-6)}: ${message.slice(0, 200)}`,
      );
      return {
        redirectUrl: `${base}?google=error&message=${encodeURIComponent(message)}`,
      };
    }
  }

  async getStatus(user: AuthUser) {
    const pub = await this.connections.getPublic(user.organizationId, AdConnectionProvider.GOOGLE);
    const row = await this.prisma.adConnection.findUnique({
      where: {
        organizationId_provider: {
          organizationId: user.organizationId,
          provider: AdConnectionProvider.GOOGLE,
        },
      },
    });
    const meta = (row?.metadata ?? {}) as {
      pendingCustomerSelection?: boolean;
      loginCustomerId?: string | null;
    };
    const linked = await this.prisma.adGoogleAdsAccount.findMany({
      where: { organizationId: user.organizationId, isSelected: true },
      orderBy: { createdAt: 'asc' },
    });

    let status: string = pub.status;
    if (!pub.hasCredentials) status = AdConnectionStatus.DISCONNECTED;
    else if (meta.pendingCustomerSelection && !pub.externalAccountId) status = 'PENDING_ACCOUNT';
    else if (pub.status === AdConnectionStatus.CONNECTED) status = 'CONNECTED';

    return {
      status,
      connected: pub.hasCredentials && pub.status === AdConnectionStatus.CONNECTED,
      customerId: pub.externalAccountId,
      customerName: pub.accountName,
      lastSyncAt: pub.lastSyncAt,
      lastError: pub.lastError,
      pendingCustomerSelection: Boolean(meta.pendingCustomerSelection && !pub.externalAccountId),
      loginCustomerId: meta.loginCustomerId ?? linked[0]?.loginCustomerId ?? null,
      accounts: linked.map((a) => ({
        customerId: a.customerId,
        loginCustomerId: a.loginCustomerId,
        name: a.name,
        isManager: a.isManager,
        accessType: a.accessType,
        isSelected: a.isSelected,
      })),
    };
  }

  async listCustomers(user: AuthUser) {
    try {
      const items = await this.discoverCustomers(user.organizationId);
      return { items };
    } catch (e) {
      await this.throwUserFacingGoogleError(user.organizationId, e);
    }
  }

  async listLinkedAccounts(user: AuthUser) {
    const items = await this.prisma.adGoogleAdsAccount.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: 'asc' },
    });
    return {
      items: items.map((a) => ({
        customerId: a.customerId,
        loginCustomerId: a.loginCustomerId,
        name: a.name,
        currency: a.currency,
        timezone: a.timezone,
        isManager: a.isManager,
        isSelected: a.isSelected,
        accessType: a.accessType,
      })),
    };
  }

  async selectCustomer(user: AuthUser, dto: SelectGoogleCustomerDto) {
    try {
      await this.applyCustomerSelection(user.organizationId, user.id, dto, { autoSync: true });
    } catch (e) {
      await this.throwUserFacingGoogleError(user.organizationId, e);
    }
    return {
      message: 'Đã chọn tài khoản Google Ads',
      customerId: normalizeGoogleCustomerId(dto.customerId),
    };
  }

  async selectAccounts(user: AuthUser, dto: SelectGoogleAccountsDto) {
    const accounts = dto.accounts ?? [];
    if (!accounts.length) throw new BadRequestException('Chọn ít nhất một tài khoản Google Ads');
    try {
      const discovered = await this.discoverCustomers(user.organizationId);
      let i = 0;
      for (const acc of accounts) {
        await this.applyCustomerSelection(user.organizationId, user.id, acc, {
          autoSync: i === 0,
          keepOthers: true,
          setPrimary: i === 0,
          discovered,
        });
        i += 1;
      }
    } catch (e) {
      await this.throwUserFacingGoogleError(user.organizationId, e);
    }
    if (dto.deselectOthers) {
      const keep = new Set(accounts.map((a) => normalizeGoogleCustomerId(a.customerId)));
      await this.prisma.adGoogleAdsAccount.updateMany({
        where: {
          organizationId: user.organizationId,
          customerId: { notIn: [...keep] },
        },
        data: { isSelected: false },
      });
    }
    return {
      message: `Đã liên kết ${accounts.length} tài khoản Google Ads`,
      customerIds: accounts.map((a) => normalizeGoogleCustomerId(a.customerId)),
    };
  }

  async sync(user: AuthUser, dto: SyncGoogleAdsDto) {
    return this.adsSyncQueue.enqueueGoogleSync(user, {
      dateFrom: dto.dateFrom,
      dateTo: dto.dateTo,
    });
  }

  async getSyncJob(user: AuthUser, jobId: string) {
    return this.adsSyncQueue.getJob(user, jobId);
  }

  async disconnect(user: AuthUser) {
    const organizationId = user.organizationId;
    try {
      await this.connections.clearCredentials(organizationId, AdConnectionProvider.GOOGLE, user.id);
    } catch (e) {
      if (!(e instanceof NotFoundException)) throw e;
    }
    await this.prisma.adGoogleAdsAccount.updateMany({
      where: { organizationId },
      data: { isSelected: false },
    });
    await this.audit.log({
      organizationId,
      userId: user.id,
      action: 'GOOGLE_ADS_DISCONNECTED',
      entityType: 'AD_CONNECTION',
      entityId: organizationId,
      metadata: redactForAudit({ provider: 'GOOGLE' }) as Prisma.InputJsonValue,
    });
    return { message: 'Đã ngắt kết nối Google Ads' };
  }

  /**
   * Per-tenant discovery: ListAccessibleCustomers → direct detail → MCC customer_client.
   * Never uses GOOGLE_ADS_LOGIN_CUSTOMER_ID (that ID belongs to one operator, not every tenant).
   */
  private async discoverCustomers(organizationId: string): Promise<GoogleAdsDiscoveredAccount[]> {
    const refreshToken = await this.connections.getGoogleRefreshToken(organizationId);
    const accessToken = await this.googleApi.refreshAccessToken(refreshToken);
    const accessibleIds = await this.googleApi.listAccessibleCustomers(accessToken);
    const direct: Array<{
      customerId: string;
      name: string;
      currency: string;
      timezone: string;
      isManager: boolean;
    }> = [];
    const childrenByManager: Record<
      string,
      Array<{
        customerId: string;
        name: string;
        currency?: string;
        timezone?: string;
        isManager?: boolean;
      }>
    > = {};

    for (const id of accessibleIds.slice(0, 50)) {
      try {
        const detail = await this.googleApi.getCustomerDetail(accessToken, id, null);
        direct.push({
          customerId: detail.id,
          name: detail.name,
          currency: detail.currency,
          timezone: detail.timezone,
          isManager: detail.isManager,
        });
        if (detail.isManager) {
          try {
            childrenByManager[id] = await this.googleApi.listCustomerClients(accessToken, id);
          } catch (e) {
            if (e instanceof GoogleAdsRateLimitError || e instanceof GoogleAdsTwoFactorError) {
              throw e;
            }
            this.logger.debug(
              `MCC children skip …${id.slice(-4)}: ${e instanceof Error ? e.message : e}`,
            );
          }
        }
      } catch (e) {
        if (e instanceof GoogleAdsRateLimitError || e instanceof GoogleAdsTwoFactorError) throw e;
        if (e instanceof GoogleAdsTokenExpiredError) throw e;
        this.logger.debug(`Direct access skip …${id.slice(-4)}: ${e instanceof Error ? e.message : e}`);
      }
    }

    return mergeGoogleAdsHierarchy({ accessibleIds, direct, childrenByManager });
  }

  private async applyCustomerSelection(
    organizationId: string,
    userId: string,
    dto: SelectGoogleCustomerDto,
    opts?: {
      autoSync?: boolean;
      keepOthers?: boolean;
      setPrimary?: boolean;
      discovered?: GoogleAdsDiscoveredAccount[];
    },
  ) {
    const customerId = normalizeGoogleCustomerId(dto.customerId);
    if (!customerId) throw new BadRequestException('Customer ID không hợp lệ');
    const setPrimary = opts?.setPrimary !== false;

    const discovered = opts?.discovered ?? (await this.discoverCustomers(organizationId));
    const match = discovered.find((c) => c.customerId === customerId);
    const requestedLogin = normalizeGoogleCustomerId(dto.loginCustomerId) || null;
    const loginCustomerId =
      match?.loginCustomerId ??
      (requestedLogin && requestedLogin !== customerId ? requestedLogin : null);

    const refreshToken = await this.connections.getGoogleRefreshToken(organizationId);
    const accessToken = await this.googleApi.refreshAccessToken(refreshToken);
    const detail = await this.googleApi.getCustomerDetail(
      accessToken,
      customerId,
      loginCustomerId,
    );

    const connection = await this.connections.upsertEncryptedCredentials({
      organizationId,
      userId,
      provider: AdConnectionProvider.GOOGLE,
      plaintextPayload: JSON.stringify({ refreshToken }),
      status: AdConnectionStatus.CONNECTED,
      ...(setPrimary
        ? {
            externalAccountId: customerId,
            externalAccountName: dto.customerName?.trim() || detail.name,
            metadata: {
              loginCustomerId,
              pendingCustomerSelection: false,
              currency: detail.currency,
              timezone: detail.timezone,
              accessType: match?.accessType ?? (loginCustomerId ? 'mcc' : 'direct'),
            } as Prisma.InputJsonValue,
          }
        : {}),
    });

    await this.prisma.adGoogleAdsAccount.upsert({
      where: {
        organizationId_customerId: { organizationId, customerId },
      },
      create: {
        organizationId,
        connectionId: connection.id,
        customerId,
        loginCustomerId,
        name: dto.customerName?.trim() || detail.name,
        currency: detail.currency,
        timezone: detail.timezone,
        isManager: detail.isManager,
        isSelected: true,
        accessType: match?.accessType ?? (loginCustomerId ? 'mcc' : 'direct'),
      },
      update: {
        connectionId: connection.id,
        loginCustomerId,
        name: dto.customerName?.trim() || detail.name,
        currency: detail.currency,
        timezone: detail.timezone,
        isManager: detail.isManager,
        isSelected: true,
        accessType: match?.accessType ?? (loginCustomerId ? 'mcc' : 'direct'),
        lastError: null,
      },
    });

    if (!opts?.keepOthers && setPrimary) {
      await this.prisma.adGoogleAdsAccount.updateMany({
        where: { organizationId, customerId: { not: customerId } },
        data: { isSelected: false },
      });
    }

    await this.prisma.adPlatformAccount.upsert({
      where: {
        userId_platform_externalId: {
          userId,
          platform: AdPlatform.GOOGLE,
          externalId: customerId,
        },
      },
      create: {
        userId,
        organizationId,
        platform: AdPlatform.GOOGLE,
        externalId: customerId,
        name: detail.name,
        currency: detail.currency,
        timezone: detail.timezone,
        isActive: true,
      },
      update: {
        name: detail.name,
        currency: detail.currency,
        timezone: detail.timezone,
        isActive: true,
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'GOOGLE_ADS_CUSTOMER_SELECTED',
      entityType: 'AD_CONNECTION',
      entityId: organizationId,
      metadata: redactForAudit({ customerId, loginCustomerId }) as Prisma.InputJsonValue,
    });

    if (opts?.autoSync) {
      const stubUser = { id: userId, organizationId } as AuthUser;
      try {
        await this.adsSyncQueue.enqueueGoogleSync(stubUser, {});
      } catch (e) {
        if (e instanceof BadRequestException || (e as { status?: number }).status === 409) {
          this.logger.debug(`Google auto-sync skipped: ${e instanceof Error ? e.message : e}`);
        } else {
          throw e;
        }
      }
    }
  }

  private ensureGoogleConfig() {
    const id = this.config.get<string>('GOOGLE_CLIENT_ID')?.trim();
    const secret = this.config.get<string>('GOOGLE_CLIENT_SECRET')?.trim();
    const devToken = this.config.get<string>('GOOGLE_ADS_DEVELOPER_TOKEN')?.trim();
    const redirect = this.config.get<string>('GOOGLE_ADS_REDIRECT_URI')?.trim();
    if (!id || !secret || !devToken || !redirect) {
      throw new BadRequestException(
        'Google Ads OAuth chưa cấu hình (GOOGLE_CLIENT_ID/SECRET/DEVELOPER_TOKEN/REDIRECT_URI)',
      );
    }
  }

  private stateSecret(): string {
    const key = this.config.get<string>('JWT_SECRET') ?? this.config.get<string>('ENCRYPTION_KEY');
    if (!key || key.length < 16) {
      throw new BadRequestException('JWT_SECRET/ENCRYPTION_KEY chưa cấu hình cho OAuth state');
    }
    return key;
  }

  private signStateId(stateId: string): string {
    return createHmac('sha256', this.stateSecret()).update(stateId).digest('hex');
  }

  private verifyStateSignature(stateId: string, sig: string): void {
    const expected = this.signStateId(stateId);
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid OAuth state signature');
    }
  }

  async createOneTimeState(payload: OAuthStatePayload): Promise<string> {
    const stateId = randomBytes(24).toString('hex');
    const key = `${STATE_PREFIX}${stateId}`;
    const serialized = JSON.stringify(payload);

    if (this.redis) {
      const ok = await this.redis.set(key, serialized, 'EX', STATE_TTL_SEC, 'NX');
      if (ok !== 'OK') {
        throw new BadRequestException('OAuth state busy — thử lại');
      }
    } else {
      this.memoryStates.set(stateId, {
        payload,
        expiresAt: Date.now() + STATE_TTL_SEC * 1000,
      });
    }

    return `${stateId}.${this.signStateId(stateId)}`;
  }

  async consumeOneTimeState(state: string): Promise<OAuthStatePayload> {
    const [stateId, sig] = state.split('.');
    if (!stateId || !sig) throw new UnauthorizedException('Invalid OAuth state');
    this.verifyStateSignature(stateId, sig);

    const key = `${STATE_PREFIX}${stateId}`;
    let raw: string | null = null;

    if (this.redis) {
      raw = await this.redis.getdel(key);
    } else {
      const entry = this.memoryStates.get(stateId);
      if (entry && entry.expiresAt > Date.now()) {
        raw = JSON.stringify(entry.payload);
      }
      this.memoryStates.delete(stateId);
    }

    if (!raw) throw new UnauthorizedException('OAuth state expired or reused');
    return JSON.parse(raw) as OAuthStatePayload;
  }

  async handleTokenError(organizationId: string, err: unknown): Promise<void> {
    const detail = this.extractParsed(err);
    const lastError = (detail
      ? `${detail.errorCode || detail.rpcStatus || `HTTP_${detail.httpStatus}`}: ${detail.message}`
      : err instanceof Error
        ? err.message
        : 'google_ads_error'
    ).slice(0, 400);

    if (err instanceof GoogleAdsTokenExpiredError) {
      await this.prisma.adConnection.updateMany({
        where: { organizationId, provider: AdConnectionProvider.GOOGLE },
        data: { status: AdConnectionStatus.TOKEN_EXPIRED, lastError },
      });
    } else if (err instanceof GoogleAdsTwoFactorError) {
      await this.prisma.adConnection.updateMany({
        where: { organizationId, provider: AdConnectionProvider.GOOGLE },
        data: {
          status: AdConnectionStatus.ERROR,
          lastError,
        },
      });
    } else if (err instanceof GoogleAdsPermissionError || err instanceof GoogleAdsRequestError) {
      await this.prisma.adConnection.updateMany({
        where: { organizationId, provider: AdConnectionProvider.GOOGLE },
        data: {
          status:
            err instanceof GoogleAdsPermissionError
              ? AdConnectionStatus.INSUFFICIENT_PERMISSIONS
              : AdConnectionStatus.ERROR,
          lastError,
        },
      });
    }
  }

  private extractParsed(err: unknown): GoogleAdsParsedError | undefined {
    if (
      err instanceof GoogleAdsPermissionError ||
      err instanceof GoogleAdsTokenExpiredError ||
      err instanceof GoogleAdsTwoFactorError ||
      err instanceof GoogleAdsRateLimitError ||
      err instanceof GoogleAdsRequestError
    ) {
      return err.parsed;
    }
    return undefined;
  }

  private googleErrorResponseBody(err: Error, parsed?: GoogleAdsParsedError) {
    const code = parsed?.errorCode || parsed?.rpcStatus || err.name || 'GOOGLE_ADS_ERROR';
    return {
      message: err.message,
      code,
      googleAdsErrorCode: parsed?.errorCode ?? null,
      googleAdsStatus: parsed?.rpcStatus ?? null,
      requestId: parsed?.requestId ?? null,
      guidance: parsed?.guidance ?? null,
      classification: parsed?.classification ?? null,
    };
  }

  private async throwUserFacingGoogleError(organizationId: string, err: unknown): Promise<never> {
    await this.handleTokenError(organizationId, err);
    if (err instanceof GoogleAdsTokenExpiredError) {
      throw new UnauthorizedException(
        this.googleErrorResponseBody(
          new Error('Google Ads token hết hạn hoặc bị thu hồi — kết nối lại OAuth'),
          err.parsed,
        ),
      );
    }
    if (err instanceof GoogleAdsTwoFactorError) {
      throw new BadRequestException(this.googleErrorResponseBody(err, err.parsed));
    }
    if (err instanceof GoogleAdsPermissionError) {
      throw new ForbiddenException(this.googleErrorResponseBody(err, err.parsed));
    }
    if (err instanceof GoogleAdsRequestError) {
      const status = err.parsed.httpStatus;
      if (status === 404) {
        throw new NotFoundException(this.googleErrorResponseBody(err, err.parsed));
      }
      throw new BadRequestException(this.googleErrorResponseBody(err, err.parsed));
    }
    if (err instanceof BadRequestException) throw err;
    const message = err instanceof Error ? err.message.slice(0, 200) : 'google_ads_failed';
    throw new BadRequestException(message);
  }
}
