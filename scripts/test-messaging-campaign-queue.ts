/**
 * Messaging campaign queue — error classification + idempotency helpers.
 * Run: pnpm test:messaging-campaign-queue
 */
import assert from 'node:assert/strict';
import {
  buildCampaignDispatchJobId,
  buildCampaignPlanJobId,
  buildRecipientIdempotencyKey,
  isPermanentMessagingError,
  parseRetryAfterSeconds,
} from '@marketingspa/shared';

function testIdempotencyKeys() {
  assert.equal(buildCampaignPlanJobId('c1'), 'messaging-plan-c1');
  assert.equal(buildCampaignDispatchJobId('c1'), 'messaging-dispatch-c1');
  assert.equal(buildCampaignDispatchJobId('c1', 'r99'), 'messaging-dispatch-c1-r99');
  assert.equal(buildRecipientIdempotencyKey('c1', 'i1'), 'mc-c1-i1');
}

function testPermanentErrors() {
  assert.equal(isPermanentMessagingError({ reasonCode: 'OPTED_OUT' }), true);
  assert.equal(isPermanentMessagingError({ reasonCode: 'BLOCKED' }), true);
  assert.equal(isPermanentMessagingError({ httpStatus: 403 }), true);
  assert.equal(isPermanentMessagingError({ httpStatus: 429 }), false);
  assert.equal(isPermanentMessagingError({ message: 'permission denied for page' }), true);
  assert.equal(isPermanentMessagingError({ message: 'temporary server error' }), false);
}

function testRetryAfter() {
  assert.equal(parseRetryAfterSeconds('10'), 10);
  assert.equal(parseRetryAfterSeconds(null, 7), 7);
}

function main() {
  testIdempotencyKeys();
  testPermanentErrors();
  testRetryAfter();
  console.log('messaging-campaign-queue PASS');
}

main();
