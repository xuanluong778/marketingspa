import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationProvider, IntegrationStatus, Prisma } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AdConnectionFacade } from '../ad-performance/ad-connection.facade';
import { AdsNormalizedService } from '../ad-performance/ads-normalized.service';
import { encryptSecret, decryptSecret, maskSecret } from '../common/utils/encryption.util';
import {
  assertNoCredentialLeak,
  redactForAudit,
  sanitizePublicMetadata,
} from '../common/utils/token-security.util';
import { ALL_INTEGRATION_PROVIDERS, createConnector, isAdsIntegrationProvider } from '../marketing/connectors';
import { ConnectIntegrationDto } from './dto/integration.dto';

const PROVIDER_LABELS: Record<IntegrationProvider, string> = {
  [IntegrationProvider.META_ADS]: 'Facebook Ads',
  [IntegrationProvider.GOOGLE_ADS]: 'Google Ads',
  [IntegrationProvider.ZALO_OA]: 'Zalo OA / ZNS',
  [IntegrationProvider.SMS]: 'SMS',
  [IntegrationProvider.EMAIL]: 'Email',
};

/**
 * Integrations: kênh messaging giữ credential riêng.
 * META_ADS / GOOGLE_ADS chỉ facade → AdConnection (ad-performance) — không kho token riêng.
 */
