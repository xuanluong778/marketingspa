import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import {
  AttendanceDayStatus,
  AttendanceMethod,
  AttendancePunchType,
  LeaveRequestStatus,
  Prisma,
  TimesheetStatus,
} from '@marketingspa/database';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { HRM_ATTENDANCE_REBUILD_QUEUE } from '../queue/queue.constants';
import { QueueEnqueueService } from '../common/services/queue-enqueue.service';
import { buildPaginatedResult, getPaginationParams } from '../common/utils/pagination.util';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  AttendanceDaysQueryDto,
  AttendanceExportQueryDto,
  AttendancePunchDto,
  CorrectAttendanceDayDto,
  CreateAttendanceAdjustmentDto,
  CreateAttendanceQrTokenDto,
} from './dto/attendance.dto';
import type { HrmActor } from './hrm-employees.service';
import { HrmEmployeesService } from './hrm-employees.service';
import { HrmTimesheetService } from './hrm-timesheet.service';
import {
  assertCanPunchForEmployee,
  assertEmployeeInScope,
  canCorrectAttendanceDay,
  resolveAttendanceScope,
  type AttendanceScope,
} from './hrm-attendance-scope';
import {
  assertPunchNotDuplicate,
  computeAttendanceDay,
  formatHrmTime,
  isDateInLeaveRange,
  parseWorkDate,
  ShiftPolicyPayload,
  workDateFromInstant,
  workDateKey,
} from '@marketingspa/database';

type ActorWithRole = HrmActor & {
  role?: string;
  employeeId?: string | null;
};

const DAY_INCLUDE = {
  employee: {
    select: {
      id: true,
      name: true,
      code: true,
      position: true,
      departmentId: true,
      department: { select: { id: true, name: true } },
    },
  },
  branch: { select: { id: true, name: true } },
  timesheetPeriod: { select: { id: true, year: true, month: true, status: true } },
} satisfies Prisma.AttendanceDayInclude;

