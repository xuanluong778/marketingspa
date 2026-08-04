import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import {
  LeaveDayPart,
  LeaveRequestStatus,
  LeaveType,
  Prisma,
  TimesheetStatus,
} from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { buildPaginatedResult, getPaginationParams } from '../common/utils/pagination.util';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  CreateLeaveRequestDto,
  CreateOvertimeRequestDto,
  LeaveBalanceQueryDto,
  LeaveCancelDto,
  LeaveDecisionDto,
  LeaveRejectDto,
  LeaveRequestQueryDto,
  OvertimeRequestQueryDto,
} from './dto/leave.dto';
import type { HrmActor } from './hrm-employees.service';
import { HrmEmployeesService } from './hrm-employees.service';
import { HrmAttendanceService } from './hrm-attendance.service';
import { HrmTimesheetService } from './hrm-timesheet.service';
import {
  assertCanApproveLeaveOt,
  assertCanCreateLeaveOt,
  assertEmployeeInScope,
  resolveHrmAccessScope,
  type HrmAccessScope,
} from './hrm-attendance-scope';
import {
  computeLeaveDays,
  computeOvertimeMinutes,
  datesOverlap,
  parseWorkDate,
  resolveLeaveQuota,
  workDateKey,
} from '@marketingspa/database';

type ActorCtx = HrmActor & {
  role?: string;
  employeeId?: string | null;
};

type UploadedFile = {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
};

const LEAVE_MIME_ALLOW = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const LEAVE_MAX_BYTES = 5 * 1024 * 1024;

const LEAVE_INCLUDE = {
  employee: { select: { id: true, name: true, code: true } },
  branch: { select: { id: true, name: true } },
  approver: { select: { id: true, name: true, email: true } },
} satisfies Prisma.LeaveRequestInclude;

const OT_INCLUDE = {
  employee: { select: { id: true, name: true, code: true } },
  branch: { select: { id: true, name: true } },
  approver: { select: { id: true, name: true, email: true } },
} satisfies Prisma.OvertimeRequestInclude;

