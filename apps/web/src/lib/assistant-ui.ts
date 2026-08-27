/**
 * Pure helpers for Trợ lý Bạch Cốt Tinh (floating UI).
 * No React — unit / autocomplete / responsive tests import from here.
 */

import { ASSISTANT_PERMISSIONS } from '@marketingspa/shared';
import type { AssistantEvidence, AssistantLink } from '@marketingspa/shared';

export const ASSISTANT_USE_PERMISSION = ASSISTANT_PERMISSIONS.USE;
export const ASSISTANT_FAB_BASE = { right: 20, bottom: 20 } as const;
export const ASSISTANT_ROOT_ATTR = 'data-ma-assistant-root';

export type AssistantQuickPrompt = {
  id: string;
  label: string;
  message: string;
};

/** FAQ-aligned quick prompts (product requirement). */
export const ASSISTANT_QUICK_PROMPTS: readonly AssistantQuickPrompt[] = [
  {
    id: 'business',
    label: 'Kết quả kinh doanh hôm nay',
    message: 'Kết quả kinh doanh hôm nay thế nào?',
  },
  {
    id: 'work_done',
    label: 'Ai hoàn thành hôm nay',
    message: 'Ai đã hoàn thành công việc hôm nay?',
  },
  {
    id: 'work_overdue',
    label: 'Chưa xong / quá hạn',
    message: 'Ai chưa hoàn thành và công việc nào quá hạn?',
  },
  {
    id: 'fanpage',
    label: 'Fanpage nhắn hôm nay',
    message: 'Fanpage Thế Giới Digi có khách nhắn hôm nay không?',
  },
  {
    id: 'care',
    label: 'Khách cần chăm sóc',
    message: 'Khách hàng nào cần chăm sóc?',
  },
  {
    id: 'ads',
    label: 'Quảng cáo 7 ngày',
    message: 'Quảng cáo 7 ngày qua hiệu quả thế nào?',
  },
] as const;

export type AssistantPeriodToken = {
  token: string;
  period: 'today' | 'yesterday' | 'last_7_days' | 'this_week' | 'this_month';
  label: string;
};

export const ASSISTANT_PERIOD_TOKENS: readonly AssistantPeriodToken[] = [
  { token: 'hom-nay', period: 'today', label: 'Hôm nay' },
  { token: 'hom-qua', period: 'yesterday', label: 'Hôm qua' },
  { token: '7-ngay', period: 'last_7_days', label: '7 ngày' },
  { token: 'tuan', period: 'this_week', label: 'Tuần này' },
  { token: 'thang', period: 'this_month', label: 'Tháng này' },
] as const;

export type AssistantSlashDef = {
  command: string;
  label: string;
  /** Base user message — period appended by expand */
  messageTemplate: string;
  aliases?: string[];
};

export const ASSISTANT_SLASH_DEFS: readonly AssistantSlashDef[] = [
  {
    command: '/doanh-thu',
    label: 'Doanh thu / kinh doanh',
    messageTemplate:
      'Kết quả kinh doanh thế nào? Dùng finance.dashboard hoặc report.executive; chỉ số từ evidence.',
  },
  {
    command: '/cong-viec',
    label: 'Công việc',
    messageTemplate:
      'Tóm tắt công việc: đã hoàn thành hôm nay (sample), chưa xong, quá hạn. Dùng work.my_work / report.executive.',
  },
  {
    command: '/fanpage',
    label: 'Inbox Fanpage',
    messageTemplate:
      'Tin nhắn / hội thoại Fanpage. Dùng report.executive hoặc inbox.page_stats; resolve pageName nếu có.',
  },
  {
    command: '/khach-hang',
    label: 'Khách cần chăm sóc',
    messageTemplate: 'Khách hàng / lead cần chăm sóc? Dùng crm.list_stale_leads.',
  },
  {
    command: '/quang-cao',
    label: 'Hiệu quả quảng cáo',
    messageTemplate: 'Hiệu quả quảng cáo? Dùng ads.get_metrics hoặc report.executive.',
  },
  {
    command: '/bao-cao-ngay',
    label: 'Báo cáo ngày',
    messageTemplate:
      'Báo cáo điều hành ngày: doanh thu, đơn, lead, khách chốt, ads, việc, inbox. Gọi report.executive period=today.',
  },
  {
    command: '/bao-cao-tuan',
    label: 'Báo cáo tuần',
    messageTemplate: 'Báo cáo điều hành tuần. Gọi report.executive period=this_week.',
  },
  {
    command: '/bao-cao-thang',
    label: 'Báo cáo tháng',
    messageTemplate: 'Báo cáo điều hành tháng. Gọi report.executive period=this_month.',
  },
  {
    command: '/so-sanh',
    label: 'So sánh kỳ trước',
    messageTemplate:
      'Báo cáo có so sánh kỳ trước (chỉ metric đủ dữ liệu). Gọi report.executive compare=true.',
  },
] as const;

