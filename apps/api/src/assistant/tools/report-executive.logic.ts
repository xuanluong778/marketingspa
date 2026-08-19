/**
 * Pure executive-report helpers (no Nest DI).
 * Composition rules: one primary metric per source; never double-count.
 */

import type { AssistantEvidence, AssistantLink } from '@marketingspa/shared';

export type ReportMetric = {
  key: string;
  label: string;
  value: number | string | null;
  unit?: string;
  source: string;
  /** Whether compare is allowed for this metric */
  comparable: boolean;
  previousValue?: number | null;
  deltaAbs?: number | null;
  deltaPct?: number | null;
  /** Human caveat when sample-capped / incomplete */
  note?: string;
  evidence: AssistantEvidence;
  link?: AssistantLink;
};

export type ReportSectionStatus = 'ok' | 'forbidden' | 'empty' | 'error' | 'skipped';

export type ReportSection = {
  id: string;
  title: string;
  status: ReportSectionStatus;
  message?: string;
  metrics: ReportMetric[];
  lists?: Array<{ title: string; items: string[] }>;
};

export type FanpageStatRow = {
  pageId: string;
  pageName: string | null;
  conversations: number;
  needsReply: number;
  open: number;
};

/** Match fanpage by pageName (accent-insensitive substring). */
export function matchFanpageByName(rows: FanpageStatRow[], query: string): FanpageStatRow | null {
  const q = normalizeName(query);
  if (!q || !rows.length) return null;
  const exact = rows.find((r) => normalizeName(r.pageName ?? '') === q);
  if (exact) return exact;
  const contains = rows.filter((r) => normalizeName(r.pageName ?? '').includes(q));
  if (contains.length === 1) return contains[0]!;
  // prefer longest common match
  if (contains.length > 1) {
    return contains.sort((a, b) => (b.pageName?.length ?? 0) - (a.pageName?.length ?? 0))[0]!;
  }
  return null;
}

function normalizeName(s: string): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export type WorkLiteTask = {
  id?: string;
  title?: string;
  deadline?: string | null;
  completedAt?: string | Date | null;
  columnKey?: string | null;
  assignees?: Array<{ name?: string | null } | string>;
  project?: { name?: string | null } | null;
};

/**
 * Completed-today from DONE samples only.
 * Documented as sample-based if underlying list is capped.
 */
export function filterCompletedOnDay(doneTasks: WorkLiteTask[], todayYmd: string): WorkLiteTask[] {
  return doneTasks.filter((t) => {
    if (t.completedAt == null) return false;
    if (typeof t.completedAt === 'string') {
      return t.completedAt.slice(0, 10) === todayYmd;
    }
    if (t.completedAt instanceof Date && !Number.isNaN(t.completedAt.getTime())) {
      return (
        t.completedAt.toISOString().slice(0, 10) === todayYmd ||
        ymdLikeFromDate(t.completedAt) === todayYmd
      );
    }
    const s = String(t.completedAt);
    return s.slice(0, 10) === todayYmd;
  });
}

function ymdLikeFromDate(d: Date): string {
  // Prefer ISO date portion (UTC) — callers pass org today; evidence notes sample.
  return d.toISOString().slice(0, 10);
}

export function formatAssigneeNames(task: WorkLiteTask): string {
  const list = task.assignees ?? [];
  const names = list
    .map((a) => (typeof a === 'string' ? a : a?.name))
    .filter((n): n is string => Boolean(n && String(n).trim()));
  return names.length ? names.join(', ') : '—';
}

/** Incomplete = not DONE: prefer overdue + inProgress + pendingReview samples, not sums of overlapping counts. */
export function buildIncompleteWorkLists(input: {
  overdue: WorkLiteTask[];
  inProgress: WorkLiteTask[];
  pendingReview: WorkLiteTask[];
}): { overdueTitles: string[]; incompleteTitles: string[] } {
  const titleOf = (t: WorkLiteTask) =>
    `${t.title ?? 'Task'} · ${formatAssigneeNames(t)}${t.deadline ? ` (hạn ${String(t.deadline).slice(0, 10)})` : ''}`;

  const overdueTitles = input.overdue.slice(0, 15).map(titleOf);

  // Incomplete (not done) samples — do NOT add counts; unique by id
  const seen = new Set<string>();
  const incomplete: WorkLiteTask[] = [];
  for (const t of [...input.overdue, ...input.inProgress, ...input.pendingReview]) {
    const id = t.id ?? titleOf(t);
    if (seen.has(id)) continue;
    seen.add(id);
    incomplete.push(t);
  }
  return {
    overdueTitles,
    incompleteTitles: incomplete.slice(0, 20).map(titleOf),
  };
}

