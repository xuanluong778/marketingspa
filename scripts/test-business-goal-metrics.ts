/**
 * Business goal calculation parity: client metrics core vs server calculate.util
 * + A–M table & highlight cards.
 * Run: pnpm test:business-goal-metrics
 */
import assert from 'node:assert/strict';
import { calculateBusinessGoals } from '../apps/api/src/business-goals/utils/calculate.util';
import {
  calculateBusinessGoalMetrics,
  extendBusinessGoalCore,
} from '../apps/web/src/lib/business-goal-metrics';
import {
  buildBusinessGoalResultTable,
  buildBusinessGoalPlainSummary,
  buildBusinessGoalHighlights,
} from '../apps/web/src/lib/business-goal-results';
import {
  sampleBusinessGoalFormState,
  formStateFromApiInput,
  deriveApiInput,
  defaultBusinessGoalFormState,
} from '../apps/web/src/lib/business-goal-form';

function main() {
  const input = {
    averageRevenuePerTransaction: 25_000,
    currentTransactionCount: 24_000,
    variableCostRate: (400_000_000 / 600_000_000) * 100,
    fixedCost: 17_000_000,
    leadConversionRate: 15,
    targetProfit: 183_000_000,
  };

  const server = calculateBusinessGoals(input);
  assert.equal(server.totalRevenue, 600_000_000);
  assert.equal(server.variableCost, 400_000_000);
  assert.equal(server.grossProfit, 200_000_000);
  assert.ok(server.grossProfitMargin != null && Math.abs(server.grossProfitMargin - 33.33) < 0.02);
  assert.equal(server.netProfit, 183_000_000);
  assert.equal(server.ordersForRevenueTarget, 24_000);
  assert.equal(server.leadsForRevenueTarget, 160_000);

  const client = calculateBusinessGoalMetrics(sampleBusinessGoalFormState);
  assert.equal(client.totalRevenue, 600_000_000);
  assert.equal(client.variableCost, 400_000_000);
  assert.equal(client.netProfit, 183_000_000);
  assert.equal(client.ordersForRevenueTarget, 24_000);
  assert.equal(client.leadsForRevenueTarget, 160_000);

  const client2 = calculateBusinessGoalMetrics(formStateFromApiInput(input));
  assert.equal(client2.totalRevenue, server.totalRevenue);
  assert.equal(client2.variableCost, server.variableCost);
  assert.equal(client2.netProfit, server.netProfit);
  assert.equal(client2.ordersForRevenueTarget, server.ordersForRevenueTarget);
  assert.equal(client2.breakEvenRevenue, server.breakEvenRevenue);

  const table = buildBusinessGoalResultTable(client);
  assert.equal(table.length, 13);
  assert.deepEqual(
    table.map((r) => r.code),
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'],
  );

  const highlights = buildBusinessGoalHighlights(client);
  assert.equal(highlights.length, 4);
  assert.ok(highlights.some((h) => h.label === 'Doanh thu hòa vốn'));
  assert.ok(highlights.some((h) => h.label === 'Số đơn cần bán'));
  assert.ok(highlights.some((h) => h.label === 'Khách tiềm năng cần có'));
  assert.ok(highlights.some((h) => h.label === 'Lợi nhuận dự kiến'));
  assert.ok(buildBusinessGoalPlainSummary(client).includes('đơn'));

  assert.ok(calculateBusinessGoalMetrics(defaultBusinessGoalFormState).totalRevenue > 0);
  assert.ok(deriveApiInput(defaultBusinessGoalFormState).fixedCost >= 0);
  assert.ok(typeof extendBusinessGoalCore === 'function');

  console.log('ALL_PASS business-goal-metrics');
}

main();
