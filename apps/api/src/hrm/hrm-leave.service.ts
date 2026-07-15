import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LeaveRequestStatus, Prisma } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { buildPaginatedResult, getPaginationParams } from '../common/utils/pagination.util';
import {
  CreateLeaveRequestDto,
  CreateOvertimeRequestDto,
  LeaveDecisionDto,
  LeaveRequestQueryDto,
  OvertimeRequestQueryDto,
} from './dto/leave.dto';
import type { HrmActor } from './hrm-employees.service';
import { HrmEmployeesService } from './hrm-employees.service';
import { HrmAttendanceService } from './hrm-attendance.service';
import { parseWorkDate, workDateKey } from '@marketingspa/database';

@Injectable()
export class HrmLeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly employees: HrmEmployeesService,
    private readonly attendance: HrmAttendanceService,
  ) {}

  async listLeave(organizationId: string, query: LeaveRequestQueryDto) {
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const where: Prisma.LeaveRequestWhereInput = {
      organizationId,
      ...(query.branchId && { branchId: query.branchId }),
      ...(query.employeeId && { employeeId: query.employeeId }),
      ...(query.status && { status: query.status }),
    };

    const [items, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: { select: { id: true, name: true, code: true } },
          branch: { select: { id: true, name: true } },
          approver: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return buildPaginatedResult(items, total, page, pageSize);
  }

  async createLeave(organizationId: string, dto: CreateLeaveRequestDto, actor?: HrmActor) {
    const employee = await this.employees.ensureEmployee(organizationId, dto.employeeId);
    const fromDate = parseWorkDate(dto.fromDate);
    const toDate = parseWorkDate(dto.toDate);
    if (toDate < fromDate) {
      throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu');
    }

    const request = await this.prisma.leaveRequest.create({
      data: {
        organizationId,
        branchId: dto.branchId ?? employee.branchId,
        employeeId: dto.employeeId,
        leaveType: dto.leaveType,
        fromDate,
        toDate,
        days: new Prisma.Decimal(dto.days),
        reason: dto.reason,
      },
      include: {
        employee: { select: { id: true, name: true, code: true } },
      },
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.leave.create',
      entityType: 'LeaveRequest',
      entityId: request.id,
      metadata: { after: { leaveType: dto.leaveType, fromDate: dto.fromDate, toDate: dto.toDate } },
      ipAddress: actor?.ipAddress,
    });

    return request;
  }

  async approveLeave(
    organizationId: string,
    id: string,
    dto: LeaveDecisionDto,
    approverId: string,
    actor?: HrmActor,
  ) {
    const request = await this.findLeave(organizationId, id);
    if (request.status !== LeaveRequestStatus.PENDING) {
      throw new BadRequestException('Đơn phép không ở trạng thái chờ duyệt');
    }

    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: LeaveRequestStatus.APPROVED,
        approverId,
        decidedAt: new Date(),
        decisionNote: dto.decisionNote,
      },
    });

    await this.rebuildLeaveRange(organizationId, request.employeeId, request.fromDate, request.toDate);

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.leave.approve',
      entityType: 'LeaveRequest',
      entityId: id,
      ipAddress: actor?.ipAddress,
    });

    return updated;
  }

  async rejectLeave(
    organizationId: string,
    id: string,
    dto: LeaveDecisionDto,
    approverId: string,
    actor?: HrmActor,
  ) {
    const request = await this.findLeave(organizationId, id);
    if (request.status !== LeaveRequestStatus.PENDING) {
      throw new BadRequestException('Đơn phép không ở trạng thái chờ duyệt');
    }

    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: LeaveRequestStatus.REJECTED,
        approverId,
        decidedAt: new Date(),
        decisionNote: dto.decisionNote,
      },
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.leave.reject',
      entityType: 'LeaveRequest',
      entityId: id,
      ipAddress: actor?.ipAddress,
    });

    return updated;
  }

  async listOvertime(organizationId: string, query: OvertimeRequestQueryDto) {
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const where: Prisma.OvertimeRequestWhereInput = {
      organizationId,
      ...(query.branchId && { branchId: query.branchId }),
      ...(query.employeeId && { employeeId: query.employeeId }),
      ...(query.status && { status: query.status }),
    };

    const [items, total] = await Promise.all([
      this.prisma.overtimeRequest.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: { select: { id: true, name: true, code: true } },
          branch: { select: { id: true, name: true } },
          approver: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.overtimeRequest.count({ where }),
    ]);

    return buildPaginatedResult(items, total, page, pageSize);
  }

  async createOvertime(organizationId: string, dto: CreateOvertimeRequestDto, actor?: HrmActor) {
    await this.employees.ensureEmployee(organizationId, dto.employeeId);
    const workDate = parseWorkDate(dto.workDate);

    const request = await this.prisma.overtimeRequest.create({
      data: {
        organizationId,
        branchId: dto.branchId,
        employeeId: dto.employeeId,
        workDate,
        minutes: dto.minutes,
        reason: dto.reason,
      },
      include: {
        employee: { select: { id: true, name: true, code: true } },
      },
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.overtime.create',
      entityType: 'OvertimeRequest',
      entityId: request.id,
      metadata: { after: { workDate: dto.workDate, minutes: dto.minutes } },
      ipAddress: actor?.ipAddress,
    });

    return request;
  }

  async approveOvertime(
    organizationId: string,
    id: string,
    dto: LeaveDecisionDto,
    approverId: string,
    actor?: HrmActor,
  ) {
    const request = await this.findOvertime(organizationId, id);
    if (request.status !== LeaveRequestStatus.PENDING) {
      throw new BadRequestException('Đơn OT không ở trạng thái chờ duyệt');
    }

    const updated = await this.prisma.overtimeRequest.update({
      where: { id },
      data: {
        status: LeaveRequestStatus.APPROVED,
        approverId,
        decidedAt: new Date(),
        decisionNote: dto.decisionNote,
      },
    });

    await this.attendance.rebuildDay(organizationId, request.employeeId, request.workDate);

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.overtime.approve',
      entityType: 'OvertimeRequest',
      entityId: id,
      ipAddress: actor?.ipAddress,
    });

    return updated;
  }

  async rejectOvertime(
    organizationId: string,
    id: string,
    dto: LeaveDecisionDto,
    approverId: string,
    actor?: HrmActor,
  ) {
    const request = await this.findOvertime(organizationId, id);
    if (request.status !== LeaveRequestStatus.PENDING) {
      throw new BadRequestException('Đơn OT không ở trạng thái chờ duyệt');
    }

    const updated = await this.prisma.overtimeRequest.update({
      where: { id },
      data: {
        status: LeaveRequestStatus.REJECTED,
        approverId,
        decidedAt: new Date(),
        decisionNote: dto.decisionNote,
      },
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.overtime.reject',
      entityType: 'OvertimeRequest',
      entityId: id,
      ipAddress: actor?.ipAddress,
    });

    return updated;
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
      await this.attendance.rebuildDay(organizationId, employeeId, cursor);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
}
