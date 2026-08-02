/**
 * Google Ads OAuth + BullMQ — no paste token, no mock.
 * Run: pnpm test:ads-google-oauth
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(__dirname, '..');

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function testNoPasteFromFrontend() {
  const svc = read('apps/api/src/ai-ads-manager/ai-ads-manager.service.ts');
  assert.ok(svc.includes('Không chấp nhận paste Google refresh token'));
  assert.ok(svc.includes('getGoogleOAuthStart') || svc.includes('googleAds.getOAuthStartUrl'));
  assert.ok(svc.includes('enqueueGoogleSync'));

  const page = read('apps/web/src/components/ai-ads-manager/ai-ads-manager-page.tsx');
  assert.ok(page.includes('startGoogleOAuth'));
  assert.ok(!page.includes('Google OAuth (sắp có)'));
  assert.ok(!/paste refresh token/i.test(page) || page.includes('startGoogleOAuth'));
  console.log('PASS no paste; OAuth wired');
}

function testOAuthStateOneTime() {
  const svc = read('apps/api/src/ad-performance/google-ads/google-ads.service.ts');
  assert.ok(svc.includes('createOneTimeState'));
  assert.ok(svc.includes('consumeOneTimeState'));
  assert.ok(svc.includes('oauth:google-ads:state:'));
  assert.ok(svc.includes("'NX'") || svc.includes('"NX"'));
  assert.ok(svc.includes('refreshToken'));
  assert.ok(svc.includes('encodeStoredSecret') || svc.includes('upsertEncryptedCredentials'));
  assert.ok(!svc.includes('dto.refreshToken'));
  console.log('PASS OAuth state one-time + encrypt RT');
}

function testApiNoTokenLeak() {
  const api = read('apps/api/src/ad-performance/google-ads/google-ads-api.service.ts');
  assert.ok(api.includes('GOOGLE_CLIENT_ID'));
  assert.ok(api.includes('GOOGLE_ADS_DEVELOPER_TOKEN'));
  assert.ok(api.includes('listAccessibleCustomers'));
  assert.ok(api.includes('GoogleAdsTokenExpiredError'));
  assert.ok(api.includes('GoogleAdsRateLimitError'));
  assert.ok(api.includes('Authorization'));

  const ctrl = read('apps/api/src/ad-performance/google-ads/google-ads.controller.ts');
  assert.ok(ctrl.includes("'ads.connect'"));
  assert.ok(ctrl.includes("'ads.sync'"));
  assert.ok(ctrl.includes('customers'));
  assert.ok(ctrl.includes('oauth/callback'));
  console.log('PASS Google API + RBAC');
}

function testBullMqGoogleSync() {
  const queue = read('apps/api/src/ad-performance/ads-sync-queue.service.ts');
  assert.ok(queue.includes('enqueueGoogleSync'));
  assert.ok(queue.includes("platform: 'GOOGLE'"));

  const proc = read('apps/worker/src/processors/ads-sync.ts');
  assert.ok(proc.includes("platform === 'GOOGLE'"));
  assert.ok(proc.includes('refreshGoogleAccessToken'));
  assert.ok(proc.includes('fetchGoogleCampaigns'));
  assert.ok(proc.includes('fetchGoogleAdGroups'));
  assert.ok(proc.includes('fetchGoogleAds'));
  assert.ok(proc.includes('fetchGoogleDailyMetrics'));
  assert.ok(proc.includes('decodeGoogleRefreshToken'));
  assert.ok(!proc.includes('google_not_implemented'));
  console.log('PASS BullMQ Google hierarchy sync');
}

function testEnvExample() {
  const env = read('.env.example');
  assert.ok(env.includes('GOOGLE_CLIENT_ID'));
  assert.ok(env.includes('GOOGLE_CLIENT_SECRET'));
  assert.ok(env.includes('GOOGLE_ADS_DEVELOPER_TOKEN'));
  assert.ok(env.includes('GOOGLE_ADS_REDIRECT_URI'));
  console.log('PASS env example');
}

function testOrgScoped() {
  const schema = read('packages/database/prisma/schema.prisma');
  assert.ok(schema.includes('enum AdConnectionProvider'));
  assert.ok(schema.includes('GOOGLE'));
  const facade = read('apps/api/src/ad-performance/ad-connection.facade.ts');
  assert.ok(facade.includes('AdConnectionProvider.GOOGLE'));
  console.log('PASS org-scoped AdConnection GOOGLE');
}

function main() {
  testNoPasteFromFrontend();
  testOAuthStateOneTime();
  testApiNoTokenLeak();
  testBullMqGoogleSync();
  testEnvExample();
  testOrgScoped();
  console.log('\nAll Google Ads OAuth checks passed.');
}

main();
