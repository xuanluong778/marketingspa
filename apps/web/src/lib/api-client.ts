import { authStorage } from './auth-storage';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errors?: string[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = authStorage.getRefreshToken();
  if (!refreshToken) return null;

  const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    authStorage.clear();
    return null;
  }

  const data = (await res.json()) as {
    accessToken: string;
    refreshToken: string;
  };
  authStorage.setTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
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

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1${path}`, { ...init, headers });
  } catch {
    throw new ApiError(
      'Không kết nối được API. Kiểm tra server backend đang chạy tại ' + API_URL,
      0,
    );
  }

  // Retry once after refresh on 401
  if (res.status === 401 && auth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(`${API_URL}/api/v1${path}`, { ...init, headers });
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(body.message ?? 'API error', res.status, body.errors);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export { API_URL };
