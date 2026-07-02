import { IntegrationProvider } from '@marketingspa/database';
import type {
  ConnectorCampaign,
  ConnectorConnectResult,
  ConnectorDailyStat,
  ConnectorSendMessagePayload,
  ConnectorSendMessageResult,
  ConnectorTestResult,
  MarketingConnector,
} from './marketing-connector.interface';

function mockDelay(ms = 120) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasCredentials(credentials: Record<string, string>) {
  return Object.values(credentials).some((v) => v?.trim());
}

abstract class BaseMockConnector implements MarketingConnector {
  abstract readonly provider: IntegrationProvider;

  async connect(credentials: Record<string, string>): Promise<ConnectorConnectResult> {
    await mockDelay();
    const ok = hasCredentials(credentials);
    return {
      success: ok,
      message: ok
        ? `[MOCK] ${this.provider} connected (placeholder)`
        : `[MOCK] Missing credentials for ${this.provider}`,
      externalAccountId: ok ? `mock-${this.provider.toLowerCase()}-001` : undefined,
    };
  }

  async testConnection(): Promise<ConnectorTestResult> {
    await mockDelay(80);
    return {
      success: true,
      message: `[MOCK] ${this.provider} test connection OK (placeholder)`,
      latencyMs: 80,
    };
  }

  async fetchCampaigns(): Promise<ConnectorCampaign[]> {
    await mockDelay();
    return [
      {
        id: 'mock-camp-1',
        name: `Demo campaign (${this.provider})`,
        status: 'ACTIVE',
        spend: 1500000,
        impressions: 12000,
      },
    ];
  }

  async fetchDailyStats(from: Date, to: Date): Promise<ConnectorDailyStat[]> {
    await mockDelay();
    const days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86400000));
    return Array.from({ length: Math.min(days, 7) }, (_, i) => ({
      date: new Date(from.getTime() + i * 86400000).toISOString().slice(0, 10),
      spend: 200000 + i * 50000,
      impressions: 1000 + i * 200,
      clicks: 50 + i * 10,
      conversions: 3 + i,
    }));
  }

  async sendMessage(payload: ConnectorSendMessagePayload): Promise<ConnectorSendMessageResult> {
    await mockDelay();
    return {
      success: true,
      messageId: `mock-msg-${Date.now()}`,
      message: `[MOCK] Message queued to ${payload.to}`,
    };
  }
}

export class MetaAdsConnector extends BaseMockConnector {
  readonly provider = IntegrationProvider.META_ADS;
}

export class GoogleAdsConnector extends BaseMockConnector {
  readonly provider = IntegrationProvider.GOOGLE_ADS;
}

export class ZaloConnector extends BaseMockConnector {
  readonly provider = IntegrationProvider.ZALO_OA;
}

export class SmsConnector extends BaseMockConnector {
  readonly provider = IntegrationProvider.SMS;
}

export class EmailConnector extends BaseMockConnector {
  readonly provider = IntegrationProvider.EMAIL;
}
