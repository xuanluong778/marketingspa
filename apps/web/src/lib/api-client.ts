import { authStorage } from './auth-storage';
import { getStoredAffiliateRef } from './affiliate-ref';

function resolveApiUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim();
  // Always prefer explicit env (works for both local and prod).
  // When falling back to `window.location.origin`, Next may run on a different port (e.g. 3001),
  // causing calls to hit the Next server instead of the backend API.
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return fromEnv?.replace(/\/$/, '') || 'http://localhost:4000';
}

export function getApiBaseUrl(): string {
  return `${resolveApiUrl()}/api/v1`;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errors?: string[],
    public code?: string,
    public redirectTo?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function throwApiError(res: Response, body: Record<string, unknown>) {
  const message = typeof body.message === 'string' ? body.message : res.statusText || 'API error';
  const err = new ApiError(
    message,
    res.status,
    Array.isArray(body.errors) ? (body.errors as string[]) : undefined,
    typeof body.code === 'string' ? body.code : undefined,
    typeof body.redirectTo === 'string' ? body.redirectTo : undefined,
  );
  // Chặn gọi API trực tiếp khi chưa thanh toán / hết trial → về trang giá
  if (
    typeof window !== 'undefined' &&
    res.status === 403 &&
    (body.code === 'SUBSCRIPTION_REQUIRED' || body.code === 'TRIAL_EXPIRED')
  ) {
    const dest = typeof body.redirectTo === 'string' ? body.redirectTo : '/pricing';
    if (!window.location.pathname.startsWith('/pricing')) {
      const reason = body.code === 'TRIAL_EXPIRED' ? 'trial_expired' : 'subscription_required';
      window.location.replace(`${dest}?reason=${reason}`);
    }
  }
  throw err;
}

/** Single-flight refresh — tránh race nhiều request 401 song song làm hỏng refresh token */
let refreshInFlight: Promise<string | null> | null = null;
/** One hard login redirect per page load */
let loginRedirectScheduled = false;

/** JWT exp trong ≤45s hoặc malformed → refresh trước (tránh 401 ồn console trên /auth/me). */
function accessTokenNeedsRefresh(token: string | null): boolean {
  if (!token) return true;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return true;
    const b64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '='));
    const payload = JSON.parse(json) as { exp?: number };
    if (typeof payload.exp !== 'number') return true;
    return payload.exp * 1000 <= Date.now() + 45_000;
  } catch {
    return true;
  }
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const API_URL = resolveApiUrl();
      const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        // Only clear session when refresh cookie is definitely rejected
        if (res.status === 401 || res.status === 403) {
          authStorage.clear();
        }
        return null;
      }

      const data = (await res.json()) as { accessToken?: string; data?: { accessToken?: string } };
      const token = data.accessToken || data.data?.accessToken || null;
      if (!token) {
        authStorage.clear();
        return null;
      }
      authStorage.setAccessToken(token);
      return token;
    } catch {
      // Network blip — keep access token; do not clear session
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

function scheduleLoginRedirectOnce() {
  if (typeof window === 'undefined') return;
  if (loginRedirectScheduled) return;
  if (window.location.pathname.startsWith('/login')) return;
  loginRedirectScheduled = true;
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.replace(`/login?next=${next}`);
}

function withCredentials(init: RequestInit): RequestInit {
  return { ...init, credentials: 'include' };
}

export async function apiClient<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const { auth = true, ...init } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  };

  let token = auth ? authStorage.getAccessToken() : null;
  // Proactive refresh so /auth/me rarely logs a 401 in the console
  if (auth && accessTokenNeedsRefresh(token)) {
    const refreshed = await refreshAccessToken();
    if (refreshed) token = refreshed;
    else if (!token) {
      scheduleLoginRedirectOnce();
      throw new ApiError('Unauthorized', 401);
    }
  }
  if (auth && token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Gửi mã affiliate đã capture (localStorage/cookie JS) — Nest khóa vào OTP lúc send-otp
  const affiliateRef = getStoredAffiliateRef();
  if (affiliateRef && !headers['X-Affiliate-Ref']) {
    headers['X-Affiliate-Ref'] = affiliateRef;
  }

  const API_URL = resolveApiUrl();
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1${path}`, withCredentials({ ...init, headers }));
  } catch {
    throw new ApiError(
      'Không kết nối được API. Kiểm tra server backend đang chạy tại ' + API_URL,
      0,
    );
  }

  if (res.status === 401 && auth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(`${API_URL}/api/v1${path}`, withCredentials({ ...init, headers }));
    } else {
      scheduleLoginRedirectOnce();
      throw new ApiError('Unauthorized', 401);
    }
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({ message: res.statusText }))) as Record<
      string,
      unknown
    >;
    throwApiError(res, body);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  const token = authStorage.getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const API_URL = resolveApiUrl();
  let res = await fetch(
    `${API_URL}/api/v1${path}`,
    withCredentials({
      method: 'POST',
      headers,
      body: formData,
    }),
  );

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.Authorization = `Bearer ${newToken}`;
      res = await fetch(
        `${API_URL}/api/v1${path}`,
        withCredentials({
          method: 'POST',
          headers,
          body: formData,
        }),
      );
    }
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({ message: res.statusText }))) as Record<
      string,
      unknown
    >;
    throwApiError(res, body);
  }

  return res.json() as Promise<T>;
}

export async function apiDownload(path: string): Promise<{ blob: Blob; filename: string }> {
  const headers: Record<string, string> = {};
  const token = authStorage.getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const API_URL = resolveApiUrl();
  let res = await fetch(`${API_URL}/api/v1${path}`, withCredentials({ headers }));

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.Authorization = `Bearer ${newToken}`;
      res = await fetch(`${API_URL}/api/v1${path}`, withCredentials({ headers }));
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(body.message ?? 'Download failed', res.status, body.errors);
  }

  const disposition = res.headers.get('Content-Disposition') ?? '';
  const star = /filename\*=(?:UTF-8''|utf-8'')([^;]+)/i.exec(disposition);
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  const rawName = star?.[1]?.trim() || plain?.[1]?.trim() || 'download.bin';
  let filename = rawName;
  try {
    filename = decodeURIComponent(rawName);
  } catch {
    filename = rawName;
  }
  const blob = await res.blob();
  return { blob, filename };
}

export { resolveApiUrl as getApiUrl };
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:4000';
