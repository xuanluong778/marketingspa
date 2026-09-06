/**
 * Unit + autocomplete + session-filter tests for executive assistant UI.
 * Run: pnpm test:assistant-ui
 */
import assert from 'node:assert/strict';
import {
  ASSISTANT_FAB_BASE,
  ASSISTANT_QUICK_PROMPTS,
  ASSISTANT_SLASH_COMMANDS,
  ASSISTANT_SLASH_DEFS,
  assistantFilterStorageKey,
  canSeeAssistantWidget,
  collectKpisFromTraces,
  expandAssistantInput,
  extractStructuredBlocks,
  filterAssistantLinks,
  getSlashAutocompleteSuggestions,
  measureFullWidthFixedBottomBarHeight,
  mergeSessionFilters,
  moveAutocompleteIndex,
  parseSlashInput,
  parseStoredSessionFilters,
  pickActionLinks,
  resolveAssistantFabOffset,
  resolveAssistantPanelLayout,
  toolErrorSummaries,
} from '../apps/web/src/lib/assistant-ui';
import type { AssistantLink } from '../packages/shared/src/assistant-tools';

function main() {
  assert.equal(canSeeAssistantWidget(null), false);
  assert.equal(canSeeAssistantWidget({ role: 'SALE', permissions: ['assistant.use'] }), true);
  assert.equal(canSeeAssistantWidget({ role: 'OWNER', permissions: [] }), true);
  assert.equal(
    canSeeAssistantWidget({
      role: 'OWNER',
      permissions: [],
      features: { assistantEnabled: false },
    }),
    false,
  );
  assert.equal(
    canSeeAssistantWidget({
      role: 'SALE',
      permissions: ['assistant.use'],
      features: { assistantEnabled: false },
    }),
    false,
  );

  for (const need of [
    'Kết quả kinh doanh hôm nay',
    'Ai hoàn thành hôm nay',
    'Chưa xong / quá hạn',
    'Fanpage nhắn hôm nay',
    'Khách cần chăm sóc',
    'Quảng cáo 7 ngày',
  ]) {
    assert.ok(
      ASSISTANT_QUICK_PROMPTS.some((q) => q.label === need),
      `missing ${need}`,
    );
  }

  // Slash defs + legacy map
  for (const cmd of [
    '/doanh-thu',
    '/cong-viec',
    '/fanpage',
    '/khach-hang',
    '/quang-cao',
    '/bao-cao-ngay',
    '/bao-cao-tuan',
    '/bao-cao-thang',
    '/so-sanh',
  ]) {
    assert.ok(ASSISTANT_SLASH_COMMANDS[cmd] || ASSISTANT_SLASH_DEFS.some((d) => d.command === cmd));
  }

  // expand with period token
  const exp = expandAssistantInput('/doanh-thu 7-ngay');
  assert.ok(exp.message.includes('period=last_7_days') || exp.message.includes('7 ngày'));
  assert.equal(exp.filters.period, 'last_7_days');

  const exp2 = expandAssistantInput('/fanpage fanpage:Thế Giới Digi hom-nay', {
    period: 'this_month',
  });
  assert.equal(exp2.filters.period, 'today');
  assert.ok(exp2.filters.pageName?.includes('Digi'));

  const exp3 = expandAssistantInput('/so-sanh tuan');
  assert.equal(exp3.filters.compare, true);
  assert.equal(exp3.filters.period, 'this_week');

  // Session filter key isolation
  const k1 = assistantFilterStorageKey('org1', 'u1', 's1');
  const k2 = assistantFilterStorageKey('org1', 'u2', 's1');
  const k3 = assistantFilterStorageKey('org1', 'u1', 's2');
  assert.notEqual(k1, k2);
  assert.notEqual(k1, k3);
  assert.deepEqual(
    parseStoredSessionFilters(JSON.stringify({ period: 'today', compare: true })),
    { period: 'today', dateFrom: undefined, dateTo: undefined, pageId: null, pageName: null, compare: true },
  );
  assert.equal(parseStoredSessionFilters('nope'), null);
  assert.equal(mergeSessionFilters({ period: 'today' }, { compare: true }).compare, true);

  // Autocomplete
  const ac1 = getSlashAutocompleteSuggestions('/do');
  assert.ok(ac1.some((s) => s.command === '/doanh-thu'));
  const ac2 = getSlashAutocompleteSuggestions('/bao-cao-ngay ');
  assert.ok(ac2.some((s) => s.kind === 'period'));
  assert.equal(moveAutocompleteIndex(0, 1, 3), 1);
  assert.equal(moveAutocompleteIndex(0, -1, 3), 2);

  // parseSlash
  const p = parseSlashInput('/quang-cao 7-ngay so-sanh');
  assert.equal(p.command, '/quang-cao');
  assert.equal(p.periodToken?.period, 'last_7_days');
  assert.equal(p.compare, true);

  // FAB / layout
  assert.deepEqual(ASSISTANT_FAB_BASE, { right: 20, bottom: 20 });
  const lifted = resolveAssistantFabOffset({ fullWidthFixedBarHeight: 60 });
  assert.ok(lifted.bottom >= 72);
  const mobile = resolveAssistantPanelLayout({
    viewportWidth: 390,
    viewportHeight: 800,
    fabBottom: 20,
    fabRight: 20,
  });
  assert.equal(mobile.isMobile, true);
  const desktop = resolveAssistantPanelLayout({
    viewportWidth: 1280,
    viewportHeight: 900,
    fabBottom: 20,
    fabRight: 20,
  });
  assert.equal(desktop.isMobile, false);

  assert.equal(
    measureFullWidthFixedBottomBarHeight(
      [{ left: 0, right: 1000, top: 740, bottom: 800, width: 1000, height: 60 }],
      { width: 1000, height: 800 },
    ),
    60,
  );

  // KPI / table
  assert.equal(
    collectKpisFromTraces([
      { ok: true, evidence: [{ label: 'revenue', value: 1000 }] },
      { ok: false, tool: 'x', code: 'EMPTY' },
    ]).length,
    1,
  );
  assert.equal(toolErrorSummaries([{ ok: false, tool: 'a', code: 'TIMEOUT' }])[0], 'a: TIMEOUT');
  const structured = extractStructuredBlocks('- A\n| H |\n| - |\n| 1 |');
  assert.ok(structured.listItems.length >= 1);

  // Action links
  const links: AssistantLink[] = [
    {
      rel: 'report',
      label: 'Xem báo cáo chi tiết',
      href: '/finance',
      entityType: 'report',
    },
    {
      rel: 'list',
      label: 'Mở công việc',
      href: '/work-management',
      entityType: 'task',
    },
    {
      rel: 'list',
      label: 'Mở khách hàng',
      href: '/customers',
      entityType: 'customer',
    },
    {
      rel: 'list',
      label: 'Mở hội thoại',
      href: '/chatbot-cskh?tab=inbox',
      entityType: 'conversation',
    },
  ];
  const actions = pickActionLinks(links);
  assert.ok(actions.detail);
  assert.ok(actions.work);
  assert.ok(actions.customer);
  assert.ok(actions.conversation);

  assert.equal(
    filterAssistantLinks(links, { role: 'SALE', permissions: [] }).length,
    4,
  );

  console.log('ALL_PASS assistant-ui');
}

main();
