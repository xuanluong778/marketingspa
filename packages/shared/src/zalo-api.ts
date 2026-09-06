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

type ZaloOaInfoRaw = {
  error?: number;
  message?: string;
  data?: {
    oa_id?: string | number;
    name?: string;
    avatar?: string;
    description?: string;
  };
  oa_id?: string | number;
  name?: string;
  avatar?: string;
  description?: string;
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
  /** Optional PKCE S256 — omit unless ZALO_OAUTH_PKCE=true (some apps reject challenge as -14003) */
  codeChallenge?: string;
}): string {
  const url = new URL('https://oauth.zaloapp.com/v4/oa/permission');
  url.searchParams.set('app_id', params.appId.trim());
  // URLSearchParams encodes correctly; value must already be the exact registered URI
  url.searchParams.set('redirect_uri', params.redirectUri.trim());
  url.searchParams.set('state', params.state);
  if (params.codeChallenge?.trim()) {
    url.searchParams.set('code_challenge', params.codeChallenge.trim());
    url.searchParams.set('code_challenge_method', 'S256');
  }
  return url.toString();
}

export async function exchangeZaloOaOAuthCode(params: {
  appId: string;
  appSecret: string;
  code: string;
  /** Must match authorize redirect_uri exactly */
  redirectUri: string;
  /** PKCE verifier paired with authorize code_challenge (only when PKCE enabled) */
  codeVerifier?: string;
}): Promise<{ accessToken: string; refreshToken?: string; expiresAt: Date | null }> {
  const body = new URLSearchParams({
    app_id: params.appId.trim(),
    code: params.code.trim(),
    grant_type: 'authorization_code',
    redirect_uri: params.redirectUri.trim(),
  });
  if (params.codeVerifier?.trim()) {
    body.set('code_verifier', params.codeVerifier.trim());
  }
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
    const detail = [data.error != null ? `error=${data.error}` : null, data.message]
      .filter(Boolean)
      .join(' ');
    throw new Error(detail || `Zalo OAuth token exchange failed (${res.status})`);
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
  const raw = (await res.json()) as ZaloOaInfoRaw;
  // Official shape: { error: 0, message: "Success", data: { oa_id, name, ... } }
  const nested = raw.data;
  const oaId = String(nested?.oa_id ?? raw.oa_id ?? '').trim();
  const name = String(nested?.name ?? raw.name ?? '').trim();
  const errCode = raw.error;
  const hasApiError = errCode != null && Number(errCode) !== 0;
  if (!res.ok || hasApiError || !oaId) {
    throw new Error(raw.message ?? `Không lấy được thông tin OA (${res.status})`);
  }
  return {
    oa_id: oaId,
    name: name || oaId,
    avatar: nested?.avatar ?? raw.avatar,
    description: nested?.description ?? raw.description,
  };
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

export type ZaloUserProfile = {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  isFollower?: boolean;
  /** API error code when profile unavailable (permission/tier) */
  errorCode?: number | null;
  errorMessage?: string | null;
};

/**
 * Lấy profile follower theo user_id (OA-scoped).
 * Thử v2 getprofile rồi v3 user/detail. Không log token.
 */
export async function fetchZaloUserProfile(params: {
  accessToken: string;
  userId: string;
}): Promise<ZaloUserProfile> {
  const token = params.accessToken.trim();
  const userId = String(params.userId || '').trim();
  if (!token || !userId) {
    return { userId, displayName: null, avatarUrl: null, errorMessage: 'missing_token_or_user' };
  }

  const tryEndpoints: Array<{ url: string; label: string }> = [
    {
      label: 'v2_getprofile',
      url: `https://openapi.zalo.me/v2.0/oa/getprofile?data=${encodeURIComponent(
        JSON.stringify({ user_id: userId }),
      )}`,
    },
    {
      label: 'v3_user_detail',
      url: `https://openapi.zalo.me/v3.0/oa/user/detail?data=${encodeURIComponent(
        JSON.stringify({ user_id: userId }),
      )}`,
    },
  ];

  let lastError: { code: number | null; message: string | null } = {
    code: null,
    message: null,
  };

  for (const ep of tryEndpoints) {
    try {
      const res = await fetch(ep.url, {
        method: 'GET',
        headers: { access_token: token },
      });
      const raw = (await res.json()) as {
        error?: number;
        message?: string;
        data?: {
          user_id?: string | number;
          display_name?: string;
          user_alias?: string;
          avatar?: string;
          avatars?: Record<string, string>;
          is_follower?: boolean | number | string;
        };
      };
      const errCode = raw.error != null ? Number(raw.error) : null;
      if (!res.ok || (errCode != null && errCode !== 0) || !raw.data) {
        lastError = {
          code: errCode,
          message: raw.message || `http_${res.status}`,
        };
        continue;
      }
      const d = raw.data;
      const displayName =
        String(d.display_name || d.user_alias || '')
          .trim()
          .slice(0, 200) || null;
      const avatarFromMap =
        d.avatars && typeof d.avatars === 'object'
          ? String(d.avatars['240'] || d.avatars['120'] || Object.values(d.avatars)[0] || '').trim()
          : '';
      const avatarUrl = String(d.avatar || avatarFromMap || '')
        .trim()
        .slice(0, 2000) || null;
      const isFollowerRaw = d.is_follower;
      const isFollower =
        isFollowerRaw === true ||
        isFollowerRaw === 1 ||
        isFollowerRaw === '1' ||
        String(isFollowerRaw).toLowerCase() === 'true';
      return {
        userId: String(d.user_id ?? userId),
        displayName,
        avatarUrl,
        isFollower,
        errorCode: 0,
        errorMessage: null,
      };
    } catch (err) {
      lastError = {
        code: null,
        message: err instanceof Error ? err.message : 'fetch_failed',
      };
    }
  }

  return {
    userId,
    displayName: null,
    avatarUrl: null,
    errorCode: lastError.code,
    errorMessage: lastError.message,
  };
}

/** Fallback hiển thị khi không có displayName thật. */
export function formatZaloVisitorFallback(externalUserId: string | null | undefined): string {
  const uid = String(externalUserId || '').trim();
  if (!uid) return 'Khách Zalo';
  const tailLen = uid.length >= 6 ? 6 : Math.max(4, Math.min(6, uid.length));
  const tail = uid.slice(-tailLen);
  return `Khách Zalo • ${tail}`;
}

/**
 * Tên yếu / placeholder — không được ghi đè tên CRM hoặc displayName thật.
 */
export function isWeakZaloDisplayName(name: string | null | undefined): boolean {
  const n = String(name || '').trim();
  if (!n) return true;
  if (/^khách\s*zalo\b/i.test(n)) return true;
  if (/^khách\s*digi\b/i.test(n)) return true;
  if (/^khách\s*messenger\b/i.test(n)) return true;
  if (/^zalo\s*[….\-]/i.test(n)) return true;
  if (/^psid\b/i.test(n)) return true;
  if (/^e2e[_-]/i.test(n)) return true;
  if (/^user[_-]?\d+$/i.test(n)) return true;
  return false;
}

/** Chọn tên tốt hơn: không để fallback/rỗng đè tên CRM. */
export function pickBetterZaloDisplayName(
  current: string | null | undefined,
  incoming: string | null | undefined,
  externalUserId?: string | null,
): string {
  const cur = String(current || '').trim();
  const next = String(incoming || '').trim();
  const curWeak = isWeakZaloDisplayName(cur);
  const nextWeak = isWeakZaloDisplayName(next);
  if (!curWeak && nextWeak) return cur;
  if (!nextWeak) return next.slice(0, 200);
  if (!curWeak) return cur;
  return formatZaloVisitorFallback(externalUserId);
}