/**
 * Numeric compare only when both current/previous are finite numbers.
 * Returns nulls when not comparable.
 */
export function compareNumeric(
  current: number | null | undefined,
  previous: number | null | undefined,
): { deltaAbs: number | null; deltaPct: number | null; comparable: boolean } {
  if (current == null || previous == null) {
    return { deltaAbs: null, deltaPct: null, comparable: false };
  }
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return { deltaAbs: null, deltaPct: null, comparable: false };
  }
  const deltaAbs = current - previous;
  const deltaPct =
    previous === 0 ? (current === 0 ? 0 : null) : Math.round((deltaAbs / previous) * 1000) / 10;
  return { deltaAbs, deltaPct, comparable: true };
}

/** Primary finance metric = revenue (payments COMPLETED). Never sum with order page totals / ad spend. */
export function buildFinanceMetrics(input: {
  revenue: number;
  ordersTotal?: number | null;
  paymentCount?: number | null;
  expense?: number | null;
  profit?: number | null;
  prev?: { revenue?: number | null; ordersTotal?: number | null } | null;
}): ReportMetric[] {
  const revCmp = compareNumeric(input.revenue, input.prev?.revenue);
  const metrics: ReportMetric[] = [
    {
      key: 'revenue',
      label: 'Doanh thu (thanh toán hoàn tất)',
      value: input.revenue,
      unit: '₫',
      source: 'finance.dashboard',
      comparable: revCmp.comparable,
      previousValue: input.prev?.revenue ?? null,
      deltaAbs: revCmp.deltaAbs,
      deltaPct: revCmp.deltaPct,
      note: 'Nguồn: Payment COMPLETED theo paidAt — không cộng với tổng trang đơn.',
      evidence: { label: 'doanh_thu', value: input.revenue, unit: '₫' },
      link: {
        rel: 'report',
        label: 'Xem báo cáo chi tiết',
        href: '/finance',
        entityType: 'report',
        requiredPermission: 'order.read',
      },
    },
  ];
  if (input.ordersTotal != null && Number.isFinite(input.ordersTotal)) {
    const oCmp = compareNumeric(input.ordersTotal, input.prev?.ordersTotal ?? null);
    metrics.push({
      key: 'orders',
      label: 'Số đơn (orderedAt trong kỳ)',
      value: input.ordersTotal,
      source: 'finance.list_orders',
      comparable: oCmp.comparable,
      previousValue: input.prev?.ordersTotal ?? null,
      deltaAbs: oCmp.deltaAbs,
      deltaPct: oCmp.deltaPct,
      note: 'Đếm đơn hàng — không cộng vào doanh thu.',
      evidence: { label: 'orders_total', value: input.ordersTotal },
      link: {
        rel: 'list',
        label: 'Xem báo cáo chi tiết',
        href: '/finance',
        entityType: 'order',
        requiredPermission: 'order.read',
      },
    });
  }
  if (input.paymentCount != null) {
    metrics.push({
      key: 'payments',
      label: 'Số giao dịch thanh toán',
      value: input.paymentCount,
      source: 'finance.dashboard',
      comparable: false,
      evidence: { label: 'payment_count', value: input.paymentCount },
      link: {
        rel: 'report',
        label: 'Xem báo cáo chi tiết',
        href: '/finance',
        entityType: 'report',
        requiredPermission: 'order.read',
      },
    });
  }
  if (input.expense != null) {
    metrics.push({
      key: 'expense',
      label: 'Chi phí (expenseDate)',
      value: input.expense,
      unit: '₫',
      source: 'finance.dashboard',
      comparable: false,
      note: 'Không trừ / cộng chéo với Ads spend Meta/Google trong report (nguồn khác nhau).',
      evidence: { label: 'expense', value: input.expense, unit: '₫' },
      link: {
        rel: 'report',
        label: 'Xem báo cáo chi tiết',
        href: '/finance',
        entityType: 'report',
        requiredPermission: 'order.read',
      },
    });
  }
  if (input.profit != null) {
    metrics.push({
      key: 'profit',
      label: 'Lợi nhuận (dashboard)',
      value: input.profit,
      unit: '₫',
      source: 'finance.dashboard',
      comparable: false,
      evidence: { label: 'profit', value: input.profit, unit: '₫' },
      link: {
        rel: 'report',
        label: 'Xem báo cáo chi tiết',
        href: '/finance',
        entityType: 'report',
        requiredPermission: 'order.read',
      },
    });
  }
  return metrics;
}

