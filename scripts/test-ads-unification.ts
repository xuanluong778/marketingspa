/**
 * Unification tests: no module reads Ads tokens from Integration / FacebookAdsConnection.
 * Run: pnpm test:ads-unification
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(__dirname, '..');

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function testAiAdsManagerNoTokenDecrypt() {
  const src = read('apps/api/src/ai-ads-manager/ai-ads-manager.service.ts');
  assert.ok(!src.includes('decryptSecret'), 'AI manager must not decrypt secrets');
  assert.ok(!src.includes('decodeStoredSecret'), 'AI manager must not decode AdConnection');
  assert.ok(!src.includes('encryptedAccessToken'), 'no legacy FB token column');
  assert.ok(!src.includes('MetaGraphApiService'), 'Meta Graph only in ad-performance');
  assert.ok(!src.includes('mockCampaigns'), 'Google mock campaigns removed');
  assert.ok(src.includes('adsMcp') || src.includes('AdsMcpGateway') || src.includes('normalizedAds'), 'must read via MCP or AdsNormalizedService');
  assert.ok(src.includes('AdConnectionFacade') || src.includes('connections'), 'use facade');
  assert.ok(src.includes('setCampaignActive'), 'pause/enable via FacebookAdsService');
  console.log('PASS ai-ads-manager read-only / no token');
}

function testIntegrationsNoAdsCredentialStore() {
  const src = read('apps/api/src/integrations/integrations.service.ts');
  assert.ok(src.includes('isAdsIntegrationProvider') || src.includes('META_ADS'));
  assert.ok(src.includes('adConnections') || src.includes('AdConnectionFacade'));
  assert.ok(
    src.includes('không lưu credential') || src.includes('không nhận credential') || src.includes('AdConnection'),
  );
  // decryptSecret may remain for Zalo/SMS/Email — must not be used on Ads providers path without guard
  assert.ok(src.includes('isAdsIntegrationProvider'));
  // fetchCampaigns for ads must not call createConnector(META)
  const fetchIdx = src.indexOf('async fetchCampaigns');
  const fetchBody = src.slice(fetchIdx, fetchIdx + 1200);
  assert.ok(fetchBody.includes('isAdsIntegrationProvider'));
  assert.ok(!fetchBody.includes('createConnector(provider)') || fetchBody.indexOf('isAdsIntegrationProvider') < fetchBody.indexOf('createConnector'));
  console.log('PASS integrations Ads facade only');
}

function testMockAdsConnectorsDisabled() {
  const src = read('apps/api/src/marketing/connectors/connector.registry.ts');
  assert.ok(src.includes('DEPRECATED'));
  assert.ok(src.includes('isAdsIntegrationProvider'));
  assert.ok(src.includes('mock connector disabled') || src.includes('AdConnection'));
  console.log('PASS Ads mock connectors disabled in registry');
}

function testFacebookConnectionHasNoTokenColumnUsage() {
  const schema = read('packages/database/prisma/schema.prisma');
  const fbModel = schema.slice(
    schema.indexOf('model FacebookAdsConnection'),
    schema.indexOf('model FacebookAdsSyncLog'),
  );
  assert.ok(!fbModel.includes('encryptedAccessToken'), 'FB connection must not store token');
  assert.ok(fbModel.includes('connectedByUserId') || fbModel.includes('organizationId'));

  const adConn = schema.slice(
    schema.indexOf('model AdConnection'),
    schema.indexOf('model AdPlatformAccount'),
  );
  assert.ok(adConn.includes('encryptedCredentials'));
  assert.ok(adConn.includes('@@unique([organizationId, provider])'));
  console.log('PASS schema single credential store');
}

function testAdPerformanceOwnsSyncAndToken() {
  const fb = read('apps/api/src/ad-performance/facebook-ads/facebook-ads.service.ts');
  assert.ok(fb.includes('AdConnectionFacade') || fb.includes('connections.getMetaAccessToken'));
  assert.ok(fb.includes('enqueueMetaSync') || fb.includes('adsSyncQueue'), 'sync via BullMQ enqueue');
  assert.ok(fb.includes('setCampaignActive'));

  const facade = read('apps/api/src/ad-performance/ad-connection.facade.ts');
  assert.ok(facade.includes('getMetaAccessToken'));
  assert.ok(facade.includes('decodeStoredSecret'));
  assert.ok(facade.includes('credentialSource'));

  const worker = read('apps/worker/src/processors/ads-sync.ts');
  assert.ok(worker.includes('decryptSecret'), 'worker decrypts from DB');
  assert.ok(worker.includes('materializeInsights') || worker.includes('adInsight.upsert'));
  console.log('PASS ad-performance enqueue + worker materialize');
}

function testNoGoogleMockInNormalized() {
  const src = read('apps/api/src/ad-performance/ads-normalized.service.ts');
  assert.ok(src.includes('syncGoogleStub'));
  assert.ok(!src.includes('g-demo-1'));
  assert.ok(src.includes('deprecated') || src.includes('BullMQ'));
  console.log('PASS Google stub deprecated (real OAuth/BullMQ)');
}

function main() {
  testAiAdsManagerNoTokenDecrypt();
  testIntegrationsNoAdsCredentialStore();
  testMockAdsConnectorsDisabled();
  testFacebookConnectionHasNoTokenColumnUsage();
  testAdPerformanceOwnsSyncAndToken();
  testNoGoogleMockInNormalized();
  console.log('\nAll Ads unification checks passed.');
}

main();