@Injectable()
export class HrmAttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly employees: HrmEmployeesService,
    private readonly timesheet: HrmTimesheetService,
    private readonly queueEnqueue: QueueEnqueueService,
    @Optional()
    @Inject(HRM_ATTENDANCE_REBUILD_QUEUE)
    private readonly rebuildQueue?: Queue,
  ) {}

  private async scopeFor(
    organizationId: string,
    user?: Pick<AuthUser, 'role' | 'employeeId'>,
  ): Promise<AttendanceScope> {
    if (!user) return { mode: 'all' };
    return resolveAttendanceScope(this.prisma, organizationId, user);
  }

  private buildDaysWhere(
    organizationId: string,
    query: AttendanceDaysQueryDto,
    scope: AttendanceScope,
  ): Prisma.AttendanceDayWhereInput {
    const where: Prisma.AttendanceDayWhereInput = {
      organizationId,
      ...(query.branchId && { branchId: query.branchId }),
      ...(query.status && { status: query.status }),
      ...(query.departmentId && { employee: { departmentId: query.departmentId } }),
    };

    if (scope.mode === 'ids') {
      where.employeeId = { in: scope.employeeIds.length ? scope.employeeIds : ['__none__'] };
    }

    if (query.employeeId) {
      if (scope.mode === 'ids' && !scope.employeeIds.includes(query.employeeId)) {
        throw new ForbiddenException('Không có quyền xem nhân viên này');
      }
      where.employeeId = query.employeeId;
    }

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

    return where;
  }

  async listDays(
    organizationId: string,
    query: AttendanceDaysQueryDto,
    user?: Pick<AuthUser, 'role' | 'employeeId'>,
  ) {
    const scope = await this.scopeFor(organizationId, user);
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const where = this.buildDaysWhere(organizationId, query, scope);

    const [items, total] = await Promise.all([
      this.prisma.attendanceDay.findMany({
        where,
        skip,
        take,
        orderBy: [{ workDate: 'desc' }, { employeeId: 'asc' }],
        include: DAY_INCLUDE,
      }),
      this.prisma.attendanceDay.count({ where }),
    ]);

    return buildPaginatedResult(items, total, page, pageSize);
  }

  async exportDays(
    organizationId: string,
    query: AttendanceExportQueryDto,
    user?: Pick<AuthUser, 'role' | 'employeeId'>,
  ) {
    const scope = await this.scopeFor(organizationId, user);
    const where = this.buildDaysWhere(organizationId, query, scope);
    const format = query.format === 'xlsx' ? 'xlsx' : 'csv';

    const items = await this.prisma.attendanceDay.findMany({
      where,
      orderBy: [{ workDate: 'asc' }, { employeeId: 'asc' }],
      include: DAY_INCLUDE,
      take: 10_000,
    });

    const headers = [
      'Ngày',
      'Mã NV',
      'Nhân viên',
      'Chi nhánh',
      'Phòng ban',
      'Giờ vào',
      'Giờ ra',
      'Giờ công (phút)',
      'Đi muộn (phút)',
      'Về sớm (phút)',
      'OT (phút)',
      'Trạng thái',
      'Kỳ',
    ];

    const statusLabel: Record<string, string> = {
      PRESENT: 'Đủ công',
      INCOMPLETE: 'Thiếu giờ',
      ABSENT: 'Vắng',
      LEAVE: 'Nghỉ phép',
      HOLIDAY: 'Nghỉ lễ',
    };

    const rows = items.map((row) => [
      workDateKey(row.workDate),
      row.employee?.code ?? '',
      row.employee?.name ?? '',
      row.branch?.name ?? '',
      row.employee?.department?.name ?? '',
      formatHrmTime(row.checkInAt),
      formatHrmTime(row.checkOutAt),
      String(row.workedMinutes),
      String(row.lateMinutes),
      String(row.earlyLeaveMinutes),
      String(row.otMinutes),
      statusLabel[row.status] ?? row.status,
      row.timesheetPeriod
        ? `${String(row.timesheetPeriod.month).padStart(2, '0')}/${row.timesheetPeriod.year}`
        : '',
    ]);

    const stamp = new Date().toISOString().slice(0, 10);
    if (format === 'csv') {
      const body = [headers, ...rows]
        .map((cols) => cols.map((c) => this.csvEscape(c)).join(','))
        .join('\n');
      const content = `\uFEFF${body}`;
      return {
        content: Buffer.from(content, 'utf8'),
        contentType: 'text/csv; charset=utf-8',
        filename: `bang-cong-${stamp}.csv`,
      };
    }

    const xmlRows = rows
      .map(
        (cols) =>
          `<Row>${cols.map((c) => `<Cell><Data ss:Type="String">${this.xmlEscape(c)}</Data></Cell>`).join('')}</Row>`,
      )
      .join('');
    const headerRow = `<Row>${headers
      .map((c) => `<Cell><Data ss:Type="String">${this.xmlEscape(c)}</Data></Cell>`)
      .join('')}</Row>`;
    const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="BangCong">
  <Table>${headerRow}${xmlRows}</Table>
 </Worksheet>
</Workbook>`;

    return {
      content: Buffer.from(xml, 'utf8'),
      contentType: 'application/vnd.ms-excel; charset=utf-8',
      filename: `bang-cong-${stamp}.xls`,
    };
  }

  async getTodayPunchState(
    organizationId: string,
    user: Pick<AuthUser, 'role' | 'employeeId'>,
  ) {
    if (!user.employeeId) {
      return { employeeId: null, workDate: null, canCheckIn: false, canCheckOut: false, day: null };
    }

    const scope = await this.scopeFor(organizationId, user);
    assertEmployeeInScope(scope, user.employeeId);

    const workDate = workDateFromInstant(new Date());
    const punches = await this.prisma.attendancePunch.findMany({
      where: { organizationId, employeeId: user.employeeId, workDate },
      orderBy: { punchedAt: 'asc' },
    });
    const checkIns = punches.filter((p) => p.type === AttendancePunchType.CHECK_IN).length;
    const checkOuts = punches.filter((p) => p.type === AttendancePunchType.CHECK_OUT).length;
    const day = await this.prisma.attendanceDay.findFirst({
      where: { organizationId, employeeId: user.employeeId, workDate },
      include: DAY_INCLUDE,
    });

    return {
      employeeId: user.employeeId,
      workDate: workDateKey(workDate),
      canCheckIn: checkIns <= checkOuts,
      canCheckOut: checkIns > checkOuts,
      day,
      punches: punches.map((p) => ({
        id: p.id,
        type: p.type,
        punchedAt: p.punchedAt,
        method: p.method,
      })),
    };
  }

  async punch(organizationId: string, dto: AttendancePunchDto, actor?: ActorWithRole) {
    const scope = await this.scopeFor(
      organizationId,
      actor?.role
        ? { role: actor.role, employeeId: actor.employeeId }
        : undefined,
    );

    const employeeId = dto.employeeId ?? actor?.employeeId ?? undefined;
    if (!employeeId) {
      throw new BadRequestException('Thiếu employeeId để chấm công');
    }

    if (actor?.role) {
      assertCanPunchForEmployee(
        { role: actor.role, employeeId: actor.employeeId },
        employeeId,
        scope,
      );
    }

    const employee = await this.employees.ensureEmployee(organizationId, employeeId);
    const branchId = dto.branchId ?? employee.branchId;
    if (!branchId) {
      throw new BadRequestException('Nhân viên chưa gắn chi nhánh');
    }

    const punchedAt = dto.punchedAt ? new Date(dto.punchedAt) : new Date();
    const workDate = workDateFromInstant(punchedAt);

    await this.timesheet.assertPeriodOpenForDate(organizationId, branchId, workDate);

    const method = dto.method ?? AttendanceMethod.MANUAL;

    let qrTokenId: string | undefined;
    if (method === AttendanceMethod.QR) {
      if (!dto.qrToken) throw new BadRequestException('Thiếu mã QR chấm công');
      const tokenHash = this.hashToken(dto.qrToken);
      const token = await this.prisma.attendanceQrToken.findFirst({
        where: {
          organizationId,
          branchId,
          tokenHash,
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
      if (!token) throw new BadRequestException('Mã QR không hợp lệ hoặc đã hết hạn');
      qrTokenId = token.id;
    }

    if (method === AttendanceMethod.MANUAL && !actor?.userId) {
      throw new BadRequestException('Chấm công thủ công cần xác thực');
    }

    const existingPunches = await this.prisma.attendancePunch.findMany({
      where: { organizationId, employeeId, workDate },
      select: { type: true },
    });

    try {
      assertPunchNotDuplicate(existingPunches, dto.type);
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      if (code === 'DUPLICATE_CHECK_IN') {
        throw new BadRequestException('Đã chấm vào — không thể chấm vào trùng');
      }
      if (code === 'MISSING_CHECK_IN') {
        throw new BadRequestException('Chưa chấm vào — không thể chấm ra');
      }
      if (code === 'DUPLICATE_CHECK_OUT') {
        throw new BadRequestException('Đã chấm ra — không thể chấm ra trùng');
      }
      throw e;
    }

    const punch = await this.prisma.attendancePunch.create({
      data: {
        organizationId,
        branchId,
        employeeId,
        workDate,
        punchedAt,
        type: dto.type,
        method,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracyM: dto.accuracyM,
        qrTokenId,
        kioskDeviceId: dto.kioskDeviceId,
        rawMetadata:
          method === AttendanceMethod.GPS
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
          employeeId,
          type: dto.type,
          method,
          punchedAt,
          workDate: workDateKey(workDate),
        },
      },
      ipAddress: actor?.ipAddress,
    });

    const day = await this.rebuildDay(organizationId, employeeId, workDate, { force: true });
    void this.enqueueRebuild(organizationId, employeeId, workDateKey(workDate));

    return { punch, day };
  }

  async rebuildDay(
    organizationId: string,
    employeeId: string,
    workDateInput: string | Date,
    options?: { force?: boolean },
  ) {
    const workDate = parseWorkDate(workDateInput);
    const employee = await this.employees.ensureEmployee(organizationId, employeeId);
    const branchId = employee.branchId;
    if (!branchId) {
      throw new BadRequestException('Nhân viên chưa gắn chi nhánh');
    }

    const existing = await this.prisma.attendanceDay.findFirst({
      where: { organizationId, employeeId, workDate },
    });

    if (
      existing &&
      (existing.source === 'ADJUSTMENT' || existing.source === 'MANUAL') &&
      !options?.force
    ) {
      return this.prisma.attendanceDay.findFirstOrThrow({
        where: { id: existing.id },
        include: {
          employee: { select: { id: true, name: true, code: true } },
          timesheetPeriod: { select: { id: true, status: true, year: true, month: true } },
        },
      });
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
      if (policy) {
        policyPayload = {
          startTime: policy.startTime,
          endTime: policy.endTime,
          breakMinutes: policy.breakMinutes,
          lateGraceMinutes: policy.lateGraceMinutes,
          earlyLeaveGraceMinutes: policy.earlyLeaveGraceMinutes,
          graceMinutes: policy.lateGraceMinutes,
          otBeforeMinutes: policy.otBeforeMinutes,
          otAfterMinutes: policy.otAfterMinutes,
          crossesMidnight: policy.crossesMidnight,
          ...((policy.versions[0]?.payload as ShiftPolicyPayload) ?? {}),
        };
        // Prefer live policy columns over stale version fields
        policyPayload.startTime = policy.startTime;
        policyPayload.endTime = policy.endTime;
        policyPayload.breakMinutes = policy.breakMinutes;
        policyPayload.lateGraceMinutes = policy.lateGraceMinutes;
        policyPayload.earlyLeaveGraceMinutes = policy.earlyLeaveGraceMinutes;
        policyPayload.otBeforeMinutes = policy.otBeforeMinutes;
        policyPayload.otAfterMinutes = policy.otAfterMinutes;
        policyPayload.crossesMidnight = policy.crossesMidnight;
        policyPayload.graceMinutes = policy.lateGraceMinutes;
      }
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
        source: 'AUTO',
        timesheetPeriodId: period.id,
      },
      include: {
        employee: { select: { id: true, name: true, code: true } },
        timesheetPeriod: { select: { id: true, status: true, year: true, month: true } },
      },
    });
  }

  async correctDay(
    organizationId: string,
    dayId: string,
    dto: CorrectAttendanceDayDto,
    actor?: ActorWithRole,
  ) {
    if (!actor?.role || !canCorrectAttendanceDay(actor.role)) {
      throw new ForbiddenException('Chỉ Owner/HR được sửa ngày công');
    }

    const day = await this.prisma.attendanceDay.findFirst({
      where: { id: dayId, organizationId },
      include: { timesheetPeriod: true },
    });
    if (!day) throw new NotFoundException('Ngày công không tồn tại');

    await this.timesheet.assertPeriodOpenForDate(organizationId, day.branchId, day.workDate);

    const before = {
      checkInAt: day.checkInAt?.toISOString() ?? null,
      checkOutAt: day.checkOutAt?.toISOString() ?? null,
      workedMinutes: day.workedMinutes,
      lateMinutes: day.lateMinutes,
      earlyLeaveMinutes: day.earlyLeaveMinutes,
      otMinutes: day.otMinutes,
      status: day.status,
      source: day.source,
    };

    const data: Prisma.AttendanceDayUpdateInput = {
      source: 'ADJUSTMENT',
    };

    if (dto.checkInAt !== undefined) {
      data.checkInAt = dto.checkInAt ? new Date(dto.checkInAt) : null;
    }
    if (dto.checkOutAt !== undefined) {
      data.checkOutAt = dto.checkOutAt ? new Date(dto.checkOutAt) : null;
    }
    if (dto.workedMinutes !== undefined) data.workedMinutes = dto.workedMinutes;
    if (dto.lateMinutes !== undefined) data.lateMinutes = dto.lateMinutes;
    if (dto.earlyLeaveMinutes !== undefined) data.earlyLeaveMinutes = dto.earlyLeaveMinutes;
    if (dto.otMinutes !== undefined) data.otMinutes = dto.otMinutes;
    if (dto.status !== undefined) data.status = dto.status;

    // Nếu chỉ sửa giờ vào/ra mà chưa set phút công — tính lại tối thiểu
    const nextCheckIn =
      dto.checkInAt !== undefined
        ? dto.checkInAt
          ? new Date(dto.checkInAt)
          : null
        : day.checkInAt;
    const nextCheckOut =
      dto.checkOutAt !== undefined
        ? dto.checkOutAt
          ? new Date(dto.checkOutAt)
          : null
        : day.checkOutAt;

    if (
      dto.workedMinutes === undefined &&
      (dto.checkInAt !== undefined || dto.checkOutAt !== undefined) &&
      nextCheckIn &&
      nextCheckOut &&
      nextCheckOut > nextCheckIn
    ) {
      data.workedMinutes = Math.max(
        0,
        Math.round((nextCheckOut.getTime() - nextCheckIn.getTime()) / 60_000),
      );
    }

    if (
      dto.status === undefined &&
      (dto.checkInAt !== undefined || dto.checkOutAt !== undefined)
    ) {
      if (nextCheckIn && nextCheckOut) {
        data.status = AttendanceDayStatus.PRESENT;
      } else if (nextCheckIn || nextCheckOut) {
        data.status = AttendanceDayStatus.INCOMPLETE;
      } else {
        data.status = AttendanceDayStatus.ABSENT;
      }
    }

    const period =
      day.timesheetPeriod ??
      (await this.timesheet.getOrCreateForDate(organizationId, day.branchId, day.workDate));

    const updated = await this.prisma.attendanceDay.update({
      where: { id: day.id },
      data,
      include: DAY_INCLUDE,
    });

    const after = {
      checkInAt: updated.checkInAt?.toISOString() ?? null,
      checkOutAt: updated.checkOutAt?.toISOString() ?? null,
      workedMinutes: updated.workedMinutes,
      lateMinutes: updated.lateMinutes,
      earlyLeaveMinutes: updated.earlyLeaveMinutes,
      otMinutes: updated.otMinutes,
      status: updated.status,
      source: updated.source,
    };

    const changedFields = (Object.keys(before) as (keyof typeof before)[]).filter(
      (k) => String(before[k]) !== String(after[k]),
    );

    for (const field of changedFields) {
      if (field === 'source') continue;
      await this.prisma.attendanceAdjustment.create({
        data: {
          organizationId,
          timesheetPeriodId: period.id,
          employeeId: day.employeeId,
          workDate: day.workDate,
          field,
          oldValue: before[field] == null ? null : String(before[field]),
          newValue: after[field] == null ? null : String(after[field]),
          reason: dto.reason,
          createdById: actor?.userId,
        },
      });
    }

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.attendance.day.correct',
      entityType: 'AttendanceDay',
      entityId: day.id,
      metadata: {
        before,
        after,
        reason: dto.reason,
      } as Prisma.InputJsonValue,
      ipAddress: actor?.ipAddress,
    });

    return updated;
  }

  async createAdjustment(
    organizationId: string,
    dto: CreateAttendanceAdjustmentDto,
    actor?: ActorWithRole,
  ) {
    if (!actor?.role || !canCorrectAttendanceDay(actor.role)) {
      throw new ForbiddenException('Chỉ Owner/HR được điều chỉnh ngày công');
    }

    const employee = await this.employees.ensureEmployee(organizationId, dto.employeeId);
    const workDate = parseWorkDate(dto.workDate);
    const branchId = employee.branchId;
    if (!branchId) throw new BadRequestException('Nhân viên chưa gắn chi nhánh');

    await this.timesheet.assertPeriodOpenForDate(organizationId, branchId, workDate);

    const period = await this.timesheet.getOrCreateForDate(organizationId, branchId, workDate);

    const day = await this.prisma.attendanceDay.findFirst({
      where: { organizationId, employeeId: dto.employeeId, workDate },
    });

    const before = day
      ? {
          [dto.field]: this.readDayField(day, dto.field),
        }
      : null;

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
      } else if (dto.field === 'status') {
        await this.prisma.attendanceDay.update({
          where: { id: day.id },
          data: { status: dto.newValue as AttendanceDayStatus, source: 'ADJUSTMENT' },
        });
      }
    }

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.attendance.adjustment',
      entityType: 'AttendanceAdjustment',
      entityId: adjustment.id,
      metadata: {
        before,
        after: { ...dto },
        reason: dto.reason,
      } as Prisma.InputJsonValue,
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

  private readDayField(
    day: {
      workedMinutes: number;
      lateMinutes: number;
      earlyLeaveMinutes: number;
      otMinutes: number;
      status: AttendanceDayStatus;
      checkInAt: Date | null;
      checkOutAt: Date | null;
    },
    field: string,
  ): string | number | null {
    switch (field) {
      case 'workedMinutes':
        return day.workedMinutes;
      case 'lateMinutes':
        return day.lateMinutes;
      case 'earlyLeaveMinutes':
        return day.earlyLeaveMinutes;
      case 'otMinutes':
        return day.otMinutes;
      case 'status':
        return day.status;
      case 'checkInAt':
        return day.checkInAt?.toISOString() ?? null;
      case 'checkOutAt':
        return day.checkOutAt?.toISOString() ?? null;
      default:
        return null;
    }
  }

  private hashToken(raw: string) {
    return createHash('sha256').update(raw).digest('hex');
  }

  private csvEscape(value: string) {
    if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
  }

  private xmlEscape(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private async enqueueRebuild(organizationId: string, employeeId: string, workDate: string) {
    if (!this.rebuildQueue) {
      throw new ServiceUnavailableException(
        'Hàng đợi chấm công chưa sẵn sàng — kiểm tra Redis/worker.',
      );
    }
    await this.queueEnqueue.add(
      this.rebuildQueue,
      'rebuild-day',
      { organizationId, employeeId, workDate },
      { removeOnComplete: 100, removeOnFail: 50 },
    );
  }
}
