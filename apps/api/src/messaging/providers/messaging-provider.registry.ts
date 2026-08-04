import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { MessagingProviderKind } from '@marketingspa/database';
import type {
  ConnectionValidationResult,
  MessagingProvider,
  NormalizedWebhookEvent,
  ValidateConnectionParams,
} from './messaging-provider.interface';

const GRAPH_VERSION = 'v21.0';

function safeEqualUtf8(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/** Meta X-Hub-Signature-256: sha256=<hmac-hex> */
function verifyMetaSha256Signature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected =
    'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqualUtf8(expected, signature.trim());
}

/** Zalo OA webhook: accept sha256=<hmac-hex> or raw hex HMAC of body */
function verifyZaloHmacSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const hex = createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = signature.trim();
  if (/^sha256=/i.test(provided)) {
    return safeEqualUtf8(`sha256=${hex}`, `sha256=${provided.slice(provided.indexOf('=') + 1)}`);
  }
  return safeEqualUtf8(hex, provided.toLowerCase());
}

@Injectable()
export class MessagingProviderRegistry {
  private readonly logger = new Logger(MessagingProviderRegistry.name);

  get(kind: MessagingProviderKind): MessagingProvider {
    switch (kind) {
      case MessagingProviderKind.MESSENGER:
        return this.messengerProvider();
      case MessagingProviderKind.ZALO_OA:
      case MessagingProviderKind.ZBS_TEMPLATE:
        return this.zaloLikeProvider(kind);
      default:
        return this.zaloLikeProvider(kind);
    }
  }

  private messengerProvider(): MessagingProvider {
    return {
      validateConnection: async (
        params: ValidateConnectionParams,
      ): Promise<ConnectionValidationResult> => {
        const token =
          params.credentials.pageAccessToken?.trim() ||
          params.credentials.accessToken?.trim() ||
          '';
        if (!token) {
          return { valid: false, message: 'Thiếu Page Access Token' };
        }
        const pageId = (params.credentials.pageId || params.accountRef || '').trim();
        if (!pageId) {
          return { valid: false, message: 'Thiếu Page ID' };
        }
        try {
          const url = new URL(
            `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pageId)}`,
          );
          url.searchParams.set('fields', 'id,name');
          url.searchParams.set('access_token', token);
          const res = await fetch(url.toString(), { method: 'GET' });
          const body = (await res.json().catch(() => ({}))) as {
            id?: string;
            name?: string;
            error?: { message?: string; code?: number; type?: string };
          };
          if (!res.ok || body.error) {
            const msg = body.error?.message || `Graph HTTP ${res.status}`;
            const lower = msg.toLowerCase();
            if (
              lower.includes('expired') ||
              lower.includes('session has expired') ||
              body.error?.code === 190
            ) {
              return { valid: false, message: `Token hết hạn / reauth: ${msg}` };
            }
            if (lower.includes('permission') || lower.includes('oauth')) {
              return { valid: false, message: `Thiếu quyền / reauth: ${msg}` };
            }
            return { valid: false, message: msg };
          }
          return {
            valid: true,
            displayName: body.name || pageId,
            permissions: ['pages_messaging'],
          };
        } catch (e) {
          this.logger.warn(
            `Messenger validate failed: ${e instanceof Error ? e.message : String(e)}`,
          );
          return {
            valid: false,
            message: e instanceof Error ? e.message : 'Không kiểm tra được token Messenger',
          };
        }
      },
      verifyWebhookSignature: (rawBody, signature, secret) =>
        verifyMetaSha256Signature(rawBody, signature, secret),
      normalizeWebhook(): NormalizedWebhookEvent[] {
        return [];
      },
      estimateCost() {
        return 0;
      },
    };
  }

  private zaloLikeProvider(kind: MessagingProviderKind): MessagingProvider {
    return {
      validateConnection: async (
        params: ValidateConnectionParams,
      ): Promise<ConnectionValidationResult> => {
        const token =
          params.credentials.accessToken?.trim() ||
          params.credentials.pageAccessToken?.trim() ||
          '';
        if (!token || token.length < 10) {
          return { valid: false, message: 'Thiếu access token Zalo' };
        }
        const accountRef =
          params.credentials.oaId?.trim() ||
          params.credentials.appId?.trim() ||
          params.accountRef?.trim() ||
          '';
        if (!accountRef) {
          return { valid: false, message: 'Thiếu OA ID / accountRef' };
        }
        return {
          valid: true,
          displayName: params.credentials.oaName || accountRef,
          permissions: kind === MessagingProviderKind.ZBS_TEMPLATE ? ['zbs'] : ['zalo_oa'],
        };
      },
      verifyWebhookSignature: (rawBody, signature, secret) =>
        verifyZaloHmacSignature(rawBody, signature, secret),
      normalizeWebhook(): NormalizedWebhookEvent[] {
        return [];
      },
      estimateCost() {
        return 0;
      },
    };
  }
}
