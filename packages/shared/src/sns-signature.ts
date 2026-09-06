import { createVerify } from 'crypto';

export type SnsVerifyResult = { ok: true } | { ok: false; reason: string };

export type SnsVerifyOptions = {
  /** Test-only: return PEM instead of fetching SigningCertURL. */
  fetchCertificate?: (signingCertUrl: string) => Promise<string>;
};

const FIELD_ORDER: Record<string, string[]> = {
  Notification: ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'],
  SubscriptionConfirmation: ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'],
  UnsubscribeConfirmation: ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'],
};

/** Strict AWS SNS signing cert host: sns.<region>.amazonaws.com only (SSRF-safe). */
const SNS_CERT_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com$/i;

/** AWS SNS signing certificate URL — HTTPS + sns.<region>.amazonaws.com only. */
export function isAllowedSnsSigningCertUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    if (parsed.port && parsed.port !== '443') return false;
    const host = parsed.hostname.toLowerCase();
    if (!SNS_CERT_HOST.test(host)) return false;
    if (!parsed.pathname.endsWith('.pem')) return false;
    if (parsed.pathname.includes('..')) return false;
    return true;
  } catch {
    return false;
  }
}

function buildStringToSign(message: Record<string, unknown>): string | null {
  const type = String(message.Type || '');
  const fields = FIELD_ORDER[type];
  if (!fields) return null;
  const parts: string[] = [];
  for (const field of fields) {
    if (field === 'Subject') {
      if (message.Subject == null) continue;
    }
    const value = message[field];
    if (value === undefined || value === null) continue;
    parts.push(String(value));
  }
  return `${parts.join('\n')}\n`;
}

async function defaultFetchCertificate(signingCertUrl: string): Promise<string> {
  if (!isAllowedSnsSigningCertUrl(signingCertUrl)) {
    throw new Error('invalid_cert_url');
  }
  const res = await fetch(signingCertUrl, { method: 'GET', redirect: 'error' });
  if (!res.ok) throw new Error(`cert_http_${res.status}`);
  return res.text();
}

/** Verify Amazon SNS message signature (SignatureVersion 1 or 2). */
export async function verifyAmazonSnsMessage(
  message: Record<string, unknown>,
  options?: SnsVerifyOptions,
): Promise<SnsVerifyResult> {
  const type = String(message.Type || '');
  if (!type) return { ok: false, reason: 'missing_type' };

  const signingCertUrl = String(message.SigningCertURL || '');
  const signature = String(message.Signature || '');
  const signatureVersion = String(message.SignatureVersion || '1');

  if (!signingCertUrl || !signature) return { ok: false, reason: 'missing_signature' };
  if (!isAllowedSnsSigningCertUrl(signingCertUrl)) return { ok: false, reason: 'invalid_cert_url' };

  const stringToSign = buildStringToSign(message);
  if (!stringToSign) return { ok: false, reason: 'unsupported_type' };

  const fetchCert = options?.fetchCertificate ?? defaultFetchCertificate;
  let certPem: string;
  try {
    certPem = await fetchCert(signingCertUrl);
  } catch {
    return { ok: false, reason: 'cert_fetch_failed' };
  }

  try {
    const algo = signatureVersion === '2' ? 'RSA-SHA256' : 'RSA-SHA1';
    const verifier = createVerify(algo);
    verifier.update(stringToSign, 'utf8');
    const valid = verifier.verify(certPem, signature, 'base64');
    return valid ? { ok: true } : { ok: false, reason: 'invalid_signature' };
  } catch {
    return { ok: false, reason: 'verify_failed' };
  }
}