/** @deprecated map — kept for simple callers; use expandAssistantInput */
export const ASSISTANT_SLASH_COMMANDS: Readonly<Record<string, string>> = Object.fromEntries(
  ASSISTANT_SLASH_DEFS.map((d) => [d.command, d.messageTemplate]),
);

export type AssistantSessionFilters = {
  period?: 'today' | 'yesterday' | 'last_7_days' | 'this_week' | 'this_month' | 'custom';
  dateFrom?: string;
  dateTo?: string;
  pageId?: string | null;
  pageName?: string | null;
  compare?: boolean;
};

/** Session filter memory key — never cross user/org. */
export function assistantFilterStorageKey(
  organizationId: string,
  userId: string,
  sessionId: string,
): string {
  return `ma.assistant.filters.v1:${organizationId}:${userId}:${sessionId}`;
}

export function parseStoredSessionFilters(raw: string | null): AssistantSessionFilters | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as AssistantSessionFilters;
    if (!o || typeof o !== 'object') return null;
    return {
      period: o.period,
      dateFrom: o.dateFrom,
      dateTo: o.dateTo,
      pageId: o.pageId ?? null,
      pageName: o.pageName ?? null,
      compare: Boolean(o.compare),
    };
  } catch {
    return null;
  }
}

export function mergeSessionFilters(
  prev: AssistantSessionFilters | null | undefined,
  next: Partial<AssistantSessionFilters>,
): AssistantSessionFilters {
  return {
    ...(prev ?? {}),
    ...next,
  };
}

export function canSeeAssistantWidget(
  user:
    | {
        role?: string;
        permissions?: string[];
        features?: { assistantEnabled?: boolean };
      }
    | null
    | undefined,
): boolean {
  if (!user) return false;
  // Canary / master: server is source of truth. Missing flag = allow (pre-deploy).
  // When features.assistantEnabled === false, hide FAB (org not allowlisted).
  if (user.features && user.features.assistantEnabled === false) {
    return false;
  }
  if (user.role === 'OWNER' || user.role === 'SUPER_ADMIN') {
    // Role may skip permission string checks — not canary/tenant
    return user.features?.assistantEnabled !== false;
  }
  return (user.permissions ?? []).includes(ASSISTANT_USE_PERMISSION);
}

export type ParsedSlashInput = {
  command: string | null;
  periodToken: AssistantPeriodToken | null;
  compare: boolean;
  pageName: string | null;
  rest: string;
  isSlashMode: boolean;
};

/**
 * Parse "/doanh-thu 7-ngay fanpage:Thế Giới Digi so-sanh ..."
 */
export function parseSlashInput(raw: string): ParsedSlashInput {
  const t = String(raw ?? '').trim();
  if (!t.startsWith('/')) {
    return {
      command: null,
      periodToken: null,
      compare: false,
      pageName: null,
      rest: t,
      isSlashMode: false,
    };
  }
  const parts = t.split(/\s+/);
  const command = (parts[0] ?? '').toLowerCase();
  let periodToken: AssistantPeriodToken | null = null;
  let compare = false;
  let pageName: string | null = null;
  const restParts: string[] = [];

  for (let i = 1; i < parts.length; i++) {
    const p = parts[i]!;
    const lower = p.toLowerCase();
    const pt = ASSISTANT_PERIOD_TOKENS.find((x) => x.token === lower);
    if (pt) {
      periodToken = pt;
      continue;
    }
    if (lower === 'so-sanh' || lower === 'compare' || lower === '--compare') {
      compare = true;
      continue;
    }
    if (lower.startsWith('fanpage:') || lower.startsWith('page:')) {
      pageName = p.slice(p.indexOf(':') + 1).replace(/_/g, ' ');
      // allow multi-word after — join remainder until next flag
      const collected = [pageName];
      while (i + 1 < parts.length) {
        const n = parts[i + 1]!;
        if (
          ASSISTANT_PERIOD_TOKENS.some((x) => x.token === n.toLowerCase()) ||
          /^(so-sanh|compare|--compare)$/i.test(n) ||
          n.startsWith('/')
        ) {
          break;
        }
        i += 1;
        collected.push(n);
      }
      pageName = collected.join(' ').trim() || null;
      continue;
    }
    restParts.push(p);
  }

  return {
    command,
    periodToken,
    compare,
    pageName,
    rest: restParts.join(' ').trim(),
    isSlashMode: true,
  };
}

