/**
 * Meta Graph HTTP helpers — usage headers, backoff, không log token.
 */

export type MetaUsageSnapshot = {
  callCount: number;
  totalCputime: number;
  totalTime: number;
  nearLimit: boolean;
  source: 'app' | 'page' | 'business' | 'unknown';
};

export type MetaGraphHttpError = Error & {
  metaError?: {
    message?: string;
    code?: number;
    type?: string;
    error_subcode?: number;
  };
  httpStatus?: number;
  permanent?: boolean;
  rateLimited?: boolean;
  network?: boolean;
  retryAfterMs?: number;
};

const NEAR_LIMIT_PCT = 80;

export function parseMetaUsageHeader(
  raw: string | null | undefined,
  source: MetaUsageSnapshot['source'],
): MetaUsageSnapshot | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const callCount = Number(parsed.call_count ?? parsed.callCount ?? 0) || 0;
    const totalCputime = Number(parsed.total_cputime ?? parsed.totalCputime ?? 0) || 0;
    const totalTime = Number(parsed.total_time ?? parsed.totalTime ?? 0) || 0;
    const nearLimit =
      callCount >= NEAR_LIMIT_PCT ||
      totalCputime >= NEAR_LIMIT_PCT ||
      totalTime >= NEAR_LIMIT_PCT;
    return { callCount, totalCputime, totalTime, nearLimit, source };
  } catch {
    return null;
  }
}

export function readMetaUsageFromHeaders(headers: Headers): MetaUsageSnapshot | null {
  const candidates: Array<[string, MetaUsageSnapshot['source']]> = [
    ['x-app-usage', 'app'],
    ['x-page-usage', 'page'],
    ['x-business-use-case-usage', 'business'],
  ];
  let worst: MetaUsageSnapshot | null = null;
  for (const [name, source] of candidates) {
    const snap = parseMetaUsageHeader(headers.get(name), source);
    if (!snap) continue;
    if (!worst || snap.callCount > worst.callCount || snap.nearLimit) {
      worst = snap;
    }
  }
  return worst;
}

/** Lỗi vĩnh viễn — không retry (permission / token). */
export function isPermanentMetaError(err: {
  message?: string;
  code?: number;
  error_subcode?: number;
}): boolean {
  const code = err.code;
  const sub = err.error_subcode;
  const m = String(err.message ?? '').toLowerCase();
  if (code === 190 || sub === 463 || sub === 467) return true;
  if (code === 10 || code === 200 || code === 294) return true;
  if (
    m.includes('pages_read_engagement') ||
    m.includes('pages_manage_posts') ||
    m.includes('permission') ||
    m.includes('access token') ||
    m.includes('session has expired') ||
    m.includes('invalid oauth')
  ) {
    return true;
  }
  return false;
}

export function isRateLimitMetaError(err: {
  message?: string;
  code?: number;
}): boolean {
  const code = err.code;
  const m = String(err.message ?? '').toLowerCase();
  return (
    code === 4 ||
    code === 17 ||
    code === 32 ||
    code === 613 ||
    m.includes('rate limit') ||
    m.includes('user request limit') ||
    m.includes('too many calls')
  );
}

export function exponentialBackoffMs(attempt: number, baseMs = 400, maxMs = 8_000): number {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt));
  const jitter = Math.floor(Math.random() * Math.min(400, exp * 0.25));
  return exp + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type MetaGraphFetchResult<T> = {
  data: T;
  usage: MetaUsageSnapshot | null;
  status: number;
};

/**
 * GET/POST Graph với:
 * - đọc X-App-Usage / X-Page-Usage / X-Business-Use-Case-Usage
 * - retry tạm thời + jitter; không retry permission/token
 * - không log URL có access_token
 */
