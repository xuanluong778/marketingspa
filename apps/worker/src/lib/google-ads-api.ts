/**
 * Google Ads API client for worker — refresh token from DB only.
 * Never logs tokens; normalizes errors to internal types.
 */

export class GoogleAdsRateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs: number,
  ) {
    super(message);
    this.name = 'GoogleAdsRateLimitError';
  }
}

export class GoogleAdsTokenExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleAdsTokenExpiredError';
  }
}

export class GoogleAdsPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleAdsPermissionError';
  }
}

function apiVersion() {
  return process.env.GOOGLE_ADS_API_VERSION ?? 'v18';
}

function developerToken() {
  const t = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!t) throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN chưa cấu hình');
  return t;
}

function clientId() {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error('GOOGLE_CLIENT_ID chưa cấu hình');
  return id;
}

function clientSecret() {
  const s = process.env.GOOGLE_CLIENT_SECRET;
  if (!s) throw new Error('GOOGLE_CLIENT_SECRET chưa cấu hình');
  return s;
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
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
    if (msg.includes('invalid_grant') || msg.includes('revoked')) {
      throw new GoogleAdsTokenExpiredError('Google refresh token hết hạn hoặc bị thu hồi');
    }
    throw new Error(msg);
  }
  return json.access_token;
}

async function adsSearch(
  accessToken: string,
  customerId: string,
  query: string,
  loginCustomerId: string | null,
  timeoutMs: number,
): Promise<Record<string, unknown>[]> {
  const cid = customerId.replace(/-/g, '');
  const rows: Record<string, unknown>[] = [];
  let pageToken: string | undefined;
  do {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(
        `https://googleads.googleapis.com/${apiVersion()}/customers/${cid}/googleAds:search`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            'developer-token': developerToken(),
            ...(loginCustomerId
              ? { 'login-customer-id': loginCustomerId.replace(/-/g, '') }
              : { 'login-customer-id': cid }),
          },
          body: JSON.stringify({ query, ...(pageToken ? { pageToken } : {}) }),
          signal: controller.signal,
        },
      );
      const retryAfter = res.headers.get('retry-after');
      const body = (await res.json()) as {
        results?: Record<string, unknown>[];
        nextPageToken?: string;
        error?: { message?: string; status?: string };
      };
      if (!res.ok || body.error) {
        throwNormalized(res.status, body, retryAfter);
      }
      if (body.results?.length) rows.push(...body.results);
      pageToken = body.nextPageToken;
    } finally {
      clearTimeout(timer);
    }
  } while (pageToken);
  return rows;
}

function throwNormalized(
  status: number,
  body: { error?: { message?: string; status?: string } },
  retryAfterHeader: string | null,
): never {
  const statusStr = body.error?.status ?? '';
  const msg = (body.error?.message ?? `Google Ads error (${status})`).slice(0, 400);
  if (status === 429 || statusStr === 'RESOURCE_EXHAUSTED') {
    const retryAfterMs = retryAfterHeader
      ? Math.max(1_000, Number(retryAfterHeader) * 1000 || 30_000)
      : 30_000;
    throw new GoogleAdsRateLimitError('Google Ads rate limit', retryAfterMs);
  }
  if (status === 401 || statusStr === 'UNAUTHENTICATED') {
    throw new GoogleAdsTokenExpiredError('Google Ads token hết hạn');
  }
  if (status === 403 || statusStr === 'PERMISSION_DENIED') {
    throw new GoogleAdsPermissionError('Thiếu quyền Google Ads');
  }
  throw new Error(msg);
}

export async function fetchGoogleCampaigns(
  accessToken: string,
  customerId: string,
  loginCustomerId: string | null,
  timeoutMs: number,
) {
  return adsSearch(
    accessToken,
    customerId,
    `SELECT campaign.id, campaign.name, campaign.status, campaign.start_date, campaign.end_date, campaign_budget.amount_micros FROM campaign WHERE campaign.status != 'REMOVED'`,
    loginCustomerId,
    timeoutMs,
  );
}

export async function fetchGoogleAdGroups(
  accessToken: string,
  customerId: string,
  loginCustomerId: string | null,
  timeoutMs: number,
) {
  return adsSearch(
    accessToken,
    customerId,
    `SELECT ad_group.id, ad_group.name, ad_group.status, campaign.id FROM ad_group WHERE ad_group.status != 'REMOVED'`,
    loginCustomerId,
    timeoutMs,
  );
}

export async function fetchGoogleAds(
  accessToken: string,
  customerId: string,
  loginCustomerId: string | null,
  timeoutMs: number,
) {
  return adsSearch(
    accessToken,
    customerId,
    `SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.status, ad_group.id, campaign.id FROM ad_group_ad WHERE ad_group_ad.status != 'REMOVED'`,
    loginCustomerId,
    timeoutMs,
  );
}

export async function fetchGoogleDailyMetrics(
  accessToken: string,
  customerId: string,
  loginCustomerId: string | null,
  dateFrom: string,
  dateTo: string,
  timeoutMs: number,
) {
  return adsSearch(
    accessToken,
    customerId,
    `SELECT campaign.id, campaign.name, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.ctr, metrics.average_cpc FROM campaign WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'`,
    loginCustomerId,
    timeoutMs,
  );
}

export async function fetchGoogleCustomerDetail(
  accessToken: string,
  customerId: string,
  loginCustomerId: string | null,
  timeoutMs: number,
) {
  const rows = await adsSearch(
    accessToken,
    customerId,
    `SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1`,
    loginCustomerId,
    timeoutMs,
  );
  return rows[0]?.customer as
    | {
        id?: string;
        descriptiveName?: string;
        currencyCode?: string;
        timeZone?: string;
      }
    | undefined;
}