export type ExpandSlashResult = {
  message: string;
  filters: AssistantSessionFilters;
};

export function expandAssistantInput(
  raw: string,
  baseFilters?: AssistantSessionFilters | null,
): ExpandSlashResult {
  const t = String(raw ?? '').trim();
  if (!t) return { message: '', filters: { ...(baseFilters ?? {}) } };

  if (!t.startsWith('/')) {
    return { message: t, filters: { ...(baseFilters ?? {}) } };
  }

  const parsed = parseSlashInput(t);
  const def = ASSISTANT_SLASH_DEFS.find((d) => d.command === parsed.command);
  if (!def) {
    return { message: t, filters: { ...(baseFilters ?? {}) } };
  }

  const period = parsed.periodToken?.period ?? baseFilters?.period ?? 'today';
  const filters: AssistantSessionFilters = mergeSessionFilters(baseFilters, {
    period,
    compare: parsed.compare || def.command === '/so-sanh' || Boolean(baseFilters?.compare),
    pageName: parsed.pageName !== null ? parsed.pageName : (baseFilters?.pageName ?? null),
  });

  // Default periods for dedicated report slashes
  if (def.command === '/bao-cao-ngay' && !parsed.periodToken) {
    filters.period = 'today';
  }
  if (def.command === '/bao-cao-tuan' && !parsed.periodToken) {
    filters.period = 'this_week';
  }
  if (def.command === '/bao-cao-thang' && !parsed.periodToken) {
    filters.period = 'this_month';
  }

  const periodLabel = ASSISTANT_PERIOD_TOKENS.find((x) => x.period === period)?.label ?? period;
  let message = def.messageTemplate;
  message += ` Kỳ: ${periodLabel} (period=${period}).`;
  if (filters.compare) message += ' compare=true.';
  if (filters.pageName) message += ` Fanpage tên: ${filters.pageName}.`;
  if (parsed.rest) message += ` ${parsed.rest}`;

  return { message, filters };
}

/** Autocomplete suggestions when input starts with `/`. */
export function getSlashAutocompleteSuggestions(
  input: string,
  opts?: { max?: number },
): Array<{
  command: string;
  label: string;
  insertText: string;
  kind: 'command' | 'period';
}> {
  const max = opts?.max ?? 12;
  const raw = String(input ?? '');
  if (!raw.startsWith('/')) return [];

  const endsWithSpace = /\s$/.test(raw);
  const t = raw.trimEnd();
  const parts = t.split(/\s+/).filter(Boolean);
  const first = (parts[0] ?? '').toLowerCase();
  const out: Array<{
    command: string;
    label: string;
    insertText: string;
    kind: 'command' | 'period';
  }> = [];

  const exactCmd = ASSISTANT_SLASH_DEFS.some((d) => d.command === first);
  // Completing command (no space after incomplete token)
  if (parts.length <= 1 && !endsWithSpace) {
    const q = first;
    for (const d of ASSISTANT_SLASH_DEFS) {
      if (d.command.startsWith(q) || d.label.toLowerCase().includes(q.slice(1))) {
        out.push({
          command: d.command,
          label: d.label,
          insertText: `${d.command} `,
          kind: 'command',
        });
      }
    }
    return out.slice(0, max);
  }

  // After a complete command (with space) → period / compare / fanpage tokens
  if (!exactCmd && parts.length === 1) {
    return out;
  }

  const last = endsWithSpace ? '' : (parts[parts.length - 1] ?? '').toLowerCase();
  const base = endsWithSpace ? t : parts.slice(0, Math.max(1, parts.length - 1)).join(' ');

  for (const p of ASSISTANT_PERIOD_TOKENS) {
    if (!last || p.token.startsWith(last)) {
      out.push({
        command: p.token,
        label: `Thời gian: ${p.label}`,
        insertText: `${base} ${p.token} `.replace(/\s+/g, ' ').replace(/^\s/, ''),
        kind: 'period',
      });
    }
  }
  if (!last || 'so-sanh'.startsWith(last) || 'compare'.startsWith(last)) {
    out.push({
      command: 'so-sanh',
      label: 'So sánh kỳ trước',
      insertText: `${base} so-sanh `.replace(/\s+/g, ' '),
      kind: 'period',
    });
  }
  if (!last || 'fanpage:'.startsWith(last) || last.startsWith('fanpage:')) {
    out.push({
      command: 'fanpage:',
      label: 'Lọc Fanpage (fanpage:Tên)',
      insertText: `${base} fanpage:`.replace(/\s+/g, ' '),
      kind: 'period',
    });
  }
  return out.slice(0, max);
}

