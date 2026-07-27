import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  fetchAllManagedPages,
  mergeGrantedScopes,
  type MetaPageAccountParsed,
} from './auto-post-meta-pages.util';
import {
  resolveAutoPostMetaScopes,
  resolveMetaAppId,
  resolveMetaAppSecret,
  resolveMetaLoginConfigId,
  resolveMetaOAuthRedirectUri,
} from './auto-post-config';

export type { MetaPageAccountParsed as MetaPageAccount };

export interface MetaPublishResult {
  id: string;
}

@Injectable()
export class AutoPostMetaService {
  private readonly logger = new Logger(AutoPostMetaService.name);

  constructor(private readonly config: ConfigService) {}

  private env(key: string): string | undefined {
    return this.config.get<string>(key) ?? process.env[key];
  }

  get apiVersion(): string {
    return this.env('META_API_VERSION') ?? 'v21.0';
  }

  get appId(): string {
    const id = resolveMetaAppId((k) => this.env(k));
    if (!id) throw new Error('META_APP_ID / FACEBOOK_APP_ID chưa cấu hình');
    return id;
  }

  get appSecret(): string {
    const secret = resolveMetaAppSecret((k) => this.env(k));
    if (!secret) throw new Error('META_APP_SECRET / FACEBOOK_APP_SECRET chưa cấu hình');
    return secret;
  }

  get loginConfigId(): string | undefined {
    return resolveMetaLoginConfigId((k) => this.env(k));
  }

  get redirectUri(): string {
    return resolveMetaOAuthRedirectUri(
      (k) => this.env(k),
      '/api/v1/auto-post/facebook/oauth/callback',
    );
  }

  getOAuthScopes(): string[] {
    return resolveAutoPostMetaScopes((k) => this.env(k));
  }

  /**
   * Facebook Login for Business (app Business) — dùng config_id.
   * Bổ sung scope + auth_type=rerequest để Meta hiển thị quyền Pages khi Configuration cho phép.
   */
  buildOAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.redirectUri,
      state,
      response_type: 'code',
      display: 'page',
      auth_type: 'rerequest',
      return_scopes: 'true',
    });

    const configId = this.loginConfigId;
    if (configId) {
      params.set('config_id', configId);
      const overrideDefault =
        (this.env('META_LOGIN_OVERRIDE_DEFAULT_RESPONSE_TYPE') ?? '')
          .trim()
          .toLowerCase() === 'true';
      if (overrideDefault) {
        params.set('override_default_response_type', 'true');
      }
      const appendScopes =
        (this.env('META_OAUTH_APPEND_SCOPES') ?? 'true').trim().toLowerCase() === 'true';
      if (appendScopes) {
        params.set('scope', this.getOAuthScopes().join(','));
      }
    } else {
      params.set('scope', this.getOAuthScopes().join(','));
    }

    return `https://www.facebook.com/${this.apiVersion}/dialog/oauth?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<{ access_token: string; expires_in?: number }> {
    const params = new URLSearchParams({
      client_id: this.appId,
      client_secret: this.appSecret,
      redirect_uri: this.redirectUri,
      code,
    });
    return this.getJson(
      `https://graph.facebook.com/${this.apiVersion}/oauth/access_token?${params.toString()}`,
    );
  }

  async exchangeForLongLivedToken(shortLivedToken: string): Promise<{
    access_token: string;
    expires_in?: number;
  }> {
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: this.appId,
      client_secret: this.appSecret,
      fb_exchange_token: shortLivedToken,
    });
    return this.getJson(
      `https://graph.facebook.com/${this.apiVersion}/oauth/access_token?${params.toString()}`,
    );
  }

  async getMe(accessToken: string): Promise<{ id: string; name?: string }> {
    return this.getJson(
      `https://graph.facebook.com/${this.apiVersion}/me?fields=id,name`,
      accessToken,
    );
  }

  async getGrantedPermissions(accessToken: string): Promise<string[]> {
    const data = await this.getJson<{
      data: Array<{ permission?: string; status?: string }>;
    }>(`https://graph.facebook.com/${this.apiVersion}/me/permissions`, accessToken);
    return (data.data ?? [])
      .filter((row) => row.status === 'granted' && row.permission)
      .map((row) => row.permission!);
  }

  /** Quyền thực tế: union /me/permissions + debug_token.scopes. */
  async resolveGrantedScopes(accessToken: string): Promise<string[]> {
    const [fromPermissions, debug] = await Promise.all([
      this.getGrantedPermissions(accessToken).catch(() => [] as string[]),
      this.debugToken(accessToken).catch(() => ({ is_valid: false, scopes: [] as string[] })),
    ]);
    return mergeGrantedScopes(fromPermissions, debug.scopes);
  }

  /** Lấy toàn bộ Fanpage user quản trị — pagination, fields id/name/access_token/tasks. */
  async getManagedPages(accessToken: string): Promise<MetaPageAccountParsed[]> {
    return fetchAllManagedPages(
      (url) => this.getJson(url, accessToken),
      this.apiVersion,
    );
  }

  async publishPagePost(
    pageId: string,
    pageAccessToken: string,
    payload: { message: string; link?: string; imageUrl?: string },
  ): Promise<MetaPublishResult> {
    if (payload.imageUrl?.trim()) {
      const params = new URLSearchParams({
        url: payload.imageUrl.trim(),
        caption: payload.message,
        access_token: pageAccessToken,
      });
      const res = await fetch(
        `https://graph.facebook.com/${this.apiVersion}/${pageId}/photos?${params.toString()}`,
        { method: 'POST' },
      );
      return this.parsePublishResponse(res);
    }

    const body: Record<string, string> = {
      message: payload.message,
      access_token: pageAccessToken,
    };
    if (payload.link?.trim()) {
      body.link = payload.link.trim();
    }

    const res = await fetch(`https://graph.facebook.com/${this.apiVersion}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return this.parsePublishResponse(res);
  }

  async debugToken(
    accessToken: string,
  ): Promise<{ is_valid: boolean; expires_at?: number; scopes?: string[] }> {
    const params = new URLSearchParams({
      input_token: accessToken,
      access_token: `${this.appId}|${this.appSecret}`,
    });
    const res = await this.getJson<{
      data: { is_valid: boolean; expires_at?: number; scopes?: string[] };
    }>(
      `https://graph.facebook.com/${this.apiVersion}/debug_token?${params.toString()}`,
    );
    return res.data;
  }

  private async parsePublishResponse(res: Response): Promise<MetaPublishResult> {
    const body = (await res.json()) as MetaPublishResult & {
      error?: { message: string; code?: number; type?: string };
    };
    if (!res.ok || body.error) {
      const msg = body.error?.message ?? `Meta API error (${res.status})`;
      this.logger.warn(`Meta publish failed: ${msg}`);
      throw new Error(msg);
    }
    if (!body.id) throw new Error('Meta không trả về post id');
    return { id: body.id };
  }

  private async getJson<T>(url: string, accessToken?: string): Promise<T> {
    const fullUrl = accessToken
      ? `${url}${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(accessToken)}`
      : url;

    const res = await fetch(fullUrl);
    const body = (await res.json()) as T & {
      error?: { message: string; code?: number; type?: string };
    };

    if (!res.ok || body.error) {
      const msg = body.error?.message ?? `Meta API error (${res.status})`;
      this.logger.warn(`Meta API request failed: ${msg}`);
      throw new Error(msg);
    }

    return body;
  }
}
