/** Meta App Reviewer — bypass OAuth canary khi email khớp META_REVIEWER_EMAIL. */
export function resolveMetaReviewerEmail(
  getEnv: (key: string) => string | undefined,
): string | null {
  const email = getEnv('META_REVIEWER_EMAIL')?.trim().toLowerCase();
  return email || null;
}

export function isMetaAppReviewerEmail(
  email: string | null | undefined,
  getEnv: (key: string) => string | undefined,
): boolean {
  const reviewer = resolveMetaReviewerEmail(getEnv);
  if (!reviewer || !email) return false;
  return email.trim().toLowerCase() === reviewer;
}

/**
 * AUTO_POST_OAUTH_CANARY=true → chỉ SUPER_ADMIN, org allowlist, hoặc Meta reviewer.
 */
export function canUseAutoPostOAuthCanary(
  user: { email: string; role: string; organizationId: string },
  getEnv: (key: string) => string | undefined,
): boolean {
  const canaryOn =
    (getEnv('AUTO_POST_OAUTH_CANARY') ?? '').trim().toLowerCase() === 'true';
  if (!canaryOn) return true;
  if (user.role === 'SUPER_ADMIN') return true;
  if (isMetaAppReviewerEmail(user.email, getEnv)) return true;

  const orgs = (getEnv('AUTO_POST_OAUTH_CANARY_ORG_IDS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return Boolean(user.organizationId && orgs.includes(user.organizationId));
}
