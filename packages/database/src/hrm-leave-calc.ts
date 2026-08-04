import { LeaveDayPart, LeaveType } from '@prisma/client';
import { parseWorkDate, workDateKey } from './hrm-attendance-calc';

/** Quota mặc định (ngày/năm) — có thể override bằng employee.metadata.leaveQuota */
export const DEFAULT_LEAVE_QUOTA: Partial<Record<LeaveType, number>> = {
  [LeaveType.ANNUAL]: 12,
  [LeaveType.SICK]: 30,
  [LeaveType.MATERNITY]: 180,
  // UNPAID / OTHER: không giới hạn
};

export function computeLeaveDays(input: {
  fromDate: string | Date;
  toDate: string | Date;
  dayPart?: LeaveDayPart | string;
}): number {
  const from = parseWorkDate(input.fromDate);
  const to = parseWorkDate(input.toDate);
  if (to < from) {
    throw new Error('INVALID_DATE_RANGE');
  }

  const dayPart = (input.dayPart as LeaveDayPart) || LeaveDayPart.FULL;
  const isHalf = dayPart === LeaveDayPart.HALF_AM || dayPart === LeaveDayPart.HALF_PM;

  if (isHalf) {
    if (workDateKey(from) !== workDateKey(to)) {
      throw new Error('HALF_DAY_SINGLE_DATE');
    }
    return 0.5;
  }

  let days = 0;
  const cursor = new Date(from);
  while (workDateKey(cursor) <= workDateKey(to)) {
    days += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function computeOvertimeMinutes(input: {
  startAt: string | Date;
  endAt: string | Date;
  breakMinutes?: number;
}): number {
  const start = input.startAt instanceof Date ? input.startAt : new Date(input.startAt);
  const end = input.endAt instanceof Date ? input.endAt : new Date(input.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('INVALID_OT_TIME');
  }
  if (end <= start) {
    throw new Error('OT_END_BEFORE_START');
  }
  const breakMinutes = Math.max(0, Math.floor(input.breakMinutes ?? 0));
  const raw = Math.round((end.getTime() - start.getTime()) / 60_000) - breakMinutes;
  if (raw < 1) {
    throw new Error('OT_MINUTES_TOO_SMALL');
  }
  return raw;
}

export function datesOverlap(aFrom: Date, aTo: Date, bFrom: Date, bTo: Date): boolean {
  return workDateKey(aFrom) <= workDateKey(bTo) && workDateKey(bFrom) <= workDateKey(aTo);
}

export function resolveLeaveQuota(leaveType: LeaveType, metadata?: unknown): number | null {
  const meta = (metadata ?? {}) as { leaveQuota?: Partial<Record<string, number>> };
  const fromMeta = meta.leaveQuota?.[leaveType];
  if (typeof fromMeta === 'number' && fromMeta >= 0) return fromMeta;
  const def = DEFAULT_LEAVE_QUOTA[leaveType];
  return def ?? null; // null = unlimited
}
