/**
 * Unit tests — meta-reviewer-access.util
 */
import assert from 'node:assert/strict';
import {
  canUseAutoPostOAuthCanary,
  isMetaAppReviewerEmail,
} from '../apps/api/src/auto-post/meta-reviewer-access.util';

const getEnv = (k: string) =>
  ({
    AUTO_POST_OAUTH_CANARY: 'true',
    AUTO_POST_OAUTH_CANARY_ORG_IDS: 'org-allowed',
    META_REVIEWER_EMAIL: 'reviewer@example.com',
  })[k];

function main() {
  assert.equal(isMetaAppReviewerEmail('reviewer@example.com', getEnv), true);
  assert.equal(isMetaAppReviewerEmail('other@example.com', getEnv), false);

  assert.equal(
    canUseAutoPostOAuthCanary(
      { email: 'reviewer@example.com', role: 'OWNER', organizationId: 'org-other' },
      getEnv,
    ),
    true,
    'reviewer email bypasses canary',
  );

  assert.equal(
    canUseAutoPostOAuthCanary(
      { email: 'user@example.com', role: 'OWNER', organizationId: 'org-allowed' },
      getEnv,
    ),
    true,
    'allowlist org',
  );

  assert.equal(
    canUseAutoPostOAuthCanary(
      { email: 'user@example.com', role: 'OWNER', organizationId: 'org-blocked' },
      getEnv,
    ),
    false,
    'blocked org',
  );

  assert.equal(
    canUseAutoPostOAuthCanary(
      { email: 'user@example.com', role: 'SUPER_ADMIN', organizationId: 'x' },
      getEnv,
    ),
    true,
    'super admin',
  );

  console.log('test-meta-reviewer-access: all passed');
}

main();
