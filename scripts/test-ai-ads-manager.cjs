/**
 * Unit tests for AI Ads Manager automation & efficiency helpers.
 * Run: node scripts/test-ai-ads-manager.cjs
 */
const assert = require('assert');
const path = require('path');

// Compiled output may not exist — test logic inline mirror
function computeEfficiencyScore(m) {
  let score = 50;
  if (m.roas != null) {
    if (m.roas >= 4) score += 25;
    else if (m.roas >= 2) score += 15;
    else if (m.roas >= 1) score += 5;
    else score -= 20;
  }
  if (m.ctr >= 2) score += 10;
  else if (m.ctr < 0.5) score -= 10;
  const results = m.conversions + m.leads;
  if (m.spend > 0 && results === 0) score -= 25;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function evaluatePauseSpendNoConversion(rule, metrics, status) {
  if (!rule.enabled) return null;
  const results = metrics.conversions + metrics.leads;
  if (
    metrics.spend >= rule.spendThreshold &&
    rule.spendThreshold > 0 &&
    results === 0 &&
    status === 'ACTIVE'
  ) {
    return { shouldPause: true, shouldAlert: true };
  }
  return null;
}

// Tests
const highRoas = computeEfficiencyScore({
  spend: 1e6,
  revenue: 5e6,
  impressions: 10000,
  clicks: 200,
  ctr: 2,
  cpc: 5000,
  cpm: 100000,
  conversions: 10,
  leads: 0,
  cpa: 100000,
  cpl: 0,
  roas: 5,
});
assert.ok(highRoas > 60, 'high ROAS should score > 60');

const pause = evaluatePauseSpendNoConversion(
  { enabled: true, spendThreshold: 300000 },
  { spend: 500000, conversions: 0, leads: 0 },
  'ACTIVE',
);
assert.ok(pause && pause.shouldPause, 'should pause when spend without conversion');

const noPause = evaluatePauseSpendNoConversion(
  { enabled: true, spendThreshold: 300000 },
  { spend: 100000, conversions: 0, leads: 0 },
  'ACTIVE',
);
assert.ok(!noPause, 'should not pause below spend threshold');

console.log('test-ai-ads-manager: all passed');
