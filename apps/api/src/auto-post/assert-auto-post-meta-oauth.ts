/**
 * Fail-fast cấu hình OAuth Auto Post cho MarketingAutoAZ production.
 * Chặn fallback sang SEOAuto / Meta App khác.
 */

export const MARKETINGAUTOAZ_META_APP_ID = '1045516051171576';
/** Login Configuration ID dự kiến trên App MarketingAutoAZ (Meta Dashboard). */
export const MARKETINGAUTOAZ_META_LOGIN_CONFIG_ID = '2006772376877449';
export const MARKETINGAUTOAZ_AUTO_POST_OAUTH_REDIRECT_URI =
  'https://marketingautoaz.com/api/v1/auto-post/facebook/oauth/callback';

const FORBIDDEN_APP_IDS = new Set([
  '1328676135903477', // seoauto social
  '2394051637998153', // chatbotspa
]);

const FORBIDDEN_REDIRECT_HOSTS = new Set(['seoauto.vn', 'www.seoauto.vn']);

export type AutoPostMetaOAuthAssertResult = {
  appId: string;
  loginConfigId: string;
  redirectUri: string;
};

function isMarketingAutoazProduction(getEnv: (key: string) => string | undefined): boolean {
  const appUrl = (getEnv('APP_URL') ?? getEnv('NEXT_PUBLIC_APP_URL') ?? '').toLowerCase();
  const apiUrl = (getEnv('API_URL') ?? getEnv('NEXT_PUBLIC_API_URL') ?? '').toLowerCase();
  const nodeEnv = (getEnv('NODE_ENV') ?? '').toLowerCase();
  const explicitUrls = [appUrl, apiUrl].filter(Boolean);
  if (explicitUrls.length > 0) {
    return explicitUrls.some((value) => {
      const host = safeHostname(value);
      return host === 'marketingautoaz.com' || host === 'www.marketingautoaz.com';
    });
  }
  // Only infer production when no environment URL is available.
  return nodeEnv === 'production';
}

/**
 * Redirect URI Auto Post: chỉ dùng URI production MarketingAutoAZ đã whitelist.
 * Không fallback seoauto relay / META_FACEBOOK_OAUTH_REDIRECT_URI / Ads redirect.
 */
export function resolveAutoPostOAuthRedirectUri(
  getEnv: (key: string) => string | undefined,
): string {
  const dedicated = getEnv('META_AUTO_POST_REDIRECT_URI')?.trim();
  const expected =
    getEnv('META_EXPECTED_OAUTH_REDIRECT_URI')?.trim() ||
    MARKETINGAUTOAZ_AUTO_POST_OAUTH_REDIRECT_URI;

  if (isMarketingAutoazProduction(getEnv)) {
    if (!dedicated) {
      throw new Error(
        'META_AUTO_POST_REDIRECT_URI bắt buộc trên MarketingAutoAZ production ' +
          `(ví dụ ${MARKETINGAUTOAZ_AUTO_POST_OAUTH_REDIRECT_URI}). ` +
          'Không dùng META_FACEBOOK_OAUTH_REDIRECT_URI / seoauto.vn.',
      );
    }
    if (dedicated !== expected) {
      throw new Error(
        `META_AUTO_POST_REDIRECT_URI phải khớp tuyệt đối URI whitelist Meta: ${expected}. ` +
          `Hiện tại: ${dedicated}`,
      );
    }
    return dedicated;
  }

  // Non-production: cho phép dedicated hoặc localhost fallback path
  if (dedicated) return dedicated;
  const apiUrl = (getEnv('API_URL') ?? 'http://localhost:4000').replace(/\/$/, '');
  return `${apiUrl}/api/v1/auto-post/facebook/oauth/callback`;
}

