import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import {
  AttendanceMethod,
  LeaveRequestStatus,
  Prisma,
  TimesheetStatus,
} from '@marketingspa/database';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { HRM_ATTENDANCE_REBUILD_QUEUE } from '../queue/queue.constants';
import { buildPaginatedResult, getPaginationParams } from '../common/utils/pagination.util';
import {
  AttendanceDaysQueryDto,
  AttendancePunchDto,
  CreateAttendanceAdjustmentDto,
  CreateAttendanceQrTokenDto,
} from './dto/attendance.dto';
import type { HrmActor } from './hrm-employees.service';
import { HrmEmployeesService } from './hrm-employees.service';
import { HrmTimesheetService } from './hrm-timesheet.service';
import {
  computeAttendanceDay,
  isDateInLeaveRange,
  parseWorkDate,
  ShiftPolicyPayload,
  workDateKey,
} from '@marketingspa/database';

@Injectable()
export class HrmAttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly employees: HrmEmployeesService,
    private readonly timesheet: HrmTimesheetService,
    @Optional()
    @Inject(HRM_ATTENDANCE_REBUILD_QUEUE)
    private readonly rebuildQueue?: Queue,
  ) {}

  async listDays(organizationId: string, query: AttendanceDaysQueryDto) {
    const { page, pageSize, skip, take } = getPaginationParams(query);

    const where: Prisma.AttendanceDayWhereInput = {
      organizationId,
      ...(query.branchId && { branchId: query.branchId }),
      ...(query.employeeId && { employeeId: query.employeeId }),
    };

    if (query.year && query.month) {
      const from = new Date(Date.UTC(query.year, query.month - 1, 1));
      const to = new Date(Date.UTC(query.year, query.month, 0));
      where.workDate = { gte: from, lte: to };
    } else if (query.from || query.to) {
      where.workDate = {
        ...(query.from && { gte: parseWorkDate(query.from) }),
        ...(query.to && { lte: parseWorkDate(query.to) }),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.attendanceDay.findMany({
        where,
        skip,
        take,
        orderBy: [{ workDate: 'desc' }, { employeeId: 'asc' }],
        include: {
          employee: { select: { id: true, name: true, code: true, position: true } },
          branch: { select: { id: true, name: true } },
          timesheetPeriod: { select: { id: true, year: true, month: true, status: true } },
        },
      }),
      this.prisma.attendanceDay.count({ where }),
    ]);

    return buildPaginatedResult(items, total, page, pageSize);
  }

  async punch(organizationId: string, dto: AttendancePunchDto, actor?: HrmActor) {
    const employee = await this.employees.ensureEmployee(organizationId, dto.employeeId);
    const punchedAt = dto.punchedAt ? new Date(dto.punchedAt) : new Date();
    const workDate = parseWorkDate(punchedAt);

    await this.timesheet.assertPeriodOpenForDate(organizationId, dto.branchId, workDate);

    let qrTokenId: string | undefined;
    if (dto.method === AttendanceMethod.QR) {
      if (!dto.qrToken) throw new BadRequestException('Thiếu mã QR chấm công');
      const tokenHash = this.hashToken(dto.qrToken);
      const token = await this.prisma.attendanceQrToken.findFirst({
        where: {
          organizationId,
          branchId: dto.branchId,
          tokenHash,
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
      if (!token) throw new BadRequestException('Mã QR không hợp lệ hoặc đã hết hạn');
      qrTokenId = token.id;
    }

    if (dto.method === AttendanceMethod.MANUAL && !actor?.userId) {
      throw new BadRequestException('Chấm công thủ công cần xác thực HR');
    }

    const punch = await this.prisma.attendancePunch.create({
      data: {
        organizationId,
        branchId: dto.branchId,
        employeeId: dto.employeeId,
        workDate,
        punchedAt,
        type: dto.type,
        method: dto.method,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracyM: dto.accuracyM,
        qrTokenId,
        kioskDeviceId: dto.kioskDeviceId,
        rawMetadata: dto.method === AttendanceMethod.GPS
          ? ({ latitude: dto.latitude, longitude: dto.longitude } as Prisma.InputJsonValue)
          : undefined,
      },
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.attendance.punch',
      entityType: 'AttendancePunch',
      entityId: punch.id,
      metadata: {
        after: {
          employeeId: dto.employeeId,
          type: dto.type,
          method: dto.method,
          punchedAt,
        },
      },
      ipAddress: actor?.ipAddress,
    });

    const day = await this.rebuildDay(organizationId, dto.employeeId, workDate);
    void this.enqueueRebuild(organizationId, dto.employeeId, workDateKey(workDate));

    return { punch, day };
  }

  async rebuildDay(organizationId: string, employeeId: string, workDateInput: string | Date) {
    const workDate = parseWorkDate(workDateInput);
    const employee = await this.employees.ensureEmployee(organizationId, employeeId);
    const branchId = employee.branchId;
    if (!branchId) {
      throw new BadRequestException('Nhân viên chưa gắn chi nhánh');
    }

    const [punches, shift, leaveRequests, otRequests] = await Promise.all([
      this.prisma.attendancePunch.findMany({
        where: { organizationId, employeeId, workDate },
        orderBy: { punchedAt: 'asc' },
      }),
      this.prisma.shiftAssignment.findFirst({
        where: { organizationId, employeeId, workDate },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          organizationId,
          employeeId,
          status: LeaveRequestStatus.APPROVED,
          fromDate: { lte: workDate },
          toDate: { gte: workDate },
        },
      }),
      this.prisma.overtimeRequest.findMany({
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
      const policy = await this.prisma.workShiftPolicy.findFirst({
        where: { id: shift.policyId, organizationId },
        include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
      });
      policyPayload = (policy?.versions[0]?.payload as ShiftPolicyPayload) ?? null;
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

    const period = await this.timesheet.getOrCreateForDate(organizationId, branchId, workDate);

    return this.prisma.attendanceDay.upsert({
      where: {
        organizationId_employeeId_workDate: {
          organizationId,
          employeeId,
          workDate,
        },
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
      include: {
        employee: { select: { id: true, name: true, code: true } },
        timesheetPeriod: { select: { id: true, status: true, year: true, month: true } },
      },
    });
  }

  async createAdjustment(
    organizationId: string,
    dto: CreateAttendanceAdjustmentDto,
    actor?: HrmActor,
  ) {
    const employee = await this.employees.ensureEmployee(organizationId, dto.employeeId);
    const workDate = parseWorkDate(dto.workDate);
    const branchId = employee.branchId;
    if (!branchId) throw new BadRequestException('Nhân viên chưa gắn chi nhánh');

    const period = await this.timesheet.getOrCreateForDate(organizationId, branchId, workDate);

    const adjustment = await this.prisma.attendanceAdjustment.create({
      data: {
        organizationId,
        timesheetPeriodId: period.id,
        employeeId: dto.employeeId,
        workDate,
        field: dto.field,
        oldValue: dto.oldValue,
        newValue: dto.newValue,
        reason: dto.reason,
        createdById: actor?.userId,
      },
    });

    const day = await this.prisma.attendanceDay.findFirst({
      where: { organizationId, employeeId: dto.employeeId, workDate },
    });

    if (day) {
      const numericFields = [
        'workedMinutes',
        'lateMinutes',
        'earlyLeaveMinutes',
        'otMinutes',
      ] as const;
      if (numericFields.includes(dto.field as (typeof numericFields)[number])) {
        const value = Number(dto.newValue);
        if (!Number.isFinite(value)) {
          throw new BadRequestException('Giá trị điều chỉnh phải là số');
        }
        await this.prisma.attendanceDay.update({
          where: { id: day.id },
          data: { [dto.field]: value, source: 'ADJUSTMENT' },
        });
      }
    } else if (period.status === TimesheetStatus.LOCKED) {
      await this.rebuildDay(organizationId, dto.employeeId, workDate);
    }

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.attendance.adjustment',
      entityType: 'AttendanceAdjustment',
      entityId: adjustment.id,
      metadata: { after: { ...dto } as Prisma.InputJsonValue },
      ipAddress: actor?.ipAddress,
    });

    return adjustment;
  }

  async createQrToken(
    organizationId: string,
    dto: CreateAttendanceQrTokenDto,
    actor?: HrmActor,
  ) {
    const rawToken = randomBytes(24).toString('hex');
    const tokenHash = this.hashToken(rawToken);

    const record = await this.prisma.attendanceQrToken.create({
      data: {
        organizationId,
        branchId: dto.branchId,
        label: dto.label,
        tokenHash,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.attendance.qr_token.create',
      entityType: 'AttendanceQrToken',
      entityId: record.id,
      metadata: { after: { label: dto.label, branchId: dto.branchId } },
      ipAddress: actor?.ipAddress,
    });

    return { ...record, token: rawToken };
  }

  async listQrTokens(organizationId: string, branchId?: string) {
    return this.prisma.attendanceQrToken.findMany({
      where: {
        organizationId,
        ...(branchId && { branchId }),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        label: true,
        branchId: true,
        isActive: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  private hashToken(raw: string) {
    return createHash('sha256').update(raw).digest('hex');
  }

  private async enqueueRebuild(organizationId: string, employeeId: string, workDate: string) {
    if (!this.rebuildQueue) return;
    try {
      await this.rebuildQueue.add(
        'rebuild-day',
        { organizationId, employeeId, workDate },
        { removeOnComplete: 100, removeOnFail: 50 },
      );
    } catch {
      // Sync rebuild already applied; queue is best-effort when Redis unavailable.
    }
  }
}
