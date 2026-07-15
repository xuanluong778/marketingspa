import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateWorkShiftPolicyDto,
  CreateWorkShiftPolicyVersionDto,
  UpdateWorkShiftPolicyDto,
} from './dto/shift.dto';
import type { HrmActor } from './hrm-employees.service';

@Injectable()
export class HrmShiftPoliciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(organizationId: string, branchId?: string) {
    return this.prisma.workShiftPolicy.findMany({
      where: {
        organizationId,
        ...(branchId && { branchId }),
      },
      orderBy: { effectiveFrom: 'desc' },
      include: {
        branch: { select: { id: true, name: true } },
        versions: { orderBy: { version: 'desc' }, take: 1 },
      },
    });
  }

  async findOne(organizationId: string, id: string) {
    const policy = await this.prisma.workShiftPolicy.findFirst({
      where: { id, organizationId },
      include: {
        branch: { select: { id: true, name: true } },
        versions: { orderBy: { version: 'desc' } },
      },
    });
    if (!policy) throw new NotFoundException('Chính sách ca không tồn tại');
    return policy;
  }

  async create(organizationId: string, dto: CreateWorkShiftPolicyDto, actor?: HrmActor) {
    try {
      const policy = await this.prisma.workShiftPolicy.create({
        data: {
          organizationId,
          branchId: dto.branchId,
          name: dto.name,
          code: dto.code,
          effectiveFrom: new Date(dto.effectiveFrom),
          effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
          currentVersion: 1,
          createdById: actor?.userId,
          versions: {
            create: {
              version: 1,
              payload: dto.payload as Prisma.InputJsonValue,
              createdById: actor?.userId,
            },
          },
        },
        include: { versions: true },
      });

      await this.audit.log({
        organizationId,
        userId: actor?.userId,
        action: 'hrm.shift_policy.create',
        entityType: 'WorkShiftPolicy',
        entityId: policy.id,
        metadata: { after: { name: policy.name, code: policy.code } },
        ipAddress: actor?.ipAddress,
      });

      return policy;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Mã chính sách ca đã tồn tại');
      }
      throw e;
    }
  }

  async addVersion(
    organizationId: string,
    id: string,
    dto: CreateWorkShiftPolicyVersionDto,
    actor?: HrmActor,
  ) {
    const policy = await this.findOne(organizationId, id);
    const nextVersion = policy.currentVersion + 1;

    const [version] = await this.prisma.$transaction([
      this.prisma.workShiftPolicyVersion.create({
        data: {
          policyId: id,
          version: nextVersion,
          payload: dto.payload as Prisma.InputJsonValue,
          createdById: actor?.userId,
        },
      }),
      this.prisma.workShiftPolicy.update({
        where: { id },
        data: { currentVersion: nextVersion },
      }),
    ]);

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.shift_policy.version',
      entityType: 'WorkShiftPolicy',
      entityId: id,
      metadata: { after: { version: nextVersion } },
      ipAddress: actor?.ipAddress,
    });

    return version;
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateWorkShiftPolicyDto,
    actor?: HrmActor,
  ) {
    await this.findOne(organizationId, id);
    const updated = await this.prisma.workShiftPolicy.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.effectiveTo !== undefined && {
          effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.shift_policy.update',
      entityType: 'WorkShiftPolicy',
      entityId: id,
      metadata: { after: { ...dto } as Prisma.InputJsonValue },
      ipAddress: actor?.ipAddress,
    });

    return updated;
  }
}