@Injectable()
export class HrmLeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly employees: HrmEmployeesService,
    private readonly attendance: HrmAttendanceService,
    private readonly timesheet: HrmTimesheetService,
  ) {}

  private async scopeFor(
    organizationId: string,
    user?: Pick<AuthUser, 'role' | 'employeeId'>,
  ): Promise<HrmAccessScope> {
    if (!user?.role) return { mode: 'all' };
    return resolveHrmAccessScope(this.prisma, organizationId, user);
  }

  private applyEmployeeScope(
    scope: HrmAccessScope,
    employeeId?: string,
  ): string | { in: string[] } | undefined {
    if (employeeId) {
      if (scope.mode === 'ids' && !scope.employeeIds.includes(employeeId)) {
        throw new ForbiddenException('Không có quyền xem nhân viên này');
      }
      return employeeId;
    }
    if (scope.mode === 'ids') {
      return { in: scope.employeeIds.length ? scope.employeeIds : ['__none__'] };
    }
    return undefined;
  }

  async listLeave(
    organizationId: string,
    query: LeaveRequestQueryDto,
    user?: Pick<AuthUser, 'role' | 'employeeId'>,
  ) {
    const scope = await this.scopeFor(organizationId, user);
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const employeeFilter = this.applyEmployeeScope(scope, query.employeeId);

    const where: Prisma.LeaveRequestWhereInput = {
      organizationId,
      ...(query.branchId && { branchId: query.branchId }),
      ...(employeeFilter !== undefined && { employeeId: employeeFilter }),
      ...(query.status && { status: query.status }),
    };

    const [items, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: LEAVE_INCLUDE,
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return buildPaginatedResult(items, total, page, pageSize);
  }

  async getBalance(
    organizationId: string,
    query: LeaveBalanceQueryDto,
    user?: Pick<AuthUser, 'role' | 'employeeId'>,
  ) {
    const scope = await this.scopeFor(organizationId, user);
    const employeeId = query.employeeId ?? user?.employeeId;
    if (!employeeId) throw new BadRequestException('Thiếu employeeId');
    assertEmployeeInScope(scope, employeeId, 'xem số dư phép của');

    const employee = await this.employees.ensureEmployee(organizationId, employeeId);
    const year = query.year ?? new Date().getUTCFullYear();
    const from = new Date(Date.UTC(year, 0, 1));
    const to = new Date(Date.UTC(year, 11, 31));

    const approved = await this.prisma.leaveRequest.findMany({
      where: {
        organizationId,
        employeeId,
        status: LeaveRequestStatus.APPROVED,
        fromDate: { lte: to },
        toDate: { gte: from },
      },
      select: { leaveType: true, days: true, fromDate: true, toDate: true },
    });

    const usedByType: Record<string, number> = {};
    for (const row of approved) {
      const key = row.leaveType;
      usedByType[key] = (usedByType[key] ?? 0) + Number(row.days);
    }

    const types = Object.values(LeaveType);
    const balances = types.map((leaveType) => {
      const quota = resolveLeaveQuota(leaveType, employee.metadata);
      const used = usedByType[leaveType] ?? 0;
      return {
        leaveType,
        year,
        quota,
        used,
        remaining: quota == null ? null : Math.max(0, Math.round((quota - used) * 10) / 10),
      };
    });

    return { employeeId, year, balances };
  }

  async createLeave(
    organizationId: string,
    dto: CreateLeaveRequestDto,
    file: UploadedFile | undefined,
    actor?: ActorCtx,
  ) {
    const scope = await this.scopeFor(
      organizationId,
      actor?.role ? { role: actor.role, employeeId: actor.employeeId } : undefined,
    );

    const employeeId = dto.employeeId ?? actor?.employeeId;
    if (!employeeId) throw new BadRequestException('Thiếu employeeId');

    if (actor?.role) {
      assertCanCreateLeaveOt(
        { role: actor.role, employeeId: actor.employeeId },
        employeeId,
        scope,
      );
    }

    const employee = await this.employees.ensureEmployee(organizationId, employeeId);
    const dayPart = dto.dayPart ?? LeaveDayPart.FULL;

    let days: number;
    try {
      days = computeLeaveDays({
        fromDate: dto.fromDate,
        toDate: dto.toDate,
        dayPart,
      });
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      if (code === 'INVALID_DATE_RANGE') {
        throw new BadRequestException('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu');
      }
      if (code === 'HALF_DAY_SINGLE_DATE') {
        throw new BadRequestException('Nửa ngày chỉ áp dụng khi từ ngày = đến ngày');
      }
      throw e;
    }

    const fromDate = parseWorkDate(dto.fromDate);
    const toDate = parseWorkDate(dto.toDate);

    await this.assertNoLeaveOverlap(organizationId, employeeId, fromDate, toDate);
    await this.assertLeaveBalance(organizationId, employee, dto.leaveType, days, fromDate);

    const attachment = file ? this.saveLeaveAttachment(organizationId, file) : null;

    const created = await this.prisma.leaveRequest.create({
      data: {
        organizationId,
        branchId: dto.branchId ?? employee.branchId,
        employeeId,
        leaveType: dto.leaveType,
        dayPart,
        fromDate,
        toDate,
        days: new Prisma.Decimal(days),
        reason: dto.reason,
        attachmentKey: attachment?.key,
        attachmentName: attachment?.name,
        attachmentMime: attachment?.mime,
        attachmentSize: attachment?.size,
      },
    });

    const request = await this.prisma.leaveRequest.update({
      where: { id: created.id },
      data: {
        attachmentUrl: attachment
          ? `/api/v1/hrm/leave-requests/${created.id}/attachment`
          : null,
      },
      include: LEAVE_INCLUDE,
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.leave.create',
      entityType: 'LeaveRequest',
      entityId: request.id,
      metadata: {
        after: {
          leaveType: dto.leaveType,
          dayPart,
          fromDate: dto.fromDate,
          toDate: dto.toDate,
          days,
          hasAttachment: !!attachment,
        },
      },
      ipAddress: actor?.ipAddress,
    });

    return request;
  }

  async approveLeave(
    organizationId: string,
    id: string,
    dto: LeaveDecisionDto,
    approverId: string,
    actor?: ActorCtx,
  ) {
    const request = await this.findLeave(organizationId, id);
    const scope = await this.scopeFor(
      organizationId,
      actor?.role ? { role: actor.role, employeeId: actor.employeeId } : undefined,
    );

    if (actor?.role) {
      assertCanApproveLeaveOt(
        { role: actor.role, employeeId: actor.employeeId },
        request.employeeId,
        scope,
      );
    }

    if (request.status !== LeaveRequestStatus.PENDING) {
      throw new BadRequestException('Đơn phép không ở trạng thái chờ duyệt');
    }

    await this.assertRangePeriodsOpen(
      organizationId,
      request.branchId,
      request.fromDate,
      request.toDate,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.leaveRequest.updateMany({
        where: { id, organizationId, status: LeaveRequestStatus.PENDING },
        data: {
          status: LeaveRequestStatus.APPROVED,
          approverId,
          decidedAt: new Date(),
          decisionNote: dto.decisionNote,
        },
      });
      if (result.count !== 1) {
        throw new BadRequestException('Đơn phép đã được xử lý');
      }
      return tx.leaveRequest.findFirstOrThrow({
        where: { id, organizationId },
        include: LEAVE_INCLUDE,
      });
    });

    // Rebuild idempotent — chỉ lấy đơn APPROVED, không cộng trùng cùng request
    await this.rebuildLeaveRange(
      organizationId,
      request.employeeId,
      request.fromDate,
      request.toDate,
    );

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.leave.approve',
      entityType: 'LeaveRequest',
      entityId: id,
      metadata: {
        before: { status: LeaveRequestStatus.PENDING },
        after: { status: LeaveRequestStatus.APPROVED },
        attendanceUpdated: {
          employeeId: request.employeeId,
          fromDate: workDateKey(request.fromDate),
          toDate: workDateKey(request.toDate),
        },
      },
      ipAddress: actor?.ipAddress,
    });

    return updated;
  }

  async rejectLeave(
    organizationId: string,
    id: string,
    dto: LeaveRejectDto,
    approverId: string,
    actor?: ActorCtx,
  ) {
    if (!dto.decisionNote?.trim() || dto.decisionNote.trim().length < 3) {
      throw new BadRequestException('Từ chối bắt buộc nhập lý do (≥ 3 ký tự)');
    }

    const request = await this.findLeave(organizationId, id);
    const scope = await this.scopeFor(
      organizationId,
      actor?.role ? { role: actor.role, employeeId: actor.employeeId } : undefined,
    );

    if (actor?.role) {
      assertCanApproveLeaveOt(
        { role: actor.role, employeeId: actor.employeeId },
        request.employeeId,
        scope,
      );
    }

    if (request.status !== LeaveRequestStatus.PENDING) {
      throw new BadRequestException('Đơn phép không ở trạng thái chờ duyệt');
    }

    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: LeaveRequestStatus.REJECTED,
        approverId,
        decidedAt: new Date(),
        decisionNote: dto.decisionNote.trim(),
      },
      include: LEAVE_INCLUDE,
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.leave.reject',
      entityType: 'LeaveRequest',
      entityId: id,
      metadata: {
        before: { status: LeaveRequestStatus.PENDING },
        after: { status: LeaveRequestStatus.REJECTED, decisionNote: dto.decisionNote.trim() },
        reason: dto.decisionNote.trim(),
      },
      ipAddress: actor?.ipAddress,
    });

    return updated;
  }

  async cancelLeave(
    organizationId: string,
    id: string,
    dto: LeaveCancelDto,
    actor?: ActorCtx,
  ) {
    if (!dto.reason?.trim() || dto.reason.trim().length < 3) {
      throw new BadRequestException('Hủy đơn bắt buộc nhập lý do (≥ 3 ký tự)');
    }

    const request = await this.findLeave(organizationId, id);
    const scope = await this.scopeFor(
      organizationId,
      actor?.role ? { role: actor.role, employeeId: actor.employeeId } : undefined,
    );
    assertEmployeeInScope(scope, request.employeeId, 'hủy đơn của');

    // Staff chỉ hủy đơn của mình; Manager/HR/Owner trong scope
    if (
      actor?.role &&
      actor.role !== 'OWNER' &&
      actor.role !== 'HR' &&
      actor.role !== 'MANAGER' &&
      actor.employeeId !== request.employeeId
    ) {
      throw new ForbiddenException('Bạn chỉ được hủy đơn của chính mình');
    }

    if (
      request.status !== LeaveRequestStatus.PENDING &&
      request.status !== LeaveRequestStatus.APPROVED
    ) {
      throw new BadRequestException('Chỉ hủy được đơn đang chờ duyệt hoặc đã duyệt');
    }

    const wasApproved = request.status === LeaveRequestStatus.APPROVED;
    if (wasApproved) {
      await this.assertRangePeriodsOpen(
        organizationId,
        request.branchId,
        request.fromDate,
        request.toDate,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.leaveRequest.updateMany({
        where: {
          id,
          organizationId,
          status: { in: [LeaveRequestStatus.PENDING, LeaveRequestStatus.APPROVED] },
        },
        data: {
          status: LeaveRequestStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelReason: dto.reason.trim(),
        },
      });
      if (result.count !== 1) {
        throw new BadRequestException('Không thể hủy đơn ở trạng thái hiện tại');
      }
      return tx.leaveRequest.findFirstOrThrow({
        where: { id, organizationId },
        include: LEAVE_INCLUDE,
      });
    });

    if (wasApproved) {
      await this.rebuildLeaveRange(
        organizationId,
        request.employeeId,
        request.fromDate,
        request.toDate,
      );
    }

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.leave.cancel',
      entityType: 'LeaveRequest',
      entityId: id,
      metadata: {
        before: { status: request.status },
        after: { status: LeaveRequestStatus.CANCELLED },
        reason: dto.reason.trim(),
        attendanceUpdated: wasApproved,
      },
      ipAddress: actor?.ipAddress,
    });

    return updated;
  }

  async getLeaveAttachment(
    organizationId: string,
    id: string,
    user?: Pick<AuthUser, 'role' | 'employeeId'>,
  ) {
    const request = await this.findLeave(organizationId, id);
    const scope = await this.scopeFor(organizationId, user);
    assertEmployeeInScope(scope, request.employeeId, 'xem đính kèm của');

    if (!request.attachmentKey) {
      throw new NotFoundException('Đơn không có file đính kèm');
    }

    const absPath = join(process.cwd(), 'uploads', request.attachmentKey);
    if (!existsSync(absPath)) {
      throw new NotFoundException('File đính kèm không tồn tại');
    }

    const stream = createReadStream(absPath);
    return {
      file: new StreamableFile(stream),
      mime: request.attachmentMime ?? 'application/octet-stream',
      filename: request.attachmentName ?? 'attachment',
    };
  }

  async listOvertime(
    organizationId: string,
    query: OvertimeRequestQueryDto,
    user?: Pick<AuthUser, 'role' | 'employeeId'>,
  ) {
    const scope = await this.scopeFor(organizationId, user);
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const employeeFilter = this.applyEmployeeScope(scope, query.employeeId);

    const where: Prisma.OvertimeRequestWhereInput = {
      organizationId,
      ...(query.branchId && { branchId: query.branchId }),
      ...(employeeFilter !== undefined && { employeeId: employeeFilter }),
      ...(query.status && { status: query.status }),
    };

    const [items, total] = await Promise.all([
      this.prisma.overtimeRequest.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: OT_INCLUDE,
      }),
      this.prisma.overtimeRequest.count({ where }),
    ]);

    return buildPaginatedResult(items, total, page, pageSize);
  }

  async createOvertime(
    organizationId: string,
    dto: CreateOvertimeRequestDto,
    actor?: ActorCtx,
  ) {
    const scope = await this.scopeFor(
      organizationId,
      actor?.role ? { role: actor.role, employeeId: actor.employeeId } : undefined,
    );

    const employeeId = dto.employeeId ?? actor?.employeeId;
    if (!employeeId) throw new BadRequestException('Thiếu employeeId');

    if (actor?.role) {
      assertCanCreateLeaveOt(
        { role: actor.role, employeeId: actor.employeeId },
        employeeId,
        scope,
      );
    }

    const employee = await this.employees.ensureEmployee(organizationId, employeeId);
    const branchId = dto.branchId ?? employee.branchId;
    if (!branchId) throw new BadRequestException('Nhân viên chưa gắn chi nhánh');

    const workDate = parseWorkDate(dto.workDate);
    let minutes: number;
    try {
      minutes = computeOvertimeMinutes({
        startAt: dto.startAt,
        endAt: dto.endAt,
        breakMinutes: dto.breakMinutes ?? 0,
      });
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      if (code === 'OT_END_BEFORE_START') {
        throw new BadRequestException('Giờ kết thúc OT phải sau giờ bắt đầu');
      }
      if (code === 'OT_MINUTES_TOO_SMALL') {
        throw new BadRequestException('Tổng phút OT phải ≥ 1 sau khi trừ thời gian nghỉ');
      }
      throw new BadRequestException('Thời gian OT không hợp lệ');
    }

    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);

    // Chặn OT trùng khung giờ cùng ngày (PENDING/APPROVED)
    const sameDay = await this.prisma.overtimeRequest.findMany({
      where: {
        organizationId,
        employeeId,
        workDate,
        status: { in: [LeaveRequestStatus.PENDING, LeaveRequestStatus.APPROVED] },
      },
    });
    for (const other of sameDay) {
      if (other.startAt && other.endAt) {
        if (startAt < other.endAt && endAt > other.startAt) {
          throw new BadRequestException('Khung giờ OT trùng với đơn khác');
        }
      }
    }

    const request = await this.prisma.overtimeRequest.create({
      data: {
        organizationId,
        branchId,
        employeeId,
        workDate,
        startAt,
        endAt,
        breakMinutes: dto.breakMinutes ?? 0,
        minutes,
        reason: dto.reason,
      },
      include: OT_INCLUDE,
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.overtime.create',
      entityType: 'OvertimeRequest',
      entityId: request.id,
      metadata: {
        after: {
          workDate: dto.workDate,
          startAt: dto.startAt,
          endAt: dto.endAt,
          breakMinutes: dto.breakMinutes ?? 0,
          minutes,
        },
      },
      ipAddress: actor?.ipAddress,
    });

    return request;
  }

  async approveOvertime(
    organizationId: string,
    id: string,
    dto: LeaveDecisionDto,
    approverId: string,
    actor?: ActorCtx,
  ) {
    const request = await this.findOvertime(organizationId, id);
    const scope = await this.scopeFor(
      organizationId,
      actor?.role ? { role: actor.role, employeeId: actor.employeeId } : undefined,
    );

    if (actor?.role) {
      assertCanApproveLeaveOt(
        { role: actor.role, employeeId: actor.employeeId },
        request.employeeId,
        scope,
      );
    }

    if (request.status !== LeaveRequestStatus.PENDING) {
      throw new BadRequestException('Đơn OT không ở trạng thái chờ duyệt');
    }

    await this.timesheet.assertPeriodOpenForDate(
      organizationId,
      request.branchId,
      request.workDate,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.overtimeRequest.updateMany({
        where: { id, organizationId, status: LeaveRequestStatus.PENDING },
        data: {
          status: LeaveRequestStatus.APPROVED,
          approverId,
          decidedAt: new Date(),
          decisionNote: dto.decisionNote,
        },
      });
      if (result.count !== 1) {
        throw new BadRequestException('Đơn OT đã được xử lý');
      }
      return tx.overtimeRequest.findFirstOrThrow({
        where: { id, organizationId },
        include: OT_INCLUDE,
      });
    });

    // Rebuild từ danh sách APPROVED — idempotent, không cộng trùng cùng request
    await this.attendance.rebuildDay(organizationId, request.employeeId, request.workDate, {
      force: true,
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.overtime.approve',
      entityType: 'OvertimeRequest',
      entityId: id,
      metadata: {
        before: { status: LeaveRequestStatus.PENDING },
        after: { status: LeaveRequestStatus.APPROVED, minutes: request.minutes },
        attendanceUpdated: {
          employeeId: request.employeeId,
          workDate: workDateKey(request.workDate),
        },
      },
      ipAddress: actor?.ipAddress,
    });

    return updated;
  }

  async rejectOvertime(
    organizationId: string,
    id: string,
    dto: LeaveRejectDto,
    approverId: string,
    actor?: ActorCtx,
  ) {
    if (!dto.decisionNote?.trim() || dto.decisionNote.trim().length < 3) {
      throw new BadRequestException('Từ chối bắt buộc nhập lý do (≥ 3 ký tự)');
    }

    const request = await this.findOvertime(organizationId, id);
    const scope = await this.scopeFor(
      organizationId,
      actor?.role ? { role: actor.role, employeeId: actor.employeeId } : undefined,
    );

    if (actor?.role) {
      assertCanApproveLeaveOt(
        { role: actor.role, employeeId: actor.employeeId },
        request.employeeId,
        scope,
      );
    }

    if (request.status !== LeaveRequestStatus.PENDING) {
      throw new BadRequestException('Đơn OT không ở trạng thái chờ duyệt');
    }

    const updated = await this.prisma.overtimeRequest.update({
      where: { id },
      data: {
        status: LeaveRequestStatus.REJECTED,
        approverId,
        decidedAt: new Date(),
        decisionNote: dto.decisionNote.trim(),
      },
      include: OT_INCLUDE,
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.overtime.reject',
      entityType: 'OvertimeRequest',
      entityId: id,
      metadata: {
        before: { status: LeaveRequestStatus.PENDING },
        after: { status: LeaveRequestStatus.REJECTED },
        reason: dto.decisionNote.trim(),
      },
      ipAddress: actor?.ipAddress,
    });

    return updated;
  }

  async cancelOvertime(
    organizationId: string,
    id: string,
    dto: LeaveCancelDto,
    actor?: ActorCtx,
  ) {
    if (!dto.reason?.trim() || dto.reason.trim().length < 3) {
      throw new BadRequestException('Hủy đơn bắt buộc nhập lý do (≥ 3 ký tự)');
    }

    const request = await this.findOvertime(organizationId, id);
    const scope = await this.scopeFor(
      organizationId,
      actor?.role ? { role: actor.role, employeeId: actor.employeeId } : undefined,
    );
    assertEmployeeInScope(scope, request.employeeId, 'hủy đơn của');

    if (
      actor?.role &&
      actor.role !== 'OWNER' &&
      actor.role !== 'HR' &&
      actor.role !== 'MANAGER' &&
      actor.employeeId !== request.employeeId
    ) {
      throw new ForbiddenException('Bạn chỉ được hủy đơn của chính mình');
    }

    if (
      request.status !== LeaveRequestStatus.PENDING &&
      request.status !== LeaveRequestStatus.APPROVED
    ) {
      throw new BadRequestException('Chỉ hủy được đơn đang chờ duyệt hoặc đã duyệt');
    }

    const wasApproved = request.status === LeaveRequestStatus.APPROVED;
    if (wasApproved) {
      await this.timesheet.assertPeriodOpenForDate(
        organizationId,
        request.branchId,
        request.workDate,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.overtimeRequest.updateMany({
        where: {
          id,
          organizationId,
          status: { in: [LeaveRequestStatus.PENDING, LeaveRequestStatus.APPROVED] },
        },
        data: {
          status: LeaveRequestStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelReason: dto.reason.trim(),
        },
      });
      if (result.count !== 1) {
        throw new BadRequestException('Không thể hủy đơn ở trạng thái hiện tại');
      }
      return tx.overtimeRequest.findFirstOrThrow({
        where: { id, organizationId },
        include: OT_INCLUDE,
      });
    });

    if (wasApproved) {
      await this.attendance.rebuildDay(organizationId, request.employeeId, request.workDate, {
        force: true,
      });
    }

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.overtime.cancel',
      entityType: 'OvertimeRequest',
      entityId: id,
      metadata: {
        before: { status: request.status },
        after: { status: LeaveRequestStatus.CANCELLED },
        reason: dto.reason.trim(),
        attendanceUpdated: wasApproved,
      },
      ipAddress: actor?.ipAddress,
    });

    return updated;
  }

  private saveLeaveAttachment(organizationId: string, file: UploadedFile) {
    if (!file.buffer?.length) {
      throw new BadRequestException('File đính kèm trống');
    }
    if ((file.size ?? file.buffer.length) > LEAVE_MAX_BYTES) {
      throw new BadRequestException('File đính kèm tối đa 5MB');
    }
    const mime = file.mimetype || '';
    if (!LEAVE_MIME_ALLOW.has(mime)) {
      throw new BadRequestException(
        'MIME không hợp lệ — chỉ PDF, JPG, PNG, WEBP, DOC, DOCX',
      );
    }

    const dir = join(process.cwd(), 'uploads', 'hrm', organizationId, 'leave');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const safeExt = extname(file.originalname || '').slice(0, 16);
    const filename = `${randomUUID()}${safeExt}`;
    const absPath = join(dir, filename);
    writeFileSync(absPath, file.buffer);

    const key = `hrm/${organizationId}/leave/${filename}`;
    return {
      key,
      name: file.originalname || filename,
      mime,
      size: file.size ?? file.buffer.length,
    };
  }

  private async assertNoLeaveOverlap(
    organizationId: string,
    employeeId: string,
    fromDate: Date,
    toDate: Date,
    excludeId?: string,
  ) {
    const existing = await this.prisma.leaveRequest.findMany({
      where: {
        organizationId,
        employeeId,
        status: { in: [LeaveRequestStatus.PENDING, LeaveRequestStatus.APPROVED] },
        ...(excludeId && { id: { not: excludeId } }),
        fromDate: { lte: toDate },
        toDate: { gte: fromDate },
      },
      select: { id: true, fromDate: true, toDate: true, status: true },
    });

    for (const row of existing) {
      if (datesOverlap(fromDate, toDate, row.fromDate, row.toDate)) {
        throw new BadRequestException(
          `Trùng thời gian với đơn phép ${row.status === 'APPROVED' ? 'đã duyệt' : 'đang chờ'} (${workDateKey(row.fromDate)} → ${workDateKey(row.toDate)})`,
        );
      }
    }
  }

  private async assertLeaveBalance(
    organizationId: string,
    employee: { id: string; metadata: unknown },
    leaveType: LeaveType,
    days: number,
    fromDate: Date,
  ) {
    const quota = resolveLeaveQuota(leaveType, employee.metadata);
    if (quota == null) return;

    const year = fromDate.getUTCFullYear();
    const yearFrom = new Date(Date.UTC(year, 0, 1));
    const yearTo = new Date(Date.UTC(year, 11, 31));

    const approved = await this.prisma.leaveRequest.findMany({
      where: {
        organizationId,
        employeeId: employee.id,
        leaveType,
        status: LeaveRequestStatus.APPROVED,
        fromDate: { lte: yearTo },
        toDate: { gte: yearFrom },
      },
      select: { days: true },
    });
    const pending = await this.prisma.leaveRequest.findMany({
      where: {
        organizationId,
        employeeId: employee.id,
        leaveType,
        status: LeaveRequestStatus.PENDING,
        fromDate: { lte: yearTo },
        toDate: { gte: yearFrom },
      },
      select: { days: true },
    });

    const used =
      approved.reduce((s, r) => s + Number(r.days), 0) +
      pending.reduce((s, r) => s + Number(r.days), 0);

    if (used + days > quota + 1e-9) {
      throw new BadRequestException(
        `Không đủ số dư phép ${leaveType}: còn ${Math.max(0, quota - used)} ngày, đơn cần ${days} ngày`,
      );
    }
  }

  private async assertRangePeriodsOpen(
    organizationId: string,
    branchId: string | null,
    fromDate: Date,
    toDate: Date,
  ) {
    const cursor = new Date(fromDate);
    while (workDateKey(cursor) <= workDateKey(toDate)) {
      const year = cursor.getUTCFullYear();
      const month = cursor.getUTCMonth() + 1;
      const period = await this.prisma.timesheetPeriod.findFirst({
        where: { organizationId, branchId, year, month },
      });
      if (period?.status === TimesheetStatus.LOCKED) {
        throw new BadRequestException(
          `Bảng công ${String(month).padStart(2, '0')}/${year} đã khóa — không thể duyệt/sửa`,
        );
      }
      // Also check org-wide period (branchId null)
      if (branchId) {
        const orgPeriod = await this.prisma.timesheetPeriod.findFirst({
          where: { organizationId, branchId: null, year, month },
        });
        if (orgPeriod?.status === TimesheetStatus.LOCKED) {
          throw new BadRequestException(
            `Bảng công ${String(month).padStart(2, '0')}/${year} đã khóa — không thể duyệt/sửa`,
          );
        }
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  private async findLeave(organizationId: string, id: string) {
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id, organizationId },
    });
    if (!request) throw new NotFoundException('Đơn phép không tồn tại');
    return request;
  }

  private async findOvertime(organizationId: string, id: string) {
    const request = await this.prisma.overtimeRequest.findFirst({
      where: { id, organizationId },
    });
    if (!request) throw new NotFoundException('Đơn OT không tồn tại');
    return request;
  }

  private async rebuildLeaveRange(
    organizationId: string,
    employeeId: string,
    fromDate: Date,
    toDate: Date,
  ) {
    const cursor = new Date(fromDate);
    while (workDateKey(cursor) <= workDateKey(toDate)) {
      await this.attendance.rebuildDay(organizationId, employeeId, cursor, { force: true });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
}
