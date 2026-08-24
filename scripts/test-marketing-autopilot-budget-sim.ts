import {
  assertNoFakeForecast,
  budgetScenarioUiHasTechnicalLeak,
  canForecastBudgetFromMetrics,
  describeBudgetDataGaps,
  pickBudgetSimSource,
  simulateBudgetScenarios,
  simulateBudgetScenariosFromAssumptions,
  toBudgetScenarioUiView,
} from '@marketingspa/shared';

function assert(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}

function assertNoUiLeak(view: ReturnType<typeof toBudgetScenarioUiView>, label: string) {
  const blob = JSON.stringify(view);
  assert(!/INSUFFICIENT_DATA|conf=|basedOn=|sample=/i.test(blob), `${label}: leaked technical text`);
  assert(!budgetScenarioUiHasTechnicalLeak(view), `${label}: budgetScenarioUiHasTechnicalLeak`);
}

function main() {
  const historicalMetrics = {
    leads: { total: 40, noFollowUp: 12 },
    bookings: { total: 8 },
    conversion: { leadToBookingRate: 20 },
    revenue: { total: 16_000_000 },
    ads: { spend: 5_000_000, cpl: 125_000, roas: 1.6, leads: 40 },
  };

  const historical = simulateBudgetScenarios({
    productPrice: 2_000_000,
    metrics: historicalMetrics,
  });
  const historicalView = toBudgetScenarioUiView(historical, {
    metrics: historicalMetrics,
    productPrice: 2_000_000,
    mode: 'historical',
  });

  const five = historical.find((s) => s.scenarioId === '5tr');
  const ten = historical.find((s) => s.scenarioId === '10tr');
  const twenty = historical.find((s) => s.scenarioId === '20tr');
  const fifty = historical.find((s) => s.scenarioId === '50tr');

  const historicalPass =
    historicalView.kind === 'ready' &&
    historicalView.source === 'historical' &&
    historicalView.cards.length >= 4 &&
    historicalView.cards.every((c) =>
      /Ngân sách|Lead|Booking|Doanh thu|ROAS|Độ tin cậy/.test(
        `Ngân sách ${c.budgetLabel} Lead dự kiến ${c.leadsLabel} Booking/Chuyển đổi dự kiến ${c.bookingsLabel} Doanh thu dự kiến ${c.revenueLabel} ROAS dự kiến ${c.roasLabel} Độ tin cậy ${c.confidenceLabel}`,
      ),
    ) &&
    (five?.estimates.leads.value ?? 0) > 0 &&
    (ten?.estimates.leads.value ?? 0) > (five?.estimates.leads.value ?? 0) &&
    (twenty?.estimates.leads.value ?? 0) > (ten?.estimates.leads.value ?? 0) &&
    (fifty?.estimates.leads.value ?? 0) > (twenty?.estimates.leads.value ?? 0) &&
    (ten?.estimates.revenue.value ?? 0) > (five?.estimates.revenue.value ?? 0) &&
    assertNoFakeForecast(historical) &&
    canForecastBudgetFromMetrics(historicalMetrics, 2_000_000);

  assertNoUiLeak(historicalView, 'historical');
  if (historicalView.kind === 'ready') {
    assert(historicalView.cards.every((c) => /đ$/.test(c.budgetLabel)), 'budget not VND');
    assert(historicalView.cards.every((c) => /đ$/.test(c.revenueLabel)), 'revenue not VND');
    assert(historicalView.cards.every((c) => /lần$/.test(c.roasLabel)), 'roas not formatted');
  }

  const emptyMetrics = {
    leads: { total: null, noFollowUp: null },
    bookings: { total: null },
    conversion: { leadToBookingRate: null },
    revenue: { total: null },
    ads: { spend: null, cpl: null, roas: null, leads: null },
  };
  const insufficient = simulateBudgetScenarios({
    productPrice: undefined,
    metrics: emptyMetrics,
  });
  const insufficientView = toBudgetScenarioUiView(insufficient, {
    metrics: emptyMetrics,
    mode: 'historical',
  });
  const gaps = describeBudgetDataGaps(emptyMetrics);

  const insufficientPass =
    insufficient.every((s) => s.dataQuality === 'INSUFFICIENT_DATA') &&
    insufficient.every((s) => s.estimates.leads.value == null) &&
    assertNoFakeForecast(insufficient) &&
    insufficientView.kind === 'insufficient' &&
    insufficientView.reason === 'Chưa đủ dữ liệu lịch sử để dự báo chính xác.' &&
    insufficientView.missing.length >= 1 &&
    gaps.canForecast === false &&
    !/INSUFFICIENT_DATA/.test(insufficientView.reason) &&
    insufficientView.missing.every((m) => !/INSUFFICIENT_DATA|conf=|basedOn=|sample=/.test(m));

  assertNoUiLeak(insufficientView, 'insufficient');

  const assumed = simulateBudgetScenariosFromAssumptions({
    cpl: 100_000,
    leadToBookingRatePct: 20,
    averageOrderValue: 2_000_000,
  });
  const assumedView = toBudgetScenarioUiView(assumed, { mode: 'assumption' });
  const a5 = assumed.find((s) => s.scenarioId === '5tr');
  const a10 = assumed.find((s) => s.scenarioId === '10tr');
  const a20 = assumed.find((s) => s.scenarioId === '20tr');
  const a50 = assumed.find((s) => s.scenarioId === '50tr');

  const assumptionPass =
    assumedView.kind === 'ready' &&
    assumedView.source === 'assumption' &&
    assumedView.disclaimer === 'Ước tính theo giả định, không phải dự báo AI.' &&
    assumedView.cards.every((c) => c.confidenceLabel === 'Theo giả định') &&
    (a5?.estimates.leads.value ?? 0) === 50 &&
    (a10?.estimates.leads.value ?? 0) === 100 &&
    (a20?.estimates.leads.value ?? 0) === 200 &&
    (a50?.estimates.leads.value ?? 0) === 500 &&
    (a5?.estimates.bookings.value ?? 0) === 10 &&
    (a10?.estimates.bookings.value ?? 0) === 20 &&
    (a5?.estimates.revenue.value ?? 0) === 20_000_000 &&
    (a10?.estimates.revenue.value ?? 0) === 40_000_000 &&
    (a5?.estimates.roas.value ?? 0) === 4 &&
    assumed.every((s) => s.mode === 'assumption') &&
    !assumed.some((s) => s.assumptions.some((a) => /INSUFFICIENT_DATA/.test(a)));

  assertNoUiLeak(assumedView, 'assumption');

  const derivedFromAdsLeads = simulateBudgetScenarios({
    productPrice: 1_000_000,
    metrics: {
      leads: { total: 0 },
      bookings: { total: 2 },
      conversion: { leadToBookingRate: 10 },
      ads: { spend: 3_000_000, cpl: null, leads: 30 },
    },
  });
  const derivedCplPass = (derivedFromAdsLeads.find((s) => s.scenarioId === '10tr')?.estimates.leads.value ?? 0) === 100;

  const windowPick = pickBudgetSimSource({
    productPrice: 1_000_000,
    metrics: emptyMetrics,
    timeRange: { from: '2026-07-24', to: '2026-08-23' },
    windows: [
      { days: 7, metrics: emptyMetrics, timeRange: { from: '2026-08-16', to: '2026-08-23' } },
      { days: 30, metrics: emptyMetrics, timeRange: { from: '2026-07-24', to: '2026-08-23' } },
      {
        days: 90,
        timeRange: { from: '2026-05-25', to: '2026-08-23' },
        metrics: historicalMetrics,
      },
    ],
  });
  const windowPass = canForecastBudgetFromMetrics(windowPick.metrics, 1_000_000);

  console.log(`HISTORICAL ${historicalPass ? 'PASS' : 'FAIL'}`);
  console.log(`INSUFFICIENT ${insufficientPass ? 'PASS' : 'FAIL'}`);
  console.log(`ASSUMPTION ${assumptionPass ? 'PASS' : 'FAIL'}`);
  console.log(`ADS LEADS CPL ${derivedCplPass ? 'PASS' : 'FAIL'}`);
  console.log(`WINDOW PICK ${windowPass ? 'PASS' : 'FAIL'}`);
  console.log(`UI LEAK NONE`);

  assert(historicalPass, 'HISTORICAL FAIL');
  assert(insufficientPass, 'INSUFFICIENT FAIL');
  assert(assumptionPass, 'ASSUMPTION FAIL');
  assert(derivedCplPass, 'ADS LEADS CPL FAIL');
  assert(windowPass, 'WINDOW PICK FAIL');
}

main();
