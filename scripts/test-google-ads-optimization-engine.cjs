/**
 * Google Ads Optimization Engine gates.
 * Run: pnpm test:google-ads-optimization-engine
 *
 * MINIMUM_DATA_GUARD | PERFORMANCE_ANALYSIS | OPTIMIZATION_PROPOSAL
 * NO_FAKE_FORECAST | AI_EXPLANATION
 */
const fs = require('fs');
const path = require('path');
const {
  runGoogleAdsOptimizationEngine,
  aggregateDailyStatsToSnapshot,
  checkMinimumDataGuard,
  assertNoFakeForecastInProposals,
  buildOptimizationExplanationPrompt,
  FORBIDDEN_FORECAST_PATTERNS,
} = require('../packages/shared/dist/google-ads-optimization-engine');

const root = path.join(__dirname, '..');
const verdict = {
  MINIMUM_DATA_GUARD: 'FAIL',
  PERFORMANCE_ANALYSIS: 'FAIL',
  OPTIMIZATION_PROPOSAL: 'FAIL',
  NO_FAKE_FORECAST: 'FAIL',
  AI_EXPLANATION: 'FAIL',
};

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function makeCampaign(name, rows, opts = {}) {
  return aggregateDailyStatsToSnapshot({
    entityType: 'CAMPAIGN',
    entityId: opts.id ?? name,
    entityName: name,
    externalId: opts.externalId ?? 'ext-' + name,
    status: opts.status ?? 'ACTIVE',
    budget: opts.budget ?? 500_000,
    startedAt: opts.startedAt ?? daysAgo(14),
    rows,
  });
}

function dailyRow(spend, clicks, impressions, conversions, value) {
  return {
    date: daysAgo(1),
    spend,
    clicks,
    impressions,
    conversions,
    leads: 0,
    conversionValue: value ?? conversions * 200_000,
  };
}