export function assertAutoPostMetaOAuthConfig(
  getEnv: (key: string) => string | undefined,
): AutoPostMetaOAuthAssertResult {
  const appId =
    getEnv('META_APP_ID')?.trim() || getEnv('FACEBOOK_APP_ID')?.trim() || '';
  const loginConfigId =
    getEnv('META_LOGIN_CONFIG_ID')?.trim() ||
    getEnv('FACEBOOK_LOGIN_CONFIG_ID')?.trim() ||
    getEnv('FACEBOOK_CONFIG_ID')?.trim() ||
    '';
  const redirectUri = resolveAutoPostOAuthRedirectUri(getEnv);
  const expectedAppId =
    getEnv('META_EXPECTED_APP_ID')?.trim() || MARKETINGAUTOAZ_META_APP_ID;
  const expectedConfigId =
    getEnv('META_EXPECTED_LOGIN_CONFIG_ID')?.trim() ||
    MARKETINGAUTOAZ_META_LOGIN_CONFIG_ID;

  if (!isMarketingAutoazProduction(getEnv)) {
    const oauthConnection = (getEnv('OAUTH_CONNECTION') ?? '').trim().toLowerCase();
    if (['0', 'false', 'off', 'no'].includes(oauthConnection)) {
      // Dev/staging may boot without Meta credentials when OAuth is explicitly disabled.
      return { appId, loginConfigId, redirectUri };
    }
    if (!appId) throw new Error('META_APP_ID / FACEBOOK_APP_ID chưa cấu hình');
    if (!loginConfigId) {
      throw new Error('META_LOGIN_CONFIG_ID bắt buộc cho Facebook Login for Business');
    }
    return { appId, loginConfigId, redirectUri };
  }

  if (!appId) {
    throw new Error('META_APP_ID chưa cấu hình cho MarketingAutoAZ production');
  }
  if (appId !== expectedAppId) {
    throw new Error(
      `META_APP_ID sai môi trường MarketingAutoAZ. Bắt buộc ${expectedAppId}, hiện tại ${appId}. ` +
        'Không dùng App SEOAuto / chatbotspa.',
    );
  }
  if (FORBIDDEN_APP_IDS.has(appId)) {
    throw new Error(`META_APP_ID ${appId} bị cấm trên MarketingAutoAZ (SEOAuto/chatbotspa).`);
  }

  if (!loginConfigId) {
    throw new Error(
      'META_LOGIN_CONFIG_ID bắt buộc (Facebook Login for Business Configuration ID).',
    );
  }
  if (loginConfigId !== expectedConfigId) {
    throw new Error(
      `META_LOGIN_CONFIG_ID phải là Configuration ID của App MarketingAutoAZ (${expectedConfigId}). ` +
        `Hiện tại: ${loginConfigId}`,
    );
  }

  let host: string;
  try {
    host = new URL(redirectUri).hostname.toLowerCase();
  } catch {
    throw new Error(`META_AUTO_POST_REDIRECT_URI không hợp lệ: ${redirectUri}`);
  }
  if (FORBIDDEN_REDIRECT_HOSTS.has(host)) {
    throw new Error(
      `Redirect OAuth không được trỏ ${host}. Dùng callback MarketingAutoAZ: ` +
        MARKETINGAUTOAZ_AUTO_POST_OAUTH_REDIRECT_URI,
    );
  }
  if (host !== 'marketingautoaz.com' && host !== 'www.marketingautoaz.com') {
    throw new Error(
      `Redirect OAuth domain phải là marketingautoaz.com (hiện: ${host}).`,
    );
  }
  const expectedRedirect =
    getEnv('META_EXPECTED_OAUTH_REDIRECT_URI')?.trim() ||
    MARKETINGAUTOAZ_AUTO_POST_OAUTH_REDIRECT_URI;
  if (redirectUri !== expectedRedirect) {
    throw new Error(
      `Redirect URI phải khớp whitelist Meta: ${expectedRedirect}. Hiện: ${redirectUri}`,
    );
  }

  // Auto Post OAuth đã dùng META_AUTO_POST_REDIRECT_URI ở trên. Biến legacy
  // META_FACEBOOK_OAUTH_REDIRECT_URI có thể bị inherit từ PM2 daemon (host khác) —
  // chỉ cảnh báo, không brick toàn bộ API (Content Studio / industries).
  const relay = getEnv('META_FACEBOOK_OAUTH_REDIRECT_URI')?.trim() ?? '';
  if (relay && FORBIDDEN_REDIRECT_HOSTS.has(safeHostname(relay))) {
    console.warn(
      '[assertAutoPostMetaOAuthConfig] META_FACEBOOK_OAUTH_REDIRECT_URI trỏ domain cấm — ' +
        'bỏ qua vì META_AUTO_POST_REDIRECT_URI đã hợp lệ. Hãy unset biến thừa trên PM2 daemon.',
    );
  }

  const secret =
    getEnv('META_APP_SECRET')?.trim() || getEnv('FACEBOOK_APP_SECRET')?.trim() || '';
  if (!secret) {
    throw new Error(
      'META_APP_SECRET bắt buộc và phải thuộc App MarketingAutoAZ ' +
        `(${expectedAppId}) — không dùng secret SEOAuto.`,
    );
  }

  return { appId, loginConfigId, redirectUri };
}

function safeHostname(uri: string): string {
  try {
    return new URL(uri).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** Graph verify: app access token phải resolve đúng App ID (không in secret). */
export async function assertMetaAppSecretMatchesAppId(input: {
  appId: string;
  appSecret: string;
  apiVersion?: string;
}): Promise<void> {
  const version = input.apiVersion ?? 'v21.0';
  const url = `https://graph.facebook.com/${version}/app?access_token=${encodeURIComponent(
    `${input.appId}|${input.appSecret}`,
  )}`;
  const res = await fetch(url);
  const body = (await res.json().catch(() => ({}))) as {
    id?: string;
    name?: string;
    error?: { message?: string };
  };
  if (!res.ok || body.error || body.id !== input.appId) {
    throw new Error(
      `META_APP_SECRET không khớp META_APP_ID ${input.appId} ` +
        `(Graph: ${body.error?.message ?? `id=${body.id ?? 'n/a'}`}). ` +
        'Lấy App Secret đúng từ Meta Developer → App MarketingAutoAZ.',
    );
  }
}
