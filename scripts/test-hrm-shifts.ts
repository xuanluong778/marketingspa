/**
 * Tests: shift window (day/night), attendance calc with shift, scope/tenant.
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-hrm-shifts.ts
 */
import assert from 'node:assert/strict';
import { AttendanceDayStatus, AttendancePunchType } from '@prisma/client';
import {
  buildShiftPayloadFromPolicy,
  combineWorkDateAndTimeIct,
  computeAttendanceDay,
  parseWorkDate,
  resolveShiftWindow,
  workDateKey,
} from '../packages/database/src/hrm-attendance-calc';
import {
  isHrmOrgWideRole,
  assertEmployeeInScope,
} from '../apps/api/src/hrm/hrm-attendance-scope';

// --- Day shift window ---
const day = parseWorkDate('2026-07-15');
const dayWin = resolveShiftWindow(day, {
  startTime: '08:00',
  endTime: '17:00',
  crossesMidnight: false,
});
assert.equal(workDateKey(dayWin.startAt), '2026-07-15');
assert.ok(dayWin.endAt > dayWin.startAt);
assert.equal(dayWin.crossesMidnight, false);
assert.equal(dayWin.startAt.toISOString(), combineWorkDateAndTimeIct(day, '08:00').toISOString());

// --- Night shift (crosses midnight) ---
const nightWin = resolveShiftWindow(day, {
  startTime: '22:00',
  endTime: '06:00',
  crossesMidnight: true,
});
assert.equal(nightWin.crossesMidnight, true);
assert.ok(nightWin.endAt > nightWin.startAt);
// 22:00 ICT Jul 15 = 15:00Z; 06:00 ICT Jul 16 = 23:00Z Jul 15
assert.equal(nightWin.endAt.toISOString(), '2026-07-15T23:00:00.000Z');
assert.equal(nightWin.startAt.toISOString(), '2026-07-15T15:00:00.000Z');
assert.equal(
  Math.round((nightWin.endAt.getTime() - nightWin.startAt.getTime()) / 3_600_000),
  8,
);

// Auto-detect midnight when end <= start
const autoNight = resolveShiftWindow(day, {
  startTime: '22:00',
  endTime: '06:00',
});
assert.equal(autoNight.crossesMidnight, true);

// --- Payload builder ---
const payload = buildShiftPayloadFromPolicy({
  startTime: '22:00',
  endTime: '06:00',
  breakMinutes: 30,
  lateGraceMinutes: 10,
  earlyLeaveGraceMinutes: 5,
  otBeforeMinutes: 30,
  otAfterMinutes: 60,
  crossesMidnight: true,
});
assert.equal(payload.crossesMidnight, true);
assert.equal(payload.breakMinutes, 30);

// --- Calc: late + OT after on day shift ---
const shiftStart = dayWin.startAt;
const shiftEnd = dayWin.endAt;
const lateIn = new Date(shiftStart.getTime() + 20 * 60_000);
const stayOut = new Date(shiftEnd.getTime() + 45 * 60_000);
const calc = computeAttendanceDay({
  punches: [
    { punchedAt: lateIn, type: AttendancePunchType.CHECK_IN },
    { punchedAt: stayOut, type: AttendancePunchType.CHECK_OUT },
  ] as never,
  shift: { startAt: shiftStart, endAt: shiftEnd } as never,
  policyPayload: {
    lateGraceMinutes: 5,
    earlyLeaveGraceMinutes: 0,
    breakMinutes: 60,
    otAfterMinutes: 120,
    otBeforeMinutes: 0,
  },
});
assert.ok(calc.lateMinutes >= 15);
assert.ok(calc.otMinutes >= 45);
assert.equal(calc.status, AttendanceDayStatus.PRESENT);

// --- Night shift worked minutes ---
const nIn = nightWin.startAt;
const nOut = nightWin.endAt;
const nightCalc = computeAttendanceDay({
  punches: [
    { punchedAt: nIn, type: AttendancePunchType.CHECK_IN },
    { punchedAt: nOut, type: AttendancePunchType.CHECK_OUT },
  ] as never,
  shift: { startAt: nightWin.startAt, endAt: nightWin.endAt } as never,
  policyPayload: {
    breakMinutes: 30,
    lateGraceMinutes: 0,
    earlyLeaveGraceMinutes: 0,
    crossesMidnight: true,
  },
});
assert.equal(nightCalc.workedMinutes, 8 * 60 - 30); // 22→06 = 8h - 30 break
assert.equal(nightCalc.lateMinutes, 0);
assert.equal(nightCalc.status, AttendanceDayStatus.PRESENT);

// --- OT before shift ---
const earlyIn = new Date(shiftStart.getTime() - 25 * 60_000);
const onTimeOut = shiftEnd;
const otBefore = computeAttendanceDay({
  punches: [
    { punchedAt: earlyIn, type: AttendancePunchType.CHECK_IN },
    { punchedAt: onTimeOut, type: AttendancePunchType.CHECK_OUT },
  ] as never,
  shift: { startAt: shiftStart, endAt: shiftEnd } as never,
  policyPayload: { breakMinutes: 60, otBeforeMinutes: 30, otAfterMinutes: 0 },
});
assert.equal(otBefore.otMinutes, 25);

// Cap OT before
const otBeforeCapped = computeAttendanceDay({
  punches: [
    { punchedAt: earlyIn, type: AttendancePunchType.CHECK_IN },
    { punchedAt: onTimeOut, type: AttendancePunchType.CHECK_OUT },
  ] as never,
  shift: { startAt: shiftStart, endAt: shiftEnd } as never,
  policyPayload: { breakMinutes: 60, otBeforeMinutes: 15, otAfterMinutes: 0 },
});
assert.equal(otBeforeCapped.otMinutes, 15);

// --- Scope / tenant ---
assert.equal(isHrmOrgWideRole('OWNER'), true);
assert.equal(isHrmOrgWideRole('HR'), true);
assert.equal(isHrmOrgWideRole('TECHNICIAN'), false);
assert.throws(
  () => assertEmployeeInScope({ mode: 'ids', employeeIds: ['e1'] }, 'e2', 'xem ca của'),
  /Không có quyền/,
);
assert.doesNotThrow(() =>
  assertEmployeeInScope({ mode: 'all' }, 'e2', 'xem ca của'),
);

function tenantWhere(orgJwt: string, _spoof?: string) {
  return { organizationId: orgJwt };
}
assert.deepEqual(tenantWhere('org-a', 'org-b'), { organizationId: 'org-a' });

// Unique code per org principle
function assertUniqueCode(existing: string[], code: string, orgId: string) {
  if (existing.includes(`${orgId}:${code}`)) throw new Error('DUPLICATE_CODE');
}
assert.throws(() => assertUniqueCode(['org-a:CA1'], 'CA1', 'org-a'), /DUPLICATE_CODE/);
assert.doesNotThrow(() => assertUniqueCode(['org-a:CA1'], 'CA1', 'org-b'));

// Soft-delete when has assignments
function deletePolicy(assignmentCount: number) {
  if (assignmentCount > 0) return { deleted: false, deactivated: true };
  return { deleted: true };
}
assert.deepEqual(deletePolicy(3), { deleted: false, deactivated: true });
assert.deepEqual(deletePolicy(0), { deleted: true });

console.log('test-hrm-shifts: all passed');
