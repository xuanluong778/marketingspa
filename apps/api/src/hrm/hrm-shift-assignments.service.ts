import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { buildPaginatedResult, getPaginationParams } from '../common/utils/pagination.util';
import {
  CreateShiftAssignmentDto,
  ShiftAssignmentQueryDto,
  UpdateShiftAssignmentDto,
} from './dto/shift.dto';
import type { HrmActor } from './hrm-employees.service';
import { HrmEmployeesService } from './hrm-employees.service';
import { HrmTimesheetService } from './hrm-timesheet.service';
import { parseWorkDate } from '@marketingspa/database';

@Injectable()
export class HrmShiftAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly employees: HrmEmployeesService,
    private readonly timesheet: HrmTimesheetService,
  ) {}

  async findAll(organizationId: string, query: ShiftAssignmentQueryDto) {
    const { page, pageSize, skip, take } = getPaginationParams(query);

    const where: Prisma.ShiftAssignmentWhereInput = {
      organizationId,
      ...(query.branchId && { branchId: query.branchId }),
      ...(query.employeeId && { employeeId: query.employeeId }),
      ...(query.from || query.to
        ? {
            workDate: {
              ...(query.from && { gte: parseWorkDate(query.from) }),
              ...(query.to && { lte: parseWorkDate(query.to) }),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.shiftAssignment.findMany({
        where,
        skip,
        take,
        orderBy: [{ workDate: 'desc' }, { startAt: 'asc' }],
        include: {
          employee: { select: { id: true, name: true, code: true } },
          branch: { select: { id: true, name: true } },
          policy: { select: { id: true, name: true, code: true } },
        },
      }),
      this.prisma.shiftAssignment.count({ where }),
    ]);

    return buildPaginatedResult(items, total, page, pageSize);
  }

  async create(organizationId: string, dto: CreateShiftAssignmentDto, actor?: HrmActor) {
    const employee = await this.employees.ensureEmployee(organizationId, dto.employeeId);
    const workDate = parseWorkDate(dto.workDate);
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);

    if (endAt <= startAt) {
      throw new BadRequestException('Giờ kết thúc ca phải sau giờ bắt đầu');
    }

    await this.timesheet.assertPeriodOpenForDate(
      organizationId,
      dto.branchId ?? employee.branchId,
      workDate,
    );

    try {
      const assignment = await this.prisma.shiftAssignment.create({
        data: {
          organizationId,
          branchId: dto.branchId,
          employeeId: dto.employeeId,
          policyId: dto.policyId,
          workDate,
          startAt,
          endAt,
          source: dto.source,
          note: dto.note,
        },
        include: {
          employee: { select: { id: true, name: true, code: true } },
          policy: { select: { id: true, name: true } },
        },
      });

      await this.audit.log({
        organizationId,
        userId: actor?.userId,
        action: 'hrm.shift_assignment.create',
        entityType: 'ShiftAssignment',
        entityId: assignment.id,
        metadata: {
          after: {
            employeeId: dto.employeeId,
            workDate: dto.workDate,
            startAt: dto.startAt,
            endAt: dto.endAt,
          },
        },
        ipAddress: actor?.ipAddress,
      });

      return assignment;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Nhân viên đã có ca trong ngày này');
      }
      throw e;
    }
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateShiftAssignmentDto,
    actor?: HrmActor,
  ) {
    const existing = await this.prisma.shiftAssignment.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException('Phân ca không tồn tại');
    if (existing.locked) {
      throw new BadRequestException('Ca đã khóa — không thể sửa');
    }

    await this.timesheet.assertPeriodOpenForDate(
      organizationId,
      existing.branchId,
      existing.workDate,
    );

    const startAt = dto.startAt ? new Date(dto.startAt) : existing.startAt;
    const endAt = dto.endAt ? new Date(dto.endAt) : existing.endAt;
    if (endAt <= startAt) {
      throw new BadRequestException('Giờ kết thúc ca phải sau giờ bắt đầu');
    }

    const updated = await this.prisma.shiftAssignment.update({
      where: { id },
      data: {
        ...(dto.policyId !== undefined && { policyId: dto.policyId }),
        ...(dto.startAt !== undefined && { startAt }),
        ...(dto.endAt !== undefined && { endAt }),
        ...(dto.note !== undefined && { note: dto.note }),
      },
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.shift_assignment.update',
      entityType: 'ShiftAssignment',
      entityId: id,
      metadata: { after: { ...dto } as Prisma.InputJsonValue },
      ipAddress: actor?.ipAddress,
    });

    return updated;
  }
}
