/**
 * NBA Engine V2 completion gates (before Outcome Learning).
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-marketing-autopilot-nba-v2-complete.ts
 */
import { execSync } from 'child_process';
import {
  NBA_DRAFT_ADAPTER_MAP,
  adapterForDraft,
  assertForecastSourceComplete,
  assertNoFakeForecast,
  mapRecommendedDraft,
  rankNextBestActionsV2,
  resolveConfirmDraftTypes,
  resolveConfirmIdempotencyKey,
  shouldReuseDraftRun,
  simulateBudgetScenarios,
} from '@marketingspa/shared';

function assert(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}

function main() {
  const timeRange = { from: '2026-07-21T00:00:00.000Z', to: '2026-08-20T00:00:00.000Z' };

  // --- FORECAST SOURCE ---
  const scenarios = simulateBudgetScenarios({
    productPrice: 500_000,
    customBudget: 12_000_000,
    timeRange,
    metrics: {
      leads: { total: 40, noFollowUp: 12 },
      bookings: { total: 4 },
      conversion: { leadToBookingRate: 10 },
      revenue: { total: 2_000_000 },
      ads: { spend: 5_000_000, cpl: 125_000, roas: 0.8 },
    },
  });

  const insufficient = simulateBudgetScenarios({
    timeRange,
    metrics: {
      leads: { total: null, noFollowUp: null },
      bookings: { total: null },
      conversion: { leadToBookingRate: null },
      revenue: { total: null },
      ads: { spend: null, cpl: null, roas: null },
    },
  });

  const forecastSourcePass =
    assertForecastSourceComplete(scenarios) &&
    assertForecastSourceComplete(insufficient) &&
    assertNoFakeForecast(scenarios) &&
    assertNoFakeForecast(insufficient) &&
    scenarios.every((s) =>
      ['leads', 'bookings', 'revenue', 'cpl', 'cpa', 'roas'].every((k) => {
        const m = s.estimates[k as keyof typeof s.estimates];
        return (
          Array.isArray(m.basedOn) &&
          m.basedOn.length > 0 &&
          'timeRange' in m &&
          'sampleSize' in m &&
          typeof m.confidence === 'string'
        );
      }),
    ) &&
    insufficient.every(
      (s) =>
        s.dataQuality === 'INSUFFICIENT_DATA' &&
        s.estimates.leads.value == null &&
        s.estimates.leads.status === 'INSUFFICIENT_DATA' &&
        s.estimates.leads.confidence === 'INSUFFICIENT_DATA',
    );

  // --- DRAFT MAPPING ---
  const draftTypes = ['CONTENT_DRAFT', 'FUNNEL_DRAFT', 'AUTOMATION_DRAFT', 'CAMPAIGN_DRAFT'] as const;
  const draftMappingPass =
    draftTypes.every((t) => mapRecommendedDraft(t) === t) &&
    draftTypes.every((t) => adapterForDraft(t) === NBA_DRAFT_ADAPTER_MAP[t]) &&
    mapRecommendedDraft('FACEBOOK_PUBLISH') === null &&
    mapRecommendedDraft('SEND_EMAIL') === null &&
    resolveConfirmDraftTypes(
      [
        { recommendedDraft: 'CONTENT_DRAFT' },
        { recommendedDraft: 'FACEBOOK_PUBLISH' },
        { type: 'AUTOMATION_DRAFT' },
        { recommendedDraft: 'ENABLE_ADS' },
      ],
      null,
    ).allowed.join(',') === 'CONTENT_DRAFT,AUTOMATION_DRAFT' &&
    resolveConfirmDraftTypes(
      [{ recommendedDraft: 'CONTENT_DRAFT' }, { recommendedDraft: 'FUNNEL_DRAFT' }],
      ['CONTENT_DRAFT'],
    ).allowed.join(',') === 'CONTENT_DRAFT';

  // --- IDEMPOTENCY ---
  const keyA = resolveConfirmIdempotencyKey({
    clientKey: 'nba:proj1:CONTENT_DRAFT',
    projectId: 'proj1',
    analysisId: 'an1',
  });
  const keyB = resolveConfirmIdempotencyKey({
    clientKey: 'nba:proj1:CONTENT_DRAFT',
    projectId: 'proj1',
    analysisId: 'an1',
  });
  const keyFallback = resolveConfirmIdempotencyKey({
    clientKey: '',
    projectId: 'proj1',
    analysisId: 'an1',
  });
  const idempotencyPass =
    keyA === keyB &&
    shouldReuseDraftRun(keyA, keyB) === true &&
    shouldReuseDraftRun(null, keyA) === false &&
    shouldReuseDraftRun('other', keyA) === false &&
    keyFallback === 'marketing-autopilot-confirm:proj1:an1';

  // --- CONTEXT-AWARE RANKING (differs by organization / metrics / insights) ---
  const orgFollowUp = rankNextBestActionsV2({
    organizationId: 'org-followup-heavy',
    monthlyBudget: 10_000_000,
    timeRange,
    safety: { draftOnly: true },
    metrics: {
      leads: { total: 50, noFollowUp: 37, hot: 5 },
      conversion: { leadToBookingRate: 12 },
      ads: { cpl: 150_000, roas: 1.1 },
      content: { teleprompterSources: 2 },
      automation: { activeFlows: 0 },
    },
    insights: [
      {
        category: 'crm.follow_up',
        title: 'Nhiều lead chưa follow-up',
        summary: '37 lead chờ chăm sóc',
        evidence: 'leads.noFollowUp=37',
        confidence: 'HIGH',
      },
    ],
    candidates: [
      { type: 'CAMPAIGN_DRAFT', title: 'Tăng Ads ngay', whyNow: 'Scale ads mạnh', priority: 1 },
      { type: 'CONTENT_DRAFT', label: 'Content', priority: 2 },
    ],
  });

  const orgHealthyAds = rankNextBestActionsV2({
    organizationId: 'org-healthy-scale',
    monthlyBudget: 20_000_000,
    timeRange,
    safety: { draftOnly: true },
    metrics: {
      leads: { total: 40, noFollowUp: 2, hot: 10 },
      conversion: { leadToBookingRate: 28 },
      ads: { cpl: 100_000, roas: 2.8 },
      content: { teleprompterSources: 8, autoPostDrafts: 5 },
      automation: { activeFlows: 3 },
      funnel: { activeFunnels: 2 },
    },
    insights: [
      {
        category: 'ads.performance',
        title: 'ROAS ổn — có thể chuẩn bị campaign draft',
        summary: 'ROAS 2.8',
        evidence: 'ads.roas=2.8',
        confidence: 'HIGH',
      },
    ],
    candidates: [
      { type: 'CAMPAIGN_DRAFT', title: 'Draft campaign remarketing', priority: 1 },
      { type: 'CONTENT_DRAFT', label: 'Content', priority: 3 },
      { type: 'FUNNEL_DRAFT', label: 'Funnel', priority: 2 },
    ],
  });

  const orgConversionGap = rankNextBestActionsV2({
    organizationId: 'org-conversion-gap',
    monthlyBudget: 8_000_000,
    timeRange,
    metrics: {
      leads: { total: 80, noFollowUp: 5 },
      conversion: { leadToBookingRate: 8 },
      ads: { cpl: 90_000, roas: 0.6 },
      funnel: { activeFunnels: 0 },
    },
    insights: [
      {
        category: 'funnel.conversion',
        title: 'Tỷ lệ lead→booking thấp',
        confidence: 'HIGH',
        evidence: 'leadToBookingRate=8%',
      },
    ],
    candidates: [{ type: 'CAMPAIGN_DRAFT', title: 'Scale ads', priority: 1 }],
  });

  const contextAwareRankingPass =
    orgFollowUp[0]?.recommendedDraft === 'AUTOMATION_DRAFT' &&
    /37/.test(orgFollowUp[0]?.title ?? '') &&
    orgFollowUp[0]?.priority === 1 &&
    orgConversionGap[0]?.recommendedDraft === 'FUNNEL_DRAFT' &&
    orgHealthyAds[0]?.recommendedDraft !== 'AUTOMATION_DRAFT' &&
    orgFollowUp[0]?.recommendedDraft !== orgHealthyAds[0]?.recommendedDraft &&
    orgFollowUp.every((a) => a.type === a.recommendedDraft) &&
    orgFollowUp.length <= 5 &&
    orgHealthyAds.length <= 5 &&
    !orgFollowUp.some((a) => a.recommendedDraft === 'FACEBOOK_PUBLISH');

  // --- EXISTING SYSTEM ---
  const existingSystemPass =
    scenarios.some((s) => s.scenarioId === '5tr') &&
    scenarios.some((s) => s.scenarioId === 'custom') &&
    draftTypes.every((t) => Object.keys(NBA_DRAFT_ADAPTER_MAP).includes(t)) &&
    orgFollowUp.every((a) => draftTypes.includes(a.recommendedDraft));

  const changedFiles = execSync('git status --porcelain', { cwd: process.cwd() })
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

  console.log(`FORECAST SOURCE ${forecastSourcePass ? 'PASS' : 'FAIL'}`);
  console.log(`DRAFT MAPPING ${draftMappingPass ? 'PASS' : 'FAIL'}`);
  console.log(`IDEMPOTENCY ${idempotencyPass ? 'PASS' : 'FAIL'}`);
  console.log(`CONTEXT-AWARE RANKING ${contextAwareRankingPass ? 'PASS' : 'FAIL'}`);
  console.log(`EXISTING SYSTEM ${existingSystemPass ? 'PASS' : 'FAIL'}`);
  console.log(`FACEBOOK FILES MODIFIED ${facebookFilesModifiedNone ? 'NONE' : 'CHANGED'}`);

  assert(forecastSourcePass, 'FORECAST SOURCE FAIL');
  assert(draftMappingPass, 'DRAFT MAPPING FAIL');
  assert(idempotencyPass, 'IDEMPOTENCY FAIL');
  assert(contextAwareRankingPass, 'CONTEXT-AWARE RANKING FAIL');
  assert(existingSystemPass, 'EXISTING SYSTEM FAIL');
  assert(facebookFilesModifiedNone, 'FACEBOOK FILES MODIFIED');
}

main();
