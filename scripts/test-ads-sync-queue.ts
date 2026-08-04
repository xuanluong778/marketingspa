/**
 * Ads sync BullMQ — payload ID-only, lock, idempotent upsert, worker decrypt.
 * Run: pnpm test:ads-sync-queue
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(__dirname, '..');

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function testQueueConstants() {
  const shared = read('packages/shared/src/constants.ts');
  assert.ok(shared.includes("ADS_SYNC: 'ads-sync-queue'"));
  assert.ok(shared.includes("ADS_SYNC_PROGRESS: 'ads:sync-progress'"));

  const q = read('apps/api/src/queue/queue.constants.ts');
  assert.ok(q.includes('ADS_SYNC_QUEUE'));
  const mod = read('apps/api/src/queue/queue.module.ts');
  assert.ok(mod.includes('QUEUE_NAMES.ADS_SYNC'));
  console.log('PASS queue + WS constants');
}

function testApiEnqueueOnlyNoToken() {
  const svc = read('apps/api/src/ad-performance/ads-sync-queue.service.ts');
  assert.ok(svc.includes('enqueueMetaSync'));
  assert.ok(svc.includes('assertSafePayload'));
  assert.ok(svc.includes('backoff'));
  assert.ok(svc.includes("type: 'exponential'"));
  assert.ok(svc.includes('idempotencyKey'));
  assert.ok(svc.includes('ConflictException'));
  assert.ok(svc.includes('ADS_SYNC_QUEUED'));
  assert.ok(!/accessToken\s*:/.test(svc), 'payload must not set accessToken');
  assert.ok(!svc.includes('decryptSecret'), 'API enqueue must not decrypt token');
  assert.ok(!svc.includes('getMetaAccessToken'), 'API enqueue must not read token');

  const payloadType = svc.slice(svc.indexOf('export type AdsSyncQueuePayload'), svc.indexOf('function buildIdempotencyKey'));
  assert.ok(payloadType.includes('organizationId'));
  assert.ok(payloadType.includes('connectionId'));
  assert.ok(payloadType.includes('accountId'));
  assert.ok(payloadType.includes('dateFrom'));
  assert.ok(payloadType.includes('dateTo'));
  assert.ok(!payloadType.includes('token'), 'payload type must not include token');

  const fb = read('apps/api/src/ad-performance/facebook-ads/facebook-ads.service.ts');
  assert.ok(fb.includes('enqueueMetaSync'));
  assert.ok(fb.includes('adsSyncQueue'));
  console.log('PASS API enqueue-only, no token in payload');
}

function testControllerPollingEndpoints() {
  const ctrl = read('apps/api/src/ad-performance/facebook-ads/facebook-ads.controller.ts');
  assert.ok(ctrl.includes("sync-jobs"));
  assert.ok(ctrl.includes('listJobs'));
  assert.ok(ctrl.includes('getJob'));
  assert.ok(ctrl.includes("'ads.sync'"));
  assert.ok(ctrl.includes("'ads.read'"));
  console.log('PASS sync-jobs polling endpoints');
}

function testWorkerOwnershipDecryptLock() {
  const proc = read('apps/worker/src/processors/ads-sync.ts');
  assert.ok(proc.includes('processAdsSync'));
  assert.ok(proc.includes('assertSafePayload'));
  assert.ok(proc.includes('decryptSecret'));
  assert.ok(proc.includes('acquireAdsSyncLock'));
  assert.ok(proc.includes('releaseAdsSyncLock'));
  assert.ok(proc.includes('organizationId, connectionId'));
  assert.ok(proc.includes('facebookAdsCampaignSnapshot.upsert'));
  assert.ok(proc.includes('MetaRateLimitError'));
  assert.ok(proc.includes('moveToDelayed'));
  assert.ok(proc.includes('ADS_SYNC_TIMEOUT_MS') || proc.includes('timeoutMs'));
  assert.ok(proc.includes('WS_EVENTS.ADS_SYNC_PROGRESS'));
  assert.ok(proc.includes('ADS_SYNC_SUCCEEDED'));
  assert.ok(proc.includes('ADS_SYNC_FAILED') || proc.includes('ADS_SYNC_RETRY'));
  assert.ok(!proc.includes('job.data.accessToken'), 'must not read token from payload');
  assert.ok(!proc.includes('job.data.token'), 'must not read token from payload');

  const lock = read('apps/worker/src/lib/ads-sync-lock.ts');
  assert.ok(lock.includes('ads-sync-lock:'));
  assert.ok(lock.includes('NX'));

  const meta = read('apps/worker/src/lib/meta-graph-ads.ts');
  assert.ok(meta.includes('Authorization'));
  assert.ok(meta.includes('Bearer'));
  assert.ok(meta.includes('retry-after') || meta.includes('Retry-After') || meta.includes('retryAfter'));
  assert.ok(!meta.includes('access_token='), 'token must not be in query string');

  const idx = read('apps/worker/src/index.ts');
  assert.ok(idx.includes('QUEUE_NAMES.ADS_SYNC'));
  assert.ok(idx.includes('processAdsSync'));
  console.log('PASS worker ownership, decrypt, lock, upsert, progress');
}

function testSchemaAdsSyncJob() {
  const schema = read('packages/database/prisma/schema.prisma');
  assert.ok(schema.includes('model AdsSyncJob'));
  assert.ok(schema.includes('idempotencyKey'));
  assert.ok(schema.includes('enum AdsSyncJobStatus'));
  const snap = schema.slice(
    schema.indexOf('model FacebookAdsCampaignSnapshot'),
    schema.indexOf('model Campaign'),
  );
  assert.ok(snap.includes('@@unique([organizationId, campaignId, dateFrom, dateTo])'));
  console.log('PASS schema AdsSyncJob + idempotent snapshot unique');
}

function main() {
  testQueueConstants();
  testApiEnqueueOnlyNoToken();
  testControllerPollingEndpoints();
  testWorkerOwnershipDecryptLock();
  testSchemaAdsSyncJob();
  console.log('\nAll Ads sync queue checks passed.');
}

main();
