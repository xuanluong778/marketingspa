import {
  AttendanceDayStatus,
  AttendancePunch,
  AttendancePunchType,
  LeaveRequestStatus,
  ShiftAssignment,
} from '@prisma/client';

export type ShiftPolicyPayload = {
  startTime?: string;
  endTime?: string;
  graceMinutes?: number;
  breakMinutes?: number;
};

export type AttendanceDayCalc = {
  checkInAt: Date | null;
  checkOutAt: Date | null;
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  otMinutes: number;
  status: AttendanceDayStatus;
};

export function parseWorkDate(input: string | Date): Date {
  if (input instanceof Date) {
    return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  }
  const iso = input.includes('T') ? input.slice(0, 10) : input;
  return new Date(`${iso}T00:00:00.000Z`);
}

export function workDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function diffMinutes(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
}

function pickPunchTime(
  punches: AttendancePunch[],
  type: AttendancePunchType,
  mode: 'first' | 'last',
): Date | null {
  const filtered = punches
    .filter((p) => p.type === type)
    .sort((a, b) => a.punchedAt.getTime() - b.punchedAt.getTime());
  if (!filtered.length) return null;
  const picked = mode === 'first' ? filtered[0] : filtered[filtered.length - 1];
  return picked?.punchedAt ?? null;
}

function breakMinutesFromPunches(punches: AttendancePunch[]): number {
  const starts = punches
    .filter((p) => p.type === AttendancePunchType.BREAK_START)
    .sort((a, b) => a.punchedAt.getTime() - b.punchedAt.getTime());
  const ends = punches
    .filter((p) => p.type === AttendancePunchType.BREAK_END)
    .sort((a, b) => a.punchedAt.getTime() - b.punchedAt.getTime());

  let total = 0;
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i];
    const end = ends[i];
    if (start && end && end.punchedAt > start.punchedAt) {
      total += diffMinutes(start.punchedAt, end.punchedAt);
    }
  }
  return total;
}

export function computeAttendanceDay(input: {
  punches: AttendancePunch[];
  shift?: ShiftAssignment | null;
  policyPayload?: ShiftPolicyPayload | null;
  approvedOtMinutes?: number;
  onApprovedLeave?: boolean;
}): AttendanceDayCalc {
  const { punches, shift, policyPayload, approvedOtMinutes = 0, onApprovedLeave } = input;

  if (onApprovedLeave) {
    return {
      checkInAt: null,
      checkOutAt: null,
      workedMinutes: 0,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      otMinutes: 0,
      status: AttendanceDayStatus.LEAVE,
    };
  }

  const checkInAt = pickPunchTime(punches, AttendancePunchType.CHECK_IN, 'first');
  const checkOutAt = pickPunchTime(punches, AttendancePunchType.CHECK_OUT, 'last');

  if (!checkInAt && !checkOutAt && punches.length === 0) {
    return {
      checkInAt: null,
      checkOutAt: null,
      workedMinutes: 0,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      otMinutes: 0,
      status: AttendanceDayStatus.ABSENT,
    };
  }

  const shiftStart = shift?.startAt ?? null;
  const shiftEnd = shift?.endAt ?? null;
  const grace = policyPayload?.graceMinutes ?? 0;
  const defaultBreak = policyPayload?.breakMinutes ?? 0;

  let workedMinutes = 0;
  let lateMinutes = 0;
  let earlyLeaveMinutes = 0;
  let otMinutes = approvedOtMinutes;

  if (checkInAt && checkOutAt && checkOutAt > checkInAt) {
    const breakMins = breakMinutesFromPunches(punches) || defaultBreak;
    workedMinutes = Math.max(0, diffMinutes(checkInAt, checkOutAt) - breakMins);
  }

  if (checkInAt && shiftStart && checkInAt > shiftStart) {
    lateMinutes = Math.max(0, diffMinutes(shiftStart, checkInAt) - grace);
  }

  if (checkOutAt && shiftEnd && checkOutAt < shiftEnd) {
    earlyLeaveMinutes = diffMinutes(checkOutAt, shiftEnd);
  }

  if (checkOutAt && shiftEnd && checkOutAt > shiftEnd) {
    const autoOt = diffMinutes(shiftEnd, checkOutAt);
    otMinutes = Math.max(otMinutes, autoOt);
  }

  let status: AttendanceDayStatus = AttendanceDayStatus.INCOMPLETE;
  if (checkInAt && checkOutAt) {
    status = AttendanceDayStatus.PRESENT;
  }

  return {
    checkInAt,
    checkOutAt,
    workedMinutes,
    lateMinutes,
    earlyLeaveMinutes,
    otMinutes,
    status,
  };
}

export function isDateInLeaveRange(
  workDate: Date,
  fromDate: Date,
  toDate: Date,
  status: LeaveRequestStatus,
): boolean {
  if (status !== LeaveRequestStatus.APPROVED) return false;
  const key = workDateKey(workDate);
  return key >= workDateKey(fromDate) && key <= workDateKey(toDate);
}
