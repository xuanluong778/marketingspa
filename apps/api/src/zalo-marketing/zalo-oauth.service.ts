import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import {
  buildZaloOaOAuthUrl,
  exchangeZaloOaOAuthCode,
  fetchZaloOaInfo,
  refreshZaloOaAccessToken,
} from '@marketingspa/shared';
import { assertEncryptionKeyConfigured } from '../common/utils/assert-encryption-key';

const STATE_TTL_MS = 10 * 60 * 1000;

export type ZaloOAuthStatePayload = {
  userId: string;
  organizationId: string;
  returnPath?: string;
  ts: number;
  nonce: string;
};

@Injectable()
export class ZaloOAuthService {
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

  getRedirectUri(): string {
    const explicit = (this.config.get<string>('ZALO_OAUTH_REDIRECT_URI') ?? '').trim();
    if (explicit) return explicit;
    const apiBase =
      (this.config.get<string>('API_PUBLIC_URL') ?? '').trim() ||
      (this.config.get<string>('NEXT_PUBLIC_API_URL') ?? '').trim() ||
      'http://localhost:4000';
    return `${apiBase.replace(/\/$/, '')}/api/v1/zalo-marketing/public/oauth/callback`;
  }

  private getEncryptionKey(): string {
    return assertEncryptionKeyConfigured(this.config.get<string>('ENCRYPTION_KEY'));
  }

  createState(params: {
    userId: string;
    organizationId: string;
    returnPath?: string;
  }): { state: string; url: string } {
    if (!this.isConfigured()) {
      throw new UnauthorizedException('Chưa cấu hình ZALO_APP_ID / ZALO_APP_SECRET');
    }
    const ts = Date.now();
    const nonce = randomBytes(16).toString('hex');
    const payload: ZaloOAuthStatePayload = {
      userId: params.userId,
      organizationId: params.organizationId,
      returnPath: params.returnPath?.trim() || '/zalo-marketing?tab=oa',
      ts,
      nonce,
    };
    const raw = JSON.stringify(payload);
    const sig = createHmac('sha256', this.getEncryptionKey()).update(raw).digest('hex');
    const state = Buffer.from(`${raw}:${sig}`).toString('base64url');
    const url = buildZaloOaOAuthUrl({
      appId: this.getAppId(),
      redirectUri: this.getRedirectUri(),
      state,
    });
    return { state, url };
  }

  verifyState(state: string): ZaloOAuthStatePayload {
    let decoded: string;
    try {
      decoded = Buffer.from(state, 'base64url').toString('utf8');
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
    if (Date.now() - payload.ts > STATE_TTL_MS) {
      throw new UnauthorizedException('State OAuth đã hết hạn');
    }
    return payload;
  }

  async exchangeCode(code: string) {
    return exchangeZaloOaOAuthCode({
      appId: this.getAppId(),
      appSecret: this.getAppSecret(),
      code,
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

  buildSuccessRedirect(returnPath?: string): string {
    const appUrl = (this.config.get<string>('APP_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
    const path = returnPath?.startsWith('/') ? returnPath : '/zalo-marketing?tab=oa';
    const join = path.includes('?') ? '&' : '?';
    return `${appUrl}${path}${join}oauth=success`;
  }

  buildErrorRedirect(message: string, returnPath?: string): string {
    const appUrl = (this.config.get<string>('APP_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
    const path = returnPath?.startsWith('/') ? returnPath : '/zalo-marketing?tab=oa';
    const join = path.includes('?') ? '&' : '?';
    return `${appUrl}${path}${join}oauth=error&msg=${encodeURIComponent(message.slice(0, 120))}`;
  }
}
