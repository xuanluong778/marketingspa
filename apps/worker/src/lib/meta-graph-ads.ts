/**
 * Meta Graph client for Ads SaaS worker.
 * - User access token: Authorization Bearer only (never query string)
 * - Never reads Fanpage env page credentials
 * - Pagination, rate limit, Retry-After, token expired, permission errors
 */

export class MetaRateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs: number,
  ) {
    super(message);
    this.name = 'MetaRateLimitError';
  }
}

export class MetaTokenExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetaTokenExpiredError';
  }
}

export class MetaPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetaPermissionError';
  }
}

function assertAdsTokenSource() {
  // Ads SaaS must receive decrypted AdConnection user token from caller only.
  // Fanpage env credentials are intentionally never read here.
}

function classifyMetaError(
  status: number,
  body: { error?: { message?: string; code?: number; type?: string; error_subcode?: number } },
  retryAfterHeader: string | null,
): never {
  const msg = body.error?.message ?? `Meta API error (${status})`;
  const code = body.error?.code;
  const sub = body.error?.error_subcode;
  const lower = msg.toLowerCase();

  if (status === 429 || code === 4 || code === 17 || code === 32 || code === 613) {
    const retryAfterMs = retryAfterHeader
      ? Math.max(1_000, Number(retryAfterHeader) * 1000 || 30_000)
      : 30_000;
    throw new MetaRateLimitError(msg, retryAfterMs);
  }

  if (
    code === 190 ||
    sub === 463 ||
    sub === 467 ||
    lower.includes('session has expired') ||
    lower.includes('error validating access token') ||
    lower.includes('invalid oauth') ||
    lower.includes('token has expired')
  ) {
    throw new MetaTokenExpiredError(msg);
  }

  if (
    code === 10 ||
    code === 200 ||
    code === 294 ||
    lower.includes('permission') ||
    lower.includes('(#100)') ||
    lower.includes('does not have permission') ||
    lower.includes('ads_management') ||
    lower.includes('ads_read')
  ) {
    throw new MetaPermissionError(msg);
  }

  throw new Error(msg);
}

