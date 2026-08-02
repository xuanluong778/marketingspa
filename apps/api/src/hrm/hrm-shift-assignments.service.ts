import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ShiftAssignmentSource,
  parseWorkDate,
  resolveShiftWindow,
  workDateKey,
} from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { buildPaginatedResult, getPaginationParams } from '../common/utils/pagination.util';
import {
  BulkShiftAssignmentDto,
  CreateShiftAssignmentDto,
  ShiftAssignmentQueryDto,
  ShiftCalendarQueryDto,
  UpdateShiftAssignmentDto,
} from './dto/shift.dto';
import type { HrmActor } from './hrm-employees.service';
import { HrmEmployeesService } from './hrm-employees.service';
import { HrmTimesheetService } from './hrm-timesheet.service';
import {
  assertEmployeeInScope,
  isHrmOrgWideRole,
  resolveHrmAccessScope,
  type HrmAccessScope,
} from './hrm-attendance-scope';
import { SYSTEM_ROLES } from '../common/constants/roles';
import type { AuthUser } from '../common/interfaces/auth-user.interface';

type ActorCtx = HrmActor & { role?: string; employeeId?: string | null };

const ASSIGN_INCLUDE = {
  employee: {
    select: {
      id: true,
      name: true,
      code: true,
      departmentId: true,
      department: { select: { id: true, name: true } },
    },
  },
  branch: { select: { id: true, name: true } },
  policy: {
    select: {
      id: true,
      name: true,
      code: true,
      startTime: true,
      endTime: true,
      crossesMidnight: true,
      breakMinutes: true,
    },
  },
} satisfies Prisma.ShiftAssignmentInclude;

