/**
 * AdsActionRequest — propose → approve → worker → verify → audit
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertApproverAllowed,
  adsActionProposeSchema,
  adsActionQueuePayloadSchema,
  isAdsActionsLive,
} from '../packages/shared/src/ads-actions';
import { QUEUE_NAMES } from '../packages/shared/src/constants';

const root = path.resolve(__dirname, '..');

function testFlagDefaultOff() {
  assert.equal(isAdsActionsLive({ ADS_ACTIONS_LIVE: undefined }), false);
  assert.equal(isAdsActionsLive({ ADS_ACTIONS_LIVE: 'false' }), false);
  assert.equal(isAdsActionsLive({ ADS_ACTIONS_LIVE: 'true' }), true);
  console.log('PASS ADS_ACTIONS_LIVE default off');
}

function testIdempotencyAndPayload() {
  const propose = adsActionProposeSchema.parse({
    organizationId: '11111111-1111-1111-1111-111111111111',
    requestedByUserId: '22222222-2222-2222-2222-222222222222',
    platform: 'META',
    actionType: 'PAUSE_CAMPAIGN',
    source: 'AI',
    beforeState: { status: 'ACTIVE', campaignId: 'c1' },
    afterState: { status: 'PAUSED', campaignId: 'c1' },
    idempotencyKey: 'idem-test-key-abcdef',
    aiGenerated: true,
  });
  assert.equal(propose.aiGenerated, true);

  const q = adsActionQueuePayloadSchema.parse({
    organizationId: propose.organizationId,
    actionRequestId: '33333333-3333-3333-3333-333333333333',
  });
  assert.ok(!JSON.stringify(q).includes('token'));
  assert.equal(QUEUE_NAMES.ADS_ACTION, 'ads-action-queue');
  console.log('PASS propose + queue payload');
}

function testAiCannotSelfApprove() {
  assert.throws(() =>
    assertApproverAllowed({
      source: 'AI',
      aiGenerated: true,
      requestedByUserId: 'u1',
      approvedByUserId: 'u1',
    }),
  );
  assert.throws(() =>
    assertApproverAllowed({
      source: 'RULE',
      aiGenerated: true,
      requestedByUserId: 'u1',
      approvedByUserId: 'u1',
    }),
  );
  assert.doesNotThrow(() =>
    assertApproverAllowed({
      source: 'AI',
      aiGenerated: true,
      requestedByUserId: 'u1',
      approvedByUserId: 'u2',
    }),
  );
  assert.doesNotThrow(() =>
    assertApproverAllowed({
      source: 'HUMAN',
      aiGenerated: false,
      requestedByUserId: 'u1',
      approvedByUserId: 'u1',
    }),
  );
  console.log('PASS AI cannot self-approve');
}

function testCodeGuards() {
  const svc = fs.readFileSync(
    path.join(root, 'apps/api/src/ads-actions/ads-action.service.ts'),
    'utf8',
  );
  assert.ok(svc.includes('assertApproverAllowed'));
  assert.ok(svc.includes('idempotencyKey'));
  assert.ok(svc.includes('writeActionsEnabled'));
  assert.ok(svc.includes('ADS_ACTIONS_LIVE'));

  const worker = fs.readFileSync(
    path.join(root, 'apps/worker/src/processors/ads-action.ts'),
    'utf8',
  );
  assert.ok(worker.includes('providerWrite'));
  assert.ok(worker.includes('ADS_ACTIONS_LIVE'));
  assert.ok(!worker.includes('setCampaignActive'));
  assert.ok(worker.includes('VERIFYING') || worker.includes('verifyLocal'));

  const ai = fs.readFileSync(
    path.join(root, 'apps/api/src/ai-ads-manager/ai-ads-manager.service.ts'),
    'utf8',
  );
  assert.ok(ai.includes('adsActions.propose'));
  assert.ok(ai.includes('AI không tự duyệt') || ai.includes('không tự duyệt'));
  assert.ok(ai.includes("source: 'RULE'") || ai.includes('source: \'RULE\''));

  const envEx = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  assert.ok(envEx.includes('ADS_ACTIONS_LIVE=false'));
  assert.ok(envEx.includes('ADS_ACTIONS_PROVIDER_WRITE=false'));

  const schema = fs.readFileSync(
    path.join(root, 'packages/database/prisma/schema.prisma'),
    'utf8',
  );
  assert.ok(schema.includes('model AdsActionRequest'));
  assert.ok(schema.includes('idempotencyKey'));
  assert.ok(schema.includes('requestedByUserId'));
  assert.ok(schema.includes('approvedByUserId'));
  console.log('PASS code guards + schema');
}

testFlagDefaultOff();
testIdempotencyAndPayload();
testAiCannotSelfApprove();
testCodeGuards();
console.log('\nAll ads action request checks passed.');
