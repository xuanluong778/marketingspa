import { createHmac, createHash, randomBytes, timingSafeEqual } from 'crypto';

export interface MetaSignedRequestPayload {
  algorithm: string;
  issued_at: number;
  user_id: string;
  /** Present on some callbacks */
  oauth_token?: string;
  expires?: number;
  [key: string]: unknown;
}

export class SignedRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignedRequestError';
  }
}

/** Facebook signed_request uses URL-safe base64 without padding */
export function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64');
}

export function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

/**
 * Verify Meta `signed_request` with APP SECRET (HMAC-SHA256).
 * Never log the secret or oauth_token from the payload.
 */
export function parseAndVerifySignedRequest(
  signedRequest: string,
  appSecret: string,
): MetaSignedRequestPayload {
  if (!signedRequest?.trim()) {
    throw new SignedRequestError('signed_request is required');
  }
  if (!appSecret?.trim()) {
    throw new SignedRequestError('META_APP_SECRET is not configured');
  }

  const parts = signedRequest.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new SignedRequestError('signed_request format is invalid');
  }

  const [encodedSig, encodedPayload] = parts;
  let sig: Buffer;
  let payloadBuf: Buffer;
  try {
    sig = base64UrlDecode(encodedSig);
    payloadBuf = base64UrlDecode(encodedPayload);
  } catch {
    throw new SignedRequestError('signed_request encoding is invalid');
  }

  const expected = createHmac('sha256', appSecret).update(encodedPayload).digest();
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) {
    throw new SignedRequestError('signed_request signature mismatch');
  }

  let payload: MetaSignedRequestPayload;
  try {
    payload = JSON.parse(payloadBuf.toString('utf8')) as MetaSignedRequestPayload;
  } catch {
    throw new SignedRequestError('signed_request payload is not valid JSON');
  }

  if (payload.algorithm !== 'HMAC-SHA256') {
    throw new SignedRequestError(`unsupported algorithm: ${String(payload.algorithm)}`);
  }
  if (!payload.user_id || typeof payload.user_id !== 'string') {
    throw new SignedRequestError('signed_request missing user_id');
  }
  if (typeof payload.issued_at !== 'number' || !Number.isFinite(payload.issued_at)) {
    throw new SignedRequestError('signed_request missing issued_at');
  }

  return payload;
}

/** Build a valid signed_request for tests (does not belong in production call paths). */
export function buildSignedRequestForTest(
  payload: {
    user_id: string;
    issued_at: number;
    algorithm?: string;
    oauth_token?: string;
    expires?: number;
  },
  appSecret: string,
): string {
  const body: MetaSignedRequestPayload = {
    algorithm: payload.algorithm ?? 'HMAC-SHA256',
    issued_at: payload.issued_at,
    user_id: payload.user_id,
  };
  if (payload.oauth_token !== undefined) body.oauth_token = payload.oauth_token;
  if (payload.expires !== undefined) body.expires = payload.expires;
  const encodedPayload = base64UrlEncode(Buffer.from(JSON.stringify(body), 'utf8'));
  const sig = createHmac('sha256', appSecret).update(encodedPayload).digest();
  return `${base64UrlEncode(sig)}.${encodedPayload}`;
}

/** Deterministic confirmation code for a Facebook user (idempotent retries). */
export function buildDataDeletionConfirmationCode(facebookUserId: string): string {
  const digest = createHash('sha256')
    .update(`auto-post-data-deletion:${facebookUserId}`)
    .digest('hex')
    .slice(0, 24);
  return `apd_${digest}`;
}

/** Random confirmation code fallback when facebook user id is absent (should not happen). */
export function buildRandomConfirmationCode(): string {
  return `apd_${randomBytes(12).toString('hex')}`;
}

/** Mask Facebook user id for safe logs / audit (keep last 4). */
export function maskFacebookUserId(userId: string): string {
  const id = userId.trim();
  if (id.length <= 4) return '••••';
  return `••••${id.slice(-4)}`;
}

/**
 * Production Meta callbacks must arrive over HTTPS (behind proxy: x-forwarded-proto).
 * Local/dev may allow http when NODE_ENV !== production.
 */
export function assertHttpsRequest(input: {
  secure?: boolean;
  forwardedProto?: string | string[];
  nodeEnv?: string;
}): void {
  const env = (input.nodeEnv ?? process.env.NODE_ENV ?? '').toLowerCase();
  if (env !== 'production' && env !== 'prod') return;

  const protoHeader = Array.isArray(input.forwardedProto)
    ? input.forwardedProto[0]
    : input.forwardedProto;
  const proto = (protoHeader ?? '').split(',')[0]?.trim().toLowerCase();
  const ok = input.secure === true || proto === 'https';
  if (!ok) {
    throw new SignedRequestError('HTTPS is required for Meta callbacks');
  }
}
