import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TimesheetStatus } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateTimesheetPeriodDto,
  TimesheetPeriodQueryDto,
} from './dto/attendance.dto';
import type { HrmActor } from './hrm-employees.service';
import { parseWorkDate } from '@marketingspa/database';

@Injectable()
export class HrmTimesheetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string, query: TimesheetPeriodQueryDto) {
    return this.prisma.timesheetPeriod.findMany({
      where: {
        organizationId,
        ...(query.branchId !== undefined && { branchId: query.branchId }),
        ...(query.year !== undefined && { year: query.year }),
        ...(query.month !== undefined && { month: query.month }),
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: {
        lockedBy: { select: { id: true, name: true, email: true } },
        branch: { select: { id: true, name: true } },
        _count: { select: { attendanceDays: true } },
      },
    });
  }

  async create(organizationId: string, dto: CreateTimesheetPeriodDto, actor?: HrmActor) {
    try {
      const period = await this.prisma.timesheetPeriod.create({
        data: {
          organizationId,
          branchId: dto.branchId ?? null,
          year: dto.year,
          month: dto.month,
        },
      });

      await this.audit.log({
        organizationId,
        userId: actor?.userId,
        action: 'hrm.timesheet.create',
        entityType: 'TimesheetPeriod',
        entityId: period.id,
        metadata: { after: { year: dto.year, month: dto.month, branchId: dto.branchId ?? null } },
        ipAddress: actor?.ipAddress,
      });

      return period;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Kỳ bảng công đã tồn tại');
      }
      throw e;
    }
  }

  async getOrCreateForDate(
    organizationId: string,
    branchId: string | null,
    workDate: Date,
  ) {
    const year = workDate.getUTCFullYear();
    const month = workDate.getUTCMonth() + 1;

    const existing = await this.prisma.timesheetPeriod.findFirst({
      where: {
        organizationId,
        branchId,
        year,
        month,
      },
    });
    if (existing) return existing;

    return this.prisma.timesheetPeriod.create({
      data: { organizationId, branchId, year, month },
    });
  }

  async assertPeriodOpenForDate(
    organizationId: string,
    branchId: string | null,
    workDate: Date,
  ) {
    const year = workDate.getUTCFullYear();
    const month = workDate.getUTCMonth() + 1;

    const period = await this.prisma.timesheetPeriod.findFirst({
      where: { organizationId, branchId, year, month },
    });

    if (period?.status === TimesheetStatus.LOCKED) {
      throw new BadRequestException('Bảng công tháng này đã khóa — không thể sửa trực tiếp');
    }
  }

  async lock(organizationId: string, id: string, actor?: HrmActor) {
    const period = await this.findPeriod(organizationId, id);
    if (period.status === TimesheetStatus.LOCKED) return period;

    const updated = await this.prisma.timesheetPeriod.update({
      where: { id },
      data: {
        status: TimesheetStatus.LOCKED,
        lockedAt: new Date(),
        lockedById: actor?.userId,
        unlockReason: null,
      },
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.timesheet.lock',
      entityType: 'TimesheetPeriod',
      entityId: id,
      metadata: { after: { status: TimesheetStatus.LOCKED } },
      ipAddress: actor?.ipAddress,
    });

    return updated;
  }

  async unlock(
    organizationId: string,
    id: string,
    reason: string,
    actor?: HrmActor,
  ) {
    const period = await this.findPeriod(organizationId, id);

    const updated = await this.prisma.timesheetPeriod.update({
      where: { id: period.id },
      data: {
        status: TimesheetStatus.OPEN,
        lockedAt: null,
        lockedById: null,
        unlockReason: reason,
      },
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.timesheet.unlock',
      entityType: 'TimesheetPeriod',
      entityId: id,
      metadata: { after: { status: TimesheetStatus.OPEN, unlockReason: reason } },
      ipAddress: actor?.ipAddress,
    });

    return updated;
  }

  async findPeriod(organizationId: string, id: string) {
    const period = await this.prisma.timesheetPeriod.findFirst({
      where: { id, organizationId },
    });
    if (!period) throw new NotFoundException('Kỳ bảng công không tồn tại');
    return period;
  }

  periodForWorkDate(workDateInput: string | Date) {
    const workDate = parseWorkDate(workDateInput);
    return {
      workDate,
      year: workDate.getUTCFullYear(),
      month: workDate.getUTCMonth() + 1,
    };
  }
}
