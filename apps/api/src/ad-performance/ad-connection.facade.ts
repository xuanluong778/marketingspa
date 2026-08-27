import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdConnectionProvider, AdConnectionStatus, Prisma } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertNoCredentialLeak,
  decodeStoredSecret,
  encodeStoredSecret,
  redactForAudit,
} from '../common/utils/token-security.util';

export type AdConnectionPublic = {
  provider: AdConnectionProvider;
  status: AdConnectionStatus;
  connected: boolean;
  accountName: string | null;
  externalAccountId: string | null;
  lastSyncAt: Date | null;
  lastError: string | null;
  tokenExpiresAt: Date | null;
  /** Integrations / UI: never exposes secrets */
  hasCredentials: boolean;
  credentialSource: 'AdConnection';
};

/**
 * Nguồn kết nối Ads duy nhất (organization-scoped).
 * Mọi module khác chỉ dùng facade này — không đọc Integration / FacebookAdsConnection token.
 */
@Injectable()
export class AdConnectionFacade {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async listPublic(organizationId: string): Promise<AdConnectionPublic[]> {
    const providers: AdConnectionProvider[] = [
      AdConnectionProvider.META,
      AdConnectionProvider.GOOGLE,
      AdConnectionProvider.GMAIL,
    ];
    const rows = await this.prisma.adConnection.findMany({ where: { organizationId } });
    const byProvider = new Map(rows.map((r) => [r.provider, r]));
    const items = providers.map((provider) => this.toPublic(provider, byProvider.get(provider)));
    assertNoCredentialLeak(items);
    return items;
  }

  async getPublic(
    organizationId: string,
    provider: AdConnectionProvider,
  ): Promise<AdConnectionPublic> {
    const row = await this.prisma.adConnection.findUnique({
      where: { organizationId_provider: { organizationId, provider } },
    });
    const item = this.toPublic(provider, row ?? undefined);
    assertNoCredentialLeak(item);
    return item;
  }

  /**
   * Map IntegrationProvider META_ADS/GOOGLE_ADS → status từ AdConnection (không đọc Integration.encryptedCredentials).
   */
  async getAdsStatusForIntegrationProvider(
    organizationId: string,
    integrationProvider: 'META_ADS' | 'GOOGLE_ADS',
  ): Promise<{
    provider: string;
    label: string;
    status: string;
    hasCredentials: boolean;
    maskedHint: string | null;
    lastTestedAt: Date | null;
    updatedAt: Date | null;
    credentialSource: 'AdConnection';
    connectVia: '/ads';
  }> {
    const provider =
      integrationProvider === 'META_ADS' ? AdConnectionProvider.META : AdConnectionProvider.GOOGLE;
    const pub = await this.getPublic(organizationId, provider);
    const status =
      pub.status === AdConnectionStatus.CONNECTED
        ? 'ACTIVE'
        : pub.status === AdConnectionStatus.TOKEN_EXPIRED
          ? 'EXPIRED'
          : pub.status === AdConnectionStatus.ERROR
            ? 'ERROR'
            : 'DISCONNECTED';
    const payload = {
      provider: integrationProvider,
      label: integrationProvider === 'META_ADS' ? 'Facebook Ads' : 'Google Ads',
      status,
      hasCredentials: pub.hasCredentials,
      maskedHint: pub.accountName,
      lastTestedAt: pub.lastSyncAt,
      updatedAt: pub.lastSyncAt,
      credentialSource: 'AdConnection' as const,
      connectVia: '/ads' as const,
    };
    assertNoCredentialLeak(payload);
    return payload;
  }

  async upsertEncryptedCredentials(params: {
    organizationId: string;
    userId: string;
    provider: AdConnectionProvider;
    plaintextPayload: string;
    status?: AdConnectionStatus;
    scopes?: string[];
    tokenExpiresAt?: Date | null;
    externalAccountId?: string | null;
    externalAccountName?: string | null;
    metadata?: Prisma.InputJsonValue;
  }) {
    const encryptedCredentials = encodeStoredSecret(
      params.plaintextPayload,
      this.getEncryptionKey(),
    );
    return this.prisma.adConnection.upsert({
      where: {
        organizationId_provider: {
          organizationId: params.organizationId,
          provider: params.provider,
        },
      },
      create: {
        organizationId: params.organizationId,
        userId: params.userId,
        provider: params.provider,
        status: params.status ?? AdConnectionStatus.CONNECTED,
        encryptedCredentials,
        scopes: params.scopes ?? [],
        tokenExpiresAt: params.tokenExpiresAt ?? null,
        externalAccountId: params.externalAccountId ?? null,
        externalAccountName: params.externalAccountName ?? null,
        metadata: params.metadata ?? {},
      },
      update: {
        userId: params.userId,
        status: params.status ?? AdConnectionStatus.CONNECTED,
        encryptedCredentials,
        scopes: params.scopes ?? [],
        tokenExpiresAt: params.tokenExpiresAt ?? null,
        externalAccountId: params.externalAccountId ?? undefined,
        externalAccountName: params.externalAccountName ?? undefined,
        lastError: null,
        ...(params.metadata !== undefined && { metadata: params.metadata }),
      },
    });
  }

