import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import {
  EmployeeStatus,
  EmploymentContractStatus,
  Prisma,
} from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { buildPaginatedResult, getPaginationParams } from '../common/utils/pagination.util';
import {
  CreateHrmEmployeeDto,
  HrmEmployeeQueryDto,
  UpdateHrmEmployeeDto,
} from './dto/employee.dto';
import { CreateEmployeeAccountDto, ResetEmployeePasswordDto } from './dto/account.dto';

const BCRYPT_ROUNDS = 12;

export type HrmActor = { userId?: string; ipAddress?: string };

const employeeListInclude = {
  branch: true,
  department: true,
  manager: { select: { id: true, name: true, code: true, position: true } },
  user: { include: { role: true } },
} satisfies Prisma.EmployeeInclude;

@Injectable()
export class HrmEmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(organizationId: string, query: HrmEmployeeQueryDto) {
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const text = (query.q ?? query.search)?.trim();

    const where: Prisma.EmployeeWhereInput = {
      organizationId,
      ...(query.branchId && { branchId: query.branchId }),
      ...(query.departmentId && { departmentId: query.departmentId }),
      ...(query.status && { status: query.status }),
      ...(query.employmentType && { employmentType: query.employmentType }),
      ...(query.position && {
        position: { contains: query.position, mode: 'insensitive' },
      }),
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(text && {
        OR: [
          { name: { contains: text, mode: 'insensitive' } },
          { phone: { contains: text } },
          { email: { contains: text, mode: 'insensitive' } },
          { code: { contains: text, mode: 'insensitive' } },
          { position: { contains: text, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: employeeListInclude,
      }),
      this.prisma.employee.count({ where }),
    ]);

    return buildPaginatedResult(items, total, page, pageSize);
  }

  async findOne(organizationId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, organizationId },
      include: {
        ...employeeListInclude,
        contracts: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        _count: {
          select: { documents: { where: { isArchived: false } } },
        },
      },
    });
    if (!employee) throw new NotFoundException('Nhân viên không tồn tại');

    const { _count, ...rest } = employee;
    return {
      ...rest,
      documentsCount: _count.documents,
    };
  }

  async ensureEmployee(organizationId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, organizationId },
    });
    if (!employee) throw new NotFoundException('Nhân viên không tồn tại');
    return employee;
  }

  private parseDate(value?: string | null): Date | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    return new Date(value);
  }

  async create(organizationId: string, dto: CreateHrmEmployeeDto, actor?: HrmActor) {
    if (dto.managerId) {
      await this.ensureEmployee(organizationId, dto.managerId);
    }
    if (dto.departmentId) {
      const dept = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, organizationId },
      });
      if (!dept) throw new BadRequestException('Phòng ban không tồn tại');
    }
    if (dto.code) {
      const codeTaken = await this.prisma.employee.findFirst({
        where: { organizationId, code: dto.code },
      });
      if (codeTaken) throw new ConflictException('Mã nhân viên đã tồn tại');
    }

    const employee = await this.prisma.employee.create({
      data: {
        organizationId,
        name: dto.name,
        code: dto.code,
        phone: dto.phone,
        email: dto.email,
        position: dto.position,
        branchId: dto.branchId,
        departmentId: dto.departmentId,
        managerId: dto.managerId,
        employmentType: dto.employmentType,
        status: dto.status,
        avatarUrl: dto.avatarUrl,
        dateOfBirth: this.parseDate(dto.dateOfBirth) ?? undefined,
        legalIdNumber: dto.legalIdNumber,
        address: dto.address,
        startDate: this.parseDate(dto.startDate) ?? undefined,
        endDate: this.parseDate(dto.endDate) ?? undefined,
        hiredAt: this.parseDate(dto.hiredAt) ?? undefined,
        isActive: dto.isActive ?? true,
      },
      include: employeeListInclude,
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.employee.create',
      entityType: 'Employee',
      entityId: employee.id,
      metadata: {
        after: {
          name: employee.name,
          code: employee.code,
          branchId: employee.branchId,
          departmentId: employee.departmentId,
          employmentType: employee.employmentType,
          status: employee.status,
        },
      },
      ipAddress: actor?.ipAddress,
    });

    return employee;
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateHrmEmployeeDto,
    actor?: HrmActor,
  ) {
    const before = await this.findOne(organizationId, id);

    if (dto.managerId) {
      if (dto.managerId === id) {
        throw new BadRequestException('Không thể đặt chính mình làm quản lý');
      }
      await this.ensureEmployee(organizationId, dto.managerId);
    }
    if (dto.departmentId) {
      const dept = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, organizationId },
      });
      if (!dept) throw new BadRequestException('Phòng ban không tồn tại');
    }
    if (dto.code !== undefined && dto.code !== before.code) {
      const codeTaken = await this.prisma.employee.findFirst({
        where: { organizationId, code: dto.code, NOT: { id } },
      });
      if (codeTaken) throw new ConflictException('Mã nhân viên đã tồn tại');
    }

    const employee = await this.prisma.employee.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.position !== undefined && { position: dto.position }),
        ...(dto.branchId !== undefined && { branchId: dto.branchId }),
        ...(dto.departmentId !== undefined && { departmentId: dto.departmentId }),
        ...(dto.managerId !== undefined && { managerId: dto.managerId }),
        ...(dto.employmentType !== undefined && { employmentType: dto.employmentType }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
        ...(dto.dateOfBirth !== undefined && {
          dateOfBirth: this.parseDate(dto.dateOfBirth),
        }),
        ...(dto.legalIdNumber !== undefined && { legalIdNumber: dto.legalIdNumber }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.startDate !== undefined && { startDate: this.parseDate(dto.startDate) }),
        ...(dto.endDate !== undefined && { endDate: this.parseDate(dto.endDate) }),
        ...(dto.hiredAt !== undefined && { hiredAt: this.parseDate(dto.hiredAt) }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: employeeListInclude,
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.employee.update',
      entityType: 'Employee',
      entityId: id,
      metadata: {
        before: {
          name: before.name,
          code: before.code,
          branchId: before.branchId,
          departmentId: before.departmentId,
          managerId: before.managerId,
          employmentType: before.employmentType,
          status: before.status,
          isActive: before.isActive,
          position: before.position,
        },
        after: {
          name: employee.name,
          code: employee.code,
          branchId: employee.branchId,
          departmentId: employee.departmentId,
          managerId: employee.managerId,
          employmentType: employee.employmentType,
          status: employee.status,
          isActive: employee.isActive,
          position: employee.position,
        },
      },
      ipAddress: actor?.ipAddress,
    });

    return employee;
  }

  async deactivate(organizationId: string, id: string, actor?: HrmActor) {
    const before = await this.ensureEmployee(organizationId, id);

    const employee = await this.prisma.employee.update({
      where: { id },
      data: {
        status: EmployeeStatus.TERMINATED,
        isActive: false,
        endDate: before.endDate ?? new Date(),
      },
      include: employeeListInclude,
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.employee.deactivate',
      entityType: 'Employee',
      entityId: id,
      metadata: {
        before: { status: before.status, isActive: before.isActive },
        after: { status: employee.status, isActive: employee.isActive },
      },
      ipAddress: actor?.ipAddress,
    });

    return employee;
  }

  async createAccount(
    organizationId: string,
    employeeId: string,
    dto: CreateEmployeeAccountDto,
    actor?: HrmActor,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId },
      include: { user: true },
    });
    if (!employee) throw new NotFoundException('Nhân viên không tồn tại');
    if (employee.user) {
      throw new ConflictException('Nhân viên đã có tài khoản');
    }

    const emailTaken = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (emailTaken) throw new ConflictException('Email đã được sử dụng');

    const role = await this.prisma.role.findFirst({
      where: { organizationId, code: dto.roleCode },
    });
    if (!role) throw new BadRequestException(`Role ${dto.roleCode} không tồn tại`);

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name?.trim() || employee.name,
        organizationId,
        roleId: role.id,
        employeeId: employee.id,
      },
      include: { role: true },
    });

    if (!employee.email) {
      await this.prisma.employee.update({
        where: { id: employee.id },
        data: { email: dto.email },
      });
    }

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.account.create',
      entityType: 'Employee',
      entityId: employeeId,
      metadata: {
        after: {
          userId: user.id,
          email: user.email,
          roleCode: role.code,
        },
      },
      ipAddress: actor?.ipAddress,
    });

    const { passwordHash: _pw, ...safe } = user;
    void _pw;
    return safe;
  }

  async resetPassword(
    organizationId: string,
    employeeId: string,
    dto: ResetEmployeePasswordDto,
    actor?: HrmActor,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId },
      include: { user: true },
    });
    if (!employee) throw new NotFoundException('Nhân viên không tồn tại');
    if (!employee.user) {
      throw new BadRequestException('Nhân viên chưa có tài khoản');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: employee.user.id },
      data: { passwordHash },
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'hrm.account.reset_password',
      entityType: 'Employee',
      entityId: employeeId,
      metadata: { userId: employee.user.id },
      ipAddress: actor?.ipAddress,
    });

    return { success: true };
  }
}