/** Ads metrics standalone — never add to finance.adSpend. */
export function buildAdsMetrics(input: {
  spend?: number | null;
  impressions?: number | null;
  clicks?: number | null;
  conversions?: number | null;
  roas?: number | null;
  prev?: { spend?: number | null; roas?: number | null } | null;
}): ReportMetric[] {
  const metrics: ReportMetric[] = [];
  const push = (
    key: string,
    label: string,
    value: number | null | undefined,
    unit?: string,
    prev?: number | null,
  ) => {
    if (value == null || !Number.isFinite(value)) return;
    const cmp = compareNumeric(value, prev ?? null);
    metrics.push({
      key,
      label,
      value,
      unit,
      source: 'ads.get_metrics',
      comparable: cmp.comparable,
      previousValue: prev ?? null,
      deltaAbs: cmp.deltaAbs,
      deltaPct: cmp.deltaPct,
      note: 'Nguồn Ads MCP (DB) — không cộng với finance.adSpend.',
      evidence: { label: key, value, unit },
      link: {
        rel: 'list',
        label: 'Xem báo cáo chi tiết',
        href: '/ads',
        entityType: 'ads_campaign',
        requiredPermission: 'ads.read',
      },
    });
  };
  push('ads_spend', 'Chi ads', input.spend, '₫', input.prev?.spend);
  push('ads_impressions', 'Impressions', input.impressions);
  push('ads_clicks', 'Clicks', input.clicks);
  push('ads_conversions', 'Conversions', input.conversions);
  push('ads_roas', 'ROAS', input.roas, undefined, input.prev?.roas);
  return metrics;
}

/** Funnel — stages exclusive; conversions cumulative — do not treat step.count as conversion. */
export function buildCrmMetrics(input: {
  totalLeads?: number | null;
  purchased?: number | null;
  staleLeads?: number | null;
}): ReportMetric[] {
  const out: ReportMetric[] = [];
  if (input.totalLeads != null) {
    out.push({
      key: 'leads',
      label: 'Lead trong kỳ',
      value: input.totalLeads,
      source: 'crm.funnel_stats',
      comparable: false,
      evidence: { label: 'total_leads', value: input.totalLeads },
      link: {
        rel: 'list',
        label: 'Mở khách hàng',
        href: '/leads',
        entityType: 'lead',
        requiredPermission: 'lead.read',
      },
    });
  }
  if (input.purchased != null) {
    out.push({
      key: 'purchased',
      label: 'Khách chốt (PURCHASED cumul. funnel)',
      value: input.purchased,
      source: 'crm.funnel_stats',
      comparable: false,
      note: 'counts.purchased của funnel — không cộng với số lead stage.',
      evidence: { label: 'purchased', value: input.purchased },
      link: {
        rel: 'list',
        label: 'Mở khách hàng',
        href: '/funnel',
        entityType: 'lead',
        requiredPermission: 'lead.read',
      },
    });
  }
  if (input.staleLeads != null) {
    out.push({
      key: 'stale_leads',
      label: 'Lead cần chăm sóc (stale NEW)',
      value: input.staleLeads,
      source: 'crm.list_stale_leads',
      comparable: false,
      evidence: { label: 'stale_leads', value: input.staleLeads },
      link: {
        rel: 'list',
        label: 'Mở khách hàng',
        href: '/leads',
        entityType: 'lead',
        requiredPermission: 'lead.read',
      },
    });
  }
  return out;
}

