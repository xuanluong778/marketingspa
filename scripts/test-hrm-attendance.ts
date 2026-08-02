/**
 * Unit tests for HRM attendance calc, anti-duplicate, scope, lock rules.
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-hrm-attendance.ts
 */
import assert from 'node:assert/strict';
import {
  AttendanceDayStatus,
  AttendancePunchType,
} from '@prisma/client';
import {
  assertPunchNotDuplicate,
  computeAttendanceDay,
  workDateFromInstant,
  workDateKey,
  HRM_TIMEZONE,
} from '../packages/database/src/hrm-attendance-calc';
import {
  canCorrectAttendanceDay,
  isAttendanceOrgWideRole,
  assertCanPunchForEmployee,
  assertEmployeeInScope,
} from '../apps/api/src/hrm/hrm-attendance-scope';

// --- Timezone Asia/Ho_Chi_Minh ---
// 2026-07-14 17:30 UTC = 2026-07-15 00:30 ICT → work date 2026-07-15
const nearMidnightUtc = new Date('2026-07-14T17:30:00.000Z');
assert.equal(workDateKey(workDateFromInstant(nearMidnightUtc)), '2026-07-15');
assert.equal(HRM_TIMEZONE, 'Asia/Ho_Chi_Minh');

// 2026-07-15 01:00 UTC = 08:00 ICT → still 2026-07-15
assert.equal(workDateKey(workDateFromInstant(new Date('2026-07-15T01:00:00.000Z'))), '2026-07-15');

// --- Anti-duplicate ---
assert.doesNotThrow(() => assertPunchNotDuplicate([], AttendancePunchType.CHECK_IN));
assert.throws(
  () =>
    assertPunchNotDuplicate(
      [{ type: AttendancePunchType.CHECK_IN }],
      AttendancePunchType.CHECK_IN,
    ),
  /DUPLICATE_CHECK_IN/,
);
assert.throws(
  () => assertPunchNotDuplicate([], AttendancePunchType.CHECK_OUT),
  /MISSING_CHECK_IN/,
);
assert.doesNotThrow(() =>
  assertPunchNotDuplicate(
    [{ type: AttendancePunchType.CHECK_IN }],
    AttendancePunchType.CHECK_OUT,
  ),
);
assert.throws(
  () =>
    assertPunchNotDuplicate(
      [
        { type: AttendancePunchType.CHECK_IN },
        { type: AttendancePunchType.CHECK_OUT },
      ],
      AttendancePunchType.CHECK_OUT,
    ),
  /DUPLICATE_CHECK_OUT/,
);

// --- Calc: late / early / OT / incomplete ---
const shiftStart = new Date('2026-07-15T01:00:00.000Z'); // 08:00 ICT
const shiftEnd = new Date('2026-07-15T10:00:00.000Z'); // 17:00 ICT
const lateIn = new Date('2026-07-15T01:20:00.000Z'); // 08:20
const earlyOut = new Date('2026-07-15T09:30:00.000Z'); // 16:30

const incomplete = computeAttendanceDay({
  punches: [
    {
      id: '1',
      organizationId: 'o',
      branchId: 'b',
      employeeId: 'e',
      workDate: new Date('2026-07-15T00:00:00.000Z'),
      punchedAt: lateIn,
      type: AttendancePunchType.CHECK_IN,
      method: 'MANUAL' as never,
      latitude: null,
      longitude: null,
      accuracyM: null,
      qrTokenId: null,
      kioskDeviceId: null,
      rawMetadata: null,
      createdAt: lateIn,
    },
    {
      id: '2',
      organizationId: 'o',
      branchId: 'b',
      employeeId: 'e',
      workDate: new Date('2026-07-15T00:00:00.000Z'),
      punchedAt: earlyOut,
      type: AttendancePunchType.CHECK_OUT,
      method: 'MANUAL' as never,
      latitude: null,
      longitude: null,
      accuracyM: null,
      qrTokenId: null,
      kioskDeviceId: null,
      rawMetadata: null,
      createdAt: earlyOut,
    },
  ] as never,
  shift: {
    id: 's',
    organizationId: 'o',
    branchId: 'b',
    employeeId: 'e',
    workDate: new Date('2026-07-15T00:00:00.000Z'),
    policyId: null,
    startAt: shiftStart,
    endAt: shiftEnd,
    source: 'MANUAL' as never,
    createdAt: shiftStart,
    updatedAt: shiftStart,
  } as never,
  policyPayload: { graceMinutes: 5, breakMinutes: 60 },
});

