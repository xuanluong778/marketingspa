/** Vietnam timezone helpers + workload metrics (pure, testable). */

export const WORK_TZ = 'Asia/Ho_Chi_Minh';

const PRIORITY_WEIGHT: Record<string, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  URGENT: 4,
};

/** YYYY-MM-DD in Asia/Ho_Chi_Minh */
export function vnDateString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: WORK_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Start of calendar day VN as UTC Date for Prisma range queries on @db.Date fields */
export function vnDayAsUtcDate(dateStr: string): Date {
  // Interpret dateStr as midnight VN by constructing ISO with offset +07:00
  return new Date(`${dateStr}T00:00:00+07:00`);
}

export function addCalendarDays(dateStr: string, days: number): string {
  const base = vnDayAsUtcDate(dateStr);
  base.setUTCDate(base.getUTCDate() + days);
  return vnDateString(base);
}

export function priorityWeight(priority: string): number {
  return PRIORITY_WEIGHT[(priority || 'MEDIUM').toUpperCase()] ?? 2;
}

export type WorkloadTaskSnapshot = {
  columnKey: string;
  priority: string;
  deadline?: string | null; // YYYY-MM-DD
  completedAt?: string | null; // ISO
  estimatedMinutes?: number | null;
  actualMinutes?: number | null;
};

/**
 * Composite score 0–100:
 * - On-time completion rate (deadline-aware)
 * - Priority-weighted throughput (not raw count alone)
 * - Time accuracy (estimated vs actual)
 * - Overdue / risk penalty
 */
export function computeWorkloadScore(
  tasks: WorkloadTaskSnapshot[],
  todayVn: string,
): {
  score: number;
  onTimeRate: number;
  doneCount: number;
  inProgressCount: number;
  overdueCount: number;
  priorityWeightedDone: number;
  timeAccuracy: number | null;
  note: string;
} {
  const done = tasks.filter((t) => t.columnKey === 'DONE');
  const inProgress = tasks.filter(
    (t) =>
      t.columnKey === 'IN_PROGRESS' ||
      t.columnKey === 'PENDING_REVIEW' ||
      t.columnKey === 'NEEDS_FIX',
  );
  const open = tasks.filter((t) => t.columnKey !== 'DONE' && t.columnKey !== 'PAUSED');
  const overdue = open.filter((t) => t.deadline && t.deadline < todayVn);

  let onTimeDone = 0;
  let doneWithDeadline = 0;
  for (const t of done) {
    if (!t.deadline) continue;
    doneWithDeadline += 1;
    const completedDay = t.completedAt ? vnDateString(new Date(t.completedAt)) : todayVn;
    if (completedDay <= t.deadline) onTimeDone += 1;
  }
  const onTimeRate = doneWithDeadline > 0 ? onTimeDone / doneWithDeadline : done.length > 0 ? 1 : 0;

  const priorityWeightedDone = done.reduce((s, t) => s + priorityWeight(t.priority), 0);
  const maxPw = Math.max(priorityWeightedDone, done.length * 4, 1);
  const priorityScore = priorityWeightedDone / maxPw;

  let timeAccSamples = 0;
  let timeAccSum = 0;
  for (const t of tasks) {
    if (
      t.estimatedMinutes &&
      t.estimatedMinutes > 0 &&
      t.actualMinutes != null &&
      t.actualMinutes > 0
    ) {
      const ratio =
        Math.min(t.estimatedMinutes, t.actualMinutes) /
        Math.max(t.estimatedMinutes, t.actualMinutes);
      timeAccSum += ratio;
      timeAccSamples += 1;
    }
  }
  const timeAccuracy = timeAccSamples > 0 ? timeAccSum / timeAccSamples : null;

  const overduePenalty = open.length > 0 ? overdue.length / open.length : 0;

  // Weighted blend — never pure completion count
  const scoreRaw =
    onTimeRate * 0.35 +
    priorityScore * 0.25 +
    (timeAccuracy ?? 0.7) * 0.25 +
    (1 - overduePenalty) * 0.15;
  const score = Math.round(Math.min(100, Math.max(0, scoreRaw * 100)));

  return {
    score,
    onTimeRate: Math.round(onTimeRate * 1000) / 10,
    doneCount: done.length,
    inProgressCount: inProgress.length,
    overdueCount: overdue.length,
    priorityWeightedDone,
    timeAccuracy: timeAccuracy != null ? Math.round(timeAccuracy * 1000) / 10 : null,
    note: 'Điểm không chỉ dựa số việc hoàn thành: kết hợp đúng hạn, ưu tiên, độ chính xác thời gian và quá hạn.',
  };
}

export function classifyRisk(
  deadline: string | null | undefined,
  columnKey: string,
  todayVn: string,
  progress: number,
): 'NONE' | 'AT_RISK' | 'OVERDUE' {
  if (!deadline || columnKey === 'DONE') return 'NONE';
  if (deadline < todayVn) return 'OVERDUE';
  const days = Math.round(
    (vnDayAsUtcDate(deadline).getTime() - vnDayAsUtcDate(todayVn).getTime()) / 86400000,
  );
  if (days <= 2 && progress < 80) return 'AT_RISK';
  if (days <= 1) return 'AT_RISK';
  return 'NONE';
}

export function escapeCsvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const header = columns.map(escapeCsvCell).join(',');
  const body = rows.map((r) => columns.map((c) => escapeCsvCell(r[c])).join(',')).join('\n');
  // UTF-8 BOM for Excel VN
  return `\uFEFF${header}\n${body}`;
}

/** Excel 2003 SpreadsheetML — opens in Excel without external deps */
export function toSpreadsheetMl(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const xmlEsc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const cells = (vals: string[]) =>
    vals.map((v) => `<Cell><Data ss:Type="String">${xmlEsc(v)}</Data></Cell>`).join('');
  const header = `<Row>${cells(columns)}</Row>`;
  const dataRows = rows
    .map((r) => `<Row>${cells(columns.map((c) => (r[c] == null ? '' : String(r[c]))))}</Row>`)
    .join('');
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="WorkReport"><Table>${header}${dataRows}</Table></Worksheet>
</Workbook>`;
}

export function nextOccurrenceDates(
  rule: 'DAILY' | 'WEEKLY' | 'MONTHLY',
  interval: number,
  fromDateStr: string,
  count: number,
  until?: string | null,
): string[] {
  const out: string[] = [];
  let cur = fromDateStr;
  let guard = 0;
  while (out.length < count && guard < 500) {
    guard += 1;
    if (rule === 'DAILY') cur = addCalendarDays(cur, Math.max(1, interval));
    else if (rule === 'WEEKLY') cur = addCalendarDays(cur, 7 * Math.max(1, interval));
    else {
      // MONTHLY: approx +30 days * interval then snap via Date
      const d = vnDayAsUtcDate(cur);
      d.setUTCMonth(d.getUTCMonth() + Math.max(1, interval));
      cur = vnDateString(d);
    }
    if (until && cur > until) break;
    out.push(cur);
  }
  return out;
}

export function occurrenceKey(seriesId: string, dateStr: string): string {
  return `${seriesId}:${dateStr}`;
}
