import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { AutomationTriggerType, AdPlatform, LeadPipelineStatus, Prisma } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantOwnershipService } from '../common/services/tenant-ownership.service';
import { AttributionService } from '../attribution/attribution.service';
import { AttributionHooksService } from '../attribution/attribution-hooks.service';
import { PipelineService } from '../crm/pipeline.service';
import { LeadAssignmentService } from '../crm/lead-assignment.service';
import { AutomationEngineService } from '../crm/automation-engine.service';
import {
  CreateLeadDto,
  UpdateLeadDto,
  UpdateLeadStatusDto,
  AssignLeadDto,
  LeadQueryDto,
  LeadKanbanQueryDto,
  LeadKanbanColumnQueryDto,
  BulkLeadActionDto,
  CreateLeadSavedViewDto,
  UpdateLeadSavedViewDto,
} from './dto/lead.dto';
import { FunnelQueryDto } from './dto/funnel.dto';
import { buildPaginatedResult, getPaginationParams } from '../common/utils/pagination.util';
import { EventsGateway } from '../events/events.gateway';
import { leadSourceCodesForPlatform } from '../common/utils/platform-lead-source.util';
import { assertLeadTransition } from '../common/utils/status-transitions.util';

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly audit: AuditService,
    private readonly tenant: TenantOwnershipService,
    private readonly attribution: AttributionService,
    private readonly attributionHooks: AttributionHooksService,
    private readonly pipeline: PipelineService,
    private readonly assignment: LeadAssignmentService,
    private readonly automation: AutomationEngineService,
  ) {}

  async findAll(organizationId: string, query: LeadQueryDto) {
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const where = this.buildLeadWhere(organizationId, query);

    const [items, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        skip,
        take,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: this.leadListInclude,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return buildPaginatedResult(
      items.map((l) => this.mapLeadCard(l)),
      total,
      page,
      pageSize,
    );
  }

  /** Kanban: 1 request — mỗi cột limit items + total + nextCursor */
  async getKanban(organizationId: string, query: LeadKanbanQueryDto) {
    const limit = Math.min(query.limit ?? 20, 50);
    const statuses = query.pipelineStatus
      ? [query.pipelineStatus]
      : (Object.values(LeadPipelineStatus) as LeadPipelineStatus[]);

    const columns: Record<
      string,
      { total: number; items: unknown[]; nextCursor: string | null }
    > = {};

    await Promise.all(
      statuses.map(async (status) => {
        const where = this.buildLeadWhere(organizationId, {
          ...query,
          pipelineStatus: status,
        });
        const [total, items] = await Promise.all([
          this.prisma.lead.count({ where }),
          this.prisma.lead.findMany({
            where,
            take: limit + 1,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            include: this.leadListInclude,
          }),
        ]);
        const hasMore = items.length > limit;
        const pageItems = hasMore ? items.slice(0, limit) : items;
        const last = pageItems[pageItems.length - 1];
        columns[status] = {
          total,
          items: pageItems.map((l) => this.mapLeadCard(l)),
          nextCursor: hasMore && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
        };
      }),
    );

    return { columns, limit };
  }

  /** Load-more một cột Kanban theo cursor */
  async getKanbanColumn(
    organizationId: string,
    status: LeadPipelineStatus,
    query: LeadKanbanColumnQueryDto,
  ) {
    const limit = Math.min(query.limit ?? 20, 50);
    const where = this.buildLeadWhere(organizationId, { ...query, pipelineStatus: status });
    const cursorWhere = this.decodeCursor(query.cursor);

    const items = await this.prisma.lead.findMany({
      where: cursorWhere
        ? {
            AND: [
              where,
              {
                OR: [
                  { createdAt: { lt: cursorWhere.createdAt } },
                  {
                    createdAt: cursorWhere.createdAt,
                    id: { lt: cursorWhere.id },
                  },
                ],
              },
            ],
          }
        : where,
      take: limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: this.leadListInclude,
    });

    const total = await this.prisma.lead.count({ where });
    const hasMore = items.length > limit;
    const pageItems = hasMore ? items.slice(0, limit) : items;
    const last = pageItems[pageItems.length - 1];

    return {
      status,
      total,
      items: pageItems.map((l) => this.mapLeadCard(l)),
      nextCursor: hasMore && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
    };
  }

  async bulkAction(
    organizationId: string,
    dto: BulkLeadActionDto,
    userId?: string,
  ) {
    const leads = await this.prisma.lead.findMany({
      where: { organizationId, id: { in: dto.leadIds } },
      select: { id: true },
    });
    if (leads.length !== dto.leadIds.length) {
      throw new NotFoundException('Một hoặc nhiều lead không tồn tại');
    }

    if (dto.action === 'status') {
      if (!dto.pipelineStatus) throw new BadRequestException('Thiếu pipelineStatus');
      let updated = 0;
      for (const id of dto.leadIds) {
        await this.updateStatus(
          organizationId,
          id,
          { pipelineStatus: dto.pipelineStatus },
          userId,
        );
        updated += 1;
      }
      return { updated };
    }

    if (dto.action === 'assign') {
      if (!dto.assignedToId) throw new BadRequestException('Thiếu assignedToId');
      let updated = 0;
      for (const id of dto.leadIds) {
        await this.assign(organizationId, id, { assignedToId: dto.assignedToId }, userId);
        updated += 1;
      }
      return { updated };
    }

    if (dto.action === 'tag') {
      if (!dto.tags?.length) throw new BadRequestException('Thiếu tags');
      const result = await this.prisma.lead.updateMany({
        where: { organizationId, id: { in: dto.leadIds } },
        data: { tags: dto.tags },
      });
      return { updated: result.count };
    }

    throw new BadRequestException('Action không hợp lệ');
  }

  async listSavedViews(organizationId: string, userId: string) {
    return this.prisma.leadSavedView.findMany({
      where: { organizationId, userId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async createSavedView(
    organizationId: string,
    userId: string,
    dto: CreateLeadSavedViewDto,
  ) {
    if (dto.isDefault) {
      await this.prisma.leadSavedView.updateMany({
        where: { organizationId, userId, isDefault: true },
        data: { isDefault: false },
      });
    }
    return this.prisma.leadSavedView.create({
      data: {
        organizationId,
        userId,
        name: dto.name,
        viewMode: dto.viewMode ?? 'kanban',
        filters: (dto.filters ?? {}) as Prisma.InputJsonValue,
        tableColumns: dto.tableColumns ?? undefined,
        isDefault: dto.isDefault ?? false,
      },
    });
  }

  async updateSavedView(
    organizationId: string,
    userId: string,
    id: string,
    dto: UpdateLeadSavedViewDto,
  ) {
    const existing = await this.prisma.leadSavedView.findFirst({
      where: { id, organizationId, userId },
    });
    if (!existing) throw new NotFoundException('Saved view không tồn tại');
    if (dto.isDefault) {
      await this.prisma.leadSavedView.updateMany({
        where: { organizationId, userId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }
    return this.prisma.leadSavedView.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.viewMode !== undefined && { viewMode: dto.viewMode }),
        ...(dto.filters !== undefined && {
          filters: dto.filters as Prisma.InputJsonValue,
        }),
        ...(dto.tableColumns !== undefined && { tableColumns: dto.tableColumns }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
      },
    });
  }

  async deleteSavedView(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.leadSavedView.findFirst({
      where: { id, organizationId, userId },
    });
    if (!existing) throw new NotFoundException('Saved view không tồn tại');
    await this.prisma.leadSavedView.delete({ where: { id } });
    return { ok: true };
  }

  private readonly leadListInclude = {
    leadSource: true,
    funnelStage: true,
    assignedTo: { select: { id: true, name: true } },
    customer: { select: { id: true, name: true } },
    branch: { select: { id: true, name: true } },
    appointments: {
      take: 1,
      orderBy: { scheduledAt: 'desc' as const },
      include: { service: { select: { id: true, name: true } } },
    },
  };

  private buildLeadWhere(
    organizationId: string,
    query: {
      pipelineStatus?: LeadPipelineStatus;
      leadSourceId?: string;
      assignedToId?: string;
      unassigned?: boolean;
      branchId?: string;
      createdFrom?: string;
      createdTo?: string;
      search?: string;
      tag?: string;
    },
  ): Prisma.LeadWhereInput {
    return {
      organizationId,
      ...(query.pipelineStatus && { pipelineStatus: query.pipelineStatus }),
      ...(query.leadSourceId && { leadSourceId: query.leadSourceId }),
      ...(query.unassigned
        ? { assignedToId: null }
        : query.assignedToId
          ? { assignedToId: query.assignedToId }
          : {}),
      ...(query.branchId && { branchId: query.branchId }),
      ...(query.createdFrom || query.createdTo
        ? {
            createdAt: {
              ...(query.createdFrom && { gte: new Date(query.createdFrom) }),
              ...(query.createdTo && { lte: new Date(query.createdTo) }),
            },
          }
        : {}),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
      ...(query.tag && { tags: { has: query.tag } }),
    };
  }

  private decodeCursor(cursor?: string): { createdAt: Date; id: string } | null {
    if (!cursor) return null;
    const [iso, id] = cursor.split('|');
    if (!iso || !id) return null;
    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  }

  private mapLeadCard(lead: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    pipelineStatus: LeadPipelineStatus;
    createdAt: Date;
    lastContactedAt: Date | null;
    tags: string[];
    note?: string | null;
    estimatedValue?: unknown;
    assignedTo?: { id: string; name: string } | null;
    leadSource?: { id: string; name: string } | null;
    branch?: { id: string; name: string } | null;
    customer?: { id: string; name: string } | null;
    appointments?: Array<{ service?: { id: string; name: string } | null }>;
  }) {
    const staleMs = 10 * 60_000;
    const isStale =
      lead.pipelineStatus === LeadPipelineStatus.NEW &&
      Date.now() - lead.createdAt.getTime() > staleMs;
    return {
      ...lead,
      serviceName: lead.appointments?.[0]?.service?.name ?? null,
      isStale,
      appointments: undefined,
    };
  }

  /** Leads chưa xử lý quá N phút — mặc định 10 phút */

  async findOne(organizationId: string, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, organizationId },
      include: {
        leadSource: true,
        funnelStage: true,
        assignedTo: true,
        customer: true,
        branch: true,
        appointments: {
          orderBy: { scheduledAt: 'desc' },
          include: { employee: true, service: true },
        },
      },
    });
    if (!lead) throw new NotFoundException('Lead không tồn tại');
    return lead;
  }

  async create(organizationId: string, dto: CreateLeadDto, userId?: string) {
    await this.tenant.validateBranchBoundRelations(organizationId, {
      branchId: dto.branchId,
      leadSourceId: dto.leadSourceId,
      assignedToId: dto.assignedToId,
      funnelStageId: dto.funnelStageId,
    });

    const { attribution: attrDto, autoAssign, tags, reminderAt, score, ...leadFields } = dto;
    const platformExternalLeadId = this.readAttributionString(attrDto, 'platformExternalLeadId');
    const attributionPlatform = this.readAttributionPlatform(attrDto);

    const duplicate = await this.attribution.findDuplicateLead(organizationId, {
      phone: dto.phone,
      email: dto.email,
      name: dto.name,
      platformExternalLeadId,
      platform: attributionPlatform,
    });

    if (duplicate) {
      if (attrDto) {
        await this.attribution.upsertLeadAttribution(organizationId, duplicate.id, attrDto);
      }
      return this.findOne(organizationId, duplicate.id);
    }

    await this.pipeline.ensureDefaultPipeline(organizationId);
    let assignedToId = dto.assignedToId;
    if (!assignedToId && autoAssign !== false) {
      assignedToId =
        (await this.assignment.autoAssign(organizationId, {
          branchId: dto.branchId,
        })) ?? undefined;
    }

    const stage =
      (dto.funnelStageId
        ? await this.prisma.funnelStage.findFirst({
            where: { id: dto.funnelStageId, organizationId },
          })
        : null) ??
      (await this.pipeline.resolveStageForStatus(organizationId, LeadPipelineStatus.NEW));

    const computedScore =
      score ??
      this.assignment.computeScore({
        estimatedValue: dto.estimatedValue,
        hasPhone: !!dto.phone,
        hasEmail: !!dto.email,
        platform: attributionPlatform,
      });

    const lead = await this.prisma.lead.create({
      data: {
        organizationId,
        ...leadFields,
        assignedToId,
        funnelStageId: stage?.id,
        estimatedValue: dto.estimatedValue,
        platformExternalLeadId,
        platform: attributionPlatform,
        score: computedScore,
        tags: tags ?? [],
        reminderAt: reminderAt ? new Date(reminderAt) : undefined,
        slaRespondBy: this.assignment.slaRespondBy(),
      },
      include: { leadSource: true, assignedTo: true, branch: true, funnelStage: true },
    });

    await this.prisma.leadActivity.create({
      data: {
        organizationId,
        leadId: lead.id,
        actorUserId: userId,
        action: 'LEAD_CREATED',
        toValue: lead.pipelineStatus,
        metadata: { assignedToId, score: computedScore },
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'LEAD_CREATED',
      entityType: 'LEAD',
      entityId: lead.id,
      metadata: { name: lead.name, pipelineStatus: lead.pipelineStatus, assignedToId },
    });

    await this.attributionHooks.onLeadCreated(organizationId, lead, attrDto);

    void this.automation.dispatch(organizationId, AutomationTriggerType.LEAD_CREATED, {
      leadId: lead.id,
      customerId: lead.customerId,
      dedupeKey: `LEAD_CREATED:${lead.id}`,
    });

    this.events.broadcastLeadNew(organizationId, {
      leadId: lead.id,
      name: lead.name,
      pipelineStatus: lead.pipelineStatus,
    });

    return lead;
  }

  async update(organizationId: string, id: string, dto: UpdateLeadDto) {
    await this.findOne(organizationId, id);
    await this.tenant.validateBranchBoundRelations(organizationId, {
      branchId: dto.branchId,
      leadSourceId: dto.leadSourceId,
      funnelStageId: dto.funnelStageId,
    });
    return this.prisma.lead.update({
      where: { id },
      data: { ...dto, estimatedValue: dto.estimatedValue },
      include: { leadSource: true, assignedTo: true, branch: true },
    });
  }

  async updateStatus(
    organizationId: string,
    id: string,
    dto: UpdateLeadStatusDto,
    userId?: string,
  ) {
    const existing = await this.findOne(organizationId, id);
    const previousStatus = existing.pipelineStatus;

    assertLeadTransition(previousStatus, dto.pipelineStatus);

    if (dto.pipelineStatus === LeadPipelineStatus.LOST && !dto.lostReason) {
      throw new BadRequestException('Vui lòng nhập lý do mất lead');
    }

    const stage = await this.pipeline.resolveStageForStatus(organizationId, dto.pipelineStatus);

    const lead = await this.prisma.lead.update({
      where: { id },
      data: {
        pipelineStatus: dto.pipelineStatus,
        funnelStageId: stage?.id ?? existing.funnelStageId,
        lostReason: dto.lostReason,
        convertedAt: dto.pipelineStatus === LeadPipelineStatus.PURCHASED ? new Date() : undefined,
        lastContactedAt:
          dto.pipelineStatus === LeadPipelineStatus.CONTACTED ||
          dto.pipelineStatus === LeadPipelineStatus.QUALIFIED
            ? new Date()
            : undefined,
        slaBreached: false,
      },
      include: { leadSource: true, assignedTo: true, branch: true, customer: true, funnelStage: true },
    });

    await this.prisma.leadActivity.create({
      data: {
        organizationId,
        leadId: id,
        actorUserId: userId,
        action: 'STATUS_CHANGED',
        fromValue: previousStatus,
        toValue: dto.pipelineStatus,
        metadata: { lostReason: dto.lostReason ?? null },
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'LEAD_STATUS_CHANGED',
      entityType: 'LEAD',
      entityId: id,
      metadata: {
        previousStatus,
        newStatus: dto.pipelineStatus,
        lostReason: dto.lostReason ?? null,
      },
    });

    this.events.broadcastLeadStatusChanged(organizationId, {
      leadId: id,
      name: lead.name,
      previousStatus,
      pipelineStatus: dto.pipelineStatus,
    });

    if (this.attributionHooks.isQualifiedStatus(dto.pipelineStatus)) {
      await this.attributionHooks.onLeadQualified(organizationId, id);
    }

    if (dto.pipelineStatus === LeadPipelineStatus.BOOKED) {
      void this.automation.dispatch(organizationId, AutomationTriggerType.LEAD_BOOKED, {
        leadId: id,
        customerId: lead.customerId,
        dedupeKey: `LEAD_BOOKED:${id}`,
      });
    }

    return lead;
  }

  async addNote(organizationId: string, leadId: string, content: string, userId?: string) {
    await this.findOne(organizationId, leadId);
    const note = await this.prisma.leadNote.create({
      data: { organizationId, leadId, content, authorUserId: userId },
    });
    await this.prisma.leadActivity.create({
      data: {
        organizationId,
        leadId,
        actorUserId: userId,
        action: 'NOTE_ADDED',
        toValue: content.slice(0, 200),
      },
    });
    return note;
  }

  async listActivity(organizationId: string, leadId: string) {
    await this.findOne(organizationId, leadId);
    const [notes, activities] = await Promise.all([
      this.prisma.leadNote.findMany({
        where: { organizationId, leadId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.leadActivity.findMany({
        where: { organizationId, leadId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    return { notes, activities };
  }

  async assign(organizationId: string, id: string, dto: AssignLeadDto, userId?: string) {
    const existing = await this.findOne(organizationId, id);
    await this.tenant.assertEmployee(organizationId, dto.assignedToId, existing.branchId);

    const lead = await this.prisma.lead.update({
      where: { id },
      data: { assignedToId: dto.assignedToId },
      include: { assignedTo: true, leadSource: true, branch: true },
    });

    await this.prisma.leadActivity.create({
      data: {
        organizationId,
        leadId: id,
        actorUserId: userId,
        action: 'LEAD_ASSIGNED',
        fromValue: existing.assignedToId ?? undefined,
        toValue: dto.assignedToId,
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'LEAD_ASSIGNED',
      entityType: 'LEAD',
      entityId: id,
      metadata: {
        previousAssigneeId: existing.assignedToId,
        assignedToId: dto.assignedToId,
      },
    });

    return lead;
  }

  /** Upsert Customer từ Lead theo phone/email — gắn lead.customerId */
  async convertToCustomer(organizationId: string, leadId: string, userId?: string) {
    const lead = await this.findOne(organizationId, leadId);
    if (lead.customerId) {
      return this.prisma.customer.findFirst({
        where: { id: lead.customerId, organizationId },
      });
    }

    const phone = lead.phone?.trim() || null;
    const email = lead.email?.trim() || null;
    let customer =
      (phone
        ? await this.prisma.customer.findFirst({
            where: { organizationId, phone, isActive: true },
          })
        : null) ??
      (email
        ? await this.prisma.customer.findFirst({
            where: { organizationId, email: { equals: email, mode: 'insensitive' }, isActive: true },
          })
        : null);

    if (!customer) {
      customer = await this.prisma.customer.create({
        data: {
          organizationId,
          branchId: lead.branchId,
          name: lead.name,
          phone: phone ?? undefined,
          email: email ?? undefined,
          leadSourceId: lead.leadSourceId,
          source: 'lead_convert',
          note: lead.note ?? undefined,
        },
      });
    }

    await this.prisma.lead.update({
      where: { id: leadId },
      data: { customerId: customer.id },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'LEAD_CONVERTED_CUSTOMER',
      entityType: 'LEAD',
      entityId: leadId,
      metadata: { customerId: customer.id },
    });

    return customer;
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    return this.prisma.lead.delete({ where: { id } });
  }

  private readAttributionString(
    attr: Record<string, unknown> | undefined,
    key: string,
  ): string | undefined {
    const value = attr?.[key];
    return typeof value === 'string' && value.trim() ? value : undefined;
  }

  private readAttributionPlatform(attr?: Record<string, unknown>): AdPlatform | undefined {
    const channel = attr?.channel;
    if (typeof channel !== 'string') return undefined;
    return (Object.values(AdPlatform) as string[]).includes(channel)
      ? (channel as AdPlatform)
      : undefined;
  }

  /** Leads chưa xử lý quá N phút — mặc định 10 phút */
  async findStaleLeads(organizationId: string, minutes = 10) {
    const threshold = new Date(Date.now() - minutes * 60 * 1000);
    return this.prisma.lead.findMany({
      where: {
        organizationId,
        pipelineStatus: LeadPipelineStatus.NEW,
        createdAt: { lt: threshold },
      },
      take: 50,
      orderBy: { createdAt: 'asc' },
      include: { leadSource: true, assignedTo: true },
    });
  }

  /** Phễu marketing — đếm lead theo giai đoạn + tỷ lệ chuyển đổi */
  async getFunnelStats(organizationId: string, query: FunnelQueryDto) {
    const to = query.to ? new Date(query.to) : new Date();
    to.setHours(23, 59, 59, 999);
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    from.setHours(0, 0, 0, 0);

    const baseWhere: Prisma.LeadWhereInput = {
      organizationId,
      createdAt: { gte: from, lte: to },
      ...(query.leadSourceId && { leadSourceId: query.leadSourceId }),
      ...(query.assignedToId && { assignedToId: query.assignedToId }),
      ...(query.branchId && { branchId: query.branchId }),
    };

    if (query.adCampaignId) {
      const campaign = await this.prisma.adCampaign.findFirst({
        where: { id: query.adCampaignId, organizationId },
      });
      if (campaign) {
        const codes = leadSourceCodesForPlatform(campaign.platform);
        if (codes.length > 0) {
          const sources = await this.prisma.leadSource.findMany({
            where: { organizationId, code: { in: codes } },
            select: { id: true },
          });
          if (sources.length > 0) {
            baseWhere.leadSourceId = { in: sources.map((s) => s.id) };
          }
        }
      }
    }

    const stages: { status: LeadPipelineStatus; label: string }[] = [
      { status: LeadPipelineStatus.NEW, label: 'Lead mới' },
      { status: LeadPipelineStatus.CONTACTED, label: 'Đã liên hệ' },
      { status: LeadPipelineStatus.BOOKED, label: 'Đặt lịch' },
      { status: LeadPipelineStatus.VISITED, label: 'Đã đến' },
      { status: LeadPipelineStatus.PURCHASED, label: 'Đã mua' },
      { status: LeadPipelineStatus.LOST, label: 'Mất khách' },
    ];

    const [totalLeads, bookedCount, visitedCount, purchasedCount, ...statusCounts] =
      await Promise.all([
        this.prisma.lead.count({ where: baseWhere }),
        this.prisma.lead.count({
          where: {
            ...baseWhere,
            pipelineStatus: {
              in: [
                LeadPipelineStatus.BOOKED,
                LeadPipelineStatus.VISITED,
                LeadPipelineStatus.PURCHASED,
              ],
            },
          },
        }),
        this.prisma.lead.count({
          where: {
            ...baseWhere,
            pipelineStatus: {
              in: [LeadPipelineStatus.VISITED, LeadPipelineStatus.PURCHASED],
            },
          },
        }),
        this.prisma.lead.count({
          where: { ...baseWhere, pipelineStatus: LeadPipelineStatus.PURCHASED },
        }),
        ...stages.map((s) =>
          this.prisma.lead.count({
            where: { ...baseWhere, pipelineStatus: s.status },
          }),
        ),
      ]);

    const steps = stages.map((s, i) => ({
      status: s.status,
      label: s.label,
      count: statusCounts[i] ?? 0,
    }));

    const pct = (num: number, den: number) =>
      den > 0 ? Math.round((num / den) * 1000) / 10 : null;

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      totalLeads,
      steps,
      conversions: {
        leadToBooking: pct(bookedCount, totalLeads),
        bookingToVisit: pct(visitedCount, bookedCount),
        visitToPurchase: pct(purchasedCount, visitedCount),
        leadToPurchase: pct(purchasedCount, totalLeads),
      },
      counts: {
        booked: bookedCount,
        visited: visitedCount,
        purchased: purchasedCount,
      },
    };
  }
}
