/**
 * Unit tests: ad-goal calculator (isolated).
 * Run: pnpm test:ad-goal-calculator
 */
import assert from 'node:assert/strict';
import {
  buildAdGoalPlainSummary,
  buildAdGoalResultTable,
  calculateAdGoalMetrics,
} from '../apps/web/src/lib/ad-goal-calculator';
import { sampleAdGoalInput } from '../apps/web/src/types/ad-goals';

function main() {
  // Sample from product note: ~162 orders, ~3.78M ad budget, 27M target
  const m = calculateAdGoalMetrics(sampleAdGoalInput);
  assert.equal(m.errorCode, 'ok');
  assert.equal(m.achievable, true);
  assert.ok(m.grossProfitPerOrder != null && m.grossProfitPerOrder === 190_000);
  assert.ok(m.adCostPerOrder != null);
  assert.ok(Math.abs((m.adCostPerOrder as number) - 35_000 / (10 * 0.15)) < 0.02);
  assert.ok(m.netProfitPerOrder != null && m.netProfitPerOrder > 0);
  assert.equal(m.ordersNeeded, Math.ceil(27_000_000 / (m.netProfitPerOrder as number)));
  assert.ok(m.ordersNeeded === 162);
  assert.ok(m.totalAdSpend != null);
  assert.ok(Math.abs((m.totalAdSpend as number) - 162 * (m.adCostPerOrder as number)) < 1);
  // ~3.78M
  assert.ok((m.totalAdSpend as number) > 3_700_000 && (m.totalAdSpend as number) < 3_900_000);
  assert.ok(m.impressionsNeeded != null && m.impressionsNeeded > 0);
  assert.ok(m.dailyAdBudget != null);
  assert.ok(m.roas != null && m.roas > 1);

  const table = buildAdGoalResultTable(sampleAdGoalInput, m);
  assert.ok(table.length >= 10);
  assert.ok(table.every((r) => r.explanation.length > 5));

  const summary = buildAdGoalPlainSummary(sampleAdGoalInput, m);
  assert.ok(summary.includes('đơn'));
  assert.ok(summary.includes('27'));

  // Negative net path
  const bad = calculateAdGoalMetrics({
    cpm: 500_000,
    conversionRate: 0.01,
    averageOrderRevenue: 100_000,
    grossProfitRate: 10,
    targetMonthlyProfit: 10_000_000,
  });
  assert.equal(bad.errorCode, 'negative_net');
  assert.equal(bad.achievable, false);
  assert.equal(bad.ordersNeeded, null);

  // Zero conversion
  const z = calculateAdGoalMetrics({ ...sampleAdGoalInput, conversionRate: 0 });
  assert.equal(z.errorCode, 'zero_conversion');

  console.log('ALL_PASS ad-goal-calculator');
}

main();