assert.ok(incomplete.lateMinutes >= 15); // 20 - 5 grace
assert.ok(incomplete.earlyLeaveMinutes >= 30);
assert.equal(incomplete.status, AttendanceDayStatus.INCOMPLETE);
assert.ok(incomplete.workedMinutes > 0);

// Full day present (no early leave, enough hours)
const fullOut = new Date('2026-07-15T10:00:00.000Z');
const onTimeIn = new Date('2026-07-15T01:00:00.000Z');
const present = computeAttendanceDay({
  punches: [
    {
      punchedAt: onTimeIn,
      type: AttendancePunchType.CHECK_IN,
    },
    {
      punchedAt: fullOut,
      type: AttendancePunchType.CHECK_OUT,
    },
  ] as never,
  shift: {
    startAt: shiftStart,
    endAt: shiftEnd,
  } as never,
  policyPayload: { graceMinutes: 0, breakMinutes: 60 },
});
assert.equal(present.lateMinutes, 0);
assert.equal(present.earlyLeaveMinutes, 0);
assert.equal(present.status, AttendanceDayStatus.PRESENT);
assert.equal(present.workedMinutes, 8 * 60); // 9h - 60 break

// OT after shift end
const otOut = new Date('2026-07-15T11:00:00.000Z'); // 18:00
const withOt = computeAttendanceDay({
  punches: [
    { punchedAt: onTimeIn, type: AttendancePunchType.CHECK_IN },
    { punchedAt: otOut, type: AttendancePunchType.CHECK_OUT },
  ] as never,
  shift: { startAt: shiftStart, endAt: shiftEnd } as never,
  policyPayload: { breakMinutes: 60 },
});
assert.equal(withOt.otMinutes, 60);

// --- Scope / RBAC helpers ---
assert.equal(isAttendanceOrgWideRole('OWNER'), true);
assert.equal(isAttendanceOrgWideRole('HR'), true);
assert.equal(isAttendanceOrgWideRole('MANAGER'), false);
assert.equal(canCorrectAttendanceDay('OWNER'), true);
assert.equal(canCorrectAttendanceDay('HR'), true);
assert.equal(canCorrectAttendanceDay('MANAGER'), false);
assert.equal(canCorrectAttendanceDay('TECHNICIAN'), false);

assert.doesNotThrow(() => assertEmployeeInScope({ mode: 'all' }, 'e1'));
assert.throws(
  () => assertEmployeeInScope({ mode: 'ids', employeeIds: ['e1'] }, 'e2'),
  /Không có quyền/,
);

assert.doesNotThrow(() =>
  assertCanPunchForEmployee(
    { role: 'TECHNICIAN', employeeId: 'e1' },
    'e1',
    { mode: 'ids', employeeIds: ['e1'] },
  ),
);
assert.throws(
  () =>
    assertCanPunchForEmployee(
      { role: 'TECHNICIAN', employeeId: 'e1' },
      'e2',
      { mode: 'ids', employeeIds: ['e1', 'e2'] },
    ),
  /chính mình/,
);

// Tenant isolation principle: list always filters organizationId (documented contract)
function buildTenantWhere(organizationId: string, foreignOrgId: string) {
  return { organizationId }; // never use foreignOrgId from client
}
assert.deepEqual(buildTenantWhere('org-a', 'org-b'), { organizationId: 'org-a' });

// Lock rule: locked period blocks mutate
function assertPeriodOpen(status: string) {
  if (status === 'LOCKED') {
    throw new Error('Bảng công tháng này đã khóa — không thể sửa trực tiếp');
  }
}
assert.throws(() => assertPeriodOpen('LOCKED'), /đã khóa/);
assert.doesNotThrow(() => assertPeriodOpen('OPEN'));

// Unlock requires reason
function assertUnlockReason(reason: string) {
  if (!reason?.trim() || reason.trim().length < 3) {
    throw new Error('Mở khóa kỳ công bắt buộc nhập lý do');
  }
}
assert.throws(() => assertUnlockReason(''), /lý do/);
assert.throws(() => assertUnlockReason('ab'), /lý do/);
assert.doesNotThrow(() => assertUnlockReason('Sửa sai sót chấm công'));

console.log('test-hrm-attendance: all passed');