@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly adConnections: AdConnectionFacade,
    private readonly normalizedAds: AdsNormalizedService,
  ) {}

  async list(organizationId: string) {
    const existing = await this.prisma.integration.findMany({ where: { organizationId } });
    const byProvider = new Map(existing.map((i) => [i.provider, i]));

    const items = await Promise.all(
      ALL_INTEGRATION_PROVIDERS.map(async (provider) => {
        if (isAdsIntegrationProvider(provider)) {
          return this.adConnections.getAdsStatusForIntegrationProvider(
            organizationId,
            provider as 'META_ADS' | 'GOOGLE_ADS',
          );
        }
        const row = byProvider.get(provider);
        return row
          ? this.toPublic(row)
          : {
              provider,
              label: PROVIDER_LABELS[provider],
              status: IntegrationStatus.DISCONNECTED,
              hasCredentials: false,
              maskedHint: null,
              lastTestedAt: null,
              updatedAt: null,
            };
      }),
    );

    assertNoCredentialLeak(items);
    return items;
  }

  async connect(
    organizationId: string,
    provider: IntegrationProvider,
    dto: ConnectIntegrationDto,
    userId?: string,
  ) {
    if (isAdsIntegrationProvider(provider)) {
      throw new BadRequestException(
        'META_ADS/GOOGLE_ADS không lưu credential tại Integrations. Kết nối qua /ads (AdConnection / OAuth).',
      );
    }

    const encryptionKey = this.getEncryptionKey();
    const connector = createConnector(provider);
    const connectResult = await connector.connect(dto.credentials);

    if (!connectResult.success) {
      throw new BadRequestException(connectResult.message);
    }

    const encryptedCredentials = encryptSecret(JSON.stringify(dto.credentials), encryptionKey);
    const accountHint = Object.values(dto.credentials).find((v) => v?.trim());
    const metadata = sanitizePublicMetadata({
      accountHint: accountHint ? maskSecret(accountHint) : undefined,
      externalAccountId: connectResult.externalAccountId
        ? maskSecret(connectResult.externalAccountId)
        : undefined,
    });

    const row = await this.prisma.integration.upsert({
      where: { organizationId_provider: { organizationId, provider } },
      create: {
        organizationId,
        provider,
        status: IntegrationStatus.ACTIVE,
        encryptedCredentials,
        metadata: metadata as Prisma.InputJsonValue,
        lastTestedAt: new Date(),
      },
      update: {
        status: IntegrationStatus.ACTIVE,
        encryptedCredentials,
        metadata: metadata as Prisma.InputJsonValue,
        lastTestedAt: new Date(),
      },
    });

    const integration = this.toPublic(row);
    assertNoCredentialLeak(integration, accountHint);

    await this.audit.log({
      organizationId,
      userId,
      action: 'INTEGRATION_CONNECTED',
      entityType: 'INTEGRATION',
      entityId: row.id,
      metadata: redactForAudit({ provider, status: IntegrationStatus.ACTIVE }) as Prisma.InputJsonValue,
    });

    return {
      message: connectResult.message,
      integration,
    };
  }

  async test(organizationId: string, provider: IntegrationProvider, userId?: string) {
    if (isAdsIntegrationProvider(provider)) {
      const status = await this.adConnections.getAdsStatusForIntegrationProvider(
        organizationId,
        provider as 'META_ADS' | 'GOOGLE_ADS',
      );
      return {
        success: status.hasCredentials && status.status === 'ACTIVE',
        message: status.hasCredentials
          ? 'AdConnection OK (credential tại AdConnection, không phải Integration)'
          : 'Chưa kết nối Ads — mở /ads để OAuth',
        integration: status,
      };
    }

    const row = await this.ensureIntegration(organizationId, provider);
    if (!row.encryptedCredentials) {
      throw new BadRequestException('Chưa cấu hình credentials');
    }

    const credentials = JSON.parse(
      decryptSecret(row.encryptedCredentials, this.getEncryptionKey()),
    ) as Record<string, string>;
    const connector = createConnector(provider);
    const result = await connector.testConnection();
    const nextStatus = this.mapTestStatus(result.message, result.success);

    const updated = await this.prisma.integration.update({
      where: { id: row.id },
      data: { status: nextStatus, lastTestedAt: new Date() },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'INTEGRATION_TESTED',
      entityType: 'INTEGRATION',
      entityId: row.id,
      metadata: redactForAudit({
        provider,
        success: result.success,
        status: nextStatus,
      }) as Prisma.InputJsonValue,
    });

    const integration = this.toPublic(updated);
    assertNoCredentialLeak(integration);
    return { success: result.success, message: result.message, integration };
  }

  async disconnect(organizationId: string, provider: IntegrationProvider, userId?: string) {
    if (isAdsIntegrationProvider(provider)) {
      throw new BadRequestException(
        'Ngắt Ads tại /ads (AdConnection). Integrations không giữ credential Ads.',
      );
    }

    const row = await this.ensureIntegration(organizationId, provider);
    const updated = await this.prisma.integration.update({
      where: { id: row.id },
      data: {
        status: IntegrationStatus.DISCONNECTED,
        encryptedCredentials: null,
        metadata: {},
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'INTEGRATION_DISCONNECTED',
      entityType: 'INTEGRATION',
      entityId: row.id,
      metadata: redactForAudit({ provider }) as Prisma.InputJsonValue,
    });

    return { message: 'Đã ngắt kết nối', integration: this.toPublic(updated) };
  }

  /**
   * Ads: trả metric chuẩn hóa từ ad-performance (không mock).
   * Kênh khác: mock connector (legacy messaging preview).
   */
  async fetchCampaigns(organizationId: string, provider: IntegrationProvider) {
    if (isAdsIntegrationProvider(provider)) {
      // Ads: đọc insight đã chuẩn hóa từ AdConnection sync (Meta/Google) — không mock
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 7);
      const dateFrom = from.toISOString().slice(0, 10);
      const dateTo = to.toISOString().slice(0, 10);
      const platformFilter = provider === IntegrationProvider.GOOGLE_ADS ? 'GOOGLE' : 'META';
      const insights = await this.normalizedAds.listInsights(organizationId, dateFrom, dateTo, {
        page: 1,
        pageSize: 100,
        platform: platformFilter,
      });
      return {
        items: insights.items.map((r) => ({
          id: r.externalCampaignId,
          name: r.campaignName,
          spend: Number(r.spend),
          platform: r.platform,
        })),
        message: 'Nguồn: AdsNormalizedService / AdConnection (không phải Integration credential)',
        source: 'AdsNormalizedService',
      };
    }

    const row = await this.ensureIntegration(organizationId, provider);
    if (row.status !== IntegrationStatus.ACTIVE) {
      return { items: [], message: 'Chưa kết nối' };
    }
    const connector = createConnector(provider);
    const items = await connector.fetchCampaigns();
    return { items, message: '[MOCK] Placeholder campaigns (non-Ads channel)' };
  }

  private mapTestStatus(message: string, success: boolean): IntegrationStatus {
    if (success) return IntegrationStatus.ACTIVE;
    const lower = message.toLowerCase();
    if (lower.includes('expired') || lower.includes('hết hạn')) {
      return IntegrationStatus.EXPIRED;
    }
    if (
      lower.includes('reauth') ||
      lower.includes('unauthorized') ||
      lower.includes('xác thực lại')
    ) {
      return IntegrationStatus.REAUTH_REQUIRED;
    }
    return IntegrationStatus.ERROR;
  }

  private async ensureIntegration(organizationId: string, provider: IntegrationProvider) {
    const row = await this.prisma.integration.findFirst({
      where: { organizationId, provider },
    });
    if (!row) {
      throw new NotFoundException('Integration chưa được cấu hình');
    }
    return row;
  }

  private getEncryptionKey(): string {
    const key = this.config.get<string>('ENCRYPTION_KEY');
    if (!key) {
      throw new BadRequestException('ENCRYPTION_KEY chưa được cấu hình trên server');
    }
    return key;
  }

  private toPublic(row: {
    provider: IntegrationProvider;
    status: IntegrationStatus;
    metadata: unknown;
    lastTestedAt: Date | null;
    updatedAt: Date;
    encryptedCredentials: string | null;
  }) {
    return {
      provider: row.provider,
      label: PROVIDER_LABELS[row.provider],
      status: row.status,
      hasCredentials: !!row.encryptedCredentials,
      maskedHint:
        row.metadata && typeof row.metadata === 'object'
          ? ((row.metadata as Record<string, string>).accountHint ?? null)
          : null,
      metadata: sanitizePublicMetadata(row.metadata),
      lastTestedAt: row.lastTestedAt,
      updatedAt: row.updatedAt,
    };
  }
}
