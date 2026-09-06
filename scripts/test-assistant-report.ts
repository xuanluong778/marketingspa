/**
 * Unit tests: executive report logic + double-count guards.
 * Run: pnpm test:assistant-report
 */
import assert from 'node:assert/strict';
import {
  addCalendarDays,
  previousAssistantRange,
  resolveAssistantRange,
  ymdInTimeZone,
} from '../apps/api/src/assistant/tools/date-range';
import {
  assertNoDoubleCountRules,
  buildAdsMetrics,
  buildCrmMetrics,
  buildExecutiveNarrative,
  buildFinanceMetrics,
  buildIncompleteWorkLists,
  buildInboxMetrics,
  buildWorkMetrics,
  compareNumeric,
  filterCompletedOnDay,
  matchFanpageByName,
  sectionsToEvidence,
  sectionsToLinks,
  type ReportMetric,
  type ReportSection,
} from '../apps/api/src/assistant/tools/report-executive.logic';
import { ASSISTANT_TOOLS, assistantToolPermissionMap } from '../packages/shared/src/assistant-tools';

function main() {
  // this_week + previous period lengths
  const now = new Date('2026-08-07T10:00:00+07:00');
  const today = resolveAssistantRange({ period: 'today' }, 'Asia/Ho_Chi_Minh', 90, now);
  assert.equal(today.dateFrom, today.dateTo);
  assert.equal(ymdInTimeZone(now, 'Asia/Ho_Chi_Minh'), today.dateFrom);

  const week = resolveAssistantRange({ period: 'this_week' }, 'Asia/Ho_Chi_Minh', 90, now);
  // 2026-08-07 is Friday → week start Mon 2026-08-03
  assert.equal(week.dateFrom, '2026-08-03');
  assert.equal(week.dateTo, '2026-08-07');

  const month = resolveAssistantRange({ period: 'this_month' }, 'Asia/Ho_Chi_Minh', 90, now);
  assert.equal(month.dateFrom, '2026-08-01');

  const prev = previousAssistantRange(today);
  assert.equal(prev.dateTo, addCalendarDays(today.dateFrom, -1));
  assert.equal(prev.dateFrom, prev.dateTo);

  const w7 = resolveAssistantRange({ period: 'last_7_days' }, 'Asia/Ho_Chi_Minh', 90, now);
  const prev7 = previousAssistantRange(w7);
  // same span length
  const span = (a: string, b: string) =>
    Math.round(
      (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000,
    );
  assert.equal(span(w7.dateFrom, w7.dateTo), span(prev7.dateFrom, prev7.dateTo));

  // Fanpage match
  const pages = [
    { pageId: '1', pageName: 'Spa Demo', conversations: 2, needsReply: 0, open: 1 },
    {
      pageId: '99',
      pageName: 'Thế Giới Digi',
      conversations: 5,
      needsReply: 2,
      open: 3,
    },
  ];
  const match = matchFanpageByName(pages, 'the gioi digi');
  assert.equal(match?.pageId, '99');
  assert.equal(matchFanpageByName(pages, 'không có')?.pageId, undefined);

  // completed today sample
  const done = [
    { id: 'a', title: 'A', completedAt: '2026-08-07T03:00:00.000Z' },
    { id: 'b', title: 'B', completedAt: '2026-08-06T03:00:00.000Z' },
    { id: 'c', title: 'C', completedAt: null },
  ];
  assert.equal(filterCompletedOnDay(done, '2026-08-07').length, 1);

  // Incomplete unique — same id in overdue+inProgress once
  const lists = buildIncompleteWorkLists({
    overdue: [{ id: 'x', title: 'X', assignees: [{ name: 'An' }] }],
    inProgress: [{ id: 'x', title: 'X', assignees: [{ name: 'An' }] }],
    pendingReview: [{ id: 'y', title: 'Y' }],
  });
  assert.equal(lists.incompleteTitles.length, 2);

  // Finance metrics separate from ads
  const fin = buildFinanceMetrics({
    revenue: 1_000_000,
    ordersTotal: 3,
    paymentCount: 2,
    expense: 100_000,
    profit: 900_000,
    prev: { revenue: 800_000, ordersTotal: 2 },
  });
  assert.ok(fin.some((m) => m.key === 'revenue' && m.comparable));
  assert.ok(fin.every((m) => m.link?.href));
  const ads = buildAdsMetrics({ spend: 50_000, impressions: 1000, prev: { spend: 40_000 } });
  const all = [...fin, ...ads];
  assert.deepEqual(assertNoDoubleCountRules(all), []);
  // forge illegal sum key
  const forged: ReportMetric[] = [
    ...all,
    {
      key: 'revenue_plus_ads',
      label: 'bad',
      value: 1,
      source: 'x',
      comparable: false,
      evidence: { label: 'bad', value: 1 },
    },
  ];
  assert.ok(assertNoDoubleCountRules(forged).includes('revenue_plus_ads_forbidden'));

  // CRM purchased separate
  const crm = buildCrmMetrics({ totalLeads: 10, purchased: 2, staleLeads: 4 });
  assert.equal(crm.find((m) => m.key === 'purchased')?.value, 2);

  // Work labels
  const work = buildWorkMetrics({
    dueToday: 2,
    overdue: 1,
    doneTotal: 9,
    completedTodaySample: 1,
    sampleCapped: true,
  });
  assert.ok(work.find((m) => m.key === 'due_today')?.note?.includes('deadline'));
  assert.ok(work.find((m) => m.key === 'completed_today_sample')?.note?.includes('50'));

  // Inbox sample vs overview not summed into one fake total key
  const inbox = buildInboxMetrics({
    conversationsTotal: 100,
    needsReplySample: 7,
    page: pages[1]!,
  });
  assert.ok(inbox.some((m) => m.key === 'page_conversations_sample'));
  assert.ok(!inbox.some((m) => m.key === 'conversations_total')); // page path skips overview metric

  // compareNumeric null previous
  assert.equal(compareNumeric(10, null).comparable, false);
  assert.equal(compareNumeric(10, 5).deltaAbs, 5);

  // Narrative no invent
  const sections: ReportSection[] = [
    { id: 'finance', title: 'Kinh doanh', status: 'ok', metrics: fin },
    {
      id: 'ads',
      title: 'Ads',
      status: 'forbidden',
      message: 'Thiếu quyền',
      metrics: [],
    },
  ];
  const text = buildExecutiveNarrative({
    periodLabel: 'Hôm nay',
    dateFrom: today.dateFrom,
    dateTo: today.dateTo,
    compareEnabled: true,
    sections,
  });
  assert.ok(text.includes('Doanh thu'));
  assert.ok(text.includes('Không đủ quyền'));
  assert.ok(!text.includes('revenue_plus_ads'));

  const evidence = sectionsToEvidence(sections);
  assert.ok(evidence.some((e) => e.label === 'doanh_thu'));
  const links = sectionsToLinks(sections);
  assert.ok(links.some((l) => l.label === 'Xem báo cáo chi tiết'));
  assert.ok(links.some((l) => l.label === 'Mở công việc'));
  assert.ok(links.some((l) => l.label === 'Mở khách hàng'));
  assert.ok(links.some((l) => l.label === 'Mở hội thoại'));

  // Shared catalog
  assert.equal(ASSISTANT_TOOLS.REPORT_EXECUTIVE, 'report.executive');
  assert.ok(assistantToolPermissionMap[ASSISTANT_TOOLS.REPORT_EXECUTIVE].includes('assistant.use'));

  console.log('ALL_PASS assistant-report');
}

main();
