/** Hide legacy System User / env labels when presenting user OAuth connections. */
export function sanitizeFacebookUserDisplayName(
  name: string | null | undefined,
  opts?: { connectionMode?: 'env' | 'oauth' },
): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  if (opts?.connectionMode === 'env') return trimmed;
  if (/system user/i.test(trimmed) || /^marketingautoaz\b/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}
