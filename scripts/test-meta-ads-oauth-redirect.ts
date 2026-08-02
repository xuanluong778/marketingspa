/**
 * Meta Ads OAuth redirect URI — App Review / URL blocked fix.
 * Run: pnpm test:meta-ads-oauth-redirect
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  MARKETINGAUTOAZ_META_ADS_OAUTH_REDIRECT_URI,
  normalizeOAuthRedirectUri,
  resolveMetaAdsOAuthRedirectUri,
} from '../apps/api/src/ad-performance/facebook-ads/assert-meta-ads-oauth';

const root = path.join(__dirname, '..');

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function testCanonicalConstant() {
  assert.equal(
    MARKETINGAUTOAZ_META_ADS_OAUTH_REDIRECT_URI,
    'https://marketingautoaz.com/api/v1/ad-performance/facebook/oauth/callback',
  );
  assert.ok(!MARKETINGAUTOAZ_META_ADS_OAUTH_REDIRECT_URI.endsWith('/'));
  assert.ok(!MARKETINGAUTOAZ_META_ADS_OAUTH_REDIRECT_URI.includes('auto-post'));
  console.log('PASS canonical Meta Ads redirect URI');
}

function testResolveProduction() {
  const uri = resolveMetaAdsOAuthRedirectUri((k) => {
    const map: Record<string, string> = {
      APP_URL: 'https://marketingautoaz.com',
      API_URL: 'https://marketingautoaz.com',
      META_ADS_REDIRECT_URI:
        'https://marketingautoaz.com/api/v1/ad-performance/facebook/oauth/callback',
    };
    return map[k];
  });
  assert.equal(uri, MARKETINGAUTOAZ_META_ADS_OAUTH_REDIRECT_URI);
  console.log('PASS resolve production META_ADS_REDIRECT_URI');
}

function testTrailingSlashNormalized() {
  const uri = resolveMetaAdsOAuthRedirectUri((k) => {
    const map: Record<string, string> = {
      APP_URL: 'https://marketingautoaz.com',
      META_ADS_REDIRECT_URI:
        'https://marketingautoaz.com/api/v1/ad-performance/facebook/oauth/callback/',
    };
    return map[k];
  });
  assert.equal(uri, MARKETINGAUTOAZ_META_ADS_OAUTH_REDIRECT_URI);
  assert.equal(
    normalizeOAuthRedirectUri(
      'https://marketingautoaz.com/api/v1/ad-performance/facebook/oauth/callback/',
    ),
    MARKETINGAUTOAZ_META_ADS_OAUTH_REDIRECT_URI,
  );
  console.log('PASS trailing slash normalized');
}

function testRejectLocalhostInProduction() {
  assert.throws(
    () =>
      resolveMetaAdsOAuthRedirectUri((k) => {
        const map: Record<string, string> = {
          APP_URL: 'https://marketingautoaz.com',
          META_ADS_REDIRECT_URI:
            'http://localhost:4000/api/v1/ad-performance/facebook/oauth/callback',
        };
        return map[k];
      }),
    /khớp tuyệt đối|localhost|HTTPS/i,
  );
  console.log('PASS reject localhost on production');
}

function testRejectAutoPostCallback() {
  assert.throws(
    () =>
      resolveMetaAdsOAuthRedirectUri((k) => {
        const map: Record<string, string> = {
          APP_URL: 'https://marketingautoaz.com',
          META_ADS_REDIRECT_URI:
            'https://marketingautoaz.com/api/v1/auto-post/facebook/oauth/callback',
        };
        return map[k];
      }),
    /khớp tuyệt đối|Auto Post|auto-post/i,
  );
  console.log('PASS reject Auto Post callback for Ads');
}

function testAuthorizeAndExchangeSameGetter() {
  const meta = read('apps/api/src/ad-performance/facebook-ads/meta-graph-api.service.ts');
  assert.ok(meta.includes('resolveMetaAdsOAuthRedirectUri'));
  assert.ok(meta.includes('redirect_uri: this.redirectUri'));
  const buildIdx = meta.indexOf('buildOAuthUrl');
  const exchangeIdx = meta.indexOf('exchangeCodeForToken');
  const buildSlice = meta.slice(buildIdx, exchangeIdx);
  const exchangeSlice = meta.slice(exchangeIdx, exchangeIdx + 400);
  assert.ok(buildSlice.includes('redirect_uri: this.redirectUri'));
  assert.ok(exchangeSlice.includes('redirect_uri: this.redirectUri'));
  assert.ok(!meta.includes("config.get<string>('META_REDIRECT_URI') ??"));
  console.log('PASS authorize + exchange share redirectUri getter');
}

function testCallbackRedirectsToConnections() {
  const svc = read('apps/api/src/ad-performance/facebook-ads/facebook-ads.service.ts');
  assert.ok(svc.includes('/ads?tab=connections'));
  assert.ok(svc.includes('facebook=connected'));
  assert.ok(svc.includes('oauth_denied'));
  assert.ok(svc.includes('invalid_state'));
  assert.ok(svc.includes('resolveAppUrl'));
  assert.ok(svc.includes('returnTo ?? \'ads\'') || svc.includes('returnTo ?? "ads"'));
  console.log('PASS callback redirects to /ads?tab=connections');
}

function testStateSignedOneTime() {
  const svc = read('apps/api/src/ad-performance/facebook-ads/facebook-ads.service.ts');
  assert.ok(svc.includes('createHmac'));
  assert.ok(svc.includes('timingSafeEqual'));
  assert.ok(svc.includes('STATE_TTL_SEC') || svc.includes('10 * 60'));
  assert.ok(svc.includes('getdel') || svc.includes('state_reused'));
  assert.ok(svc.includes('organizationId'));
  console.log('PASS OAuth state HMAC + TTL + one-time');
}

function testEnvExampleHasMetaAdsVar() {
  const ex = read('.env.example');
  assert.ok(ex.includes('META_ADS_REDIRECT_URI='));
  console.log('PASS .env.example documents META_ADS_REDIRECT_URI');
}

function main() {
  testCanonicalConstant();
  testResolveProduction();
  testTrailingSlashNormalized();
  testRejectLocalhostInProduction();
  testRejectAutoPostCallback();
  testAuthorizeAndExchangeSameGetter();
  testCallbackRedirectsToConnections();
  testStateSignedOneTime();
  testEnvExampleHasMetaAdsVar();
  console.log('\nALL meta-ads-oauth-redirect checks PASS');
  console.log('\nAdd this exact URI in Meta Dashboard:');
  console.log(MARKETINGAUTOAZ_META_ADS_OAUTH_REDIRECT_URI);
}

main();