export function buildWorkMetrics(input: {
  dueToday?: number | null;
  overdue?: number | null;
  doneTotal?: number | null;
  completedTodaySample?: number | null;
  sampleCapped?: boolean;
}): ReportMetric[] {
  const out: ReportMetric[] = [];
  const link: AssistantLink = {
    rel: 'list',
    label: 'Mở công việc',
    href: '/work-management',
    entityType: 'task',
    requiredPermission: 'work.task.read',
  };
  if (input.dueToday != null) {
    out.push({
      key: 'due_today',
      label: 'Việc hạn hôm nay (assignee)',
      value: input.dueToday,
      source: 'work.my_work',
      comparable: false,
      note: 'counts.today = deadline hôm nay — không phải đã hoàn thành.',
      evidence: { label: 'due_today', value: input.dueToday },
      link,
    });
  }
  if (input.overdue != null) {
    out.push({
      key: 'overdue',
      label: 'Quá hạn (chưa DONE)',
      value: input.overdue,
      source: 'work.my_work',
      comparable: false,
      evidence: { label: 'overdue', value: input.overdue },
      link,
    });
  }
  if (input.doneTotal != null) {
    out.push({
      key: 'done_total',
      label: 'Đang ở cột DONE (tổng assignee)',
      value: input.doneTotal,
      source: 'work.my_work',
      comparable: false,
      note: 'All-time DONE bucket — không phải hoàn thành trong kỳ.',
      evidence: { label: 'done', value: input.doneTotal },
      link,
    });
  }
  if (input.completedTodaySample != null) {
    out.push({
      key: 'completed_today_sample',
      label: 'Hoàn thành hôm nay (mẫu DONE có completedAt)',
      value: input.completedTodaySample,
      source: 'work.my_work',
      comparable: false,
      note: input.sampleCapped
        ? 'Mẫu tối đa 50 task DONE — có thể thiếu; không bịa full list.'
        : undefined,
      evidence: { label: 'completed_today_sample', value: input.completedTodaySample },
      link,
    });
  }
  return out;
}

export function buildInboxMetrics(input: {
  conversationsTotal?: number | null;
  needsReplySample?: number | null;
  page?: FanpageStatRow | null;
  sampleNote?: string;
}): ReportMetric[] {
  const out: ReportMetric[] = [];
  const link: AssistantLink = {
    rel: 'list',
    label: 'Mở hội thoại',
    href: '/chatbot-cskh?tab=inbox',
    entityType: 'conversation',
    requiredPermission: 'chatbot.inbox.read',
  };
  if (input.page) {
    out.push({
      key: 'page_conversations_sample',
      label: `Hội thoại mẫu · ${input.page.pageName ?? input.page.pageId}`,
      value: input.page.conversations,
      source: 'inbox.page_stats',
      comparable: false,
      note:
        input.sampleNote ?? 'Đếm trên mẫu ≤200 hội thoại gần nhất (không double-count overview).',
      evidence: {
        label: `page_${input.page.pageId}_conversations`,
        value: input.page.conversations,
      },
      link: {
        ...link,
        href: `/chatbot-cskh?tab=inbox&pageId=${encodeURIComponent(input.page.pageId)}`,
      },
    });
    out.push({
      key: 'page_needs_reply',
      label: `Cần trả lời · ${input.page.pageName ?? input.page.pageId}`,
      value: input.page.needsReply,
      source: 'inbox.page_stats',
      comparable: false,
      evidence: { label: `page_${input.page.pageId}_needs_reply`, value: input.page.needsReply },
      link,
    });
  } else {
    if (input.conversationsTotal != null) {
      out.push({
        key: 'conversations_total',
        label: 'Tổng hội thoại org (overview)',
        value: input.conversationsTotal,
        source: 'inbox.page_stats',
        comparable: false,
        evidence: { label: 'conversations_total', value: input.conversationsTotal },
        link,
      });
    }
    if (input.needsReplySample != null) {
      out.push({
        key: 'needs_reply_sample',
        label: 'Cần trả lời (tổng mẫu byFanpage)',
        value: input.needsReplySample,
        source: 'inbox.page_stats',
        comparable: false,
        note: 'Sum needsReply trên byFanpage (mẫu) — không bằng bắt buộc overview.',
        evidence: { label: 'needs_reply_total', value: input.needsReplySample },
        link,
      });
    }
  }
  return out;
}

/** Flatten section metrics → evidence array (dedupe by label). */
export function sectionsToEvidence(sections: ReportSection[]): AssistantEvidence[] {
  const out: AssistantEvidence[] = [];
  const seen = new Set<string>();
  for (const s of sections) {
    for (const m of s.metrics) {
      if (seen.has(m.evidence.label)) continue;
      seen.add(m.evidence.label);
      out.push(m.evidence);
    }
  }
  return out.slice(0, 40);
}

