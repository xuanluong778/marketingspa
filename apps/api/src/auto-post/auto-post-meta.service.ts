import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  fetchAllManagedPages,
  mergeGrantedScopes,
  missingRequiredPageScopes,
  type MetaPageAccountParsed,
} from './auto-post-meta-pages.util';
import {
  resolveAutoPostMetaScopes,
  resolveMetaAppId,
  resolveMetaAppSecret,
  resolveMetaLoginConfigId,
} from './auto-post-config';
import {
  assertAutoPostMetaOAuthConfig,
  assertMetaAppSecretMatchesAppId,
  resolveAutoPostOAuthRedirectUri,
} from './assert-auto-post-meta-oauth';
import { normalizePublishMedia } from './auto-post-media.util';
import {
  formatMetaGraphErrorTechnical,
  formatMetaGraphErrorUserFacing,
  type MetaGraphErrorShape,
} from './auto-post-publish-errors';
import { metaGraphFetchJson } from './meta-graph-http';
import { MetaGraphUsageService } from './meta-graph-usage.service';

export type { MetaPageAccountParsed as MetaPageAccount };

export interface MetaPublishResult {
  id: string;
}

@Injectable()
export class AutoPostMetaService {
  private readonly logger = new Logger(AutoPostMetaService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly usage: MetaGraphUsageService,
  ) {}

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
    return resolveAutoPostOAuthRedirectUri((k) => this.env(k));
  }

  /** Fail-fast App ID / config_id / redirect MarketingAutoAZ trước khi build OAuth URL. */
  assertProductionOAuthConfig(): {
    appId: string;
    loginConfigId: string;
    redirectUri: string;
  } {
    return assertAutoPostMetaOAuthConfig((k) => this.env(k));
  }

  getOAuthScopes(): string[] {
    return resolveAutoPostMetaScopes((k) => this.env(k));
  }

  /**
   * Facebook Login for Business (app Business) — chỉ dùng config_id.
   * Không truyền scope=pages_* kèm config_id: Meta sẽ báo "Invalid Scopes".
   * Quyền Pages phải khai trong Login Configuration trên Meta Developer.
   * Standard Login (không có config_id) vẫn dùng scope như cũ.
   */
  buildOAuthUrl(state: string): string {
    const asserted = this.assertProductionOAuthConfig();
    const params = new URLSearchParams({
      client_id: asserted.appId,
      redirect_uri: asserted.redirectUri,
      state,
      response_type: 'code',
      display: 'page',
      auth_type: 'rerequest',
      return_scopes: 'true',
    });

    const configId = asserted.loginConfigId || this.loginConfigId;
    if (configId) {
      params.set('config_id', configId);
      const overrideDefault =
        (this.env('META_LOGIN_OVERRIDE_DEFAULT_RESPONSE_TYPE') ?? '')
          .trim()
          .toLowerCase() === 'true';
      if (overrideDefault) {
        params.set('override_default_response_type', 'true');
      }
      // Mặc định KHÔNG append scope khi có config_id (tránh Invalid Scopes).
      // Chỉ bật META_OAUTH_APPEND_SCOPES=true nếu Configuration là loại hỗ trợ thêm scope.
      const appendScopes =
        (this.env('META_OAUTH_APPEND_SCOPES') ?? 'false').trim().toLowerCase() === 'true';
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
    const rows = await this.getPermissionStatuses(accessToken);
    return rows.filter((r) => r.status === 'granted').map((r) => r.permission);
  }

  /** Toàn bộ /me/permissions (granted + declined) — không log token. */
  async getPermissionStatuses(
    accessToken: string,
  ): Promise<Array<{ permission: string; status: 'granted' | 'declined' | 'expired' | 'unknown' }>> {
    const data = await this.getJson<{
      data: Array<{ permission?: string; status?: string }>;
    }>(`https://graph.facebook.com/${this.apiVersion}/me/permissions`, accessToken);
    return (data.data ?? [])
      .filter((row) => Boolean(row.permission))
      .map((row) => {
        const statusRaw = String(row.status ?? '').toLowerCase();
        const status: 'granted' | 'declined' | 'expired' | 'unknown' =
          statusRaw === 'granted'
            ? 'granted'
            : statusRaw === 'declined'
              ? 'declined'
              : statusRaw === 'expired'
                ? 'expired'
                : 'unknown';
        return { permission: row.permission!, status };
      });
  }

  /** Quyền thực tế: union /me/permissions + debug_token.scopes. */
  async resolveGrantedScopes(accessToken: string): Promise<string[]> {
    const [fromPermissions, debug] = await Promise.all([
      this.getGrantedPermissions(accessToken).catch(() => [] as string[]),
      this.debugToken(accessToken).catch(() => ({ is_valid: false, scopes: [] as string[] })),
    ]);
    return mergeGrantedScopes(fromPermissions, debug.scopes);
  }

  /**
   * Chẩn đoán quyền sau OAuth — log an toàn tên + status, không log token.
   * Trả về granted + declined + missing required.
   */
  async diagnoseUserPermissions(accessToken: string): Promise<{
    permissions: Array<{ permission: string; status: 'granted' | 'declined' | 'expired' | 'unknown' }>;
    granted: string[];
    declined: string[];
    missingRequired: string[];
  }> {
    type PermRow = {
      permission: string;
      status: 'granted' | 'declined' | 'expired' | 'unknown';
    };
    const permissions: PermRow[] = await this.getPermissionStatuses(accessToken).catch(
      () => [] as PermRow[],
    );
    const debug = await this.debugToken(accessToken).catch(() => ({
      is_valid: false,
      scopes: [] as string[],
    }));
    const grantedSet = new Set(
      permissions.filter((p) => p.status === 'granted').map((p) => p.permission),
    );
    for (const s of debug.scopes ?? []) {
      if (s && !grantedSet.has(s)) {
        grantedSet.add(s);
        permissions.push({ permission: s, status: 'granted' });
      }
    }
    const granted = [...grantedSet];
    const declined = permissions
      .filter((p) => p.status === 'declined')
      .map((p) => p.permission);
    const missingRequired = missingRequiredPageScopes(granted);
    this.logger.log(
      `Meta permissions diag granted=[${granted.join(',')}] declined=[${declined.join(',')}] missing=[${missingRequired.join(',')}]`,
    );
    return { permissions, granted, declined, missingRequired };
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
    const media = normalizePublishMedia({
      imageUrl: payload.imageUrl,
      linkUrl: payload.link,
    });
    if (media.note) {
      this.logger.log(`publish media normalize: ${media.note}`);
    }

    if (media.imageUrl) {
      const params = new URLSearchParams({
        url: media.imageUrl,
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
    if (media.linkUrl) {
      body.link = media.linkUrl;
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
      error?: MetaGraphErrorShape;
    };
    if (!res.ok || body.error) {
      const err = body.error ?? { message: `Meta API error (${res.status})` };
      const user = formatMetaGraphErrorUserFacing(err);
      const tech = formatMetaGraphErrorTechnical(err);
      this.logger.warn(`Meta publish failed: ${tech}`);
      throw new Error(user === tech ? user : `${user} (${tech})`);
    }
    if (!body.id) throw new Error('Meta không trả về post id');
    return { id: body.id };
  }

  private async getJson<T>(url: string, accessToken?: string): Promise<T> {
    const result = await metaGraphFetchJson<T>(url, {
      accessToken,
      maxRetries: 2,
      onUsage: (u) => {
        void this.usage.record(u);
      },
      logger: this.logger,
    });
    return result.data;
  }
}
