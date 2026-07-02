import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT = 'marketingspa-integration-v1';

/**
 * Placeholder encryption helper — dùng ENCRYPTION_KEY từ env.
 * Không lưu API key plain text; production nên dùng KMS/Vault.
 */
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

export function maskSecret(value: string): string {
  if (!value) return '';
  if (value.length <= 4) return '****';
  return `${'*'.repeat(Math.min(value.length - 4, 12))}${value.slice(-4)}`;
}
