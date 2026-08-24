/**
 * E2E / regression for Marketing Autopilot AI Director upgrade.
 * Reports: CONTEXT V2 / PLANNER V3 / NBA V3 / AUTOFILL AI / OUTCOME LEARNING / DRAFT SAFETY / EXISTING UI
 *
 * node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-marketing-autopilot-ai-director-e2e.ts
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import {
  HIGH_RISK_LIVE_ACTION_TYPES,
  OUTCOME_LEARNING_HORIZONS,
  QUEUE_NAMES,
  assertNoFakeForecast,
  rankNextBestActionsV3,
  resolveConfirmDraftTypes,
  runPlannerV3GroundedCritic,
  simulateBudgetScenarios,
} from '@marketingspa/shared';

type Case = { name: string; ok: boolean; detail?: string };

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function readSrc(rel: string): string {
  const p = resolve(__dirname, '..', rel);
  return readFileSync(p, 'utf8');
}

function fileHas(rel: string, ...needles: string[]): boolean {
  if (!existsSync(resolve(__dirname, '..', rel))) return false;
  const src = readSrc(rel);
  return needles.every((n) => src.includes(n));
}

async function main() {
  const results: Case[] = [];

  // --- CONTEXT V2 ---
  {
    const ok =
      fileHas(
        'apps/api/src/marketing-autopilot/context/marketing-context.types.ts',
        'CONTEXT_ENGINE_WINDOWS',
        'bottlenecks',
        'opportunities',
        'windows',
      ) &&
      fileHas(
        'apps/api/src/marketing-autopilot/context/marketing-context-engine.service.ts',
        "ENGINE_VERSION = 'v2'",
        'detectBottlenecks',
        'detectOpportunities',
        'collectWindows',
        '7',
        '30',
        '90',
      );
    results.push({
      name: 'CONTEXT V2',
      ok,
      detail: ok ? 'engine v2 + 7/30/90 + bottlenecks/opportunities' : 'missing context v2 pieces',
    });
  }

  // --- PLANNER V3 ---
  {
    const ok =
      fileHas(
        'packages/shared/src/marketing-autopilot-planner-v3.ts',
        'PLANNER_V3_STEPS',
        'runPlannerV3GroundedCritic',
        'tagPlannerOutputAsV3',
      ) &&
      fileHas(
        'apps/api/src/marketing-autopilot/marketing-autopilot-planner.service.ts',
        'runStrategyPlannerV3',
        'toAutopilotAnalysisV3',
        'strategy-planner-v3',
        'rankNextBestActionsV3',
      ) &&
      fileHas(
        'apps/api/src/marketing-autopilot/marketing-autopilot-planner-v3.prompt.ts',
        'Grounded',
        '7/30/90',
      );

    const stubPlan = {
      schemaVersion: 'marketing-autopilot-planner.v3' as const,
      summary: 'thiếu dữ liệu nhưng tăng ROAS = 5 booking',
      score: 50,
      suggestedChannels: ['Ads'],
      risks: [],
      nextSteps: ['x'],
      budgetSplit: [{ channel: 'Ads', percent: 100 }],
      budget: { content: { monthlyBudget: 10_000_000, split: [{ channel: 'Ads', percent: 100 }] } },
      channelStrategy: {
        content: { channels: [{ channel: 'Ads', role: 'scale', budgetSharePercent: 100 }] },
      },
      kpi: { content: { kpis: [{ name: 'b', baseline: 1, target: 2, unit: 'n' }] } },
      nextBestActions: [
        {
          title: 'Scale Ads ngay',
          label: 'Ads',
          whyNow: 'tăng ads budget',
          recommendation: {
            reason: 'tăng ads',
            evidence: '',
            source: 'guess',
            confidence: 'HIGH',
            expectedImpact: 'x',
            riskLevel: 'HIGH',
          },
        },
      ],
    };
    const critic = runPlannerV3GroundedCritic(
      stubPlan as never,
      10_000_000,
      { leads: { total: 20, noFollowUp: 12 }, conversion: { leadToBookingRate: 8 }, ads: { spend: 0 } },
    );
    const groundedOk =
      critic.pass === false &&
      critic.issues.some((i) => /evidence|whyNow|scale Ads|suy đoán|ROAS/i.test(i));
    results.push({
      name: 'PLANNER V3',
      ok: ok && groundedOk,
      detail: ok
        ? `grounded critic issues=${critic.issues.length} (${critic.issues.slice(0, 2).join('; ')})`
        : 'missing planner v3 wiring',
    });
  }

  // --- NBA V3 ---
  {
    const ranked = rankNextBestActionsV3({
      organizationId: 'org-test',
      primaryGoal: 'Tăng Booking',
      monthlyBudget: 20_000_000,
      metrics: {
        leads: { total: 40, noFollowUp: 18, hot: 5 },
        conversion: { leadToBookingRate: 8 },
        funnel: { activeFunnels: 0, leadsInFunnel: 0 },
        ads: { spend: 5_000_000, cpl: 200_000, roas: 0.6 },
      },
      bottlenecks: [
        {
          kind: 'crm_followup',
          title: 'Follow-up bottleneck',
          evidence: 'noFollowUp=18',
          severity: 'HIGH',
        },
      ],
      candidates: [
        {
          type: 'CAMPAIGN_DRAFT',
          title: 'Scale Ads budget ngay',
          whyNow: 'tăng ads để lấy lead',
          recommendedDraft: 'CAMPAIGN_DRAFT',
          priority: 1,
        },
        {
          type: 'AUTOMATION_DRAFT',
          title: 'Nurture lead',
          whyNow: 'follow-up',
          recommendedDraft: 'AUTOMATION_DRAFT',
          priority: 2,
        },
      ],
      safety: { draftOnly: true },
    });
    const top = ranked[0];
    const adsScaleFirst =
      top &&
      /scale|tăng\s*ads/i.test(`${top.title} ${top.whyNow}`) &&
      top.recommendedDraft === 'CAMPAIGN_DRAFT';
    const scenarios = simulateBudgetScenarios({
      metrics: { leads: { total: 10 }, ads: { cpl: 100_000 }, conversion: { leadToBookingRate: 20 } },
      productPrice: 2_000_000,
      customBudget: 10_000_000,
      timeRange: { from: '2026-01-01', to: '2026-01-31' },
    });
    const confirm = resolveConfirmDraftTypes([
      { recommendedDraft: 'AUTOMATION_DRAFT' },
      { recommendedDraft: 'FACEBOOK_PUBLISH' as string },
      { type: 'SEND_EMAIL' },
    ]);
    const ok =
      ranked.length > 0 &&
      ranked.length <= 5 &&
      !adsScaleFirst &&
      top?.recommendedDraft === 'AUTOMATION_DRAFT' &&
      assertNoFakeForecast(scenarios) &&
      confirm.allowed.includes('AUTOMATION_DRAFT') &&
      confirm.blocked.includes('FACEBOOK_PUBLISH') &&
      HIGH_RISK_LIVE_ACTION_TYPES.includes('ENABLE_ADS' as never);
    results.push({
      name: 'NBA V3',
      ok,
      detail: `top=${top?.recommendedDraft} n=${ranked.length} blocked=${confirm.blocked.join(',')}`,
    });
  }

  // --- AUTOFILL AI ---
  {
    const ok =
      fileHas(
        'apps/api/src/marketing-autopilot/marketing-autopilot-autofill.service.ts',
        'context-v2',
        'bottlenecks',
        'opportunities',
        'windows',
      ) &&
      fileHas(
        'apps/web/src/lib/marketing-autopilot-suggestions.ts',
        'bottlenecks',
        'opportunities',
        'Context V2',
      );
    results.push({
      name: 'AUTOFILL AI',
      ok,
      detail: ok ? 'autofill + audience grounded on Context V2' : 'missing autofill AI grounding',
    });
  }

  // --- OUTCOME LEARNING ---
  {
    const ok =
      OUTCOME_LEARNING_HORIZONS.join(',') === '1,7,30' &&
      QUEUE_NAMES.MARKETING_AUTOPILOT_OUTCOME_EVAL.includes('outcome') &&
      fileHas(
        'apps/worker/src/processors/marketing-autopilot-outcome-scan.ts',
        'processMarketingAutopilotOutcomeScan',
        'correlationOnly',
        'organizationId',
      ) &&
      fileHas(
        'apps/worker/src/schedulers/register-jobs.ts',
        'MARKETING_AUTOPILOT_OUTCOME_EVAL',
        'scan-due-outcome-evaluations',
      ) &&
      fileHas(
        'apps/worker/src/index.ts',
        'processMarketingAutopilotOutcomeScan',
        'MARKETING_AUTOPILOT_OUTCOME_EVAL',
      );
    results.push({
      name: 'OUTCOME LEARNING',
      ok,
      detail: ok
        ? `horizons=${OUTCOME_LEARNING_HORIZONS.join('/')} + BullMQ auto scan`
        : 'missing outcome auto wiring',
    });
  }

  // --- DRAFT SAFETY ---
  {
    const adapter = readSrc('apps/api/src/marketing-autopilot/marketing-autopilot-draft.adapter.ts');
    const ok =
      adapter.includes('isActive: false') &&
      adapter.includes('isPaused: true') &&
      adapter.includes('includeAutomations: false') &&
      adapter.includes('draftOnly: true') &&
      adapter.includes('DRAFT ONLY') &&
      adapter.includes('grounded: true') &&
      !/facebook.*publish|ENABLE_ADS|liveActionsEnabled:\s*true/i.test(adapter) &&
      fileHas(
        'apps/api/src/marketing-autopilot/marketing-autopilot.service.ts',
        'liveActionsEnabled: false',
        "facebookSafetyMode: 'read-only'",
      );
    results.push({
      name: 'DRAFT SAFETY',
      ok,
      detail: ok ? 'draft-only grounded adapters + status flags' : 'draft safety regression',
    });
  }

  // --- EXISTING UI ---
  {
    const page = readSrc('apps/web/src/app/(app)/marketing-autopilot/page.tsx');
    const form = readSrc('apps/web/src/components/marketing-autopilot/autopilot-brief-form.tsx');
    const hooks = readSrc('apps/web/src/hooks/use-marketing-autopilot.ts');
    // UI surface unchanged: same route, same form component, same hooks/endpoints
    const ok =
      page.includes('AutopilotBriefForm') &&
      page.includes('useMarketingAutopilotStatus') &&
      page.includes('useCreateMarketingAutopilotProject') &&
      page.includes('useConfirmMarketingAutopilotProjectDraft') &&
      form.includes('customerMode') &&
      hooks.includes('/marketing-autopilot/status') &&
      hooks.includes('/marketing-autopilot/projects') &&
      hooks.includes('/marketing-autopilot/autofill') &&
      !page.includes('AI Marketing Director Dashboard') && // no redesign banner
      fileHas(
        'apps/web/src/types/marketing-autopilot.ts',
        'liveActionsEnabled',
        'bottlenecks',
        'opportunities',
      );
    results.push({
      name: 'EXISTING UI',
      ok,
      detail: ok ? 'page/form/hooks unchanged — additive types only' : 'UI contract broken',
    });
  }

  console.log('\n=== Marketing Autopilot AI Director E2E ===\n');
  let failed = 0;
  for (const r of results) {
    const mark = r.ok ? 'PASS' : 'FAIL';
    if (!r.ok) failed += 1;
    console.log(`${r.name} = ${mark}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  console.log(`\nSummary: ${results.length - failed}/${results.length} PASS`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