@Injectable()
export class HrmShiftAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly employees: HrmEmployeesService,
    private readonly timesheet: HrmTimesheetService,
  ) {}

  private async scopeFor(
    organizationId: string,
    user?: Pick<AuthUser, 'role' | 'employeeId'>,
  ): Promise<HrmAccessScope> {
    if (!user?.role) return { mode: 'all' };
    return resolveHrmAccessScope(this.prisma, organizationId, user);
  }

  private assertCanWriteAssignments(role?: string) {
    if (!role || (!isHrmOrgWideRole(role) && role !== SYSTEM_ROLES.MANAGER)) {
      throw new ForbiddenException('Không có quyền phân ca');
    }
  }

  /** ISO weekday 1=Mon … 7=Sun from UTC midnight date */
  private isoWeekday(workDate: Date): number {
    const js = workDate.getUTCDay(); // 0=Sun
    return js === 0 ? 7 : js;
  }

  private eachDateInRange(from: Date, to: Date, weekdays?: number[]): Date[] {
    const dates: Date[] = [];
    const cursor = new Date(from);
    while (workDateKey(cursor) <= workDateKey(to)) {
      const wd = this.isoWeekday(cursor);
      if (!weekdays?.length || weekdays.includes(wd)) {
        dates.push(new Date(cursor));
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
  }

  async findAll(
    organizationId: string,
    query: ShiftAssignmentQueryDto,
    user?: Pick<AuthUser, 'role' | 'employeeId'>,
  ) {
    const scope = await this.scopeFor(organizationId, user);
    const { page, pageSize, skip, take } = getPaginationParams(query);

    let employeeFilter: string | { in: string[] } | undefined;
    if (query.employeeId) {
      assertEmployeeInScope(scope, query.employeeId, 'xem ca của');
      employeeFilter = query.employeeId;
    } else if (scope.mode === 'ids') {
      employeeFilter = {
        in: scope.employeeIds.length ? scope.employeeIds : ['__none__'],
      };
    }

    const where: Prisma.ShiftAssignmentWhereInput = {
      organizationId,
      ...(query.branchId && { branchId: query.branchId }),
      ...(query.policyId && { policyId: query.policyId }),
      ...(employeeFilter !== undefined && { employeeId: employeeFilter }),
      ...(query.departmentId && {
        employee: { departmentId: query.departmentId },
      }),
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
        orderBy: [{ workDate: 'asc' }, { startAt: 'asc' }],
        include: ASSIGN_INCLUDE,
      }),
      this.prisma.shiftAssignment.count({ where }),
    ]);

    return buildPaginatedResult(items, total, page, pageSize);
  }

  async calendar(
    organizationId: string,
    query: ShiftCalendarQueryDto,
    user?: Pick<AuthUser, 'role' | 'employeeId'>,
  ) {
    const scope = await this.scopeFor(organizationId, user);
    let employeeFilter: string | { in: string[] } | undefined;
    if (query.employeeId) {
      assertEmployeeInScope(scope, query.employeeId, 'xem ca của');
      employeeFilter = query.employeeId;
    } else if (scope.mode === 'ids') {
      employeeFilter = {
        in: scope.employeeIds.length ? scope.employeeIds : ['__none__'],
      };
    }

    const from = parseWorkDate(query.from);
    const to = parseWorkDate(query.to);

    const items = await this.prisma.shiftAssignment.findMany({
      where: {
        organizationId,
        workDate: { gte: from, lte: to },
        ...(query.branchId && { branchId: query.branchId }),
        ...(employeeFilter !== undefined && { employeeId: employeeFilter }),
        ...(query.departmentId && {
          employee: { departmentId: query.departmentId },
        }),
      },
      orderBy: [{ workDate: 'asc' }, { startAt: 'asc' }],
      include: ASSIGN_INCLUDE,
      take: 5000,
    });

    return { from: workDateKey(from), to: workDateKey(to), items };
  }

  private async loadActivePolicy(organizationId: string, policyId: string) {
    const policy = await this.prisma.workShiftPolicy.findFirst({
      where: { id: policyId, organizationId, isActive: true },
    });
    if (!policy) throw new NotFoundException('Ca làm việc không tồn tại hoặc đã ngưng');
    return policy;
  }

  private async upsertAssignment(input: {
    organizationId: string;
    branchId: string;
    employeeId: string;
    policy: {
      id: string;
      startTime: string;
      endTime: string;
      crossesMidnight: boolean;
    };
    workDate: Date;
    forceOverwrite: boolean;
    note?: string;
    actor?: ActorCtx;
  }) {
    const { startAt, endAt } = resolveShiftWindow(input.workDate, input.policy);
    await this.timesheet.assertPeriodOpenForDate(
      input.organizationId,
      input.branchId,
      input.workDate,
    );

    const existing = await this.prisma.shiftAssignment.findFirst({
      where: {
        organizationId: input.organizationId,
        employeeId: input.employeeId,
        workDate: input.workDate,
      },
    });

    if (existing && !input.forceOverwrite) {
      return {
        status: 'conflict' as const,
        existing,
        workDate: workDateKey(input.workDate),
        employeeId: input.employeeId,
      };
    }

    if (existing?.locked) {
      throw new BadRequestException(
        `Ca ngày ${workDateKey(input.workDate)} đã khóa — không thể ghi đè`,
      );
    }

    if (existing && input.forceOverwrite) {
      const before = {
        policyId: existing.policyId,
        startAt: existing.startAt,
        endAt: existing.endAt,
      };
      const updated = await this.prisma.shiftAssignment.update({
        where: { id: existing.id },
        data: {
          branchId: input.branchId,
          policyId: input.policy.id,
          startAt,
          endAt,
          source: ShiftAssignmentSource.MANUAL,
          note: input.note,
        },
        include: ASSIGN_INCLUDE,
      });

      await this.audit.log({
        organizationId: input.organizationId,
        userId: input.actor?.userId,
        action: 'hrm.shift_assignment.overwrite',
        entityType: 'ShiftAssignment',
        entityId: updated.id,
        metadata: {
          before,
          after: {
            policyId: input.policy.id,
            startAt,
            endAt,
            workDate: workDateKey(input.workDate),
            employeeId: input.employeeId,
          },
          reason: 'forceOverwrite',
        },
        ipAddress: input.actor?.ipAddress,
      });

      return { status: 'overwritten' as const, assignment: updated };
    }

    const created = await this.prisma.shiftAssignment.create({
      data: {
        organizationId: input.organizationId,
        branchId: input.branchId,
        employeeId: input.employeeId,
        policyId: input.policy.id,
        workDate: input.workDate,
        startAt,
        endAt,
        source: ShiftAssignmentSource.POLICY,
        note: input.note,
      },
      include: ASSIGN_INCLUDE,
    });

    await this.audit.log({
      organizationId: input.organizationId,
      userId: input.actor?.userId,
      action: 'hrm.shift_assignment.create',
      entityType: 'ShiftAssignment',
      entityId: created.id,
      metadata: {
        after: {
          employeeId: input.employeeId,
          workDate: workDateKey(input.workDate),
          policyId: input.policy.id,
          startAt,
          endAt,
        },
      },
      ipAddress: input.actor?.ipAddress,
    });

    return { status: 'created' as const, assignment: created };
  }

  async create(
    organizationId: string,
    dto: CreateShiftAssignmentDto,
    actor?: ActorCtx,
  ) {
    this.assertCanWriteAssignments(actor?.role);
    const scope = await this.scopeFor(
      organizationId,
      actor?.role ? { role: actor.role, employeeId: actor.employeeId } : undefined,
    );
    assertEmployeeInScope(scope, dto.employeeId, 'phân ca cho');

    const employee = await this.employees.ensureEmployee(organizationId, dto.employeeId);
    const branchId = dto.branchId ?? employee.branchId;
    if (!branchId) throw new BadRequestException('Nhân viên chưa gắn chi nhánh');

    const policy = await this.loadActivePolicy(organizationId, dto.policyId);
    const workDate = parseWorkDate(dto.workDate);

    const result = await this.upsertAssignment({
      organizationId,
      branchId,
      employeeId: dto.employeeId,
      policy,
      workDate,
      forceOverwrite: !!dto.forceOverwrite,
      note: dto.note,
      actor,
    });

    if (result.status === 'conflict') {
      throw new ConflictException({
        message: 'Nhân viên đã có ca trong ngày này — xác nhận để ghi đè',
        conflict: {
          workDate: result.workDate,
          employeeId: result.employeeId,
          existingId: result.existing.id,
          existingPolicyId: result.existing.policyId,
        },
      });
    }

    return result.assignment;
  }

  async bulkAssign(
    organizationId: string,
    dto: BulkShiftAssignmentDto,
    actor?: ActorCtx,
  ) {
    this.assertCanWriteAssignments(actor?.role);
    const scope = await this.scopeFor(
      organizationId,
      actor?.role ? { role: actor.role, employeeId: actor.employeeId } : undefined,
    );

    const from = parseWorkDate(dto.fromDate);
    const to = parseWorkDate(dto.toDate);
    if (to < from) throw new BadRequestException('Khoảng ngày không hợp lệ');

    const policy = await this.loadActivePolicy(organizationId, dto.policyId);
    const dates = this.eachDateInRange(from, to, dto.weekdays);

    let employeeIds = dto.employeeIds ?? [];
    if (!employeeIds.length) {
      const employees = await this.prisma.employee.findMany({
        where: {
          organizationId,
          isActive: true,
          ...(dto.branchId && { branchId: dto.branchId }),
          ...(dto.departmentId && { departmentId: dto.departmentId }),
          ...(policy.branchId && !dto.branchId && { branchId: policy.branchId }),
        },
        select: { id: true, branchId: true },
      });
      employeeIds = employees.map((e) => e.id);
    }

    for (const eid of employeeIds) {
      assertEmployeeInScope(scope, eid, 'phân ca cho');
    }

    if (!employeeIds.length) {
      throw new BadRequestException('Không có nhân viên nào để phân ca');
    }

    const employeeRows = await this.prisma.employee.findMany({
      where: { organizationId, id: { in: employeeIds } },
      select: { id: true, branchId: true },
    });
    const branchByEmp = new Map(employeeRows.map((e) => [e.id, e.branchId]));

    const created: unknown[] = [];
    const overwritten: unknown[] = [];
    const conflicts: Array<{
      employeeId: string;
      workDate: string;
      existingId: string;
    }> = [];

    for (const employeeId of employeeIds) {
      const empBranch = dto.branchId ?? branchByEmp.get(employeeId) ?? policy.branchId;
      if (!empBranch) continue;

      for (const workDate of dates) {
        const result = await this.upsertAssignment({
          organizationId,
          branchId: empBranch,
          employeeId,
          policy,
          workDate,
          forceOverwrite: !!dto.forceOverwrite,
          note: dto.note,
          actor,
        });
        if (result.status === 'conflict') {
          conflicts.push({
            employeeId,
            workDate: result.workDate,
            existingId: result.existing.id,
          });
        } else if (result.status === 'created') {
          created.push(result.assignment);
        } else {
          overwritten.push(result.assignment);
        }
      }
    }

    if (conflicts.length && !dto.forceOverwrite) {
      throw new ConflictException({
        message: `${conflicts.length} ca trùng — gửi lại với forceOverwrite=true để ghi đè`,
        conflicts: conflicts.slice(0, 50),
        conflictCount: conflicts.length,
        createdCount: created.length,
      });
    }

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.shift_assignment.bulk',
      entityType: 'ShiftAssignment',
      metadata: {
        after: {
          policyId: dto.policyId,
          fromDate: dto.fromDate,
          toDate: dto.toDate,
          weekdays: dto.weekdays,
          employeeCount: employeeIds.length,
          created: created.length,
          overwritten: overwritten.length,
          forceOverwrite: !!dto.forceOverwrite,
        },
      },
      ipAddress: actor?.ipAddress,
    });

    return {
      created: created.length,
      overwritten: overwritten.length,
      conflicts: conflicts.length,
      items: [...created, ...overwritten].slice(0, 100),
    };
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateShiftAssignmentDto,
    actor?: ActorCtx,
  ) {
    this.assertCanWriteAssignments(actor?.role);
    const existing = await this.prisma.shiftAssignment.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException('Phân ca không tồn tại');

    const scope = await this.scopeFor(
      organizationId,
      actor?.role ? { role: actor.role, employeeId: actor.employeeId } : undefined,
    );
    assertEmployeeInScope(scope, existing.employeeId, 'sửa ca của');

    if (existing.locked) {
      throw new BadRequestException('Ca đã khóa — không thể sửa');
    }

    await this.timesheet.assertPeriodOpenForDate(
      organizationId,
      existing.branchId,
      existing.workDate,
    );

    let startAt = existing.startAt;
    let endAt = existing.endAt;
    let policyId = existing.policyId;

    if (dto.policyId) {
      const policy = await this.loadActivePolicy(organizationId, dto.policyId);
      const window = resolveShiftWindow(existing.workDate, policy);
      startAt = window.startAt;
      endAt = window.endAt;
      policyId = policy.id;
    }

    const before = {
      policyId: existing.policyId,
      startAt: existing.startAt,
      endAt: existing.endAt,
      note: existing.note,
    };

    const updated = await this.prisma.shiftAssignment.update({
      where: { id },
      data: {
        policyId,
        startAt,
        endAt,
        ...(dto.note !== undefined && { note: dto.note }),
      },
      include: ASSIGN_INCLUDE,
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.shift_assignment.update',
      entityType: 'ShiftAssignment',
      entityId: id,
      metadata: { before, after: { policyId, startAt, endAt, note: dto.note } },
      ipAddress: actor?.ipAddress,
    });

    return updated;
  }

  async remove(organizationId: string, id: string, actor?: ActorCtx) {
    this.assertCanWriteAssignments(actor?.role);
    const existing = await this.prisma.shiftAssignment.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException('Phân ca không tồn tại');

    const scope = await this.scopeFor(
      organizationId,
      actor?.role ? { role: actor.role, employeeId: actor.employeeId } : undefined,
    );
    assertEmployeeInScope(scope, existing.employeeId, 'xóa ca của');

    if (existing.locked) {
      throw new BadRequestException('Ca đã khóa — không thể xóa');
    }

    await this.timesheet.assertPeriodOpenForDate(
      organizationId,
      existing.branchId,
      existing.workDate,
    );

    // Nếu ngày đã có punch — không xóa cứng assignment (giữ để tính công)
    const punchCount = await this.prisma.attendancePunch.count({
      where: {
        organizationId,
        employeeId: existing.employeeId,
        workDate: existing.workDate,
      },
    });
    if (punchCount > 0) {
      throw new BadRequestException(
        'Ngày đã có dữ liệu chấm công — không xóa phân ca. Hãy đổi ca thay vì xóa.',
      );
    }

    await this.prisma.shiftAssignment.delete({ where: { id } });
    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.shift_assignment.delete',
      entityType: 'ShiftAssignment',
      entityId: id,
      metadata: {
        before: {
          employeeId: existing.employeeId,
          workDate: workDateKey(existing.workDate),
          policyId: existing.policyId,
        },
      },
      ipAddress: actor?.ipAddress,
    });

    return { deleted: true, id };
  }
}
