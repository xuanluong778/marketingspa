import type { IntegrationProvider } from '@marketingspa/database';

export interface ConnectorConnectResult {
  success: boolean;
  message: string;
  externalAccountId?: string;
}

export interface ConnectorTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
}

export interface ConnectorCampaign {
  id: string;
  name: string;
  status: string;
  spend?: number;
  impressions?: number;
}

export interface ConnectorDailyStat {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

export interface ConnectorSendMessagePayload {
  to: string;
  subject?: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export interface ConnectorSendMessageResult {
  success: boolean;
  messageId?: string;
  message: string;
}

export interface MarketingConnector {
  readonly provider: IntegrationProvider;
  connect(credentials: Record<string, string>): Promise<ConnectorConnectResult>;
  testConnection(): Promise<ConnectorTestResult>;
  fetchCampaigns(): Promise<ConnectorCampaign[]>;
  fetchDailyStats(from: Date, to: Date): Promise<ConnectorDailyStat[]>;
  sendMessage(payload: ConnectorSendMessagePayload): Promise<ConnectorSendMessageResult>;
}
