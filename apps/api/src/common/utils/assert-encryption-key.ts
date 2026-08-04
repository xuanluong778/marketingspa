export function assertEncryptionKeyConfigured(key?: string): string {
  const value = key ?? process.env.ENCRYPTION_KEY ?? process.env.TOKEN_ENCRYPTION_KEY ?? '';
  if (!value || value.length < 16) {
    throw new Error('ENCRYPTION_KEY is not configured');
  }
  return value;
}
