import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Customer, Prisma } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantOwnershipService } from '../common/services/tenant-ownership.service';
import { CreateCustomerDto, UpdateCustomerDto, CustomerQueryDto } from './dto/customer.dto';
import { buildPaginatedResult, getPaginationParams } from '../common/utils/pagination.util';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenant: TenantOwnershipService,
  ) {}

  async findAll(organizationId: string, query: CustomerQueryDto) {
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const where: Prisma.CustomerWhereInput = {
      organizationId,
      isActive: query.isActive !== undefined ? query.isActive : true,
      ...(query.branchId && { branchId: query.branchId }),
      ...(query.leadSourceId && { leadSourceId: query.leadSourceId }),
      ...(query.tag && { tags: { has: query.tag } }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { leadSource: true, branch: true },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return buildPaginatedResult(items, total, page, pageSize);
  }

  findAllLegacy(organizationId: string): Promise<Customer[]> {
    return this.prisma.customer.findMany({
      where: { organizationId, isActive: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async findOne(organizationId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId },
      include: { leadSource: true, branch: true },
    });
    if (!customer) throw new NotFoundException('Khách hàng không tồn tại');
    return customer;
  }

  async getHistory(organizationId: string, id: string) {
    const customer = await this.findOne(organizationId, id);

    const [leads, appointments, orders, noteLogs] = await Promise.all([
      this.prisma.lead.findMany({
        where: { organizationId, customerId: id },
        orderBy: { createdAt: 'desc' },
        include: { leadSource: true, assignedTo: true },
      }),
      this.prisma.appointment.findMany({
        where: { organizationId, customerId: id },
        orderBy: { scheduledAt: 'desc' },
        include: { employee: true, service: true, branch: true },
      }),
      this.prisma.order.findMany({
        where: { organizationId, customerId: id },
        orderBy: { orderedAt: 'desc' },
        include: { items: true, payments: true },
      }),
      this.prisma.auditLog.findMany({
        where: {
          organizationId,
          entityType: 'CUSTOMER',
          entityId: id,
          action: 'CONSULTATION_NOTE',
        },
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true } } },
      }),
    ]);

    const consultationNotes = noteLogs.map((log) => ({
      id: log.id,
      content: (log.metadata as { content?: string })?.content ?? '',
      createdAt: log.createdAt.toISOString(),
      authorName: log.user?.name ?? null,
    }));

    return { customer, leads, appointments, orders, consultationNotes };
  }

  async addNote(organizationId: string, customerId: string, userId: string, content: string) {
    await this.findOne(organizationId, customerId);
    const log = await this.audit.log({
      organizationId,
      userId,
      action: 'CONSULTATION_NOTE',
      entityType: 'CUSTOMER',
      entityId: customerId,
      metadata: { content },
    });
    return {
      id: log.id,
      content,
      createdAt: log.createdAt.toISOString(),
    };
  }

  async create(organizationId: string, dto: CreateCustomerDto): Promise<Customer> {
    await this.tenant.validateBranchBoundRelations(organizationId, {
      branchId: dto.branchId,
      leadSourceId: dto.leadSourceId,
    });

    const phone = dto.phone?.trim() || null;
    const email = dto.email?.trim() || null;
    if (phone) {
      const dup = await this.prisma.customer.findFirst({
        where: { organizationId, phone, isActive: true },
        include: { leadSource: true, branch: true },
      });
      if (dup) return dup;
    }
    if (email) {
      const dup = await this.prisma.customer.findFirst({
        where: { organizationId, email: { equals: email, mode: 'insensitive' }, isActive: true },
        include: { leadSource: true, branch: true },
      });
      if (dup) return dup;
    }

    return this.prisma.customer.create({
      data: {
        organizationId,
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        gender: dto.gender,
        birthday: dto.birthday ? new Date(dto.birthday) : undefined,
        note: dto.note,
        tags: dto.tags ?? [],
        source: dto.source,
        leadSourceId: dto.leadSourceId,
        branchId: dto.branchId,
      },
      include: { leadSource: true, branch: true },
    });
  }

  async update(organizationId: string, id: string, dto: UpdateCustomerDto) {
    await this.findOne(organizationId, id);
    await this.tenant.validateBranchBoundRelations(organizationId, {
      branchId: dto.branchId,
      leadSourceId: dto.leadSourceId,
    });
    return this.prisma.customer.update({
      where: { id },
      data: {
        ...dto,
        birthday: dto.birthday ? new Date(dto.birthday) : undefined,
      },
      include: { leadSource: true, branch: true },
    });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    return this.prisma.customer.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
