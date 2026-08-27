import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { CUSTOMER_360_TEST_TAG, type Customer, type Prisma } from '@marketingspa/database';
import { listCustomerSources, normalizeCustomerSource } from '@marketingspa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantOwnershipService } from '../common/services/tenant-ownership.service';
import { TenantKpiCacheService } from '../common/services/tenant-kpi-cache.service';
import { CreateCustomerDto, UpdateCustomerDto, CustomerQueryDto } from './dto/customer.dto';
import { buildPaginatedResult, getPaginationParams } from '../common/utils/pagination.util';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenant: TenantOwnershipService,
    private readonly kpiCache?: TenantKpiCacheService,
  ) {}

  async listSources() {
    return listCustomerSources();
  }

  async findAll(organizationId: string, query: CustomerQueryDto) {
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const cacheName = `list:cust:${page}:${pageSize}:${JSON.stringify({
      s: query.search,
      src: query.source,
      br: query.branchId,
      tag: query.tag,
      ls: query.leadSourceId,
      act: query.isActive,
    })}`;
    const cached = await this.kpiCache?.getJson<any>(organizationId, cacheName);
    if (cached) return cached;
    const canonicalSource = query.source ? normalizeCustomerSource(query.source) : null;
    const andFilters: Prisma.CustomerWhereInput[] = [];

    if (query.source) {
      if (canonicalSource) {
        andFilters.push({
          OR: [
            { latestSource: canonicalSource },
            { firstSource: canonicalSource },
            { source: canonicalSource },
          ],
        });
      } else {
        andFilters.push({ id: '00000000-0000-0000-0000-000000000000' });
      }
    }

    if (query.search) {
      andFilters.push({
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }

    if (!query.includeTest && query.tag !== CUSTOMER_360_TEST_TAG && query.tag !== '__test__') {
      andFilters.push({
        NOT: {
          OR: [
            { tags: { has: CUSTOMER_360_TEST_TAG } },
            { tags: { has: '__test__' } },
          ],
        },
      });
    }

    const where: Prisma.CustomerWhereInput = {
      organizationId,
      isActive: query.isActive !== undefined ? query.isActive : true,
      mergedIntoId: null,
      ...(query.branchId && { branchId: query.branchId }),
      ...(query.leadSourceId && { leadSourceId: query.leadSourceId }),
      ...(query.tag && { tags: { has: query.tag } }),
      ...(andFilters.length ? { AND: andFilters } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { leadSource: { select: { id: true, name: true } }, branch: { select: { id: true, name: true } } },
      }),
      this.prisma.customer.count({ where }),
    ]);

    const payload = buildPaginatedResult(items, total, page, pageSize);
    await this.kpiCache?.setJson(organizationId, cacheName, payload, 8);
    return payload;
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

    const row = await this.prisma.customer.create({
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
    await this.kpiCache?.bump(organizationId);
    return row;
  }

  async update(organizationId: string, id: string, dto: UpdateCustomerDto) {
    await this.findOne(organizationId, id);
    await this.tenant.validateBranchBoundRelations(organizationId, {
      branchId: dto.branchId,
      leadSourceId: dto.leadSourceId,
    });
    const row = await this.prisma.customer.update({
      where: { id },
      data: {
        ...dto,
        birthday: dto.birthday ? new Date(dto.birthday) : undefined,
      },
      include: { leadSource: true, branch: true },
    });
    await this.kpiCache?.bump(organizationId);
    return row;
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    const row = await this.prisma.customer.update({
      where: { id },
      data: { isActive: false },
    });
    await this.kpiCache?.bump(organizationId);
    return row;
  }
}
