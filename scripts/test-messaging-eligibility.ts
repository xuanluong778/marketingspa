/**
 * MessagingEligibilityService unit scenarios.
 * Run: pnpm test:messaging-eligibility
 */
import assert from 'node:assert/strict';
import {
  evaluateMessagingEligibility,
  MESSENGER_INTERACTION_WINDOW_MS,
  ZALO_OA_CONSULT_WINDOW_MS,
} from '@marketingspa/shared';

function testMessengerWithinWindow() {
  const now = new Date();
  const r = evaluateMessagingEligibility({
    organizationId: 'org',
    channel: 'MESSENGER',
    campaignType: 'automation',
    identity: {
      externalUserId: 'psid-1',
      integrationScopeKey: 'messenger:page-1',
      lastInboundAt: new Date(now.getTime() - 60_000),
      consentStatus: 'OPTED_IN',
    },
    connection: {
      accountRef: 'page-1',
      status: 'ACTIVE',
      permissions: ['MESSAGES'],
    },
    now,
  });
  assert.equal(r.eligible, true);
  assert.equal(r.providerMode, 'MESSENGER_STANDARD');
}

function testMessengerOutsideWindow() {
  const now = new Date();
  const lastInbound = new Date(now.getTime() - MESSENGER_INTERACTION_WINDOW_MS - 1000);
  const r = evaluateMessagingEligibility({
    organizationId: 'org',
    channel: 'MESSENGER',
    campaignType: 'automation',
    identity: {
      externalUserId: 'psid-1',
      integrationScopeKey: 'messenger:page-1',
      lastInboundAt: lastInbound,
    },
    connection: { accountRef: 'page-1', status: 'ACTIVE', permissions: ['MESSAGES'] },
    now,
  });
  assert.equal(r.eligible, false);
  assert.equal(r.providerMode, 'MESSENGER_UTILITY');
  assert.equal(r.reasonCode, 'MESSENGER_OUTSIDE_WINDOW');
  assert.ok(r.nextEligibleAt);
}

function testMessengerUtilityTransactional() {
  const now = new Date();
  const r = evaluateMessagingEligibility({
    organizationId: 'org',
    channel: 'MESSENGER',
    campaignType: 'transactional',
    identity: {
      externalUserId: 'psid-1',
      integrationScopeKey: 'messenger:page-1',
      lastInboundAt: new Date(now.getTime() - MESSENGER_INTERACTION_WINDOW_MS - 1000),
    },
    connection: { accountRef: 'page-1', status: 'ACTIVE', permissions: ['MESSAGES'] },
    template: { isUtility: true, isApproved: true },
    now,
  });
  assert.equal(r.eligible, true);
  assert.equal(r.providerMode, 'MESSENGER_UTILITY');
}

function testMessengerBlockedOptOut() {
  const r = evaluateMessagingEligibility({
    organizationId: 'org',
    channel: 'MESSENGER',
    campaignType: 'automation',
    identity: {
      externalUserId: 'psid-1',
      optedOut: true,
      consentStatus: 'OPTED_OUT',
    },
    connection: { accountRef: 'page-1', status: 'ACTIVE' },
  });
  assert.equal(r.eligible, false);
  assert.equal(r.reasonCode, 'OPTED_OUT');
}

function testMessengerWrongPage() {
  const r = evaluateMessagingEligibility({
    organizationId: 'org',
    channel: 'MESSENGER',
    campaignType: 'automation',
    identity: {
      externalUserId: 'psid-1',
      integrationScopeKey: 'messenger:page-A',
      lastInboundAt: new Date(),
    },
    connection: { accountRef: 'page-B', status: 'ACTIVE', permissions: ['MESSAGES'] },
  });
  assert.equal(r.eligible, false);
  assert.equal(r.reasonCode, 'WRONG_PAGE');
}