export async function metaGraphFetchJson<T>(
  url: string,
  options?: {
    accessToken?: string;
    method?: 'GET' | 'POST';
    body?: string | URLSearchParams | FormData | null;
    headers?: Record<string, string>;
    maxRetries?: number;
    onUsage?: (usage: MetaUsageSnapshot) => void;
    onRetry?: () => void;
    logger?: { warn: (msg: string) => void };
  },
): Promise<MetaGraphFetchResult<T>> {
  const maxRetries = options?.maxRetries ?? 2;
  const method = options?.method ?? 'GET';
  const accessToken = options?.accessToken;

  let fullUrl = url;
  if (accessToken && method === 'GET') {
    fullUrl = `${url}${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(accessToken)}`;
  }

  let lastErr: MetaGraphHttpError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) options?.onRetry?.();
    try {
      const headers: Record<string, string> = { ...(options?.headers ?? {}) };
      let body = options?.body ?? null;
      if (accessToken && method === 'POST') {
        // form body already may include token; don't duplicate in logs
        if (body instanceof URLSearchParams && !body.has('access_token')) {
          body.append('access_token', accessToken);
        }
      }

      const res = await fetch(fullUrl, { method, headers, body });
      const usage = readMetaUsageFromHeaders(res.headers);
      if (usage && options?.onUsage) options.onUsage(usage);

      const retryAfterHeader = res.headers.get('retry-after');
      const retryAfterMs = retryAfterHeader
        ? Number(retryAfterHeader) * 1000 || undefined
        : undefined;

      const json = (await res.json().catch(() => ({}))) as T & {
        error?: {
          message?: string;
          code?: number;
          type?: string;
          error_subcode?: number;
        };
      };

      if (!res.ok || json.error) {
        const metaError = json.error ?? { message: `Meta API error (${res.status})` };
        const permanent = isPermanentMetaError(metaError);
        const rateLimited = isRateLimitMetaError(metaError) || res.status === 429;
        options?.logger?.warn(
          `Meta Graph failed status=${res.status} code=${metaError.code ?? '-'} attempt=${attempt} permanent=${permanent} rateLimited=${rateLimited} msg=${String(metaError.message ?? '').slice(0, 160)}`,
        );

        const err = Object.assign(new Error(String(metaError.message ?? 'Meta API error')), {
          metaError,
          httpStatus: res.status,
          permanent,
          rateLimited,
          retryAfterMs,
        }) as MetaGraphHttpError;

        if (permanent || attempt >= maxRetries) throw err;
        if (!rateLimited && res.status < 500 && res.status !== 429) throw err;

        const wait = retryAfterMs ?? exponentialBackoffMs(attempt);
        await sleep(wait);
        lastErr = err;
        continue;
      }

      return { data: json, usage, status: res.status };
    } catch (e) {
      if (e && typeof e === 'object' && 'metaError' in e) throw e;
      const message = e instanceof Error ? e.message : 'network error';
      const network = true;
      const err = Object.assign(new Error(message), {
        network,
        permanent: false,
        rateLimited: false,
      }) as MetaGraphHttpError;
      options?.logger?.warn(
        `Meta Graph network error attempt=${attempt} msg=${message.slice(0, 160)}`,
      );
      if (attempt >= maxRetries) throw err;
      await sleep(exponentialBackoffMs(attempt));
      lastErr = err;
    }
  }

  throw lastErr ?? new Error('Meta Graph request failed');
}

/** Redact Meta secrets from logs, error URLs, and UI-facing messages. */
export function redactMetaSecrets(text: string): string {
  return String(text ?? '')
    .replace(/access_token\s*=\s*[^&\s#]+/gi, 'access_token=[REDACTED]')
    .replace(/(fb_exchange_token|client_secret|app_secret)=[^&\s#]+/gi, '$1=[REDACTED]')
    .replace(/([?&#])(code|state)=([^&#]*)/gi, '$1$2=[REDACTED]')
    .replace(/\b(?:EAAG|EAAD|EAA|EBA|EAAE)[A-Za-z0-9_-]{10,}\b/g, '[meta_token]');
}
