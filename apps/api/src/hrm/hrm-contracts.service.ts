import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EmploymentContractStatus,
  Prisma,
} from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateEmploymentContractDto,
  UpdateEmploymentContractDto,
} from './dto/contract.dto';
import type { HrmActor } from './hrm-employees.service';
import { HrmEmployeesService } from './hrm-employees.service';

@Injectable()
export class HrmContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly employees: HrmEmployeesService,
  ) {}

  async listByEmployee(organizationId: string, employeeId: string) {
    await this.employees.ensureEmployee(organizationId, employeeId);
    return this.prisma.employmentContract.findMany({
      where: { organizationId, employeeId },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(
    organizationId: string,
    employeeId: string,
    dto: CreateEmploymentContractDto,
    actor?: HrmActor,
  ) {
    const employee = await this.employees.ensureEmployee(organizationId, employeeId);

    const contract = await this.prisma.employmentContract.create({
      data: {
        organizationId,
        employeeId,
        branchId: employee.branchId,
        title: dto.title,
        contractType: dto.contractType,
        status: dto.status ?? EmploymentContractStatus.DRAFT,
        salaryBase: dto.salaryBase !== undefined ? new Prisma.Decimal(dto.salaryBase) : undefined,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        notes: dto.notes,
        fileUrl: dto.fileUrl,
        code: dto.code,
        currency: dto.currency ?? 'VND',
        createdById: actor?.userId,
      },
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.contract.create',
      entityType: 'EmploymentContract',
      entityId: contract.id,
      metadata: {
        after: {
          employeeId,
          title: contract.title,
          contractType: contract.contractType,
          status: contract.status,
          salaryBase: contract.salaryBase?.toString() ?? null,
          startDate: contract.startDate,
          endDate: contract.endDate,
          version: contract.version,
        },
      },
      ipAddress: actor?.ipAddress,
    });

    return contract;
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateEmploymentContractDto,
    actor?: HrmActor,
  ) {
    const existing = await this.prisma.employmentContract.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException('Hợp đồng không tồn tại');

    const termsChanged =
      (dto.salaryBase !== undefined &&
        String(dto.salaryBase) !== (existing.salaryBase?.toString() ?? undefined)) ||
      (dto.contractType !== undefined && dto.contractType !== existing.contractType) ||
      (dto.startDate !== undefined &&
        new Date(dto.startDate).getTime() !== existing.startDate.getTime()) ||
      (dto.endDate !== undefined &&
        (dto.endDate === null
          ? existing.endDate !== null
          : !existing.endDate ||
            new Date(dto.endDate).getTime() !== existing.endDate.getTime()));

    if (termsChanged) {
      const result = await this.prisma.$transaction(async (tx) => {
        await tx.employmentContract.update({
          where: { id: existing.id },
          data: { status: EmploymentContractStatus.TERMINATED },
        });

        const nextStatus =
          dto.status ??
          (existing.status === EmploymentContractStatus.DRAFT
            ? EmploymentContractStatus.DRAFT
            : EmploymentContractStatus.ACTIVE);

        return tx.employmentContract.create({
          data: {
            organizationId,
            employeeId: existing.employeeId,
            branchId: existing.branchId,
            title: dto.title ?? existing.title,
            contractType: dto.contractType ?? existing.contractType,
            status: nextStatus,
            salaryBase:
              dto.salaryBase !== undefined
                ? new Prisma.Decimal(dto.salaryBase)
                : existing.salaryBase,
            currency: dto.currency ?? existing.currency,
            startDate: dto.startDate ? new Date(dto.startDate) : existing.startDate,
            endDate:
              dto.endDate === undefined
                ? existing.endDate
                : dto.endDate === null
                  ? null
                  : new Date(dto.endDate),
            notes: dto.notes === undefined ? existing.notes : dto.notes,
            fileUrl: dto.fileUrl === undefined ? existing.fileUrl : dto.fileUrl,
            code: dto.code === undefined ? existing.code : dto.code,
            version: existing.version + 1,
            previousContractId: existing.id,
            createdById: actor?.userId,
          },
        });
      });

      await this.audit.log({
        organizationId,
        userId: actor?.userId,
        action: 'hrm.contract.version',
        entityType: 'EmploymentContract',
        entityId: result.id,
        metadata: {
          before: {
            id: existing.id,
            version: existing.version,
            salaryBase: existing.salaryBase?.toString() ?? null,
            contractType: existing.contractType,
            startDate: existing.startDate,
            endDate: existing.endDate,
            status: existing.status,
          },
          after: {
            id: result.id,
            version: result.version,
            previousContractId: result.previousContractId,
            salaryBase: result.salaryBase?.toString() ?? null,
            contractType: result.contractType,
            startDate: result.startDate,
            endDate: result.endDate,
            status: result.status,
          },
        },
        ipAddress: actor?.ipAddress,
      });

      return result;
    }

    if (
      dto.title === undefined &&
      dto.status === undefined &&
      dto.notes === undefined &&
      dto.fileUrl === undefined &&
      dto.code === undefined &&
      dto.currency === undefined
    ) {
      throw new BadRequestException('Không có thay đổi');
    }

    const updated = await this.prisma.employmentContract.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.fileUrl !== undefined && { fileUrl: dto.fileUrl }),
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
      },
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.contract.update',
      entityType: 'EmploymentContract',
      entityId: id,
      metadata: {
        before: {
          title: existing.title,
          status: existing.status,
          notes: existing.notes,
          fileUrl: existing.fileUrl,
        },
        after: {
          title: updated.title,
          status: updated.status,
          notes: updated.notes,
          fileUrl: updated.fileUrl,
        },
      },
      ipAddress: actor?.ipAddress,
    });

    return updated;
  }
}
