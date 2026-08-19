export type ZaloOAuthTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: string | number;
  error?: number;
  message?: string;
};

export type ZaloOaInfo = {
  oa_id: string;
  name: string;
  avatar?: string;
  description?: string;
  error?: number;
  message?: string;
};

export type ZaloZbsTemplateItem = {
  template_id: string;
  template_name: string;
  status: string;
  preview_text?: string;
  list_params?: Array<{ name: string; type?: string; require?: boolean }>;
  price?: number;
};

export type ZaloZbsTemplateListResponse = {
  data?: ZaloZbsTemplateItem[];
  error?: number;
  message?: string;
};

export type ZaloQuotaInfo = {
  dailyQuota?: number;
  remainingQuota?: number;
  totalQuota?: number;
};

function parseExpiresIn(raw: string | number | undefined): Date | null {
  if (raw == null || raw === '') return null;
  const sec = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(sec) || sec <= 0) return null;
  return new Date(Date.now() + sec * 1000);
}

export function buildZaloOaOAuthUrl(params: {
  appId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL('https://oauth.zaloapp.com/v4/oa/permission');
  url.searchParams.set('app_id', params.appId.trim());
  url.searchParams.set('redirect_uri', params.redirectUri.trim());
  url.searchParams.set('state', params.state);
  return url.toString();
}

export async function exchangeZaloOaOAuthCode(params: {
  appId: string;
  appSecret: string;
  code: string;
}): Promise<{ accessToken: string; refreshToken?: string; expiresAt: Date | null }> {
  const body = new URLSearchParams({
    app_id: params.appId.trim(),
    code: params.code.trim(),
    grant_type: 'authorization_code',
  });
  const res = await fetch('https://oauth.zaloapp.com/v4/oa/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      secret_key: params.appSecret.trim(),
    },
    body,
  });
  const data = (await res.json()) as ZaloOAuthTokenResponse;
  if (!res.ok || data.error || !data.access_token) {
    throw new Error(data.message ?? `Zalo OAuth token exchange failed (${res.status})`);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: parseExpiresIn(data.expires_in),
  };
}

export async function refreshZaloOaAccessToken(params: {
  appId: string;
  appSecret: string;
  refreshToken: string;
}): Promise<{ accessToken: string; refreshToken?: string; expiresAt: Date | null }> {
  const body = new URLSearchParams({
    app_id: params.appId.trim(),
    refresh_token: params.refreshToken.trim(),
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth.zaloapp.com/v4/oa/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      secret_key: params.appSecret.trim(),
    },
    body,
  });
  const data = (await res.json()) as ZaloOAuthTokenResponse;
  if (!res.ok || data.error || !data.access_token) {
    throw new Error(data.message ?? `Zalo refresh token failed (${res.status})`);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? params.refreshToken,
    expiresAt: parseExpiresIn(data.expires_in),
  };
}

export async function fetchZaloOaInfo(accessToken: string): Promise<ZaloOaInfo> {
  const res = await fetch('https://openapi.zalo.me/v2.0/oa/getoa', {
    headers: { access_token: accessToken.trim() },
  });
  const data = (await res.json()) as ZaloOaInfo;
  if (!res.ok || data.error || !data.oa_id) {
    throw new Error(data.message ?? `Không lấy được thông tin OA (${res.status})`);
  }
  return data;
}

export async function listZaloZbsTemplates(params: {
  accessToken: string;
  offset?: number;
  limit?: number;
}): Promise<ZaloZbsTemplateItem[]> {
  const url = new URL('https://business.openapi.zalo.me/template/all');
  url.searchParams.set('offset', String(params.offset ?? 0));
  url.searchParams.set('limit', String(params.limit ?? 100));
  const res = await fetch(url.toString(), {
    headers: { access_token: params.accessToken.trim() },
  });
  const data = (await res.json()) as ZaloZbsTemplateListResponse;
  if (!res.ok || data.error) {
    throw new Error(data.message ?? `Đồng bộ template ZBS thất bại (${res.status})`);
  }
  return data.data ?? [];
}

export function mapZaloTemplateApprovalStatus(status: string): 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' {
  const s = status.trim().toUpperCase();
  if (s.includes('APPROV') || s === 'ENABLE' || s === 'ACTIVE') return 'APPROVED';
  if (s.includes('REJECT') || s === 'DISABLE') return 'REJECTED';
  if (s.includes('PEND') || s.includes('REVIEW')) return 'PENDING';
  return 'DRAFT';
}

export function extractZbsTemplateVariables(
  item: ZaloZbsTemplateItem,
): Array<{ key: string; label: string }> {
  const vars: Array<{ key: string; label: string }> = [];
  for (const p of item.list_params ?? []) {
    const key = String(p.name || '').trim();
    if (!key) continue;
    vars.push({ key, label: key });
  }
  return vars;
}
