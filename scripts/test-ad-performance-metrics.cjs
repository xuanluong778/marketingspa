/**
 * Chạy: node scripts/test-ad-performance-metrics.cjs
 * Kiểm tra công thức calculateAdPerformanceMetrics với dữ liệu mẫu.
 */
const assert = require('assert');

function safeAdNumber(value) {
  if (!Number.isFinite(value) || Number.isNaN(value)) return 0;
  return value;
}

function calculateCampaignMetrics(row) {
  const adBudget = safeAdNumber(row.adBudget);
  const cpm = safeAdNumber(row.cpm);
  const resultRate = safeAdNumber(row.resultRate);
  const frequency = safeAdNumber(row.frequency);
  const impressions = cpm > 0 ? (adBudget / cpm) * 1000 : 0;
  const resultCount = impressions * (resultRate / 100);
  const costPerResult = resultCount > 0 ? adBudget / resultCount : 0;
  const reachPeople = frequency > 0 ? resultCount / frequency : 0;
  return { impressions, resultCount, costPerResult, reachPeople };
}

const sales = calculateCampaignMetrics({
  adBudget: 42_600_000,
  cpm: 80_000,
  resultRate: 0.3,
  frequency: 1.42,
});

assert.ok(Math.abs(sales.resultCount - 1597.5) < 0.1, 'sales resultCount ~1597.5');
assert.ok(sales.impressions === 532500, 'sales impressions');

const engagement = calculateCampaignMetrics({
  adBudget: 150_000_000,
  cpm: 20_000,
  resultRate: 30,
  frequency: 1.5,
});
assert.ok(engagement.impressions === 7_500_000, 'engagement impressions');

console.log('✅ ad-performance metrics tests passed');
