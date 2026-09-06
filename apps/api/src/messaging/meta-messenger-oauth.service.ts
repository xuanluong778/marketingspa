import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes } from 'crypto';
import { resolveMetaAppId } from '../auto-post/auto-post-config';
import {
  resolveMetaLoginConfigStatus,
  resolveMetaMessengerLoginConfigId,
} from '../meta/meta-oauth-config';
import { buildMetaOAuthAuthorizeUrl } from '../meta/meta-oauth-url.util';

const STATE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class MetaMessengerOAuthService {
  constructor(private readonly config: ConfigService) {}

  private getEnv(key: string): string | undefined {
    return this.config.get<string>(key) ?? process.env[key];
  }

  getOAuthStartUrl(userId: string, organizationId: string): {
    url?: string;
    code?: string;
    message?: string;
    configId?: string;
  } {
    const configStatus = resolveMetaLoginConfigStatus('messenger', (k) => this.getEnv(k));
    if (configStatus.status !== 'CONFIGURED') {
      return {
        code: 'MANUAL_META_ACTION_REQUIRED',
        message: configStatus.message,
      };
    }

    const redirectUri = this.getEnv('META_MESSENGER_REDIRECT_URI')?.trim();
    if (!redirectUri) {
      return {
        code: 'MANUAL_META_ACTION_REQUIRED',
        message:
          'META_MESSENGER_REDIRECT_URI chưa cấu hình — thêm Valid OAuth Redirect URI trên Meta Dashboard ' +
          'và set env (ví dụ https://marketingautoaz.com/api/v1/messaging/facebook/oauth/callback).',
      };
    }

    const appId = resolveMetaAppId((k) => this.getEnv(k));
    if (!appId) {
      return {
        code: 'MANUAL_META_ACTION_REQUIRED',
        message: 'META_APP_ID chưa cấu hình',
      };
    }

    const state = this.signState(userId, organizationId);
    const url = buildMetaOAuthAuthorizeUrl({
      flow: 'messenger',
      appId,
      redirectUri,
      state,
      apiVersion: this.getEnv('META_API_VERSION') ?? 'v21.0',
      getEnv: (k) => this.getEnv(k),
    });

    return {
      url,
      configId: resolveMetaMessengerLoginConfigId((k) => this.getEnv(k)),
    };
  }

  private signState(userId: string, organizationId: string): string {
    const exp = Date.now() + STATE_TTL_MS;
    const nonce = randomBytes(16).toString('hex');
    const secret =
      this.getEnv('ENCRYPTION_KEY')?.trim() ||
      this.getEnv('JWT_SECRET')?.trim() ||
      'dev-messenger-oauth-state';
    const payload = `${userId}:${organizationId}:messenger:${exp}:${nonce}`;
    const sig = createHmac('sha256', secret).update(payload).digest('hex');
    return Buffer.from(`${payload}:${sig}`).toString('base64url');
  }
}
