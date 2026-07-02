import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationProvider, IntegrationStatus, Prisma } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { encryptSecret, decryptSecret, maskSecret } from '../common/utils/encryption.util';
import { ALL_INTEGRATION_PROVIDERS, createConnector } from '../marketing/connectors';
import { ConnectIntegrationDto } from './dto/integration.dto';

const PROVIDER_LABELS: Record<IntegrationProvider, string> = {
  [IntegrationProvider.META_ADS]: 'Facebook Ads',
  [IntegrationProvider.GOOGLE_ADS]: 'Google Ads',
  [IntegrationProvider.ZALO_OA]: 'Zalo OA / ZNS',
  [IntegrationProvider.SMS]: 'SMS',
  [IntegrationProvider.EMAIL]: 'Email',
};

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async list(organizationId: string) {
    const existing = await this.prisma.integration.findMany({ where: { organizationId } });
    const byProvider = new Map(existing.map((i) => [i.provider, i]));

    return ALL_INTEGRATION_PROVIDERS.map((provider) => {
      const row = byProvider.get(provider);
      return {
        provider,
        label: PROVIDER_LABELS[provider],
        status: row?.status ?? IntegrationStatus.DISCONNECTED,
        hasCredentials: !!row?.encryptedCredentials,
        maskedHint: row?.metadata
          ? ((row.metadata as Record<string, string>).accountHint ?? null)
          : null,
        lastTestedAt: row?.lastTestedAt ?? null,
        updatedAt: row?.updatedAt ?? null,
      };
    });
  }

  async connect(organizationId: string, provider: IntegrationProvider, dto: ConnectIntegrationDto) {
    const encryptionKey = this.getEncryptionKey();
    const connector = createConnector(provider);
    const connectResult = await connector.connect(dto.credentials);

    if (!connectResult.success) {
      throw new BadRequestException(connectResult.message);
    }

    const encryptedCredentials = encryptSecret(JSON.stringify(dto.credentials), encryptionKey);
    const accountHint = Object.values(dto.credentials).find((v) => v?.trim());
    const metadata = {
      accountHint: accountHint ? maskSecret(accountHint) : undefined,
      externalAccountId: connectResult.externalAccountId,
    };

    const row = await this.prisma.integration.upsert({
      where: { organizationId_provider: { organizationId, provider } },
      create: {
        organizationId,
        provider,
        status: IntegrationStatus.CONNECTED,
        encryptedCredentials,
        metadata: metadata as Prisma.InputJsonValue,
        lastTestedAt: new Date(),
      },
      update: {
        status: IntegrationStatus.CONNECTED,
        encryptedCredentials,
        metadata: metadata as Prisma.InputJsonValue,
        lastTestedAt: new Date(),
      },
    });

    return {
      message: connectResult.message,
      integration: this.toPublic(row),
    };
  }

  async test(organizationId: string, provider: IntegrationProvider) {
    const row = await this.ensureIntegration(organizationId, provider);
    if (!row.encryptedCredentials) {
      throw new BadRequestException('Chưa cấu hình credentials');
    }

    const credentials = JSON.parse(
      decryptSecret(row.encryptedCredentials, this.getEncryptionKey()),
    ) as Record<string, string>;

    const connector = createConnector(provider);
    await connector.connect(credentials);
    const result = await connector.testConnection();

    const status = result.success ? IntegrationStatus.CONNECTED : IntegrationStatus.ERROR;
    const updated = await this.prisma.integration.update({
      where: { id: row.id },
      data: { status, lastTestedAt: new Date() },
    });

    return { ...result, integration: this.toPublic(updated) };
  }

  async disconnect(organizationId: string, provider: IntegrationProvider) {
    const row = await this.ensureIntegration(organizationId, provider);
    const updated = await this.prisma.integration.update({
      where: { id: row.id },
      data: {
        status: IntegrationStatus.DISCONNECTED,
        encryptedCredentials: null,
        metadata: {},
      },
    });
    return { message: 'Đã ngắt kết nối', integration: this.toPublic(updated) };
  }

  /** Placeholder: fetch mock campaigns when connected */
  async fetchCampaigns(organizationId: string, provider: IntegrationProvider) {
    const row = await this.ensureIntegration(organizationId, provider);
    if (row.status !== IntegrationStatus.CONNECTED) {
      return { items: [], message: 'Chưa kết nối' };
    }
    const connector = createConnector(provider);
    const items = await connector.fetchCampaigns();
    return { items, message: '[MOCK] Placeholder campaigns' };
  }

  private async ensureIntegration(organizationId: string, provider: IntegrationProvider) {
    const row = await this.prisma.integration.findUnique({
      where: { organizationId_provider: { organizationId, provider } },
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
      metadata: row.metadata,
      lastTestedAt: row.lastTestedAt,
      updatedAt: row.updatedAt,
    };
  }
}
