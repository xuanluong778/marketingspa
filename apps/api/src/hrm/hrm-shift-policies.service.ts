import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  buildShiftPayloadFromPolicy,
  resolveShiftWindow,
} from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateWorkShiftPolicyDto,
  UpdateWorkShiftPolicyDto,
} from './dto/shift.dto';
import type { HrmActor } from './hrm-employees.service';
import { SYSTEM_ROLES } from '../common/constants/roles';
import { isHrmOrgWideRole } from './hrm-attendance-scope';

type ActorCtx = HrmActor & { role?: string; employeeId?: string | null };

function assertCanManagePolicies(role?: string) {
  if (!role || (!isHrmOrgWideRole(role) && role !== SYSTEM_ROLES.MANAGER)) {
    throw new ForbiddenException('Không có quyền quản lý ca làm việc');
  }
}

@Injectable()
export class HrmShiftPoliciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(
    organizationId: string,
    query?: { branchId?: string; includeInactive?: boolean },
  ) {
    return this.prisma.workShiftPolicy.findMany({
      where: {
        organizationId,
        ...(query?.branchId && { branchId: query.branchId }),
        ...(!query?.includeInactive && { isActive: true }),
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: {
        branch: { select: { id: true, name: true } },
        versions: { orderBy: { version: 'desc' }, take: 1 },
        _count: { select: { assignments: true } },
      },
    });
  }

  async findOne(organizationId: string, id: string) {
    const policy = await this.prisma.workShiftPolicy.findFirst({
      where: { id, organizationId },
      include: {
        branch: { select: { id: true, name: true } },
        versions: { orderBy: { version: 'desc' } },
        _count: { select: { assignments: true } },
      },
    });
    if (!policy) throw new NotFoundException('Ca làm việc không tồn tại');
    return policy;
  }

  private normalizeTimes(dto: {
    startTime: string;
    endTime: string;
    crossesMidnight?: boolean;
  }) {
    const [sh, sm] = dto.startTime.split(':').map(Number);
    const [eh, em] = dto.endTime.split(':').map(Number);
    const startMins = (sh ?? 0) * 60 + (sm ?? 0);
    const endMins = (eh ?? 0) * 60 + (em ?? 0);
    const crossesMidnight =
      dto.crossesMidnight === true || endMins <= startMins;
    return { crossesMidnight };
  }

  async create(organizationId: string, dto: CreateWorkShiftPolicyDto, actor?: ActorCtx) {
    assertCanManagePolicies(actor?.role);
    const { crossesMidnight } = this.normalizeTimes(dto);
    const effectiveFrom = dto.effectiveFrom
      ? new Date(dto.effectiveFrom)
      : new Date();

    const fields = {
      startTime: dto.startTime,
      endTime: dto.endTime,
      breakMinutes: dto.breakMinutes ?? 60,
      lateGraceMinutes: dto.lateGraceMinutes ?? 0,
      earlyLeaveGraceMinutes: dto.earlyLeaveGraceMinutes ?? 0,
      otBeforeMinutes: dto.otBeforeMinutes ?? 0,
      otAfterMinutes: dto.otAfterMinutes ?? 0,
      crossesMidnight,
    };
    const payload = buildShiftPayloadFromPolicy(fields);

    try {
      const policy = await this.prisma.workShiftPolicy.create({
        data: {
          organizationId,
          branchId: dto.branchId,
          name: dto.name.trim(),
          code: dto.code?.trim().toUpperCase(),
          ...fields,
          effectiveFrom,
          effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
          currentVersion: 1,
          createdById: actor?.userId,
          versions: {
            create: {
              version: 1,
              payload: payload as Prisma.InputJsonValue,
              createdById: actor?.userId,
            },
          },
        },
        include: {
          versions: true,
          branch: { select: { id: true, name: true } },
          _count: { select: { assignments: true } },
        },
      });

      await this.audit.log({
        organizationId,
        userId: actor?.userId,
        action: 'hrm.shift_policy.create',
        entityType: 'WorkShiftPolicy',
        entityId: policy.id,
        metadata: { after: { name: policy.name, code: policy.code, ...fields } },
        ipAddress: actor?.ipAddress,
      });

      return policy;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Mã ca đã tồn tại trong organization');
      }
      throw e;
    }
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateWorkShiftPolicyDto,
    actor?: ActorCtx,
  ) {
    assertCanManagePolicies(actor?.role);
    const existing = await this.findOne(organizationId, id);
    const before = {
      name: existing.name,
      branchId: existing.branchId,
      startTime: existing.startTime,
      endTime: existing.endTime,
      breakMinutes: existing.breakMinutes,
      lateGraceMinutes: existing.lateGraceMinutes,
      earlyLeaveGraceMinutes: existing.earlyLeaveGraceMinutes,
      otBeforeMinutes: existing.otBeforeMinutes,
      otAfterMinutes: existing.otAfterMinutes,
      crossesMidnight: existing.crossesMidnight,
      isActive: existing.isActive,
    };

    const startTime = dto.startTime ?? existing.startTime;
    const endTime = dto.endTime ?? existing.endTime;
    const { crossesMidnight } = this.normalizeTimes({
      startTime,
      endTime,
      crossesMidnight: dto.crossesMidnight ?? existing.crossesMidnight,
    });

    const nextFields = {
      startTime,
      endTime,
      breakMinutes: dto.breakMinutes ?? existing.breakMinutes,
      lateGraceMinutes: dto.lateGraceMinutes ?? existing.lateGraceMinutes,
      earlyLeaveGraceMinutes:
        dto.earlyLeaveGraceMinutes ?? existing.earlyLeaveGraceMinutes,
      otBeforeMinutes: dto.otBeforeMinutes ?? existing.otBeforeMinutes,
      otAfterMinutes: dto.otAfterMinutes ?? existing.otAfterMinutes,
      crossesMidnight,
    };

    const scheduleChanged =
      nextFields.startTime !== existing.startTime ||
      nextFields.endTime !== existing.endTime ||
      nextFields.breakMinutes !== existing.breakMinutes ||
      nextFields.lateGraceMinutes !== existing.lateGraceMinutes ||
      nextFields.earlyLeaveGraceMinutes !== existing.earlyLeaveGraceMinutes ||
      nextFields.otBeforeMinutes !== existing.otBeforeMinutes ||
      nextFields.otAfterMinutes !== existing.otAfterMinutes ||
      nextFields.crossesMidnight !== existing.crossesMidnight;

    const payload = buildShiftPayloadFromPolicy(nextFields);
    const nextVersion = existing.currentVersion + (scheduleChanged ? 1 : 0);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (scheduleChanged) {
        await tx.workShiftPolicyVersion.create({
          data: {
            policyId: id,
            version: nextVersion,
            payload: payload as Prisma.InputJsonValue,
            createdById: actor?.userId,
          },
        });
      }

      return tx.workShiftPolicy.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.branchId !== undefined && { branchId: dto.branchId }),
          ...nextFields,
          ...(dto.effectiveTo !== undefined && {
            effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
          }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          ...(scheduleChanged && { currentVersion: nextVersion }),
        },
        include: {
          branch: { select: { id: true, name: true } },
          versions: { orderBy: { version: 'desc' }, take: 1 },
          _count: { select: { assignments: true } },
        },
      });
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.shift_policy.update',
      entityType: 'WorkShiftPolicy',
      entityId: id,
      metadata: { before, after: dto as Prisma.InputJsonValue },
      ipAddress: actor?.ipAddress,
    });

    return updated;
  }

  async setActive(
    organizationId: string,
    id: string,
    isActive: boolean,
    actor?: ActorCtx,
  ) {
    assertCanManagePolicies(actor?.role);
    const existing = await this.findOne(organizationId, id);
    if (existing.isActive === isActive) return existing;

    const updated = await this.prisma.workShiftPolicy.update({
      where: { id },
      data: { isActive },
      include: {
        branch: { select: { id: true, name: true } },
        _count: { select: { assignments: true } },
      },
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: isActive ? 'hrm.shift_policy.activate' : 'hrm.shift_policy.deactivate',
      entityType: 'WorkShiftPolicy',
      entityId: id,
      metadata: {
        before: { isActive: existing.isActive },
        after: { isActive },
      },
      ipAddress: actor?.ipAddress,
    });

    return updated;
  }

  /** Không xóa cứng nếu đã có phân ca. Ngưng (isActive=false) thay thế. */
  async remove(organizationId: string, id: string, actor?: ActorCtx) {
    assertCanManagePolicies(actor?.role);
    const existing = await this.findOne(organizationId, id);

    const assignmentCount = await this.prisma.shiftAssignment.count({
      where: { organizationId, policyId: id },
    });

    if (assignmentCount > 0) {
      const deactivated = await this.setActive(organizationId, id, false, actor);
      return {
        deleted: false,
        deactivated: true,
        message:
          'Ca đã có phân ca — không xóa cứng. Đã chuyển sang trạng thái ngưng.',
        policy: deactivated,
      };
    }

    await this.prisma.workShiftPolicyVersion.deleteMany({ where: { policyId: id } });
    await this.prisma.workShiftPolicy.delete({ where: { id } });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.shift_policy.delete',
      entityType: 'WorkShiftPolicy',
      entityId: id,
      metadata: { before: { name: existing.name, code: existing.code } },
      ipAddress: actor?.ipAddress,
    });

    return { deleted: true, id };
  }

  resolveWindowForPolicy(
    policy: {
      startTime: string;
      endTime: string;
      crossesMidnight: boolean;
    },
    workDate: Date,
  ) {
    return resolveShiftWindow(workDate, {
      startTime: policy.startTime,
      endTime: policy.endTime,
      crossesMidnight: policy.crossesMidnight,
    });
  }
}
