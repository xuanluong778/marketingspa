const SYSTEM_USER_PATTERN = /system user/i;
const MARKETINGAUTOAZ_SERVICE_PATTERN = /^marketingautoaz\b/i;

/** Reviewer-facing label — never show System User wording for user OAuth. */
export function sanitizeFacebookDisplayName(
  name: string | null | undefined,
  fallback = 'Connected Facebook account',
): string {
  const trimmed = name?.trim();
  if (!trimmed) return fallback;
  if (SYSTEM_USER_PATTERN.test(trimmed) || MARKETINGAUTOAZ_SERVICE_PATTERN.test(trimmed)) {
    return fallback;
  }
  return trimmed;
}
