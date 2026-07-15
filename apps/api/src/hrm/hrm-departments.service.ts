import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateDepartmentDto, DepartmentQueryDto } from './dto/department.dto';
import type { HrmActor } from './hrm-employees.service';

@Injectable()
export class HrmDepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(organizationId: string, query: DepartmentQueryDto) {
    return this.prisma.department.findMany({
      where: {
        organizationId,
        ...(query.branchId && { branchId: query.branchId }),
        ...(query.isActive !== undefined && { isActive: query.isActive }),
      },
      orderBy: { name: 'asc' },
      include: {
        branch: { select: { id: true, name: true } },
        parent: { select: { id: true, name: true, code: true } },
        _count: { select: { employees: true, children: true } },
      },
    });
  }

  async create(organizationId: string, dto: CreateDepartmentDto, actor?: HrmActor) {
    if (dto.parentId) {
      const parent = await this.prisma.department.findFirst({
        where: { id: dto.parentId, organizationId },
      });
      if (!parent) throw new BadRequestException('Phòng ban cha không tồn tại');
    }
    if (dto.code) {
      const taken = await this.prisma.department.findFirst({
        where: { organizationId, code: dto.code },
      });
      if (taken) throw new ConflictException('Mã phòng ban đã tồn tại');
    }

    const department = await this.prisma.department.create({
      data: {
        organizationId,
        name: dto.name,
        code: dto.code,
        branchId: dto.branchId,
        parentId: dto.parentId,
        isActive: dto.isActive ?? true,
      },
      include: {
        branch: { select: { id: true, name: true } },
        parent: { select: { id: true, name: true, code: true } },
      },
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.department.create',
      entityType: 'Department',
      entityId: department.id,
      metadata: {
        after: {
          name: department.name,
          code: department.code,
          branchId: department.branchId,
          parentId: department.parentId,
        },
      },
      ipAddress: actor?.ipAddress,
    });

    return department;
  }
}
