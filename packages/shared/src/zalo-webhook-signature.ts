import { createHash, createHmac, timingSafeEqual } from 'crypto';

/**
 * Zalo OA webhook signature (official docs):
 *   X-ZEvent-Signature: mac=<sha256(appId + rawJsonBody + timestamp + OA_Secret_Key)>
 *
 * OA Secret Key = secret khi liên kết OA (không phải App Secret Key).
 * Timestamp lấy từ body.timestamp (string/number).
 */
export type VerifyZaloWebhookSignatureParams = {
  rawBody: Buffer | string;
  signature: string;
  appId: string;
  timestamp: string | number;
  oaSecretKey: string;
  /** Keep legacy HMAC(rawBody) as secondary for older misconfigured clients */
  allowLegacyHmac?: boolean;
};

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

/** Normalize header value: `mac=abc`, `mac = abc`, or raw hex. */
export function extractZaloMacHex(signature: string): string {
  const provided = String(signature || '').trim();
  const macMatch = /^mac\s*=\s*(.+)$/i.exec(provided);
  if (macMatch?.[1]) return macMatch[1].trim().toLowerCase();
  if (/^sha256=/i.test(provided)) {
    return provided.slice(provided.indexOf('=') + 1).trim().toLowerCase();
  }
  return provided.toLowerCase();
}

export function buildZaloWebhookMacHex(params: {
  appId: string;
  rawBody: Buffer | string;
  timestamp: string | number;
  oaSecretKey: string;
}): string {
  const raw = typeof params.rawBody === 'string' ? params.rawBody : params.rawBody.toString('utf8');
  const base = `${params.appId}${raw}${params.timestamp}${params.oaSecretKey}`;
  return createHash('sha256').update(base, 'utf8').digest('hex');
}

export function verifyZaloWebhookSignature(params: VerifyZaloWebhookSignatureParams): boolean {
  const appId = String(params.appId || '').trim();
  const secret = String(params.oaSecretKey || '').trim();
  const signature = String(params.signature || '').trim();
  if (!secret || !signature) return false;

  const providedHex = extractZaloMacHex(signature);
  if (!/^[0-9a-f]{64}$/.test(providedHex)) return false;

  if (appId && params.timestamp !== undefined && params.timestamp !== null && `${params.timestamp}` !== '') {
    const expectedOfficial = buildZaloWebhookMacHex({
      appId,
      rawBody: params.rawBody,
      timestamp: params.timestamp,
      oaSecretKey: secret,
    });
    if (safeEqualUtf8(expectedOfficial, providedHex)) return true;
  }

  if (params.allowLegacyHmac !== false) {
    const rawBuf =
      typeof params.rawBody === 'string' ? Buffer.from(params.rawBody, 'utf8') : params.rawBody;
    const legacyHex = createHmac('sha256', secret).update(rawBuf).digest('hex');
    if (safeEqualUtf8(legacyHex, providedHex)) return true;
  }

  return false;
}
