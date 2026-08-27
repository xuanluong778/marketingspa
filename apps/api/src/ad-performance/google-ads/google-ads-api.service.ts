import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  formatGoogleAdsLogLine,
  formatGoogleAdsUserMessage,
  googleAdsLoginHeaders,
  isGoogleAdsInvalidGrant,
  isGoogleAdsTwoFactorMessage,
  normalizeGoogleCustomerId,
  parseGoogleAdsErrorResponse,
  parseListAccessibleCustomerIds,
  type GoogleAdsParsedError,
} from '@marketingspa/shared';
import { resolveGoogleAdsRedirectUri } from './assert-google-ads-oauth';

export class GoogleAdsRateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs: number,
    public readonly parsed?: GoogleAdsParsedError,
  ) {
    super(message);
    this.name = 'GoogleAdsRateLimitError';
  }
}

export class GoogleAdsTokenExpiredError extends Error {
  constructor(
    message: string,
    public readonly parsed?: GoogleAdsParsedError,
  ) {
    super(message);
    this.name = 'GoogleAdsTokenExpiredError';
  }
}

export class GoogleAdsTwoFactorError extends Error {
  constructor(
    message: string,
    public readonly parsed?: GoogleAdsParsedError,
  ) {
    super(message);
    this.name = 'GoogleAdsTwoFactorError';
  }
}

export class GoogleAdsPermissionError extends Error {
  constructor(
    message: string,
    public readonly parsed?: GoogleAdsParsedError,
  ) {
    super(message);
    this.name = 'GoogleAdsPermissionError';
  }
}

/** Non-classified Google Ads API failure with structured details for the client. */
export class GoogleAdsRequestError extends Error {
  constructor(
    message: string,
    public readonly parsed: GoogleAdsParsedError,
  ) {
    super(message);
    this.name = 'GoogleAdsRequestError';
  }
}

const ADWORDS_SCOPE = 'https://www.googleapis.com/auth/adwords';

@Injectable()
export class GoogleAdsApiService {
  private readonly logger = new Logger(GoogleAdsApiService.name);

  constructor(private readonly config: ConfigService) {}