  async clearCredentials(organizationId: string, provider: AdConnectionProvider, userId: string) {
    const existing = await this.prisma.adConnection.findUnique({
      where: { organizationId_provider: { organizationId, provider } },
    });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy tài nguyên');
    }
    await this.prisma.adConnection.update({
      where: { id: existing.id },
      data: {
        userId,
        status: AdConnectionStatus.DISCONNECTED,
        encryptedCredentials: null,
        tokenExpiresAt: null,
        externalAccountId: null,
        externalAccountName: null,
        lastError: null,
      },
    });
    return { ok: true };
  }

  /**
   * Decrypt access/refresh payload for provider call sites inside ad-performance only.
   * Never return to controllers / queue / logs.
   */
  async getDecryptedPayload(
    organizationId: string,
    provider: AdConnectionProvider,
  ): Promise<{
    plaintext: string;
    metadata: Record<string, unknown>;
    tokenExpiresAt: Date | null;
  }> {
    const row = await this.prisma.adConnection.findUnique({
      where: { organizationId_provider: { organizationId, provider } },
    });
    if (!row?.encryptedCredentials) {
      throw new BadRequestException(`Chưa kết nối ${provider}`);
    }
    if (row.tokenExpiresAt && row.tokenExpiresAt.getTime() < Date.now()) {
      await this.prisma.adConnection.update({
        where: { id: row.id },
        data: { status: AdConnectionStatus.TOKEN_EXPIRED },
      });
      throw new BadRequestException('Token đã hết hạn, vui lòng kết nối lại');
    }
    const plaintext = decodeStoredSecret(row.encryptedCredentials, this.getEncryptionKey());
    if (!plaintext) {
      throw new BadRequestException('Không đọc được credential đã lưu');
    }
    return {
      plaintext,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
      tokenExpiresAt: row.tokenExpiresAt,
    };
  }

  async getMetaAccessToken(organizationId: string): Promise<string> {
    try {
      const { plaintext, metadata } = await this.getDecryptedPayload(
        organizationId,
        AdConnectionProvider.META,
      );
      if (metadata.legacyTokenCipher) {
        return plaintext;
      }
      try {
        const parsed = JSON.parse(plaintext) as { accessToken?: string };
        if (parsed.accessToken) return parsed.accessToken;
      } catch {
        /* plain */
      }
      return plaintext;
    } catch (e) {
      // Bootstrap từ MetaAdsMCP / env — chỉ khi org chưa có OAuth token
      const envToken = this.config.get<string>('META_ACCESS_TOKEN')?.trim();
      if (envToken) {
        return envToken;
      }
      throw e;
    }
  }

  /** Ad account bootstrap từ env (META_AD_ACCOUNT_ID) khi org chưa chọn account. */
  getEnvMetaAdAccountId(): string | null {
    const id = this.config.get<string>('META_AD_ACCOUNT_ID')?.trim();
    return id || null;
  }

  async getGoogleRefreshToken(organizationId: string): Promise<string> {
    const { plaintext } = await this.getDecryptedPayload(
      organizationId,
      AdConnectionProvider.GOOGLE,
    );
    try {
      const parsed = JSON.parse(plaintext) as { refreshToken?: string };
      if (parsed.refreshToken?.trim()) return parsed.refreshToken.trim();
    } catch {
      /* plain refresh token legacy */
    }
    if (plaintext.trim()) return plaintext.trim();
    throw new BadRequestException('Chưa có Google refresh token');
  }

  /** Safe audit helper */
  redact(payload: unknown) {
    return redactForAudit(payload);
  }

  private toPublic(
    provider: AdConnectionProvider,
    row?: {
      status: AdConnectionStatus;
      externalAccountName: string | null;
      externalAccountId: string | null;
      lastSyncAt: Date | null;
      lastError: string | null;
      tokenExpiresAt: Date | null;
      encryptedCredentials: string | null;
    },
  ): AdConnectionPublic {
    const status = row?.status ?? AdConnectionStatus.DISCONNECTED;
    return {
      provider,
      status,
      connected: status === AdConnectionStatus.CONNECTED,
      accountName: row?.externalAccountName ?? null,
      externalAccountId: row?.externalAccountId ?? null,
      lastSyncAt: row?.lastSyncAt ?? null,
      lastError: row?.lastError ?? null,
      tokenExpiresAt: row?.tokenExpiresAt ?? null,
      hasCredentials: !!row?.encryptedCredentials,
      credentialSource: 'AdConnection',
    };
  }

  private getEncryptionKey(): string {
    const key = this.config.get<string>('ENCRYPTION_KEY');
    if (!key || key.length < 16) {
      throw new BadRequestException('ENCRYPTION_KEY chưa được cấu hình');
    }
    return key;
  }
}
