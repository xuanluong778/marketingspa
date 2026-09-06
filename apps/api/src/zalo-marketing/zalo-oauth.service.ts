import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import {
  exchangeZaloOaOAuthCode,
  fetchZaloOaInfo,
  refreshZaloOaAccessToken,
} from '@marketingspa/shared';
import { assertEncryptionKeyConfigured } from '../common/utils/assert-encryption-key';

const STATE_TTL_MS = 10 * 60 * 1000;
export const ZALO_OA_OAUTH_COOKIE = 'zalo_oa_oauth';

/** Canonical production callback — must match Zalo Developer Console exactly. */
export const ZALO_OA_OAUTH_CALLBACK_PATH =
  '/api/v1/zalo-marketing/public/oauth/callback';

export const ZALO_OA_OAUTH_CANONICAL_REDIRECT_URI =
  'https://marketingautoaz.com/api/v1/zalo-marketing/public/oauth/callback';

export type ZaloOAuthStatePayload = {
  userId: string;
  organizationId: string;
  returnPath?: string;
  ts: number;
  nonce: string;
  /** PKCE verifier — never log; omitted when PKCE disabled */
  codeVerifier?: string;
};

@Injectable()
export class ZaloOAuthService {
  private readonly logger = new Logger(ZaloOAuthService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.getAppId() && this.getAppSecret() && this.getRedirectUri());
  }

  getAppId(): string {
    return (this.config.get<string>('ZALO_APP_ID') ?? '').trim();
  }

  getAppSecret(): string {
    return (this.config.get<string>('ZALO_APP_SECRET') ?? '').trim();
  }

  /**
   * PKCE optional. Zalo OA console often stores a static Code Challenge;
   * a random per-click challenge (or a huge `state`) is reported as -14003.
   * Default OFF so authorize URL matches working OA links: app_id + redirect_uri only.
   */
  isPkceEnabled(): boolean {
    const raw = (this.config.get<string>('ZALO_OAUTH_PKCE') ?? 'false').trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
  }

  /**
   * Putting CSRF `state` on the Zalo authorize URL is optional.
   * Working OA links (EzyOA / Zalo docs samples) send only app_id + redirect_uri.
   * A 300+ char signed state is a known source of -14003 after Zalo login.
   */
  sendStateQuery(): boolean {
    const raw = (this.config.get<string>('ZALO_OAUTH_SEND_STATE') ?? 'false').trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
  }

  /**
   * Single production redirect_uri source of truth.
   * Prefer ZALO_REDIRECT_URI (alias ZALO_OAUTH_REDIRECT_URI).
   * Production hard-fallback = canonical HTTPS callback (no trailing slash).
   */
  getRedirectUri(): string {
    const explicit = (
      this.config.get<string>('ZALO_REDIRECT_URI') ??
      this.config.get<string>('ZALO_OAUTH_REDIRECT_URI') ??
      ''
    ).trim();
    if (explicit) {
      return this.normalizeRedirectUri(explicit);
    }
    const nodeEnv = (this.config.get<string>('NODE_ENV') ?? '').trim();
    if (nodeEnv === 'production') {
      return ZALO_OA_OAUTH_CANONICAL_REDIRECT_URI;
    }
    const apiBase =
      (this.config.get<string>('API_PUBLIC_URL') ?? '').trim() ||
      (this.config.get<string>('NEXT_PUBLIC_API_URL') ?? '').trim() ||
      'http://localhost:4000';
    return this.normalizeRedirectUri(
      `${apiBase.replace(/\/$/, '')}${ZALO_OA_OAUTH_CALLBACK_PATH}`,
    );
  }

  normalizeRedirectUri(raw: string): string {
    const trimmed = String(raw || '')
      .trim()
      .replace(/^['"]|['"]$/g, '')
      .replace(/[\r\n\t]/g, '');
    if (!trimmed) return '';
    try {
      const u = new URL(trimmed);
      if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
        u.pathname = u.pathname.replace(/\/+$/, '');
      }
      u.hash = '';
      u.search = '';
      return `${u.protocol}//${u.host}${u.pathname}`;
    } catch {
      return trimmed.replace(/\/+$/, '');
    }
  }

  private getEncryptionKey(): string {
    return assertEncryptionKeyConfigured(this.config.get<string>('ENCRYPTION_KEY'));
  }

  private createPkce(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    return { codeVerifier, codeChallenge };
  }

  /**
   * Build authorize query with encodeURIComponent (RFC 3986) — not URLSearchParams
   * (`+` encoding). Endpoint: /v4/oa/permission (OA), NOT /v4/permission (User Login).
   */
  buildAuthorizeUrl(params: {
    appId: string;
    redirectUri: string;
    state?: string;
    codeChallenge?: string;
  }): string {
    const parts = [
      `app_id=${encodeURIComponent(params.appId.trim())}`,
      `redirect_uri=${encodeURIComponent(params.redirectUri.trim())}`,
    ];
    if (params.state?.trim()) {
      parts.push(`state=${encodeURIComponent(params.state.trim())}`);
    }
    if (params.codeChallenge?.trim()) {
      parts.push(`code_challenge=${encodeURIComponent(params.codeChallenge.trim())}`);
      parts.push('code_challenge_method=S256');
    }
    return `https://oauth.zaloapp.com/v4/oa/permission?${parts.join('&')}`;
  }

  signPayload(payload: ZaloOAuthStatePayload): string {
    const raw = JSON.stringify(payload);
    const sig = createHmac('sha256', this.getEncryptionKey()).update(raw).digest('hex');
    return Buffer.from(`${raw}:${sig}`).toString('base64url');
  }

  createPendingSession(params: {
    userId: string;
    organizationId: string;
    returnPath?: string;
  }): {
    state: string;
    url: string;
    redirectUri: string;
    appIdMasked: string;
    cookieValue: string;
    cookieName: string;
  } {
    if (!this.isConfigured()) {
      throw new UnauthorizedException(
        'Chưa cấu hình ZALO_APP_ID / ZALO_APP_SECRET / ZALO_REDIRECT_URI',
      );
    }
    const redirectUri = this.getRedirectUri();
    const appId = this.getAppId();
    const usePkce = this.isPkceEnabled();
    const pkce = usePkce ? this.createPkce() : null;
    const ts = Date.now();
    const nonce = randomBytes(16).toString('hex');
    const payload: ZaloOAuthStatePayload = {
      userId: params.userId,
      organizationId: params.organizationId,
      returnPath: params.returnPath?.trim() || '/zalo-marketing?tab=oa',
      ts,
      nonce,
      ...(pkce ? { codeVerifier: pkce.codeVerifier } : {}),
    };
    const token = this.signPayload(payload);
    const sendState = this.sendStateQuery();
    const url = this.buildAuthorizeUrl({
      appId,
      redirectUri,
      state: sendState ? token : undefined,
      codeChallenge: pkce?.codeChallenge,
    });

    const built = new URL(url);
    const fromParams = built.searchParams.get('redirect_uri');
    if (fromParams !== redirectUri) {
      this.logger.error(
        `Zalo OA OAuth redirect_uri encode mismatch got=${fromParams} expected=${redirectUri}`,
      );
      throw new UnauthorizedException('redirect_uri encode mismatch');
    }
    if (!built.pathname.endsWith('/oa/permission')) {
      throw new UnauthorizedException('Invalid OA OAuth endpoint');
    }

    this.logger.log(
      `Zalo OA OAuth start appId=…${appId.slice(-6)} redirectUri=${redirectUri} pkce=${usePkce} sendState=${sendState} urlLen=${url.length} org=…${params.organizationId.slice(-6)} authorize=${built.origin}${built.pathname}`,
    );

    return {
      state: token,
      url,
      redirectUri,
      appIdMasked: `…${appId.slice(-6)}`,
      cookieValue: token,
      cookieName: ZALO_OA_OAUTH_COOKIE,
    };
  }

  /** @deprecated use createPendingSession */
  createState(params: {
    userId: string;
    organizationId: string;
    returnPath?: string;
  }) {
    return this.createPendingSession(params);
  }

  verifySignedToken(token: string): ZaloOAuthStatePayload {
    let decoded: string;
    try {
      decoded = Buffer.from(token, 'base64url').toString('utf8');
    } catch {
      throw new UnauthorizedException('State OAuth không hợp lệ');
    }
    const sep = decoded.lastIndexOf(':');
    if (sep <= 0) throw new UnauthorizedException('State OAuth không hợp lệ');
    const raw = decoded.slice(0, sep);
    const sig = decoded.slice(sep + 1);
    const expected = createHmac('sha256', this.getEncryptionKey()).update(raw).digest('hex');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('State OAuth không hợp lệ');
    }
    const payload = JSON.parse(raw) as ZaloOAuthStatePayload;
    if (!payload.userId || !payload.organizationId || !payload.nonce || !payload.ts) {
      throw new UnauthorizedException('State OAuth không hợp lệ');
    }
    if (this.isPkceEnabled() && !payload.codeVerifier) {
      throw new UnauthorizedException('State OAuth thiếu PKCE — hãy Kết nối OA lại');
    }
    if (Date.now() - payload.ts > STATE_TTL_MS) {
      throw new UnauthorizedException('State OAuth đã hết hạn');
    }
    return payload;
  }

  verifyState(state: string): ZaloOAuthStatePayload {
    return this.verifySignedToken(state);
  }

  resolveCallbackSession(state?: string, cookieValue?: string): ZaloOAuthStatePayload {
    if (state?.trim()) {
      return this.verifySignedToken(state.trim());
    }
    if (cookieValue?.trim()) {
      return this.verifySignedToken(cookieValue.trim());
    }
    throw new UnauthorizedException('Thiếu phiên OAuth — hãy bấm Kết nối OA lại');
  }

  async exchangeCode(code: string, codeVerifier?: string) {
    const redirectUri = this.getRedirectUri();
    const appId = this.getAppId();
    this.logger.log(
      `Zalo OA OAuth exchange appId=…${appId.slice(-6)} redirectUri=${redirectUri} pkce=${Boolean(codeVerifier)}`,
    );
    return exchangeZaloOaOAuthCode({
      appId,
      appSecret: this.getAppSecret(),
      code,
      redirectUri,
      codeVerifier: codeVerifier || undefined,
    });
  }

  async refresh(refreshToken: string) {
    return refreshZaloOaAccessToken({
      appId: this.getAppId(),
      appSecret: this.getAppSecret(),
      refreshToken,
    });
  }

  async fetchOaInfo(accessToken: string) {
    return fetchZaloOaInfo(accessToken);
  }

  getPublicConfig() {
    const appId = this.getAppId();
    return {
      configured: this.isConfigured(),
      flow: 'oa/permission' as const,
      authorizeHost: 'oauth.zaloapp.com',
      authorizePath: '/v4/oa/permission',
      redirectUri: this.getRedirectUri(),
      appIdMasked: appId ? `…${appId.slice(-6)}` : null,
      pkce: this.isPkceEnabled(),
      sendState: this.sendStateQuery(),
    };
  }

  buildSuccessRedirect(returnPath?: string): string {
    const appUrl = (
      this.config.get<string>('APP_URL') ??
      this.config.get<string>('NEXT_PUBLIC_APP_URL') ??
      'http://localhost:3000'
    ).replace(/\/$/, '');
    const path = returnPath?.startsWith('/') ? returnPath : '/zalo-marketing?tab=oa';
    const join = path.includes('?') ? '&' : '?';
    return `${appUrl}${path}${join}oauth=success`;
  }

  buildErrorRedirect(message: string, returnPath?: string): string {
    const appUrl = (
      this.config.get<string>('APP_URL') ??
      this.config.get<string>('NEXT_PUBLIC_APP_URL') ??
      'http://localhost:3000'
    ).replace(/\/$/, '');
    const path = returnPath?.startsWith('/') ? returnPath : '/zalo-marketing?tab=oa';
    const join = path.includes('?') ? '&' : '?';
    return `${appUrl}${path}${join}oauth=error&msg=${encodeURIComponent(message.slice(0, 160))}`;
  }
}
