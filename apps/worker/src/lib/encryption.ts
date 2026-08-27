import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT = 'marketingspa-integration-v1';

export function encryptSecret(plaintext: string, encryptionKey: string): string {
  if (!encryptionKey || encryptionKey.length < 16) {
    throw new Error('ENCRYPTION_KEY must be set (min 16 chars) to store credentials');
  }
  const key = scryptSync(encryptionKey, SALT, 32);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptSecret(ciphertext: string, encryptionKey: string): string {
  if (!encryptionKey || encryptionKey.length < 16) {
    throw new Error('ENCRYPTION_KEY must be set (min 16 chars) to read credentials');
  }
  const key = scryptSync(encryptionKey, SALT, 32);
  const data = Buffer.from(ciphertext, 'base64');
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function parseConnectionCredentials(
  encrypted: string | null | undefined,
): Record<string, string> {
  if (!encrypted?.trim()) return {};
  const key = process.env.ENCRYPTION_KEY ?? '';
  const raw = decryptSecret(encrypted, key);
  return JSON.parse(raw) as Record<string, string>;
}

export function encryptConnectionCredentials(credentials: Record<string, string>): string {
  const key = process.env.ENCRYPTION_KEY ?? '';
  return encryptSecret(JSON.stringify(credentials), key);
}
