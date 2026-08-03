import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MetaTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

export interface MetaAdAccount {
  id: string;
  account_id: string;
  name: string;
  currency?: string;
  account_status?: number;
}

export interface MetaAction {
  action_type: string;
  value: string;
}

export interface MetaCampaignInsight {
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  cpm?: string;
  cpc?: string;
  ctr?: string;
  clicks?: string;
  actions?: MetaAction[];
  cost_per_action_type?: MetaAction[];
  purchase_roas?: MetaAction[];
  action_values?: MetaAction[];
  objective?: string;
}

@Injectable()
export class MetaGraphApiService {
  private readonly logger = new Logger(MetaGraphApiService.name);

  constructor(private readonly config: ConfigService) {}

  get apiVersion(): string {
    return this.config.get<string>('META_API_VERSION') ?? 'v21.0';
  }

  get appId(): string {
    const id = this.config.get<string>('META_APP_ID');
    if (!id) throw new Error('META_APP_ID chưa cấu hình');
    return id;
  }

  get appSecret(): string {
    const secret = this.config.get<string>('META_APP_SECRET');
    if (!secret) throw new Error('META_APP_SECRET chưa cấu hình');
    return secret;
  }

  get redirectUri(): string {
    return (
      this.config.get<string>('META_REDIRECT_URI') ??
      `${this.config.get<string>('API_URL') ?? 'http://localhost:4000'}/api/v1/ad-performance/facebook/oauth/callback`
    );
  }

  getOAuthScopes(): string[] {
    return ['ads_read', 'pages_read_engagement'];
  }

  buildOAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.redirectUri,
      state,
      scope: this.getOAuthScopes().join(','),
      response_type: 'code',
    });
    return `https://www.facebook.com/${this.apiVersion}/dialog/oauth?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<MetaTokenResponse> {
    const params = new URLSearchParams({
      client_id: this.appId,
      client_secret: this.appSecret,
      redirect_uri: this.redirectUri,
      code,
    });
    return this.getJson<MetaTokenResponse>(
      `https://graph.facebook.com/${this.apiVersion}/oauth/access_token?${params.toString()}`,
    );
  }

  async exchangeForLongLivedToken(shortLivedToken: string): Promise<MetaTokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: this.appId,
      client_secret: this.appSecret,
      fb_exchange_token: shortLivedToken,
    });
    return this.getJson<MetaTokenResponse>(
      `https://graph.facebook.com/${this.apiVersion}/oauth/access_token?${params.toString()}`,
    );
  }

  async getMe(accessToken: string): Promise<{ id: string; name?: string }> {
    return this.getJson(`https://graph.facebook.com/${this.apiVersion}/me`, accessToken);
  }

  async getAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
    const data = await this.getJson<{ data: MetaAdAccount[] }>(
      `https://graph.facebook.com/${this.apiVersion}/me/adaccounts?fields=id,account_id,name,currency,account_status&limit=100`,
      accessToken,
    );
    return data.data ?? [];
  }

  async getCampaignInsights(
    accessToken: string,
    adAccountId: string,
    dateFrom: string,
    dateTo: string,
    campaignId?: string,
  ): Promise<MetaCampaignInsight[]> {
    const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
    const fields = [
      'campaign_id',
      'campaign_name',
      'objective',
      'spend',
      'impressions',
      'reach',
      'frequency',
      'cpm',
      'cpc',
      'ctr',
      'clicks',
      'actions',
      'cost_per_action_type',
      'purchase_roas',
      'action_values',
    ].join(',');

    const timeRange = JSON.stringify({ since: dateFrom, until: dateTo });
    const params = new URLSearchParams({
      level: 'campaign',
      fields,
      time_range: timeRange,
      limit: '500',
    });

    if (campaignId) {
      params.set(
        'filtering',
        JSON.stringify([{ field: 'campaign.id', operator: 'EQUAL', value: campaignId }]),
      );
    }

    const url = `https://graph.facebook.com/${this.apiVersion}/${actId}/insights?${params.toString()}`;
    const data = await this.getJson<{ data: MetaCampaignInsight[] }>(url, accessToken);
    return data.data ?? [];
  }

  async debugToken(accessToken: string): Promise<{ is_valid: boolean; expires_at?: number }> {
    const params = new URLSearchParams({
      input_token: accessToken,
      access_token: `${this.appId}|${this.appSecret}`,
    });
    const res = await this.getJson<{ data: { is_valid: boolean; expires_at?: number } }>(
      `https://graph.facebook.com/${this.apiVersion}/debug_token?${params.toString()}`,
    );
    return res.data;
  }

  async updateCampaignStatus(
    accessToken: string,
    campaignId: string,
    active: boolean,
  ): Promise<void> {
    const status = active ? 'ACTIVE' : 'PAUSED';
    const url = `https://graph.facebook.com/${this.apiVersion}/${campaignId}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, access_token: accessToken }),
    });
    const body = (await res.json()) as { success?: boolean; error?: { message: string } };
    if (!res.ok || body.error) {
      const msg = body.error?.message ?? `Meta API error (${res.status})`;
      this.logger.warn(`Meta campaign status update failed: ${msg}`);
      throw new Error(msg);
    }
  }

  private async getJson<T>(url: string, accessToken?: string): Promise<T> {
    const fullUrl = accessToken
      ? `${url}${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(accessToken)}`
      : url;

    const res = await fetch(fullUrl);
    const body = (await res.json()) as T & {
      error?: { message: string; code?: number; type?: string };
    };

    if (!res.ok || body.error) {
      const msg = body.error?.message ?? `Meta API error (${res.status})`;
      this.logger.warn(`Meta API request failed: ${msg}`);
      throw new Error(msg);
    }

    return body;
  }
}
