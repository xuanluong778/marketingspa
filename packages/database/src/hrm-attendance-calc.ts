import {
  AttendanceDayStatus,
  AttendancePunch,
  AttendancePunchType,
  LeaveRequestStatus,
  ShiftAssignment,
} from '@prisma/client';

/** Timezone chuẩn cho chấm công Việt Nam */
export const HRM_TIMEZONE = 'Asia/Ho_Chi_Minh';

export type ShiftPolicyPayload = {
  startTime?: string;
  endTime?: string;
  /** @deprecated dùng lateGraceMinutes */
  graceMinutes?: number;
  breakMinutes?: number;
  lateGraceMinutes?: number;
  earlyLeaveGraceMinutes?: number;
  /** Cửa sổ OT trước ca (phút) — chấm sớm hơn được tính OT trong giới hạn này */
  otBeforeMinutes?: number;
  /** Cửa sổ OT sau ca (phút) */
  otAfterMinutes?: number;
  crossesMidnight?: boolean;
  /** Số phút công chuẩn trong ngày (override). Nếu thiếu thì suy từ ca. */
  expectedWorkMinutes?: number;
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

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function getZonedParts(date: Date, timeZone: string = HRM_TIMEZONE): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    fmt
      .formatToParts(date)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Ngày công = calendar date theo Asia/Ho_Chi_Minh, lưu dạng UTC midnight. */
export function workDateFromInstant(input: string | Date, timeZone: string = HRM_TIMEZONE): Date {
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return parseWorkDate(input);
  }
  const date = input instanceof Date ? input : new Date(input);
  const z = getZonedParts(date, timeZone);
  return new Date(Date.UTC(z.year, z.month - 1, z.day));
}

