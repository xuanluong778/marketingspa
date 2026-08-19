import type { AssistantPeriod } from '@marketingspa/shared';
import { ASSISTANT_TOOL_LIMITS } from '@marketingspa/shared';

export type ResolvedAssistantRange = {
  period: AssistantPeriod;
  dateFrom: string;
  dateTo: string;
  /** Instant start of dateFrom in timezone */
  from: Date;
  /** Instant end of dateTo in timezone */
  to: Date;
  label: string;
  timezone: string;
};

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function formatYmd(y: number, m: number, d: number) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Calendar date parts for an instant in IANA timezone. */
export function zonedParts(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const bag: Record<string, string> = {};
  for (const p of f.formatToParts(date)) {
    if (p.type !== 'literal') bag[p.type] = p.value;
  }
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

export function ymdInTimeZone(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return formatYmd(p.year, p.month, p.day);
}

function parseYmd(ymd: string): { Y: number; M: number; D: number } {
  const parts = ymd.split('-').map(Number);
  const Y = parts[0];
  const M = parts[1];
  const D = parts[2];
  if (!Y || !M || !D) throw new Error('invalid_date_format');
  return { Y, M, D };
}

/**
 * Convert local wall time in `timeZone` to UTC Date (iterative offset fix).
 * ymd = YYYY-MM-DD
 */
export function zonedLocalToUtc(
  ymd: string,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  timeZone: string,
): Date {
  const { Y, M, D } = parseYmd(ymd);
  let utcMs = Date.UTC(Y, M - 1, D, hour, minute, second, ms);
  for (let i = 0; i < 4; i++) {
    const parts = zonedParts(new Date(utcMs), timeZone);
    const asLocal = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      0,
    );
    const want = Date.UTC(Y, M - 1, D, hour, minute, second, 0);
    utcMs += want - asLocal;
  }
  return new Date(utcMs);
}

function addCalendarDays(ymd: string, delta: number): string {
  const { Y, M, D } = parseYmd(ymd);
  const base = new Date(Date.UTC(Y, M - 1, D + delta));
  return formatYmd(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate());
}

function daysBetweenYmd(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00.000Z`).getTime();
  const b = new Date(`${to}T00:00:00.000Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

const LABELS: Record<AssistantPeriod, string> = {
  today: 'Hôm nay',
  yesterday: 'Hôm qua',
  last_7_days: '7 ngày gần nhất',
  this_week: 'Tuần này',
  this_month: 'Tháng này',
  custom: 'Tuỳ chọn',
};

/** ISO weekday Mon=1 … Sun=7 for calendar YMD (UTC noon trick). */
function weekdayMon1(ymd: string): number {
  const { year, month, day } = (() => {
    const [Y, M, D] = ymd.split('-').map(Number);
    return { year: Y!, month: M!, day: D! };
  })();
  const utc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const d = utc.getUTCDay(); // Sun=0
  return d === 0 ? 7 : d;
}

/**
 * Resolve period presets against `timeZone` (from JWT context, not client orgId).
 */
export function resolveAssistantRange(
  input: { period?: string; dateFrom?: string; dateTo?: string },
  timeZone: string,
  maxSpanDays = ASSISTANT_TOOL_LIMITS.maxDateSpanDays,
  now = new Date(),
): ResolvedAssistantRange {
  const period = (input.period ?? 'this_month') as AssistantPeriod;
  const todayYmd = ymdInTimeZone(now, timeZone);

  let dateFrom: string;
  let dateTo: string;

  switch (period) {
    case 'today':
      dateFrom = todayYmd;
      dateTo = todayYmd;
      break;
    case 'yesterday':
      dateFrom = addCalendarDays(todayYmd, -1);
      dateTo = dateFrom;
      break;
    case 'last_7_days':
      dateTo = todayYmd;
      dateFrom = addCalendarDays(todayYmd, -6);
      break;
    case 'this_week': {
      // Monday…today (or Mon–Sun if querying future — typically ends today)
      dateTo = todayYmd;
      const wd = weekdayMon1(todayYmd);
      dateFrom = addCalendarDays(todayYmd, -(wd - 1));
      break;
    }
    case 'this_month': {
      const p = zonedParts(now, timeZone);
      dateFrom = formatYmd(p.year, p.month, 1);
      dateTo = todayYmd;
      break;
    }
    case 'custom': {
      if (!input.dateFrom || !input.dateTo) {
        throw new Error('custom_period_requires_dates');
      }
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(input.dateFrom) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(input.dateTo)
      ) {
        throw new Error('invalid_date_format');
      }
      if (input.dateFrom > input.dateTo) {
        throw new Error('dateFrom_gt_dateTo');
      }
      dateFrom = input.dateFrom;
      dateTo = input.dateTo;
      break;
    }
    default:
      throw new Error(`unknown_period:${period}`);
  }

  const span = daysBetweenYmd(dateFrom, dateTo);
  if (span > maxSpanDays) {
    throw new Error(`date_span_max_${maxSpanDays}`);
  }

  const from = zonedLocalToUtc(dateFrom, 0, 0, 0, 0, timeZone);
  const to = zonedLocalToUtc(dateTo, 23, 59, 59, 999, timeZone);

  return {
    period,
    dateFrom,
    dateTo,
    from,
    to,
    label: LABELS[period] ?? period,
    timezone: timeZone,
  };
}

/** ISO strings safe for domain services expecting date bounds. */
export function rangeToServiceIso(range: ResolvedAssistantRange): {
  from: string;
  to: string;
  dateFrom: string;
  dateTo: string;
} {
  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
  };
}

/**
 * Kỳ trước cùng chiều dài lịch (ngay trước dateFrom, lùi span ngày).
 * Chỉ dùng để so sánh khi tool current + previous đều ok.
 */
export function previousAssistantRange(current: ResolvedAssistantRange): ResolvedAssistantRange {
  const span = daysBetweenYmd(current.dateFrom, current.dateTo);
  const prevTo = addCalendarDays(current.dateFrom, -1);
  const prevFrom = addCalendarDays(prevTo, -span);
  const from = zonedLocalToUtc(prevFrom, 0, 0, 0, 0, current.timezone);
  const to = zonedLocalToUtc(prevTo, 23, 59, 59, 999, current.timezone);
  return {
    period: 'custom',
    dateFrom: prevFrom,
    dateTo: prevTo,
    from,
    to,
    label: `Kỳ trước (${prevFrom} → ${prevTo})`,
    timezone: current.timezone,
  };
}

export { addCalendarDays, daysBetweenYmd };
