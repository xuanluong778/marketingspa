import { authStorage } from './auth-storage';
import { getStoredAffiliateRef } from './affiliate-ref';

function resolveApiUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (fromEnv && !fromEnv.includes('localhost') && !fromEnv.includes('127.0.0.1')) {
    return fromEnv.replace(/\/$/, '');
  }
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
  const message =
    typeof body.message === 'string' ? body.message : res.statusText || 'API error';
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
    const dest =
      typeof body.redirectTo === 'string' ? body.redirectTo : '/pricing';
    if (!window.location.pathname.startsWith('/pricing')) {
      const reason =
        body.code === 'TRIAL_EXPIRED' ? 'trial_expired' : 'subscription_required';
      window.location.replace(`${dest}?reason=${reason}`);
    }
  }
  throw err;
}

async function refreshAccessToken(): Promise<string | null> {
  const API_URL = resolveApiUrl();
  const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    authStorage.clear();
    return null;
  }

  const data = (await res.json()) as { accessToken: string };
  authStorage.setAccessToken(data.accessToken);
  return data.accessToken;
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

  const token = auth ? authStorage.getAccessToken() : null;
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
    } else if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(`/login?next=${next}`);
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
  let res = await fetch(`${API_URL}/api/v1${path}`, withCredentials({
    method: 'POST',
    headers,
    body: formData,
  }));

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.Authorization = `Bearer ${newToken}`;
      res = await fetch(`${API_URL}/api/v1${path}`, withCredentials({
        method: 'POST',
        headers,
        body: formData,
      }));
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
  const match = /filename="?([^"]+)"?/i.exec(disposition);
  const filename = match?.[1] ?? 'download.bin';
  const blob = await res.blob();
  return { blob, filename };
}

export { resolveApiUrl as getApiUrl };
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:4000';