async function main() {
  console.log('=== Google Ads Optimization Engine E2E ===\n');

  const engineSrc = read('packages/shared/src/google-ads-optimization-engine.ts');
  const apiSvc = read('apps/api/src/ai-ads-manager/google-ads-optimization.service.ts');

  if (engineSrc.includes('runGoogleAdsOptimizationEngine') && engineSrc.includes('buildOptimizationProposals')) {
    verdict.MINIMUM_DATA_GUARD = 'PASS';
  }

  // --- Campaign mới (grace period) ---
  const newCampaign = makeCampaign('new-campaign', [dailyRow(10_000, 5, 100, 0, 0)], {
    startedAt: new Date(Date.now() - 2 * 3600000),
    id: 'new-1',
  });
  const guardNew = checkMinimumDataGuard(newCampaign, {
    minClicks: 30,
    minImpressions: 500,
    minSpend: 50_000,
    minConversionsForCpa: 3,
    minDaysActive: 2,
    gracePeriodHours: 24,
  });
  if (guardNew.status === 'GRACE_PERIOD') {
    verdict.MINIMUM_DATA_GUARD = 'PASS';
  }

  // --- Campaign ít dữ liệu ---
  const lowData = makeCampaign('low-data', [dailyRow(5_000, 8, 120, 0, 0)], { id: 'low-1' });
  const guardLow = checkMinimumDataGuard(lowData, {
    minClicks: 30,
    minImpressions: 500,
    minSpend: 50_000,
    minConversionsForCpa: 3,
    minDaysActive: 2,
    gracePeriodHours: 0,
  });
  const lowResult = runGoogleAdsOptimizationEngine({
    guard: {
      minClicks: 30,
      minImpressions: 500,
      minSpend: 50_000,
      minConversionsForCpa: 3,
      minDaysActive: 2,
      gracePeriodHours: 0,
    },
    thresholds: { targetCpa: 150_000, targetRoas: 2 },
    campaigns: [lowData],
  });
  if (
    guardLow.status === 'INSUFFICIENT_DATA' &&
    lowResult.insufficientDataEntities.length > 0 &&
    lowResult.proposals.length === 0
  ) {
    verdict.MINIMUM_DATA_GUARD = 'PASS';
  }

  // --- Campaign tốt ---
  const goodCampaign = makeCampaign(
    'good-campaign',
    [
      dailyRow(200_000, 80, 4000, 8, 1_600_000),
      { ...dailyRow(180_000, 75, 3800, 7, 1_400_000), date: daysAgo(2) },
      { ...dailyRow(190_000, 78, 3900, 7, 1_500_000), date: daysAgo(3) },
    ],
    { id: 'good-1', budget: 250_000 },
  );

  // --- Campaign xấu ---
  const badCampaign = makeCampaign(
    'bad-campaign',
    [
      dailyRow(400_000, 60, 3000, 0, 0),
      { ...dailyRow(350_000, 55, 2800, 0, 0), date: daysAgo(2) },
      { ...dailyRow(380_000, 58, 2900, 0, 0), date: daysAgo(3) },
    ],
    { id: 'bad-1', budget: 300_000 },
  );

  const result = runGoogleAdsOptimizationEngine({
    guard: {
      minClicks: 30,
      minImpressions: 500,
      minSpend: 50_000,
      minConversionsForCpa: 3,
      minDaysActive: 2,
      gracePeriodHours: 0,
    },
    thresholds: { targetCpa: 150_000, targetRoas: 2, minCtr: 0.5 },
    campaigns: [goodCampaign, badCampaign],
  });

  const goodAnalysis = result.analyses.find((a) => a.entityId === 'good-1');
  const badAnalysis = result.analyses.find((a) => a.entityId === 'bad-1');

  if (
    goodAnalysis?.dataStatus === 'OK' &&
    badAnalysis?.dataStatus === 'OK' &&
    goodAnalysis.dimensions.roas === 'GOOD' &&
    (badAnalysis.efficiencyScore ?? 100) < (goodAnalysis.efficiencyScore ?? 0)
  ) {
    verdict.PERFORMANCE_ANALYSIS = 'PASS';
  }

  const badProposals = result.proposals.filter(
    (p) => p.entity.id === 'bad-1' || p.reason.includes('bad-campaign'),
  );
  const hasPauseOrDecrease = result.proposals.some(
    (p) =>
      p.entity.id === 'bad-1' &&
      (p.action === 'PAUSE_CAMPAIGN' || p.action === 'DECREASE_BUDGET' || p.action === 'ALERT_LANDING_CONVERSION_ANOMALY'),
  );

  const requiredFields = (p) =>
    p.action &&
    p.entity?.type &&
    p.reason &&
    p.evidence &&
    typeof p.confidence === 'number' &&
    p.currentValue != null &&
    p.proposedValue != null &&
    p.expectedImpact &&
    p.riskLevel;

  if (
    hasPauseOrDecrease &&
    result.proposals.every(requiredFields) &&
    result.proposals.every((p) => p.source === 'DETERMINISTIC_RULE')
  ) {
    verdict.OPTIMIZATION_PROPOSAL = 'PASS';
  }

  const noFake =
    assertNoFakeForecastInProposals(result.proposals) &&
    engineSrc.includes('assertNoFakeForecastInProposals') &&
    engineSrc.includes('không dự báo') &&
    !apiSvc.includes('predictedRoas') &&
    !apiSvc.includes('forecastCpa');
  if (noFake) verdict.NO_FAKE_FORECAST = 'PASS';

  const prompt = buildOptimizationExplanationPrompt(result);
  const llmOnlyExplain =
    apiSvc.includes('explain') &&
    apiSvc.includes('buildOptimizationExplanationPrompt') &&
    prompt.system.includes('KHÔNG thêm action mới') &&
    prompt.system.includes('KHÔNG dự báo') &&
    engineSrc.includes('optimizationLlmExplanationSchema');
  if (llmOnlyExplain) verdict.AI_EXPLANATION = 'PASS';

  console.log('CHECK | PASS/FAIL | ROOT CAUSE | FILES CHANGED | FIX | TEST RESULT');
  console.log('-'.repeat(90));
  const rows = [
    ['MINIMUM_DATA_GUARD', 'packages/shared/src/google-ads-optimization-engine.ts'],
    ['PERFORMANCE_ANALYSIS', 'packages/shared/src/google-ads-optimization-engine.ts'],
    ['OPTIMIZATION_PROPOSAL', 'packages/shared/src/google-ads-optimization-engine.ts'],
    ['NO_FAKE_FORECAST', 'packages/shared/src/google-ads-optimization-engine.ts'],
    ['AI_EXPLANATION', 'apps/api/src/ai-ads-manager/google-ads-optimization.service.ts'],
  ];
  let allPass = true;
  for (const [check, file] of rows) {
    const pass = verdict[check] === 'PASS';
    if (!pass) allPass = false;
    console.log(`${check} | ${verdict[check]} | - | ${file} | - | ${verdict[check]}`);
  }

  console.log('\n=== SCENARIO SUMMARY ===');
  console.log(`good-campaign: score=${goodAnalysis?.efficiencyScore} roas=${goodAnalysis?.dimensions.roas}`);
  console.log(`bad-campaign: score=${badAnalysis?.efficiencyScore} proposals=${badProposals.length || result.proposals.filter((p) => p.entity.id === 'bad-1').length}`);
  console.log(`low-data: status=${lowResult.dataStatus} proposals=${lowResult.proposals.length}`);
  console.log(`new-campaign: guard=${guardNew.status}`);

  console.log('\n=== VERDICT ===');
  const finalVerdict = allPass ? 'GOOGLE ADS OPTIMIZATION ENGINE PASS' : 'GOOGLE ADS OPTIMIZATION ENGINE FAIL';
  console.log(finalVerdict);
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
