/**
 * Unit checks for MarketingAutoAZ Auto Post Meta OAuth fail-fast.
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-assert-auto-post-meta-oauth.ts
 */
import assert from 'node:assert/strict';
import {
  MARKETINGAUTOAZ_AUTO_POST_OAUTH_REDIRECT_URI,
  MARKETINGAUTOAZ_META_APP_ID,
  MARKETINGAUTOAZ_META_LOGIN_CONFIG_ID,
  assertAutoPostMetaOAuthConfig,
  resolveAutoPostOAuthRedirectUri,
} from '../apps/api/src/auto-post/assert-auto-post-meta-oauth';

function env(map: Record<string, string | undefined>) {
  return (k: string) => map[k];
}

function main() {
  const base = {
    NODE_ENV: 'production',
    APP_URL: 'https://marketingautoaz.com',
    API_URL: 'https://marketingautoaz.com',
    META_APP_ID: MARKETINGAUTOAZ_META_APP_ID,
    META_APP_SECRET: 'test_secret_not_used_in_static_assert_xxxxxxxxxxxx',
    META_LOGIN_CONFIG_ID: MARKETINGAUTOAZ_META_LOGIN_CONFIG_ID,
    META_AUTO_POST_REDIRECT_URI: MARKETINGAUTOAZ_AUTO_POST_OAUTH_REDIRECT_URI,
  };

  const ok = assertAutoPostMetaOAuthConfig(env(base));
  assert.equal(ok.appId, MARKETINGAUTOAZ_META_APP_ID);
  assert.equal(ok.redirectUri, MARKETINGAUTOAZ_AUTO_POST_OAUTH_REDIRECT_URI);

  assert.throws(
    () => assertAutoPostMetaOAuthConfig(env({ ...base, META_APP_ID: '1328676135903477' })),
    /META_APP_ID sai|bị cấm|Bắt buộc/,
  );

  assert.throws(
    () =>
      assertAutoPostMetaOAuthConfig(
        env({
          ...base,
          META_FACEBOOK_OAUTH_REDIRECT_URI: 'https://seoauto.vn/api/social/facebook/oauth/callback',
        }),
      ),
    /seoauto/,
  );

  assert.throws(
    () =>
      resolveAutoPostOAuthRedirectUri(
        env({
          ...base,
          META_AUTO_POST_REDIRECT_URI: 'https://seoauto.vn/wrong',
        }),
      ),
    /khớp tuyệt đối|META_AUTO_POST_REDIRECT_URI/,
  );

  console.log('test-assert-auto-post-meta-oauth: all passed');
}

main();