export function moveAutocompleteIndex(current: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (current + delta + length * 10) % length;
}

export type AssistantFabOffset = { right: number; bottom: number };

export function resolveAssistantFabOffset(input: {
  baseRight?: number;
  baseBottom?: number;
  fullWidthFixedBarHeight?: number;
}): AssistantFabOffset {
  const right = input.baseRight ?? ASSISTANT_FAB_BASE.right;
  const baseBottom = input.baseBottom ?? ASSISTANT_FAB_BASE.bottom;
  const bar = Math.max(0, Number(input.fullWidthFixedBarHeight) || 0);
  const bottom = bar > 0 ? Math.max(baseBottom, Math.ceil(bar) + 12) : baseBottom;
  return { right, bottom };
}

export type AssistantPanelLayout = {
  isMobile: boolean;
  widthPx: number | 'full';
  heightPx: number | 'full';
  maxHeightPx: number;
  left: number | 'auto';
  right: number;
  bottom: number;
  top: number | 'auto';
};

export function resolveAssistantPanelLayout(input: {
  viewportWidth: number;
  viewportHeight: number;
  fabBottom: number;
  fabRight: number;
}): AssistantPanelLayout {
  const vw = Math.max(0, input.viewportWidth);
  const vh = Math.max(0, input.viewportHeight);
  const isMobile = vw < 640;
  const fabBottom = Math.max(0, input.fabBottom);
  const fabRight = Math.max(0, input.fabRight);

  if (isMobile) {
    const inset = 8;
    return {
      isMobile: true,
      widthPx: 'full',
      heightPx: 'full',
      maxHeightPx: Math.max(280, vh - inset * 2),
      left: inset,
      right: inset,
      bottom: inset,
      top: inset,
    };
  }

  const width = Math.min(420, Math.max(320, vw - fabRight - 24));
  const fabSize = 56;
  const gap = 12;
  const bottom = fabBottom + fabSize + gap;
  const maxHeight = Math.min(640, Math.max(360, vh - bottom - 16));
  return {
    isMobile: false,
    widthPx: width,
    heightPx: maxHeight,
    maxHeightPx: maxHeight,
    left: 'auto',
    right: fabRight,
    bottom,
    top: 'auto',
  };
}

export function filterAssistantLinks(
  links: AssistantLink[] | undefined | null,
  user: { role?: string; permissions?: string[] } | null | undefined,
): AssistantLink[] {
  if (!links?.length) return [];
  const role = user?.role;
  const have = new Set(user?.permissions ?? []);
  const bypass = role === 'OWNER' || role === 'SUPER_ADMIN';
  return links.filter((link) => {
    if (link.href?.startsWith('http') && typeof window !== 'undefined') {
      try {
        const u = new URL(link.href);
        if (u.origin !== window.location.origin) return false;
      } catch {
        return false;
      }
    }
    const req = link.requiredPermission;
    if (!req) return true;
    if (bypass) return true;
    const need = Array.isArray(req) ? req : [req];
    return need.every((p) => have.has(p));
  });
}

/** Prefer standard action buttons by known labels. */
export function pickActionLinks(links: AssistantLink[] | undefined | null): {
  detail?: AssistantLink;
  work?: AssistantLink;
  customer?: AssistantLink;
  conversation?: AssistantLink;
  rest: AssistantLink[];
} {
  const list = links ?? [];
  const find = (re: RegExp) => list.find((l) => re.test(l.label) || re.test(l.href));
  const detail = find(/báo cáo chi tiết|finance|\/finance/i);
  const work = find(/công việc|work-management/i);
  const customer = find(/khách hàng|customers|\/leads|\/funnel/i);
  const conversation = find(/hội thoại|inbox|chatbot/i);
  const used = new Set([detail, work, customer, conversation].filter(Boolean));
  return {
    detail,
    work,
    customer,
    conversation,
    rest: list.filter((l) => !used.has(l)),
  };
}

