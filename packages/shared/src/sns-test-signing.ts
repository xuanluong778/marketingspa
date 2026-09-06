import { createHash, createSign, generateKeyPairSync } from 'crypto';

const TEST_CERT_URL = 'https://sns.ap-southeast-1.amazonaws.com/test-cert.pem';

let cachedKeys: { privateKey: string; certPem: string } | null = null;

function testKeyPair() {
  if (cachedKeys) return cachedKeys;
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  cachedKeys = {
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    certPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
  };
  return cachedKeys;
}

function fieldOrder(type: string): string[] {
  if (type === 'Notification') {
    return ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'];
  }
  return ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'];
}

function buildStringToSign(message: Record<string, unknown>): string {
  const type = String(message.Type || '');
  const parts: string[] = [];
  for (const field of fieldOrder(type)) {
    if (field === 'Subject' && message.Subject == null) continue;
    const value = message[field];
    if (value === undefined || value === null) continue;
    parts.push(String(value));
  }
  return `${parts.join('\n')}\n`;
}

/** Build a syntactically valid signed SNS envelope for automated tests (mock cert fetch). */
export function buildSignedSnsEnvelope(
  base: Record<string, unknown>,
  opts?: { signatureVersion?: '1' | '2' },
): Record<string, unknown> {
  const keys = testKeyPair();
  const envelope: Record<string, unknown> = {
    SignatureVersion: opts?.signatureVersion ?? '1',
    SigningCertURL: TEST_CERT_URL,
    ...base,
  };
  const stringToSign = buildStringToSign(envelope);
  const algo = envelope.SignatureVersion === '2' ? 'RSA-SHA256' : 'RSA-SHA1';
  const signer = createSign(algo);
  signer.update(stringToSign, 'utf8');
  envelope.Signature = signer.sign(keys.privateKey, 'base64');
  return envelope;
}

export function testSnsCertificateFetcher(): (url: string) => Promise<string> {
  const keys = testKeyPair();
  return async (url: string) => {
    if (url !== TEST_CERT_URL) throw new Error('unexpected_cert_url');
    return keys.certPem;
  };
}

export function snsTestSigningKey(): string {
  return (process.env.SES_SNS_WEBHOOK_TEST_SIGNING_KEY || '').trim();
}

export function buildSnsTestHmac(rawBody: string, key: string): string {
  return createHash('sha256').update(`${key}:${rawBody}`).digest('hex');
}
