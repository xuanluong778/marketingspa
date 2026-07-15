import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { LeadPipelineStatus, OrderStatus, AppointmentStatus } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateEmployeeDto, UpdateEmployeeDto, EmployeeQueryDto } from './dto/employee.dto';
import { buildPaginatedResult, getPaginationParams } from '../common/utils/pagination.util';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(organizationId: string, query: EmployeeQueryDto) {
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const where = {
      organizationId,
      ...(query.branchId && { branchId: query.branchId }),
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' as const } },
          { phone: { contains: query.search } },
          { email: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { branch: true, user: { include: { role: true } } },
      }),
      this.prisma.employee.count({ where }),
    ]);

    return buildPaginatedResult(items, total, page, pageSize);
  }

  async findOne(organizationId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, organizationId },
      include: { branch: true, user: { include: { role: true } } },
    });
    if (!employee) throw new NotFoundException('Nhân viên không tồn tại');
    return employee;
  }

  async create(
    organizationId: string,
    dto: CreateEmployeeDto,
    actor?: { userId?: string; ipAddress?: string },
  ) {
    const employee = await this.prisma.employee.create({
      data: {
        organizationId,
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        position: dto.position,
        branchId: dto.branchId,
      },
      include: { branch: true },
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'employee.create',
      entityType: 'Employee',
      entityId: employee.id,
      metadata: { after: { name: employee.name, branchId: employee.branchId, position: employee.position } },
      ipAddress: actor?.ipAddress,
    });

    return employee;
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateEmployeeDto,
    actor?: { userId?: string; ipAddress?: string },
  ) {
    const before = await this.findOne(organizationId, id);

    if (dto.roleCode) {
      const role = await this.prisma.role.findFirst({
        where: { organizationId, code: dto.roleCode },
      });
      if (!role) throw new BadRequestException(`Role ${dto.roleCode} không tồn tại`);

      const employee = await this.prisma.employee.findFirst({
        where: { id, organizationId },
        include: { user: true },
      });
      if (employee?.user) {
        await this.prisma.user.update({
          where: { id: employee.user.id },
          data: { roleId: role.id },
        });
      }
    }

    const { roleCode: _roleCode, ...data } = dto;
    void _roleCode;
    const employee = await this.prisma.employee.update({
      where: { id },
      data,
      include: { branch: true, user: { include: { role: true } } },
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'employee.update',
      entityType: 'Employee',
      entityId: id,
      metadata: {
        before: {
          name: before.name,
          branchId: before.branchId,
          position: before.position,
          isActive: before.isActive,
          roleCode: before.user?.role?.code,
        },
        after: {
          name: employee.name,
          branchId: employee.branchId,
          position: employee.position,
          isActive: employee.isActive,
          roleCode: employee.user?.role?.code ?? dto.roleCode,
        },
      },
      ipAddress: actor?.ipAddress,
    });

    return employee;
  }

  async remove(
    organizationId: string,
    id: string,
    actor?: { userId?: string; ipAddress?: string },
  ) {
    await this.findOne(organizationId, id);
    const employee = await this.prisma.employee.update({
      where: { id },
      data: { isActive: false },
    });

    await this.audit.log({
      organizationId,
      userId: actor?.userId,
      action: 'employee.deactivate',
      entityType: 'Employee',
      entityId: id,
      metadata: { before: { isActive: true }, after: { isActive: false } },
      ipAddress: actor?.ipAddress,
    });

    return employee;
  }

  /** KPI hiệu suất nhân viên theo khoảng thời gian */
  async getPerformance(
    organizationId: string,
    employeeId: string,
    query: { from?: string; to?: string },
  ) {
    await this.findOne(organizationId, employeeId);

    const to = query.to ? new Date(query.to) : new Date();
    to.setHours(23, 59, 59, 999);
    const from = query.from ? new Date(query.from) : new Date(to.getFullYear(), to.getMonth(), 1);
    from.setHours(0, 0, 0, 0);

    const leadWhere = {
      organizationId,
      assignedToId: employeeId,
      createdAt: { gte: from, lte: to },
    };

    const contactedStatuses = [
      LeadPipelineStatus.CONTACTED,
      LeadPipelineStatus.BOOKED,
      LeadPipelineStatus.VISITED,
      LeadPipelineStatus.PURCHASED,
    ];

    const arrivedStatuses = [AppointmentStatus.ARRIVED, AppointmentStatus.COMPLETED];

    const [
      leadsReceived,
      leadsContacted,
      appointmentsCreated,
      customersArrived,
      customersPurchased,
      revenueAgg,
    ] = await Promise.all([
      this.prisma.lead.count({ where: leadWhere }),
      this.prisma.lead.count({
        where: { ...leadWhere, pipelineStatus: { in: contactedStatuses } },
      }),
      this.prisma.appointment.count({
        where: {
          organizationId,
          employeeId,
          createdAt: { gte: from, lte: to },
        },
      }),
      this.prisma.appointment.count({
        where: {
          organizationId,
          employeeId,
          scheduledAt: { gte: from, lte: to },
          status: { in: arrivedStatuses },
        },
      }),
      this.prisma.lead.count({
        where: { ...leadWhere, pipelineStatus: LeadPipelineStatus.PURCHASED },
      }),
      this.prisma.order.aggregate({
        where: {
          organizationId,
          status: OrderStatus.PAID,
          orderedAt: { gte: from, lte: to },
          customer: {
            leads: { some: { assignedToId: employeeId } },
          },
        },
        _sum: { total: true },
      }),
    ]);

    const revenue = Number(revenueAgg._sum.total ?? 0);
    const closeRate =
      leadsReceived > 0 ? Math.round((customersPurchased / leadsReceived) * 1000) / 10 : null;

    return {
      employeeId,
      from: from.toISOString(),
      to: to.toISOString(),
      leadsReceived,
      leadsContacted,
      appointmentsCreated,
      customersArrived,
      customersPurchased,
      revenue,
      closeRate,
    };
  }
}
