/**
 * Facebook/Meta Ads policy check — unit + isolation smoke.
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-facebook-policy-check.ts
 */
import assert from 'node:assert/strict';
import {
  runFacebookPolicyRuleEngine,
  computeRiskScore,
  statusFromScore,
  hasInsufficientAdCopy,
  buildHeuristicRewrite,
} from '../apps/api/src/content-marketing/facebook-policy/facebook-policy.engine';
import {
  checkFacebookAdPolicy,
  rewriteFacebookAdPolicy,
} from '../apps/api/src/content-marketing/facebook-policy/facebook-policy.logic';
import { FACEBOOK_POLICY_BUNDLE, FACEBOOK_ADS_POLICY_CATALOG } from '../apps/api/src/content-marketing/facebook-policy/facebook-policy.config';
import { FACEBOOK_POLICY_RULES } from '../apps/api/src/content-marketing/facebook-policy/facebook-policy.rules';

async function main() {
  // Config metadata present
  assert.ok(FACEBOOK_POLICY_BUNDLE.policyCode);
  assert.ok(FACEBOOK_POLICY_BUNDLE.policyVersion);
  assert.ok(FACEBOOK_POLICY_BUNDLE.sourceUrl.startsWith('http'));
  assert.ok(FACEBOOK_POLICY_BUNDLE.reviewedAt);
  for (const [group, meta] of Object.entries(FACEBOOK_ADS_POLICY_CATALOG)) {
    assert.ok(meta.policyCode, group);
    assert.ok(meta.sourceUrl, group);
  }

  // Every rule requires >= 2 signals (no single-keyword conclusions)
  for (const rule of FACEBOOK_POLICY_RULES) {
    assert.ok(rule.minSignals >= 2, `${rule.id} minSignals`);
    assert.ok(rule.signals.length >= 2, `${rule.id} signals`);
  }

  // Single keyword alone → no finding
  const single = runFacebookPolicyRuleEngine({
    primaryText: 'Chúng tôi có sản phẩm chăm sóc da nhẹ nhàng.',
  });
  assert.equal(single.filter((f) => f.policyGroup === 'ABSOLUTE_CLAIMS').length, 0);

  const only100 = runFacebookPolicyRuleEngine({
    primaryText: 'Tỷ lệ hài lòng khoảng 100 người mỗi tháng dùng thử.',
  });
  // "100" without cam kết/khỏi should not trip absolute-guarantees (needs 2 signals)
  assert.equal(
    only100.filter((f) => f.id.startsWith('absolute-guarantees')).length,
    0,
    'single-ish numeric should not force absolute claim',
  );

  // Multi-signal absolute + health
  const risky = runFacebookPolicyRuleEngine({
    headline: 'Cam kết 100% chữa khỏi nám',
    primaryText: 'Bạn đang bị nám? Điều trị triệt để trước-sau chỉ sau 7 ngày.',
    productService: 'Serum nám XYZ',
    brandName: 'Spa Demo',
    specialAdCategory: 'NONE',
  });
  assert.ok(risky.length >= 1, 'risky content should find issues');
  assert.ok(
    risky.some((f) => f.signalCount >= 2),
    'findings require multi-signal',
  );
  const score = computeRiskScore(risky);
  assert.ok(score > 20, `riskScore ${score}`);
  const status = statusFromScore(score, risky, false);
  assert.ok(
    ['REVIEW_REQUIRED', 'HIGH_RISK', 'PROHIBITED'].includes(status),
    status,
  );

  // Insufficient data
  assert.equal(hasInsufficientAdCopy({ headline: 'Hi' }), true);
  assert.equal(
    hasInsufficientAdCopy({
      headline: 'Chăm sóc da dịu nhẹ mỗi ngày',
      primaryText: 'Công thức lành tính cho da nhạy cảm.',
    }),
    false,
  );

  // Full check without OpenAI (rules + skipped AI)
  const orgA = 'org-tenant-aaa-1111';
  const orgB = 'org-tenant-bbb-2222';
  const checkA = await checkFacebookAdPolicy(
    {
      headline: 'Cam kết 100% chữa khỏi nám',
      primaryText: 'Bạn đang bị nám nặng? Điều trị triệt để ngay.',
      productService: 'Serum nám XYZ',
      brandName: 'Spa Demo',
      organizationId: orgA,
      country: 'VN',
      ageMin: 25,
      ageMax: 45,
      specialAdCategory: 'NONE',
    },
    undefined,
  );
  assert.equal(checkA.organizationId, orgA);
  assert.ok(checkA.riskScore >= 0 && checkA.riskScore <= 100);
  assert.ok(checkA.confidence > 0 && checkA.confidence <= 1);
  assert.ok(checkA.findings.every((f) => f.signalCount >= 2 || f.id.includes('special')));
  assert.equal(checkA.policyMeta.policyCode, FACEBOOK_POLICY_BUNDLE.policyCode);

  const checkB = await checkFacebookAdPolicy(
    {
      primaryText: 'Spa chăm sóc da nhẹ nhàng, không cam kết y khoa.',
      productService: 'Gói chăm sóc da cơ bản',
      organizationId: orgB,
    },
    undefined,
  );
  assert.equal(checkB.organizationId, orgB);
  // Tenant isolation: responses echo only their own org id
  assert.notEqual(checkA.organizationId, checkB.organizationId);

  // Safe-ish content → low risk / pass or mild review
  assert.ok(checkB.riskScore < checkA.riskScore);

  // Rewrite preserves product/brand; requiresRecheck
  const rewritten = await rewriteFacebookAdPolicy(
    {
      headline: 'Cam kết 100% chữa khỏi',
      primaryText: 'Bạn đang bị nám? Cam kết 100% khỏi hẳn.',
      productService: 'Serum nám XYZ',
      brandName: 'Spa Demo',
      organizationId: orgA,
    },
    undefined,
  );
  assert.equal(rewritten.requiresRecheck, true);
  assert.ok(rewritten.rewrittenContent.includes('Serum nám XYZ'));
  assert.ok(rewritten.rewrittenContent.includes('Spa Demo'));
  assert.equal(rewritten.organizationId, orgA);
  assert.ok(rewritten.changes.length >= 1);

  const heuristic = buildHeuristicRewrite(
    {
      primaryText: 'Cam kết 100% chữa khỏi nám',
      productService: 'Serum nám XYZ',
      brandName: 'Spa Demo',
    },
    risky,
  );
  assert.ok(heuristic.length > 0);

  // Special ad category undeclared
  const housing = runFacebookPolicyRuleEngine({
    primaryText: 'Cho thuê nhà quận 1, căn hộ bán giá tốt, tuyển dụng lễ tân mức lương hấp dẫn.',
    specialAdCategory: 'NONE',
  });
  assert.ok(
    housing.some((f) => f.policyGroup === 'SPECIAL_AD_CATEGORY'),
    'housing/jobs content should flag special category',
  );

  console.log('test-facebook-policy-check: PASS');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
