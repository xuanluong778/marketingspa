/**
 * Unit tests: workload score, recurrence no-dup keys, Vietnam timezone, CSV/export.
 * Run: node -r ts-node/register/transpile-only scripts/test-work-management-insights.ts
 *  (or via tsx if available)
 */
import assert from 'node:assert/strict';
import {
  classifyRisk,
  computeWorkloadScore,
  nextOccurrenceDates,
  occurrenceKey,
  toCsv,
  toSpreadsheetMl,
  vnDateString,
  WORK_TZ,
} from '../apps/api/src/work-management/work-metrics';

function section(name: string) {
  console.log(`\n=== ${name} ===`);
}

// ── Timezone VN ────────────────────────────────────────────────────────────
section('Timezone Asia/Ho_Chi_Minh');
assert.equal(WORK_TZ, 'Asia/Ho_Chi_Minh');
// Fixed UTC instant → VN date (UTC+7)
// 2026-08-04T20:00:00Z = 2026-08-05 03:00 VN
const sample = vnDateString(new Date('2026-08-04T20:00:00.000Z'));
assert.equal(sample, '2026-08-05', `expected 2026-08-05 got ${sample}`);
// morning VN still same calendar day as UTC morning
const morning = vnDateString(new Date('2026-08-05T01:00:00.000Z'));
assert.equal(morning, '2026-08-05');
console.log('PASS timezone mapping');

// ── Workload score not completion-count only ───────────────────────────────
section('Workload score composite');
const today = '2026-08-05';
const bulkDoneLate = Array.from({ length: 10 }, () => ({
  columnKey: 'DONE',
  priority: 'LOW',
  deadline: '2026-08-01',
  completedAt: '2026-08-04T10:00:00.000Z',
  estimatedMinutes: 60,
  actualMinutes: 240,
}));
const qualityDone = [
  {
    columnKey: 'DONE',
    priority: 'URGENT',
    deadline: '2026-08-05',
    completedAt: '2026-08-04T10:00:00.000Z',
    estimatedMinutes: 60,
    actualMinutes: 55,
  },
  {
    columnKey: 'DONE',
    priority: 'HIGH',
    deadline: '2026-08-05',
    completedAt: '2026-08-05T02:00:00.000Z',
    estimatedMinutes: 30,
    actualMinutes: 28,
  },
];
const scoreBulk = computeWorkloadScore(bulkDoneLate, today);
const scoreQuality = computeWorkloadScore(qualityDone, today);
assert.ok(
  scoreQuality.score > scoreBulk.score,
  `quality (${scoreQuality.score}) should beat bulk late low-prio (${scoreBulk.score})`,
);
assert.ok(scoreBulk.onTimeRate < 50, 'late bulk onTimeRate should be low');
assert.ok(scoreQuality.onTimeRate >= 90, 'on-time quality onTimeRate high');
assert.ok(scoreQuality.note.includes('không chỉ'));
console.log('PASS score bulk', scoreBulk.score, 'vs quality', scoreQuality.score);

// overdue penalty
const overdueSnap = computeWorkloadScore(
  [
    {
      columnKey: 'IN_PROGRESS',
      priority: 'MEDIUM',
      deadline: '2026-08-01',
    },
  ],
  today,
);
assert.equal(overdueSnap.overdueCount, 1);
assert.ok(overdueSnap.score < 80);
console.log('PASS overdue penalty', overdueSnap.score);

// ── Risk ───────────────────────────────────────────────────────────────────
section('Risk classify');
assert.equal(classifyRisk('2026-08-01', 'IN_PROGRESS', today, 50), 'OVERDUE');
assert.equal(classifyRisk('2026-08-06', 'IN_PROGRESS', today, 10), 'AT_RISK');
assert.equal(classifyRisk('2026-08-20', 'IN_PROGRESS', today, 10), 'NONE');
assert.equal(classifyRisk('2026-08-01', 'DONE', today, 100), 'NONE');
console.log('PASS risk');

// ── Recurrence uniqueness ──────────────────────────────────────────────────
section('Recurrence keys / schedule');
const series = 'series-abc';
const d1 = occurrenceKey(series, '2026-08-06');
const d2 = occurrenceKey(series, '2026-08-06');
assert.equal(d1, d2, 'same occurrence key must be identical (unique constraint safe)');
assert.equal(d1, 'series-abc:2026-08-06');
const weekly = nextOccurrenceDates('WEEKLY', 1, '2026-08-05', 3);
assert.deepEqual(weekly, ['2026-08-12', '2026-08-19', '2026-08-26']);
const limited = nextOccurrenceDates('DAILY', 1, '2026-08-05', 10, '2026-08-07');
assert.deepEqual(limited, ['2026-08-06', '2026-08-07']);
const set = new Set(weekly.map((d) => occurrenceKey(series, d)));
assert.equal(set.size, weekly.length, 'no duplicate keys in series');
console.log('PASS recurrence no-dup keys');

// ── Export CSV / SpreadsheetML ─────────────────────────────────────────────
section('Export CSV / Excel ML');
const rows = [
  { name: 'Dự án A', inProgress: 2, overdue: 1, done: 3 },
  { name: 'Dự án "B", test', inProgress: 0, overdue: 0, done: 5 },
];
const cols = ['name', 'inProgress', 'overdue', 'done'];
const csv = toCsv(rows, cols);
assert.ok(csv.startsWith('\uFEFF'), 'UTF-8 BOM for Excel VN');
assert.ok(csv.includes('Dự án A'));
assert.ok(csv.includes('"Dự án ""B"", test"'), 'escaped quotes/commas');
const xls = toSpreadsheetMl(rows, cols);
assert.ok(xls.includes('Workbook'));
assert.ok(xls.includes('Worksheet'));
assert.ok(xls.includes('Dự án A'));
console.log('PASS export formats');

console.log('\nALL_PASS work-management-insights');
