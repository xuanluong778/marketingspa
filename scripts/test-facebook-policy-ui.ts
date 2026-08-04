/**
 * UI helpers for Check Content Ads — gates, hashes, badges, tenant isolation echo.
 * Run: pnpm test:facebook-policy-ui
 */
import assert from 'node:assert/strict';
import {
  adsUsabilityLabel,
  applyFindingFixes,
  contentHashFromPayload,
  evaluateAdsSendGate,
  evaluateAutoPostGate,
  findingBucket,
  formFieldsFromInitial,
  hashesFromPayload,
  isPolicySnapshotStale,
  payloadFromPostFields,
  resolvePolicyBadge,
  sanitizeFacebookPolicyCheckPayload,
  snapshotFromCheckResult,
  type ContentPolicySnapshot,
} from '../apps/web/src/lib/facebook-policy-ui';
import type {
  FacebookPolicyCheckResult,
  FacebookPolicyFinding,
} from '../apps/web/src/types/content-marketing';

function sampleFinding(partial: Partial<FacebookPolicyFinding>): FacebookPolicyFinding {
  return {
    id: 't1',
    field: 'primaryText',
    excerpt: 'cam kết 100%',
    policyGroup: 'ABSOLUTE_CLAIMS',
    policyCode: 'META-ADS',
    severity: 'HIGH',
    reason: 'test',
    remediation: 'fix',
    suggestedReplacement: 'hỗ trợ cải thiện',
    signalCount: 2,
    signals: ['a', 'b'],
    source: 'rule',
    ...partial,
  };
}