function testZaloConsult() {
  const now = new Date();
  const r = evaluateMessagingEligibility({
    organizationId: 'org',
    channel: 'ZALO',
    campaignType: 'automation',
    identity: {
      externalUserId: 'zalo-1',
      lastInboundAt: new Date(now.getTime() - 60_000),
      followStatus: 'FOLLOWING',
    },
    connection: { accountRef: 'oa-1', status: 'ACTIVE' },
    now,
  });
  assert.equal(r.eligible, true);
  assert.equal(r.providerMode, 'ZALO_OA_CONSULT');
}

function testZaloBroadcastNotFollowing() {
  const r = evaluateMessagingEligibility({
    organizationId: 'org',
    channel: 'ZALO',
    campaignType: 'broadcast',
    identity: {
      externalUserId: 'zalo-1',
      followStatus: 'UNFOLLOWED',
    },
    connection: { accountRef: 'oa-1', status: 'ACTIVE' },
    quota: { broadcastsRemaining: 10 },
  });
  assert.equal(r.eligible, false);
  assert.equal(r.reasonCode, 'ZALO_NOT_FOLLOWING');
}

function testZaloBroadcastQuota() {
  const r = evaluateMessagingEligibility({
    organizationId: 'org',
    channel: 'ZALO',
    campaignType: 'broadcast',
    identity: {
      externalUserId: 'zalo-1',
      followStatus: 'FOLLOWING',
    },
    connection: { accountRef: 'oa-1', status: 'ACTIVE' },
    quota: { broadcastsRemaining: 0 },
  });
  assert.equal(r.eligible, false);
  assert.equal(r.reasonCode, 'BROADCAST_QUOTA_EXCEEDED');
}

function testZbsTemplate() {
  const r = evaluateMessagingEligibility({
    organizationId: 'org',
    channel: 'ZALO',
    campaignType: 'template',
    identity: { externalUserId: '0900111222' },
    connection: { accountRef: 'zbs-1', status: 'ACTIVE' },
    template: { isZbsTemplate: true, isApproved: true },
    walletBalance: 500,
    estimatedCostPerMessage: 200,
    quota: { templatesRemaining: 5 },
  });
  assert.equal(r.eligible, true);
  assert.equal(r.providerMode, 'ZBS_TEMPLATE');
  assert.equal(r.estimatedCost, 200);
}

function testZbsInsufficientBalance() {
  const r = evaluateMessagingEligibility({
    organizationId: 'org',
    channel: 'ZALO',
    campaignType: 'template',
    identity: { externalUserId: '0900111222' },
    template: { isZbsTemplate: true, isApproved: true },
    walletBalance: 50,
    estimatedCostPerMessage: 200,
  });
  assert.equal(r.eligible, false);
  assert.equal(r.reasonCode, 'INSUFFICIENT_BALANCE');
}

function testZaloOutsideConsultWindow() {
  const now = new Date();
  const r = evaluateMessagingEligibility({
    organizationId: 'org',
    channel: 'ZALO',
    campaignType: 'automation',
    identity: {
      externalUserId: 'zalo-1',
      lastInboundAt: new Date(now.getTime() - ZALO_OA_CONSULT_WINDOW_MS - 1000),
      followStatus: 'FOLLOWING',
    },
    connection: { accountRef: 'oa-1', status: 'ACTIVE' },
    now,
  });
  assert.equal(r.eligible, false);
  assert.equal(r.reasonCode, 'ZALO_OUTSIDE_CONSULT_WINDOW');
}

function main() {
  testMessengerWithinWindow();
  testMessengerOutsideWindow();
  testMessengerUtilityTransactional();
  testMessengerBlockedOptOut();
  testMessengerWrongPage();
  testZaloConsult();
  testZaloBroadcastNotFollowing();
  testZaloBroadcastQuota();
  testZbsTemplate();
  testZbsInsufficientBalance();
  testZaloOutsideConsultWindow();
  console.log('messaging-eligibility PASS');
}

main();
