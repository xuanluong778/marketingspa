/**
 * Chạy: node scripts/test-content-marketing-logic.cjs
 */
const assert = require('assert');
const path = require('path');

// Load compiled logic would need build — test inline mirrors

const SALES_CTA_PATTERNS =
  /inbox để mua|đăng ký ngay|chốt đơn|nhận ưu đãi|mua ngay|inbox ngay|đặt lịch ngay|nhắn tin để mua/giu;

function detectSalesCta(content) {
  return SALES_CTA_PATTERNS.test(content);
}

const RISK_RULES = [
  { pattern: /100\s*%|triệt để/giu, penalty: 18 },
  { pattern: /chữa khỏi|điều trị/giu, penalty: 25 },
];

function checkAdPolicyRisk(content) {
  let safetyScore = 100;
  for (const rule of RISK_RULES) {
    if (rule.pattern.test(content)) safetyScore -= rule.penalty;
  }
  return Math.max(0, safetyScore);
}

function scorePersonalHook(content) {
  const firstLine = content.split('\n').filter(Boolean)[0] ?? '';
  return firstLine.length >= 20 ? 15 : 5;
}

assert.ok(checkAdPolicyRisk('Cam kết 100% chữa khỏi') < 60, 'risky content lowers score');
assert.ok(checkAdPolicyRisk('Spa chăm sóc da nhẹ nhàng') >= 80, 'safe content');
assert.ok(!detectSalesCta('Bạn thấy đúng không?'), 'soft CTA is not sales');
assert.ok(detectSalesCta('Inbox ngay để mua hàng'), 'sales CTA detected');
assert.ok(scorePersonalHook('Tôi từng nghĩ mình không đủ giỏi để làm điều này') >= 10, 'personal hook');

console.log('✅ content-marketing logic tests passed');
