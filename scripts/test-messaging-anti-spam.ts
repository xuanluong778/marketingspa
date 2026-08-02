/**
 * Prompt 9 — quiet hours, opt-out keywords, template fallbacks.
 * Run: pnpm test:messaging-anti-spam
 */
import assert from 'node:assert/strict';
import {
  isInQuietHours,
  nextQuietHoursEnd,
  matchesOptOutKeyword,
  renderTemplateWithFallbacks,
  previewTemplateContent,
  evaluateMessagingEligibility,
  ELIGIBILITY_REASON,
  MESSAGING_RESCHEDULE_REASON_CODES,
} from '@marketingspa/shared';

function testQuietHours() {
  // 23:00 VN is in 22:00–08:00
  const late = new Date('2026-07-22T16:00:00.000Z'); // 23:00 Asia/Ho_Chi_Minh
  assert.equal(isInQuietHours(late, '22:00', '08:00', 'Asia/Ho_Chi_Minh'), true);
  const next = nextQuietHoursEnd(late, '22:00', '08:00', 'Asia/Ho_Chi_Minh');
  assert.ok(next);
  assert.ok(next!.getTime() > late.getTime());

  const noon = new Date('2026-07-22T05:00:00.000Z'); // 12:00 VN
  assert.equal(isInQuietHours(noon, '22:00', '08:00', 'Asia/Ho_Chi_Minh'), false);
}

function testOptOutKeywords() {
  assert.equal(matchesOptOutKeyword('Xin STOP giúp', ['STOP', 'HUY']), true);
  assert.equal(matchesOptOutKeyword('dừng nhận tin', ['DUNG']), true);
  assert.equal(matchesOptOutKeyword('Xin chào spa', ['STOP']), false);
}

function testTemplateFallback() {
  const { rendered, missingKeys } = renderTemplateWithFallbacks(
    'Xin chào {{customer_name}}, hẹn {{appointment_time}}',
    { appointment_time: '10:00' },
    { customer_name: 'Quý khách' },
  );
  assert.equal(rendered, 'Xin chào Quý khách, hẹn 10:00');
  assert.deepEqual(missingKeys, []);

  const preview = previewTemplateContent({
    body: 'Hi {{x}}',
    context: {},
    fallbacks: {},
    ctaLabel: 'Đặt lịch',
    ctaUrl: 'https://example.com',
  });
  assert.equal(preview.text, 'Hi ');
  assert.deepEqual(preview.missingKeys, ['x']);
  assert.equal(preview.cta?.label, 'Đặt lịch');
}

function testQuietHoursEligibility() {
  const now = new Date('2026-07-22T16:00:00.000Z');
  const r = evaluateMessagingEligibility({
    organizationId: 'org',
    channel: 'MESSENGER',
    campaignType: 'broadcast',
    identity: {
      externalUserId: 'psid-1',
      integrationScopeKey: 'messenger:page-1',
      lastInboundAt: now,
      consentStatus: 'OPTED_IN',
    },
    connection: { accountRef: 'page-1', status: 'ACTIVE', permissions: ['MESSAGES'] },
    quietHours: { start: '22:00', end: '08:00', timeZone: 'Asia/Ho_Chi_Minh' },
    now,
  });
  assert.equal(r.eligible, false);
  assert.equal(r.reasonCode, ELIGIBILITY_REASON.QUIET_HOURS);
  assert.ok(r.nextEligibleAt);
  assert.equal(MESSAGING_RESCHEDULE_REASON_CODES.has(ELIGIBILITY_REASON.QUIET_HOURS), true);
}

function testManualContact() {
  const r = evaluateMessagingEligibility({
    organizationId: 'org',
    channel: 'ZALO',
    campaignType: 'broadcast',
    identity: {
      externalUserId: 'zalo-1',
      integrationScopeKey: 'zalo:oa-1',
      lastInboundAt: new Date(),
      consentStatus: 'OPTED_IN',
      followStatus: 'FOLLOWING',
    },
    connection: { accountRef: 'oa-1', status: 'ACTIVE', permissions: ['send_message'] },
    sendHistory: { recentlyManualMessaged: true },
  });
  assert.equal(r.eligible, false);
  assert.equal(r.reasonCode, ELIGIBILITY_REASON.MANUAL_RECENT_CONTACT);
}

function main() {
  testQuietHours();
  testOptOutKeywords();
  testTemplateFallback();
  testQuietHoursEligibility();
  testManualContact();
  console.log('messaging-anti-spam PASS');
}

main();
