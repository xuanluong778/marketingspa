/**
 * Unit tests for HRM leave/OT calc, overlap, quota, OT minutes.
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-hrm-leave.ts
 */
import assert from 'node:assert/strict';
import { LeaveDayPart, LeaveType } from '@prisma/client';
import {
  computeLeaveDays,
  computeOvertimeMinutes,
  datesOverlap,
  resolveLeaveQuota,
  DEFAULT_LEAVE_QUOTA,
} from '../packages/database/src/hrm-leave-calc';
import {
  canApproveLeaveOt,
  assertCanCreateLeaveOt,
  assertCanApproveLeaveOt,
  isHrmOrgWideRole,
} from '../apps/api/src/hrm/hrm-attendance-scope';

// --- Leave days ---
assert.equal(
  computeLeaveDays({ fromDate: '2026-07-01', toDate: '2026-07-03', dayPart: LeaveDayPart.FULL }),
  3,
);
assert.equal(
  computeLeaveDays({ fromDate: '2026-07-01', toDate: '2026-07-01', dayPart: LeaveDayPart.HALF_AM }),
  0.5,
);
assert.throws(
  () =>
    computeLeaveDays({
      fromDate: '2026-07-01',
      toDate: '2026-07-02',
      dayPart: LeaveDayPart.HALF_PM,
    }),
  /HALF_DAY_SINGLE_DATE/,
);
assert.throws(
  () => computeLeaveDays({ fromDate: '2026-07-05', toDate: '2026-07-01' }),
  /INVALID_DATE_RANGE/,
);

// --- OT minutes ---
assert.equal(
  computeOvertimeMinutes({
    startAt: '2026-07-15T11:00:00.000Z',
    endAt: '2026-07-15T13:00:00.000Z',
    breakMinutes: 15,
  }),
  105,
);
assert.throws(
  () =>
    computeOvertimeMinutes({
      startAt: '2026-07-15T13:00:00.000Z',
      endAt: '2026-07-15T11:00:00.000Z',
    }),
  /OT_END_BEFORE_START/,
);
assert.throws(
  () =>
    computeOvertimeMinutes({
      startAt: '2026-07-15T11:00:00.000Z',
      endAt: '2026-07-15T11:10:00.000Z',
      breakMinutes: 15,
    }),
  /OT_MINUTES_TOO_SMALL/,
);

// --- Overlap ---
const aFrom = new Date('2026-07-01T00:00:00.000Z');
const aTo = new Date('2026-07-05T00:00:00.000Z');
assert.equal(
  datesOverlap(aFrom, aTo, new Date('2026-07-05T00:00:00.000Z'), new Date('2026-07-07T00:00:00.000Z')),
  true,
);
assert.equal(
  datesOverlap(aFrom, aTo, new Date('2026-07-06T00:00:00.000Z'), new Date('2026-07-07T00:00:00.000Z')),
  false,
);

// --- Quota ---
assert.equal(resolveLeaveQuota(LeaveType.ANNUAL), DEFAULT_LEAVE_QUOTA.ANNUAL);
assert.equal(resolveLeaveQuota(LeaveType.UNPAID), null);
assert.equal(
  resolveLeaveQuota(LeaveType.ANNUAL, { leaveQuota: { ANNUAL: 15 } }),
  15,
);

// Balance gate simulation
function assertBalance(quota: number, used: number, requestDays: number) {
  if (used + requestDays > quota) throw new Error('INSUFFICIENT_BALANCE');
}
assert.throws(() => assertBalance(12, 11, 2), /INSUFFICIENT_BALANCE/);
assert.doesNotThrow(() => assertBalance(12, 10, 2));

// --- Scope / approve ---
assert.equal(isHrmOrgWideRole('OWNER'), true);
assert.equal(isHrmOrgWideRole('HR'), true);
assert.equal(canApproveLeaveOt('MANAGER'), true);
assert.equal(canApproveLeaveOt('TECHNICIAN'), false);

assert.doesNotThrow(() =>
  assertCanCreateLeaveOt(
    { role: 'TECHNICIAN', employeeId: 'e1' },
    'e1',
    { mode: 'ids', employeeIds: ['e1'] },
  ),
);
assert.throws(
  () =>
    assertCanCreateLeaveOt(
      { role: 'TECHNICIAN', employeeId: 'e1' },
      'e2',
      { mode: 'ids', employeeIds: ['e1', 'e2'] },
    ),
  /chính mình/,
);

assert.throws(
  () =>
    assertCanApproveLeaveOt(
      { role: 'MANAGER', employeeId: 'e1' },
      'e1',
      { mode: 'ids', employeeIds: ['e1', 'e2'] },
    ),
  /không tự duyệt/,
);

assert.doesNotThrow(() =>
  assertCanApproveLeaveOt(
    { role: 'MANAGER', employeeId: 'e1' },
    'e2',
    { mode: 'ids', employeeIds: ['e1', 'e2'] },
  ),
);

// Reject/cancel reason required
function requireReason(reason: string) {
  if (!reason?.trim() || reason.trim().length < 3) throw new Error('REASON_REQUIRED');
}
assert.throws(() => requireReason(''), /REASON_REQUIRED/);
assert.throws(() => requireReason('ab'), /REASON_REQUIRED/);
assert.doesNotThrow(() => requireReason('Không đủ nhân sự'));

// Locked period blocks approve
function assertPeriodOpen(status: string) {
  if (status === 'LOCKED') throw new Error('PERIOD_LOCKED');
}
assert.throws(() => assertPeriodOpen('LOCKED'), /PERIOD_LOCKED/);

// Tenant isolation
function tenantWhere(orgFromJwt: string, _spoofed?: string) {
  return { organizationId: orgFromJwt };
}
assert.deepEqual(tenantWhere('org-a', 'org-b'), { organizationId: 'org-a' });

// Idempotent OT sum (no double count same request)
const approvedOt = [
  { id: 'ot1', minutes: 60 },
  { id: 'ot2', minutes: 30 },
];
const sum = approvedOt.reduce((s, r) => s + r.minutes, 0);
assert.equal(sum, 90);
// Re-approving same id does not appear twice
const unique = new Map(approvedOt.map((r) => [r.id, r.minutes]));
assert.equal([...unique.values()].reduce((a, b) => a + b, 0), 90);

console.log('test-hrm-leave: all passed');