export async function metaGetJson<T>(
  url: string,
  accessToken: string,
  timeoutMs: number,
): Promise<T> {
  assertAdsTokenSource();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      signal: controller.signal,
    });

    const retryAfterHeader = res.headers.get('retry-after');
    const body = (await res.json()) as T & {
      error?: { message: string; code?: number; type?: string; error_subcode?: number };
    };

    if (!res.ok || body.error) {
      classifyMetaError(res.status, body, retryAfterHeader);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/** Follow paging.next until exhausted (cap pages to avoid runaway). */
export async function metaGetAllPages<T>(
  initialUrl: string,
  accessToken: string,
  timeoutMs: number,
  maxPages = 50,
): Promise<T[]> {
  const items: T[] = [];
  let url: string | null = initialUrl;
  let pages = 0;
  while (url && pages < maxPages) {
    pages += 1;
    const pageBody: { data?: T[]; paging?: { next?: string } } = await metaGetJson(
      url,
      accessToken,
      timeoutMs,
    );
    if (pageBody.data?.length) items.push(...pageBody.data);
    url = pageBody.paging?.next ?? null;
  }
  return items;
}

function actId(adAccountId: string): string {
  return adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
}

function apiVersion(): string {
  return process.env.META_API_VERSION ?? 'v21.0';
}

const INSIGHT_FIELDS = [
  'campaign_id',
  'campaign_name',
  'adset_id',
  'adset_name',
  'ad_id',
  'ad_name',
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
  'date_start',
  'date_stop',
].join(',');

export type MetaAdAccountDetail = {
  id: string;
  account_id: string;
  name: string;
  currency?: string;
  account_status?: number;
  timezone_name?: string;
};

export type MetaCampaignNode = {
  id: string;
  name: string;
  status?: string;
  effective_status?: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
};

export type MetaAdSetNode = {
  id: string;
  name: string;
  status?: string;
  effective_status?: string;
  campaign_id?: string;
};

export type MetaAdNode = {
  id: string;
  name: string;
  status?: string;
  effective_status?: string;
  campaign_id?: string;
  adset_id?: string;
};

export async function fetchMetaAdAccount(
  accessToken: string,
  adAccountId: string,
  timeoutMs: number,
): Promise<MetaAdAccountDetail> {
  const id = actId(adAccountId);
  return metaGetJson<MetaAdAccountDetail>(
    `https://graph.facebook.com/${apiVersion()}/${id}?fields=id,account_id,name,currency,account_status,timezone_name`,
    accessToken,
    timeoutMs,
  );
}

export async function fetchMetaCampaigns(
  accessToken: string,
  adAccountId: string,
  timeoutMs: number,
  campaignId?: string,
): Promise<MetaCampaignNode[]> {
  const id = actId(adAccountId);
  const fields =
    'id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time';
  if (campaignId) {
    const one = await metaGetJson<MetaCampaignNode>(
      `https://graph.facebook.com/${apiVersion()}/${campaignId}?fields=${fields}`,
      accessToken,
      timeoutMs,
    );
    return [one];
  }
  return metaGetAllPages<MetaCampaignNode>(
    `https://graph.facebook.com/${apiVersion()}/${id}/campaigns?fields=${fields}&limit=100`,
    accessToken,
    timeoutMs,
  );
}

export async function fetchMetaAdSets(
  accessToken: string,
  adAccountId: string,
  timeoutMs: number,
  campaignId?: string,
): Promise<MetaAdSetNode[]> {
  const id = actId(adAccountId);
  const fields = 'id,name,status,effective_status,campaign_id';
  const filtering = campaignId
    ? `&filtering=${encodeURIComponent(
        JSON.stringify([{ field: 'campaign.id', operator: 'EQUAL', value: campaignId }]),
      )}`
    : '';
  return metaGetAllPages<MetaAdSetNode>(
    `https://graph.facebook.com/${apiVersion()}/${id}/adsets?fields=${fields}&limit=100${filtering}`,
    accessToken,
    timeoutMs,
  );
}

export async function fetchMetaAds(
  accessToken: string,
  adAccountId: string,
  timeoutMs: number,
  campaignId?: string,
): Promise<MetaAdNode[]> {
  const id = actId(adAccountId);
  const fields = 'id,name,status,effective_status,campaign_id,adset_id';
  const filtering = campaignId
    ? `&filtering=${encodeURIComponent(
        JSON.stringify([{ field: 'campaign.id', operator: 'EQUAL', value: campaignId }]),
      )}`
    : '';
  return metaGetAllPages<MetaAdNode>(
    `https://graph.facebook.com/${apiVersion()}/${id}/ads?fields=${fields}&limit=100${filtering}`,
    accessToken,
    timeoutMs,
  );
}

/** Campaign-level insights for whole range (AI snapshot compatibility). */
export async function fetchMetaCampaignInsights(params: {
  accessToken: string;
  adAccountId: string;
  dateFrom: string;
  dateTo: string;
  campaignId?: string;
  timeoutMs: number;
}) {
  const version = apiVersion();
  const id = actId(params.adAccountId);
  const search = new URLSearchParams({
    level: 'campaign',
    fields: INSIGHT_FIELDS,
    time_range: JSON.stringify({ since: params.dateFrom, until: params.dateTo }),
    limit: '200',
  });
  if (params.campaignId) {
    search.set(
      'filtering',
      JSON.stringify([{ field: 'campaign.id', operator: 'EQUAL', value: params.campaignId }]),
    );
  }
  return metaGetAllPages<Record<string, unknown>>(
    `https://graph.facebook.com/${version}/${id}/insights?${search.toString()}`,
    params.accessToken,
    params.timeoutMs,
  );
}

/** Daily campaign metrics (time_increment=1). */
export async function fetchMetaDailyCampaignInsights(params: {
  accessToken: string;
  adAccountId: string;
  dateFrom: string;
  dateTo: string;
  campaignId?: string;
  timeoutMs: number;
}) {
  const version = apiVersion();
  const id = actId(params.adAccountId);
  const search = new URLSearchParams({
    level: 'campaign',
    fields: INSIGHT_FIELDS,
    time_range: JSON.stringify({ since: params.dateFrom, until: params.dateTo }),
    time_increment: '1',
    limit: '200',
  });
  if (params.campaignId) {
    search.set(
      'filtering',
      JSON.stringify([{ field: 'campaign.id', operator: 'EQUAL', value: params.campaignId }]),
    );
  }
  return metaGetAllPages<Record<string, unknown>>(
    `https://graph.facebook.com/${version}/${id}/insights?${search.toString()}`,
    params.accessToken,
    params.timeoutMs,
  );
}

async function metaPostJson(
  url: string,
  accessToken: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  assertAdsTokenSource();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const retryAfterHeader = res.headers.get('retry-after');
    const body = (await res.json()) as Record<string, unknown> & {
      error?: { message?: string; code?: number; type?: string; error_subcode?: number };
    };
    if (!res.ok || body.error) {
      classifyMetaError(res.status, body, retryAfterHeader);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export async function metaUpdateCampaignStatus(
  accessToken: string,
  campaignId: string,
  active: boolean,
  timeoutMs: number,
): Promise<void> {
  await metaPostJson(
    `https://graph.facebook.com/${apiVersion()}/${campaignId}`,
    accessToken,
    { status: active ? 'ACTIVE' : 'PAUSED' },
    timeoutMs,
  );
}

export async function metaUpdateDailyBudget(
  accessToken: string,
  objectId: string,
  dailyBudgetMinor: number,
  timeoutMs: number,
): Promise<void> {
  await metaPostJson(
    `https://graph.facebook.com/${apiVersion()}/${objectId}`,
    accessToken,
    { daily_budget: String(Math.round(dailyBudgetMinor)) },
    timeoutMs,
  );
}

export async function metaListCampaignAdSets(
  accessToken: string,
  campaignId: string,
  timeoutMs: number,
): Promise<Array<{ id: string; daily_budget?: string }>> {
  return metaGetAllPages(
    `https://graph.facebook.com/${apiVersion()}/${campaignId}/adsets?fields=id,daily_budget&limit=50`,
    accessToken,
    timeoutMs,
  );
}