export function sectionsToLinks(sections: ReportSection[]): AssistantLink[] {
  const out: AssistantLink[] = [];
  const seen = new Set<string>();
  const push = (l?: AssistantLink) => {
    if (!l?.href) return;
    const k = `${l.rel}|${l.href}|${l.label}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(l);
  };
  // Standard action links first
  push({
    rel: 'report',
    label: 'Xem báo cáo chi tiết',
    href: '/finance',
    entityType: 'report',
  });
  push({
    rel: 'list',
    label: 'Mở công việc',
    href: '/work-management',
    entityType: 'task',
  });
  push({
    rel: 'list',
    label: 'Mở khách hàng',
    href: '/customers',
    entityType: 'customer',
  });
  push({
    rel: 'list',
    label: 'Mở hội thoại',
    href: '/chatbot-cskh?tab=inbox',
    entityType: 'conversation',
  });
  for (const s of sections) {
    for (const m of s.metrics) push(m.link);
  }
  return out.slice(0, 30);
}

/**
 * Guardrails: never present rules that sum incompatible metrics.
 */
export function assertNoDoubleCountRules(metrics: ReportMetric[]): string[] {
  const keys = new Set(metrics.map((m) => m.key));
  const violations: string[] = [];
  // These must never be co-presented as a single "total money" without labels — builder keeps separate keys
  if (keys.has('revenue') && keys.has('ads_spend')) {
    // OK if separate — check no synthetic sum key
    if (keys.has('revenue_plus_ads')) {
      violations.push('revenue_plus_ads_forbidden');
    }
  }
  if (keys.has('orders') && keys.has('revenue')) {
    if (keys.has('gross_orders_plus_revenue')) {
      violations.push('orders_plus_revenue_forbidden');
    }
  }
  return violations;
}

/** Build Vietnamese narrative strictly from sections — no invented numbers. */
export function buildExecutiveNarrative(input: {
  periodLabel: string;
  dateFrom: string;
  dateTo: string;
  compareEnabled: boolean;
  sections: ReportSection[];
}): string {
  const lines: string[] = [];
  lines.push(`## Báo cáo điều hành · ${input.periodLabel}`);
  lines.push(`Kỳ: ${input.dateFrom} → ${input.dateTo}`);
  if (!input.compareEnabled) {
    lines.push('So sánh kỳ trước: không (thiếu dữ liệu đủ hoặc không yêu cầu).');
  } else {
    lines.push('So sánh kỳ trước: chỉ với metric có cả kỳ hiện tại và kỳ trước (ok).');
  }
  lines.push('');

  for (const s of input.sections) {
    lines.push(`### ${s.title}`);
    if (s.status !== 'ok') {
      lines.push(
        s.message
          ? `— ${statusVi(s.status)}: ${s.message}`
          : `— ${statusVi(s.status)}: không có số liệu tin cậy.`,
      );
      lines.push('');
      continue;
    }
    for (const m of s.metrics) {
      const val =
        m.value == null
          ? '—'
          : typeof m.value === 'number'
            ? formatNum(m.value) + (m.unit ? ` ${m.unit}` : '')
            : String(m.value);
      let line = `- **${m.label}**: ${val}`;
      if (m.comparable && m.deltaAbs != null) {
        const sign = m.deltaAbs > 0 ? '+' : '';
        line += ` · Δ ${sign}${formatNum(m.deltaAbs)}${
          m.deltaPct != null ? ` (${sign}${m.deltaPct}%)` : ''
        } vs kỳ trước`;
      }
      if (m.note) line += ` _(${m.note})_`;
      lines.push(line);
    }
    for (const list of s.lists ?? []) {
      if (!list.items.length) continue;
      lines.push(`**${list.title}:**`);
      for (const it of list.items.slice(0, 12)) lines.push(`  - ${it}`);
    }
    lines.push('');
  }

  lines.push('_Mọi số liệu lấy từ tool/evidence. Không suy đoán khi section lỗi hoặc empty._');
  return lines.join('\n');
}

function statusVi(s: ReportSectionStatus): string {
  switch (s) {
    case 'forbidden':
      return 'Không đủ quyền';
    case 'empty':
      return 'Trống';
    case 'error':
      return 'Lỗi';
    case 'skipped':
      return 'Bỏ qua';
    default:
      return 'OK';
  }
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1000) return new Intl.NumberFormat('vi-VN').format(n);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}
