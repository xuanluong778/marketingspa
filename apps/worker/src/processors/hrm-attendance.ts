import type { Job } from 'bullmq';
import {
  LeaveRequestStatus,
  prisma,
  computeAttendanceDay,
  isDateInLeaveRange,
  parseWorkDate,
  ShiftPolicyPayload,
} from '@marketingspa/database';

export type HrmAttendanceRebuildJob = {
  organizationId: string;
  employeeId: string;
  workDate: string;
};

export async function processHrmAttendanceRebuild(job: Job<HrmAttendanceRebuildJob>) {
  const { organizationId, employeeId, workDate: workDateStr } = job.data;
  const workDate = parseWorkDate(workDateStr);

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, organizationId },
  });
  if (!employee?.branchId) {
    return { skipped: true, reason: 'employee_or_branch_missing' };
  }

  const branchId = employee.branchId;

  const [punches, shift, leaveRequests, otRequests] = await Promise.all([
    prisma.attendancePunch.findMany({
      where: { organizationId, employeeId, workDate },
      orderBy: { punchedAt: 'asc' },
    }),
    prisma.shiftAssignment.findFirst({
      where: { organizationId, employeeId, workDate },
    }),
    prisma.leaveRequest.findMany({
      where: {
        organizationId,
        employeeId,
        status: LeaveRequestStatus.APPROVED,
        fromDate: { lte: workDate },
        toDate: { gte: workDate },
      },
    }),
    prisma.overtimeRequest.findMany({
      where: {
        organizationId,
        employeeId,
        workDate,
        status: LeaveRequestStatus.APPROVED,
      },
    }),
  ]);

  let policyPayload: ShiftPolicyPayload | null = null;
  if (shift?.policyId) {
    const version = await prisma.workShiftPolicyVersion.findFirst({
      where: { policyId: shift.policyId },
      orderBy: { version: 'desc' },
    });
    policyPayload = (version?.payload as ShiftPolicyPayload) ?? null;
  }

  const onApprovedLeave = leaveRequests.some((lr) =>
    isDateInLeaveRange(workDate, lr.fromDate, lr.toDate, lr.status),
  );
  const approvedOtMinutes = otRequests.reduce((sum, ot) => sum + ot.minutes, 0);

  const calc = computeAttendanceDay({
    punches,
    shift,
    policyPayload,
    approvedOtMinutes,
    onApprovedLeave,
  });

  const year = workDate.getUTCFullYear();
  const month = workDate.getUTCMonth() + 1;
  let period = await prisma.timesheetPeriod.findFirst({
    where: { organizationId, branchId, year, month },
  });
  if (!period) {
    period = await prisma.timesheetPeriod.create({
      data: { organizationId, branchId, year, month },
    });
  }

  const day = await prisma.attendanceDay.upsert({
    where: {
      organizationId_employeeId_workDate: { organizationId, employeeId, workDate },
    },
    create: {
      organizationId,
      branchId,
      employeeId,
      workDate,
      checkInAt: calc.checkInAt,
      checkOutAt: calc.checkOutAt,
      workedMinutes: calc.workedMinutes,
      lateMinutes: calc.lateMinutes,
      earlyLeaveMinutes: calc.earlyLeaveMinutes,
      otMinutes: calc.otMinutes,
      status: calc.status,
      source: 'AUTO',
      timesheetPeriodId: period.id,
    },
    update: {
      checkInAt: calc.checkInAt,
      checkOutAt: calc.checkOutAt,
      workedMinutes: calc.workedMinutes,
      lateMinutes: calc.lateMinutes,
      earlyLeaveMinutes: calc.earlyLeaveMinutes,
      otMinutes: calc.otMinutes,
      status: calc.status,
      timesheetPeriodId: period.id,
    },
  });

  return { dayId: day.id, status: day.status };
}