function main() {
  // Hashes / stale
  const p1 = payloadFromPostFields({
    title: 'Serum',
    content: 'Chăm sóc da dịu nhẹ',
    cta: 'Inbox',
  });
  const h1 = hashesFromPayload(p1);
  assert.ok(h1.checkedContentHash);
  const snap: ContentPolicySnapshot = {
    policyCheckId: 'pol_1',
    policyStatus: 'PASS_CANDIDATE',
    riskScore: 10,
    policyVersion: '1.0',
    checkedAt: new Date().toISOString(),
    ...h1,
    specialAdCategory: 'NONE',
    organizationId: 'org-A',
  };
  assert.equal(resolvePolicyBadge(snap, p1), 'PASS_CANDIDATE');
  const p2 = { ...p1, primaryText: 'Chăm sóc da dịu nhẹ — đã sửa' };
  assert.equal(isPolicySnapshotStale(snap, p2), true);
  assert.equal(resolvePolicyBadge(snap, p2), 'STALE');

  // Ads gates
  assert.equal(evaluateAdsSendGate({ snapshot: null }).ok, false);
  assert.equal(evaluateAdsSendGate({ snapshot: snap }).level, 'allow');
  assert.equal(
    evaluateAdsSendGate({
      snapshot: { ...snap, policyStatus: 'HIGH_RISK' },
    }).ok,
    false,
  );
  assert.equal(
    evaluateAdsSendGate({
      snapshot: { ...snap, policyStatus: 'PROHIBITED' },
    }).ok,
    false,
  );
  assert.equal(
    evaluateAdsSendGate({
      snapshot: { ...snap, policyStatus: 'INSUFFICIENT_DATA' },
    }).ok,
    false,
  );
  assert.equal(
    evaluateAdsSendGate({
      snapshot: { ...snap, policyStatus: 'REVIEW_REQUIRED' },
    }).level,
    'confirm',
  );
  assert.equal(
    evaluateAdsSendGate({
      snapshot: snap,
      rewrittenPendingRecheck: true,
    }).ok,
    false,
  );
  assert.equal(
    evaluateAdsSendGate({
      snapshot: {
        ...snap,
        needsSpecialAdCategory: true,
        specialAdCategory: 'NONE',
      },
    }).ok,
    false,
  );

  // Auto Post gates
  assert.equal(evaluateAutoPostGate({ snapshot: snap }).level, 'allow');
  assert.equal(
    evaluateAutoPostGate({
      snapshot: { ...snap, policyStatus: 'PROHIBITED' },
    }).ok,
    false,
  );
  assert.equal(
    evaluateAutoPostGate({
      snapshot: { ...snap, policyStatus: 'HIGH_RISK' },
    }).level,
    'confirm',
  );
  assert.equal(evaluateAutoPostGate({ snapshot: null }).level, 'confirm');

  // Finding buckets
  assert.equal(findingBucket(sampleFinding({ id: 'img:x' })), 'Image');
  assert.equal(findingBucket(sampleFinding({ id: 'vid:x' })), 'Video');
  assert.equal(findingBucket(sampleFinding({ id: 'tr:x' })), 'Audio');
  assert.equal(findingBucket(sampleFinding({ id: 'landing-product-mismatch' })), 'Landing page');
  assert.equal(
    findingBucket(sampleFinding({ field: 'specialAdCategory', policyGroup: 'SPECIAL_AD_CATEGORY' })),
    'Targeting',
  );

  // Apply fix does not mutate original
  const before = { ...p1, primaryText: 'Text cam kết 100% here' };
  const after = applyFindingFixes(before, [
    sampleFinding({ excerpt: 'cam kết 100%', suggestedReplacement: 'hỗ trợ' }),
  ]);
  assert.notEqual(after.primaryText, before.primaryText);
  assert.ok(after.primaryText?.includes('hỗ trợ'));
  assert.ok(before.primaryText?.includes('cam kết 100%'));

  // Snapshot org isolation echo
  const result: FacebookPolicyCheckResult = {
    riskScore: 40,
    confidence: 0.8,
    overallStatus: 'REVIEW_REQUIRED',
    findings: [],
    rewrittenContent: null,
    policyMeta: {
      policyCode: 'META',
      policyVersion: '2026.1',
      sourceUrl: 'https://example.com',
      reviewedAt: '2026-01-01',
      label: 'Meta',
    },
    layers: {
      ruleFindingCount: 0,
      aiReviewed: false,
      aiSource: 'skipped',
      falsePositivesDismissed: 0,
    },
    organizationId: 'org-tenant-AAA',
    requiresRecheck: false,
    summary: 'ok',
  };
  const sA = snapshotFromCheckResult(result, p1, 'meta_ads');
  const sB = snapshotFromCheckResult(
    { ...result, organizationId: 'org-tenant-BBB' },
    p1,
    'meta_ads',
  );
  assert.equal(sA.organizationId, 'org-tenant-AAA');
  assert.equal(sB.organizationId, 'org-tenant-BBB');
  assert.notEqual(sA.organizationId, sB.organizationId);

  assert.ok(adsUsabilityLabel('PASS_CANDIDATE').length > 5);
  assert.ok(contentHashFromPayload(p1).length >= 8);

  // Sanitize strips UI-only keys; maps content/text aliases
  const dirty = {
    primaryText: '',
    content: 'Cam kết 100% chữa khỏi nám trong 7 ngày',
    mode: 'meta_ads',
    historyId: 'hist_1',
    importUrl: 'https://example.com',
    ageMin: 25,
    specialAdCategory: 'NONE' as const,
  };
  const clean = sanitizeFacebookPolicyCheckPayload(dirty);
  assert.equal(clean.primaryText, dirty.content);
  assert.equal((clean as Record<string, unknown>).mode, undefined);
  assert.equal((clean as Record<string, unknown>).historyId, undefined);
  assert.equal((clean as Record<string, unknown>).importUrl, undefined);
  const fromInitial = formFieldsFromInitial({
    ...dirty,
    mode: 'facebook_post',
    historyId: 'x',
  });
  assert.equal(fromInitial.primaryText, dirty.content);
  assert.equal((fromInitial as Record<string, unknown>).mode, undefined);

  console.log('test-facebook-policy-ui: PASS');
}

main();
