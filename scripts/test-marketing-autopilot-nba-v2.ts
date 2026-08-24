import { execSync } from 'child_process';
import {
  assertNoFakeForecast,
  rankNextBestActionsV2,
  simulateBudgetScenarios,
} from '@marketingspa/shared';

function assert(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}

function main() {
  // --- Priority: 37 leads chưa follow-up phải trước Ads ---
  const withFollowUpGap = rankNextBestActionsV2({
    monthlyBudget: 10_000_000,
    metrics: {
      leads: { total: 50, noFollowUp: 37, hot: 5 },
      conversion: { leadToBookingRate: 12 },
      ads: { cpl: 150_000, spend: 5_000_000, roas: 1.2 },
      bookings: { total: 6 },
      revenue: { total: 3_000_000 },
    },
    candidates: [
      {
        type: 'CAMPAIGN_DRAFT',
        title: 'Tăng Ads ngay',
        whyNow: 'Scale ads mạnh',
        priority: 1,
      },
      {
        type: 'CONTENT_DRAFT',
        label: 'Content',
        priority: 2,
      },
    ],
  });

  const nextBestActionPass =
    withFollowUpGap.length >= 1 &&
    withFollowUpGap.length <= 5 &&
    withFollowUpGap.every(
      (a) =>
        a.priority >= 1 &&
        a.priority <= 5 &&
        a.whyNow &&
        a.evidence &&
        a.confidence &&
        a.expectedImpact &&
        a.riskLevel &&
        a.recommendedDraft &&
        a.type === a.recommendedDraft,
    );

  const priorityPass =
    withFollowUpGap[0]?.recommendedDraft === 'AUTOMATION_DRAFT' &&
    /37/.test(withFollowUpGap[0]?.title ?? '') &&
    withFollowUpGap[0]?.priority === 1 &&
    !/tăng ads|scale ads/i.test(withFollowUpGap[0]?.title ?? '') &&
    withFollowUpGap.findIndex((a) => a.recommendedDraft === 'CAMPAIGN_DRAFT') >
      withFollowUpGap.findIndex((a) => a.recommendedDraft === 'AUTOMATION_DRAFT');

  // Healthy pipeline → campaign can rank higher
  const healthy = rankNextBestActionsV2({
    monthlyBudget: 20_000_000,
    metrics: {
      leads: { total: 40, noFollowUp: 2, hot: 8 },
      conversion: { leadToBookingRate: 25 },
      ads: { cpl: 120_000, roas: 2.5 },
    },
  });
  const healthyOk =
    healthy[0]?.recommendedDraft !== 'AUTOMATION_DRAFT' ||
    healthy.every((a) => a.priority <= 5);

  // --- Scenario simulator ---
  const scenarios = simulateBudgetScenarios({
    productPrice: 500_000,
    customBudget: 12_000_000,
    metrics: {
      leads: { total: 40, noFollowUp: 12 },
      bookings: { total: 4 },
      conversion: { leadToBookingRate: 10 },
      revenue: { total: 2_000_000 },
      ads: { spend: 5_000_000, cpl: 125_000, roas: 0.8 },
    },
  });

  const scenarioIds = scenarios.map((s) => s.scenarioId);
  const scenarioPass =
    scenarioIds.includes('5tr') &&
    scenarioIds.includes('10tr') &&
    scenarioIds.includes('20tr') &&
    scenarioIds.includes('50tr') &&
    scenarioIds.includes('custom') &&
    scenarios.every((s) => {
      const e = s.estimates;
      return e.leads && e.bookings && e.revenue && e.cpl && e.cpa && e.roas;
    }) &&
    (scenarios.find((s) => s.scenarioId === '10tr')?.estimates.leads.value ?? 0) > 0;

  // --- No fake forecast ---
  const insufficient = simulateBudgetScenarios({
    productPrice: undefined,
    customBudget: 5_000_000,
    metrics: {
      leads: { total: null, noFollowUp: null },
      bookings: { total: null },
      conversion: { leadToBookingRate: null },
      revenue: { total: null },
      ads: { spend: null, cpl: null, roas: null },
    },
  });

  const noFakeForecastPass =
    assertNoFakeForecast(scenarios) &&
    assertNoFakeForecast(insufficient) &&
    insufficient.every((s) => s.dataQuality === 'INSUFFICIENT_DATA') &&
    insufficient.every(
      (s) =>
        s.estimates.leads.status === 'INSUFFICIENT_DATA' &&
        s.estimates.leads.value == null &&
        s.assumptions.some((a) => /thiếu|insufficient/i.test(a)),
    );

  // Existing system still works: ranking without candidates still returns ≤5
  const existingSystemPass =
    healthyOk &&
    healthy.length <= 5 &&
    withFollowUpGap.every((a) =>
      ['CONTENT_DRAFT', 'FUNNEL_DRAFT', 'AUTOMATION_DRAFT', 'CAMPAIGN_DRAFT'].includes(a.type),
    );

  const changedFiles = execSync('git status --porcelain', {
    cwd: process.cwd(),
  })
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean);
  // Only flag real source edits — ignore compiled .js/.d.ts/.map artifacts
  const facebookFilesModifiedNone = !changedFiles.some((f) => {
    const path = f.replace(/^..\s+/, '').trim();
    if (!path.includes('apps/api/src/facebook/') && !path.includes('apps/api/src/auto-post/')) {
      return false;
    }
    return /\.(ts|tsx)$/.test(path) && !/\.d\.ts$/.test(path);
  });

  console.log(`NEXT BEST ACTION ${nextBestActionPass ? 'PASS' : 'FAIL'}`);
  console.log(`PRIORITY ${priorityPass ? 'PASS' : 'FAIL'}`);
  console.log(`SCENARIO ${scenarioPass ? 'PASS' : 'FAIL'}`);
  console.log(`NO FAKE FORECAST ${noFakeForecastPass ? 'PASS' : 'FAIL'}`);
  console.log(`EXISTING SYSTEM ${existingSystemPass ? 'PASS' : 'FAIL'}`);
  console.log(`FACEBOOK FILES MODIFIED ${facebookFilesModifiedNone ? 'NONE' : 'CHANGED'}`);

  assert(nextBestActionPass, 'NEXT BEST ACTION FAIL');
  assert(priorityPass, 'PRIORITY FAIL');
  assert(scenarioPass, 'SCENARIO FAIL');
  assert(noFakeForecastPass, 'NO FAKE FORECAST FAIL');
  assert(existingSystemPass, 'EXISTING SYSTEM FAIL');
  assert(facebookFilesModifiedNone, 'FACEBOOK FILES MODIFIED');
}

main();
