/**
 * Fail-fast khi thiếu ENCRYPTION_KEY — dùng lúc API/worker bootstrap.
 * Khóa phải đủ dài để scrypt → AES-256-GCM (32-byte key material).
 */
export function assertEncryptionKeyConfigured(
  encryptionKey: string | undefined | null,
  context = 'ENCRYPTION_KEY',
): string {
  const key = (encryptionKey ?? '').trim();
  if (!key || key.length < 16) {
    throw new Error(
      `${context} chưa cấu hình hoặc quá ngắn (min 16 chars). ` +
        `Facebook/Meta access tokens yêu cầu AES-256-GCM — không được fallback plaintext.`,
    );
  }
  if (/^(change_me|changeme|test|todo|replace)/i.test(key)) {
    throw new Error(`${context} vẫn là giá trị placeholder — hãy đặt khóa production thật.`);
  }
  return key;
}