export type AssistantKpi = {
  label: string;
  value: string;
  unit?: string;
};

export function evidenceToKpis(
  evidence:
    AssistantEvidence[] | Array<{ label: string; value: unknown; unit?: string }> | undefined,
): AssistantKpi[] {
  if (!evidence?.length) return [];
  return evidence.slice(0, 12).map((e) => ({
    label: String(e.label),
    value: formatEvidenceValue(e.value),
    unit: e.unit,
  }));
}

export function formatEvidenceValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Math.abs(value) >= 1000) {
      return new Intl.NumberFormat('vi-VN').format(value);
    }
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return String(value).slice(0, 80);
}

export function extractStructuredBlocks(content: string): {
  paragraphs: string[];
  listItems: string[];
  table: { headers: string[]; rows: string[][] } | null;
} {
  const text = String(content ?? '').trim();
  if (!text) return { paragraphs: [], listItems: [], table: null };

  const lines = text.split(/\r?\n/);
  const listItems: string[] = [];
  const paraLines: string[] = [];
  let table: { headers: string[]; rows: string[][] } | null = null;

  const tableLines = lines.filter((l) => /^\s*\|.+\|\s*$/.test(l));
  if (tableLines.length >= 2) {
    const parseRow = (row: string) =>
      row
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim());
    const headers = parseRow(tableLines[0]!);
    const body = tableLines
      .slice(1)
      .filter((l) => !/^\s*\|?\s*:?-{2,}/.test(l))
      .map(parseRow)
      .filter((r) => r.some((c) => c && !/^-+$/.test(c)));
    if (headers.length && body.length) {
      table = { headers, rows: body };
    }
  }

  for (const line of lines) {
    const m = line.match(/^\s*[-*•]\s+(.+)$/);
    if (m?.[1]) {
      listItems.push(m[1].trim());
      continue;
    }
    if (/^\s*\|.+\|\s*$/.test(line)) continue;
    if (/^\s*\|?\s*:?-{2,}/.test(line)) continue;
    const tr = line.trim();
    if (tr) paraLines.push(tr);
  }

  return {
    paragraphs: paraLines.length ? [paraLines.join('\n')] : [],
    listItems: listItems.slice(0, 40),
    table,
  };
}

export type AssistantToolTracePublic = {
  toolCallId?: string;
  tool?: string;
  ok?: boolean;
  code?: string | null;
  durationMs?: number;
  evidence?: Array<{ label: string; value: unknown; unit?: string }>;
};

export function collectKpisFromTraces(
  traces: AssistantToolTracePublic[] | undefined,
): AssistantKpi[] {
  if (!traces?.length) return [];
  const out: AssistantKpi[] = [];
  for (const t of traces) {
    if (t.ok === false) continue;
    out.push(...evidenceToKpis(t.evidence));
  }
  return out.slice(0, 16);
}

export function toolErrorSummaries(traces: AssistantToolTracePublic[] | undefined): string[] {
  if (!traces?.length) return [];
  return traces
    .filter((t) => t.ok === false)
    .map((t) => `${t.tool ?? 'tool'}: ${t.code || 'ERROR'}`)
    .slice(0, 8);
}

export function measureFullWidthFixedBottomBarHeight(
  elements: Array<{
    right: number;
    left: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
  }>,
  viewport: { width: number; height: number },
): number {
  let maxLift = 0;
  for (const r of elements) {
    if (r.height <= 0 || r.width <= 0) continue;
    if (r.bottom < viewport.height - 8) continue;
    if (r.width < viewport.width * 0.55) continue;
    const fromBottom = Math.max(0, viewport.height - r.top);
    if (fromBottom > 0 && fromBottom <= 120) {
      maxLift = Math.max(maxLift, fromBottom);
    }
  }
  return maxLift;
}

export function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `asst-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function clientTimezoneHeader(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh';
  } catch {
    return 'Asia/Ho_Chi_Minh';
  }
}
