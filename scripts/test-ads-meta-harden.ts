/**
 * Meta Ads harden — Bearer, org-scope, hierarchy sync, no Fanpage env.
 * Run: pnpm test:ads-meta-harden
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(__dirname, '..');

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function testBearerOnlyNoQueryUserToken() {
  const api = read('apps/api/src/ad-performance/facebook-ads/meta-graph-api.service.ts');
  assert.ok(api.includes('Authorization: `Bearer ${accessToken}`') || api.includes("Authorization: `Bearer ${accessToken}`"));
  assert.ok(api.includes('Authorization'));
  // User Graph calls must not append access_token= to URL when token is provided via header path
  const getJson = api.slice(api.indexOf('private async getJson'));
  assert.ok(getJson.includes('Bearer'));
  assert.ok(!getJson.includes('access_token='));

  const worker = read('apps/worker/src/lib/meta-graph-ads.ts');
  assert.ok(worker.includes('Authorization'));
  assert.ok(worker.includes('Bearer'));
  assert.ok(!worker.includes('access_token='));
  assert.ok(worker.includes('MetaRateLimitError'));
  assert.ok(worker.includes('MetaTokenExpiredError'));
  assert.ok(worker.includes('MetaPermissionError'));
  assert.ok(worker.includes('metaGetAllPages') || worker.includes('paging'));
  assert.ok(worker.includes('retry-after') || worker.includes('retryAfter'));
  console.log('PASS Bearer + pagination + error classes');
}

function testNoFanpageEnvForAds() {
  const paths = [
    'apps/api/src/ad-performance/facebook-ads/meta-graph-api.service.ts',
    'apps/api/src/ad-performance/facebook-ads/facebook-ads.service.ts',
    'apps/api/src/ad-performance/ads-sync-queue.service.ts',
    'apps/worker/src/lib/meta-graph-ads.ts',
    'apps/worker/src/processors/ads-sync.ts',
  ];
  for (const p of paths) {
    const src = read(p);
    assert.ok(
      !src.includes('process.env.META_PAGE_ACCESS_TOKEN') &&
        !src.includes("config.get<string>('META_PAGE_ACCESS_TOKEN')") &&
        !src.includes('config.get("META_PAGE_ACCESS_TOKEN")'),
      `${p} must not read Fanpage env token`,
    );
    assert.ok(
      !src.includes('process.env.META_PAGE_ID') &&
        !src.includes("config.get<string>('META_PAGE_ID')"),
      `${p} must not read Fanpage page id for Ads`,
    );
  }
  console.log('PASS no Fanpage env on Ads paths');
}

function testReuseOAuthNoSecond() {
  const ai = read('apps/api/src/ai-ads-manager/ai-ads-manager.service.ts');
  assert.ok(ai.includes('facebookAds.getOAuthStartUrl') || ai.includes('getMetaOAuthStart'));
  assert.ok(ai.includes('FacebookAdsService'));
  // No separate dialog oauth builder for Ads in ai-ads-manager
  assert.ok(!ai.includes('dialog/oauth'));
  console.log('PASS reuse FacebookAdsService OAuth');
}

function testRbacConnectSync() {
  const ctrl = read('apps/api/src/ad-performance/facebook-ads/facebook-ads.controller.ts');
  assert.ok(ctrl.includes("'ads.connect'"));
  assert.ok(ctrl.includes("'ads.sync'"));
  const oauthBlock = ctrl.slice(ctrl.indexOf("oauth/start"), ctrl.indexOf("oauth/callback"));
  assert.ok(oauthBlock.includes('ads.connect'));
  const syncBlock = ctrl.slice(ctrl.indexOf("@Post('sync')"), ctrl.indexOf("@Get('sync-jobs')"));
  assert.ok(syncBlock.includes('ads.sync'));
  console.log('PASS RBAC ads.connect / ads.sync');
}

function testOrgScopedConnection() {
  const schema = read('packages/database/prisma/schema.prisma');
  const adConn = schema.slice(schema.indexOf('model AdConnection'), schema.indexOf('model AdsSyncJob'));
  assert.ok(adConn.includes('@@unique([organizationId, provider])'));
  const facade = read('apps/api/src/ad-performance/ad-connection.facade.ts');
  assert.ok(facade.includes('organizationId_provider'));
  assert.ok(facade.includes('getMetaAccessToken'));
  console.log('PASS org-scoped AdConnection');
}

function testHierarchyBullMqSync() {
  const proc = read('apps/worker/src/processors/ads-sync.ts');
  assert.ok(proc.includes('fetchMetaAdAccount'));
  assert.ok(proc.includes('fetchMetaCampaigns'));
  assert.ok(proc.includes('fetchMetaAdSets'));
  assert.ok(proc.includes('fetchMetaAds'));
  assert.ok(proc.includes('fetchMetaDailyCampaignInsights'));
  assert.ok(proc.includes('upsertMetaAdAccount'));
  assert.ok(proc.includes('upsertDailyCampaignStats'));
  assert.ok(proc.includes('MetaTokenExpiredError'));
  assert.ok(proc.includes('MetaPermissionError'));
  assert.ok(proc.includes('decodeMetaAccessToken'));

  const persist = read('apps/worker/src/lib/ads-hierarchy-persist.ts');
  assert.ok(persist.includes('adDailyStat.upsert'));
  assert.ok(persist.includes('adSet.create') || persist.includes('adSet.update'));
  assert.ok(persist.includes('adCreative'));
  console.log('PASS hierarchy + daily via BullMQ');
}

function testDecryptAtCallSite() {
  const fb = read('apps/api/src/ad-performance/facebook-ads/facebook-ads.service.ts');
  assert.ok(fb.includes('Decrypt ngay trước') || fb.includes('getValidAccessToken') || fb.includes('getMetaAccessToken'));
  const queue = read('apps/api/src/ad-performance/ads-sync-queue.service.ts');
  assert.ok(!queue.includes('decryptSecret'));
  assert.ok(!queue.includes('getMetaAccessToken'));
  console.log('PASS decrypt at call / no token in queue');
}

function main() {
  testBearerOnlyNoQueryUserToken();
  testNoFanpageEnvForAds();
  testReuseOAuthNoSecond();
  testRbacConnectSync();
  testOrgScopedConnection();
  testHierarchyBullMqSync();
  testDecryptAtCallSite();
  console.log('\nAll Meta Ads harden checks passed.');
}

main();