  buildOAuthUrl(state: string): string {
    const clientId = this.requireClientId();
    const redirectUri = this.requireRedirectUri();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: ADWORDS_SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
    scope?: string;
  }> {
    const body = new URLSearchParams({
      code,
      client_id: this.requireClientId(),
      client_secret: this.requireClientSecret(),
      redirect_uri: this.requireRedirectUri(),
      grant_type: 'authorization_code',
    });
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body.toString(),
    });
    const json = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !json.access_token) {
      const msg = json.error_description ?? json.error ?? 'google_oauth_exchange_failed';
      this.logger.warn(`Google OAuth exchange failed: ${msg.slice(0, 120)}`);
      throw new BadRequestException('Không đổi được mã OAuth Google Ads');
    }
    const scope = (json.scope ?? '').trim();
    if (scope && !scope.includes('adwords')) {
      this.logger.warn(`Google OAuth missing adwords scope; granted=${scope.slice(0, 200)}`);
      throw new BadRequestException(
        'OAuth thiếu scope Google Ads (adwords). Bấm Kết nối lại Google và chấp nhận quyền Quảng cáo.',
      );
    }
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresIn: json.expires_in,
      scope: scope || ADWORDS_SCOPE,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.requireClientId(),
      client_secret: this.requireClientSecret(),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body.toString(),
    });
    const json = (await res.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !json.access_token) {
      const msg = json.error_description ?? json.error ?? 'oauth_refresh_failed';
      if (isGoogleAdsInvalidGrant(json.error, json.error_description)) {
        throw new GoogleAdsTokenExpiredError('Google refresh token hết hạn hoặc bị thu hồi');
      }
      throw new Error(msg);
    }
    return json.access_token;
  }

  async listAccessibleCustomers(accessToken: string): Promise<string[]> {
    const res = await fetch(
      `https://googleads.googleapis.com/${this.apiVersion()}/customers:listAccessibleCustomers`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'developer-token': this.requireDeveloperToken(),
        },
      },
    );
    const body = await this.parseGoogleJson<{
      resourceNames?: string[];
      error?: { message?: string; status?: string; details?: unknown[] };
    }>(res);
    if (!res.ok || body.error) {
      this.throwNormalized(res.status, body, res.headers);
    }
    return parseListAccessibleCustomerIds(body.resourceNames);
  }

  async getCustomerDetail(
    accessToken: string,
    customerId: string,
    loginCustomerId?: string | null,
  ): Promise<{
    id: string;
    name: string;
    currency: string;
    timezone: string;
    isManager: boolean;
  }> {
    const cid = normalizeGoogleCustomerId(customerId);
    const query =
      'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer LIMIT 1';
    const body = await this.search(accessToken, cid, query, loginCustomerId);
    const customer = body.results?.[0]?.customer as
      | {
          id?: string;
          descriptiveName?: string;
          currencyCode?: string;
          timeZone?: string;
          manager?: boolean;
        }
      | undefined;
    return {
      id: cid,
      name: customer?.descriptiveName?.trim() || cid,
      currency: customer?.currencyCode ?? 'USD',
      timezone: customer?.timeZone ?? 'UTC',
      isManager: Boolean(customer?.manager),
    };
  }

  async listCustomerClients(
    accessToken: string,
    managerCustomerId: string,
  ): Promise<
    Array<{
      customerId: string;
      name: string;
      currency: string;
      timezone: string;
      isManager: boolean;
    }>
  > {
    const mid = normalizeGoogleCustomerId(managerCustomerId);
    const query = [
      'SELECT',
      'customer_client.client_customer,',
      'customer_client.descriptive_name,',
      'customer_client.currency_code,',
      'customer_client.time_zone,',
      'customer_client.manager,',
      'customer_client.status',
      'FROM customer_client',
      "WHERE customer_client.status != 'CANCELED'",
    ].join(' ');
    const body = await this.search(accessToken, mid, query, mid);
    const items: Array<{
      customerId: string;
      name: string;
      currency: string;
      timezone: string;
      isManager: boolean;
    }> = [];
    for (const row of body.results ?? []) {
      const cc = (row as { customerClient?: Record<string, unknown> }).customerClient as
        | {
            clientCustomer?: string;
            descriptiveName?: string;
            currencyCode?: string;
            timeZone?: string;
            manager?: boolean;
          }
        | undefined;
      const id = normalizeGoogleCustomerId(
        String(cc?.clientCustomer ?? '').replace(/^customers\//i, ''),
      );
      if (!id || id === mid) continue;
      items.push({
        customerId: id,
        name: cc?.descriptiveName?.trim() || id,
        currency: cc?.currencyCode ?? 'USD',
        timezone: cc?.timeZone ?? 'UTC',
        isManager: Boolean(cc?.manager),
      });
    }
    return items;
  }

  private async search(
    accessToken: string,
    customerId: string,
    query: string,
    loginCustomerId?: string | null,
  ): Promise<{ results?: Array<Record<string, unknown>>; error?: { message?: string; status?: string } }> {
    const cid = normalizeGoogleCustomerId(customerId);
    const res = await fetch(
      `https://googleads.googleapis.com/${this.apiVersion()}/customers/${cid}/googleAds:search`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'developer-token': this.requireDeveloperToken(),
          ...googleAdsLoginHeaders(cid, loginCustomerId),
        },
        body: JSON.stringify({ query }),
      },
    );
    const body = await this.parseGoogleJson<{
      results?: Array<Record<string, unknown>>;
      error?: { message?: string; status?: string; details?: unknown[] };
    }>(res);
    if (!res.ok || body.error) {
      this.throwNormalized(res.status, body, res.headers);
    }
    return body;
  }

  private async parseGoogleJson<T extends { error?: { message?: string; status?: string } }>(
    res: Response,
  ): Promise<T> {
    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      const requestId = res.headers.get('request-id') ?? res.headers.get('x-request-id');
      this.logger.warn(
        `Google Ads non-JSON response status=${res.status} apiVersion=${this.apiVersion()} requestId=${requestId ?? '-'}`,
      );
      const parsed = parseGoogleAdsErrorResponse({
        httpStatus: res.status,
        body: {
          error: {
            status: res.status === 404 ? 'NOT_FOUND' : 'UNKNOWN',
            message: `Google Ads non-JSON response (${res.status})`,
          },
        },
        requestIdHeader: requestId,
      });
      throw new GoogleAdsRequestError(formatGoogleAdsUserMessage(parsed), parsed);
    }
  }

  private throwNormalized(
    status: number,
    body: { error?: { message?: string; status?: string; details?: unknown[] } },
    headers: Headers,
  ): never {
    const requestIdHeader = headers.get('request-id') ?? headers.get('x-request-id');
    const parsed = parseGoogleAdsErrorResponse({
      httpStatus: status,
      body,
      requestIdHeader,
    });
    this.logger.warn(
      `Google Ads API error ${formatGoogleAdsLogLine(parsed, this.apiVersion())}`,
    );

    const userMsg = formatGoogleAdsUserMessage(parsed);
    if (
      parsed.classification === 'two_factor' ||
      isGoogleAdsTwoFactorMessage(parsed.message) ||
      isGoogleAdsTwoFactorMessage(parsed.errorCode ?? '')
    ) {
      throw new GoogleAdsTwoFactorError(
        'Tài khoản Google Ads yêu cầu xác minh 2 bước — bật 2FA rồi kết nối lại',
        parsed,
      );
    }
    if (parsed.classification === 'rate_limit' || status === 429) {
      const retryAfterMs = (() => {
        const h = headers.get('retry-after');
        return h ? Math.max(1_000, Number(h) * 1000 || 30_000) : 30_000;
      })();
      throw new GoogleAdsRateLimitError('Google Ads rate limit', retryAfterMs, parsed);
    }
    if (parsed.classification === 'auth' || status === 401) {
      throw new GoogleAdsTokenExpiredError('Google Ads token hết hạn — kết nối lại OAuth', parsed);
    }
    if (
      parsed.classification === 'permission' ||
      parsed.classification === 'developer_token' ||
      parsed.classification === 'customer' ||
      status === 403
    ) {
      throw new GoogleAdsPermissionError(userMsg, parsed);
    }
    throw new GoogleAdsRequestError(userMsg, parsed);
  }

  private apiVersion(): string {
    return this.config.get<string>('GOOGLE_ADS_API_VERSION') ?? 'v22';
  }

  private requireClientId(): string {
    const id = this.config.get<string>('GOOGLE_CLIENT_ID')?.trim();
    if (!id) throw new BadRequestException('GOOGLE_CLIENT_ID chưa cấu hình');
    return id;
  }

  private requireClientSecret(): string {
    const s = this.config.get<string>('GOOGLE_CLIENT_SECRET')?.trim();
    if (!s) throw new BadRequestException('GOOGLE_CLIENT_SECRET chưa cấu hình');
    return s;
  }

  private requireDeveloperToken(): string {
    const t = this.config.get<string>('GOOGLE_ADS_DEVELOPER_TOKEN')?.trim();
    if (!t) throw new BadRequestException('GOOGLE_ADS_DEVELOPER_TOKEN chưa cấu hình');
    return t;
  }

  private requireRedirectUri(): string {
    return resolveGoogleAdsRedirectUri((key) => this.config.get<string>(key));
  }
}