export function parseWorkDate(input: string | Date): Date {
  if (input instanceof Date) {
    return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  }
  const iso = input.includes('T') ? input.slice(0, 10) : input;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

export function workDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Format giờ theo timezone HRM (HH:mm). */
export function formatHrmTime(isoOrDate?: string | Date | null): string {
  if (!isoOrDate) return '';
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: HRM_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

export function parseHhMm(time: string): { hour: number; minute: number } {
  const [h, m] = time.split(':').map(Number);
  return { hour: h ?? 0, minute: m ?? 0 };
}

/** Ghép ngày công (UTC midnight = calendar ICT) + HH:mm ICT → Instant. */
export function combineWorkDateAndTimeIct(workDate: Date, hhmm: string): Date {
  const key = workDateKey(workDate);
  const normalized = hhmm.length === 5 ? `${hhmm}:00` : hhmm;
  return new Date(`${key}T${normalized}+07:00`);
}

/**
 * Tính cửa sổ ca từ policy (hỗ trợ ca qua ngày / ca đêm).
 * startAt/endAt luôn thỏa endAt > startAt.
 */
export function resolveShiftWindow(
  workDate: Date,
  payload: Pick<ShiftPolicyPayload, 'startTime' | 'endTime' | 'crossesMidnight'>,
): { startAt: Date; endAt: Date; crossesMidnight: boolean } {
  const startTime = payload.startTime ?? '08:00';
  const endTime = payload.endTime ?? '17:00';
  const startAt = combineWorkDateAndTimeIct(workDate, startTime);
  let endAt = combineWorkDateAndTimeIct(workDate, endTime);
  const startMins = parseHhMm(startTime).hour * 60 + parseHhMm(startTime).minute;
  const endMins = parseHhMm(endTime).hour * 60 + parseHhMm(endTime).minute;
  const crosses = payload.crossesMidnight === true || endMins <= startMins || endAt <= startAt;
  if (crosses) {
    endAt = new Date(endAt.getTime() + 24 * 60 * 60 * 1000);
  }
  return { startAt, endAt, crossesMidnight: crosses };
}

export function buildShiftPayloadFromPolicy(policy: {
  startTime: string;
  endTime: string;
  breakMinutes: number;
  lateGraceMinutes: number;
  earlyLeaveGraceMinutes: number;
  otBeforeMinutes: number;
  otAfterMinutes: number;
  crossesMidnight: boolean;
}): ShiftPolicyPayload {
  return {
    startTime: policy.startTime,
    endTime: policy.endTime,
    breakMinutes: policy.breakMinutes,
    lateGraceMinutes: policy.lateGraceMinutes,
    earlyLeaveGraceMinutes: policy.earlyLeaveGraceMinutes,
    graceMinutes: policy.lateGraceMinutes,
    otBeforeMinutes: policy.otBeforeMinutes,
    otAfterMinutes: policy.otAfterMinutes,
    crossesMidnight: policy.crossesMidnight,
  };
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

function expectedMinutesFromShift(
  shift?: ShiftAssignment | null,
  policyPayload?: ShiftPolicyPayload | null,
): number | null {
  if (policyPayload?.expectedWorkMinutes != null && policyPayload.expectedWorkMinutes > 0) {
    return policyPayload.expectedWorkMinutes;
  }
  const breakMins = policyPayload?.breakMinutes ?? 0;
  if (shift?.startAt && shift?.endAt && shift.endAt > shift.startAt) {
    return Math.max(0, diffMinutes(shift.startAt, shift.endAt) - breakMins);
  }
  if (policyPayload?.startTime && policyPayload?.endTime) {
    const startMins =
      parseHhMm(policyPayload.startTime).hour * 60 + parseHhMm(policyPayload.startTime).minute;
    const endMins =
      parseHhMm(policyPayload.endTime).hour * 60 + parseHhMm(policyPayload.endTime).minute;
    const crosses = policyPayload.crossesMidnight || endMins <= startMins;
    const span = crosses ? 24 * 60 - startMins + endMins : endMins - startMins;
    return Math.max(0, span - breakMins);
  }
  return null;
}

/**
 * Chống chấm trùng trong cùng ngày công.
 */
export function assertPunchNotDuplicate(
  punches: Array<{ type: AttendancePunchType }>,
  type: AttendancePunchType,
): void {
  const checkIns = punches.filter((p) => p.type === AttendancePunchType.CHECK_IN).length;
  const checkOuts = punches.filter((p) => p.type === AttendancePunchType.CHECK_OUT).length;

  if (type === AttendancePunchType.CHECK_IN) {
    if (checkIns > checkOuts) {
      throw new Error('DUPLICATE_CHECK_IN');
    }
  }
  if (type === AttendancePunchType.CHECK_OUT) {
    if (checkIns === 0) {
      throw new Error('MISSING_CHECK_IN');
    }
    if (checkOuts >= checkIns) {
      throw new Error('DUPLICATE_CHECK_OUT');
    }
  }
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
  const lateGrace = policyPayload?.lateGraceMinutes ?? policyPayload?.graceMinutes ?? 0;
  const earlyGrace = policyPayload?.earlyLeaveGraceMinutes ?? 0;
  const defaultBreak = policyPayload?.breakMinutes ?? 0;
  const otBeforeCap = policyPayload?.otBeforeMinutes ?? 0;
  const otAfterCap = policyPayload?.otAfterMinutes ?? Number.MAX_SAFE_INTEGER;

  let workedMinutes = 0;
  let lateMinutes = 0;
  let earlyLeaveMinutes = 0;
  let otMinutes = approvedOtMinutes;

  if (checkInAt && checkOutAt && checkOutAt > checkInAt) {
    const punchBreak = breakMinutesFromPunches(punches);
    const breakMins = punchBreak > 0 ? punchBreak : defaultBreak;
    workedMinutes = Math.max(0, diffMinutes(checkInAt, checkOutAt) - breakMins);
  }

  if (checkInAt && shiftStart && checkInAt > shiftStart) {
    lateMinutes = Math.max(0, diffMinutes(shiftStart, checkInAt) - lateGrace);
  }

  if (checkOutAt && shiftEnd && checkOutAt < shiftEnd) {
    earlyLeaveMinutes = Math.max(0, diffMinutes(checkOutAt, shiftEnd) - earlyGrace);
  }

  let autoOt = 0;
  if (checkInAt && shiftStart && checkInAt < shiftStart) {
    const early = diffMinutes(checkInAt, shiftStart);
    autoOt += otBeforeCap > 0 ? Math.min(early, otBeforeCap) : early;
  }
  if (checkOutAt && shiftEnd && checkOutAt > shiftEnd) {
    const lateStay = diffMinutes(shiftEnd, checkOutAt);
    autoOt += otAfterCap < Number.MAX_SAFE_INTEGER ? Math.min(lateStay, otAfterCap) : lateStay;
  }
  otMinutes = Math.max(otMinutes, autoOt);

  let status: AttendanceDayStatus = AttendanceDayStatus.INCOMPLETE;

  if (checkInAt && checkOutAt) {
    const expected = expectedMinutesFromShift(shift, policyPayload);
    const shortHours = earlyLeaveMinutes > 0 || (expected != null && workedMinutes + 1 < expected);

    status = shortHours ? AttendanceDayStatus.INCOMPLETE : AttendanceDayStatus.PRESENT;
  } else if (!checkInAt && !checkOutAt) {
    status = AttendanceDayStatus.ABSENT;
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
