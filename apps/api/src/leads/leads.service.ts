import { Injectable, NotFoundException } from '@nestjs/common';
import { LeadPipelineStatus, Prisma } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateLeadDto,
  UpdateLeadDto,
  UpdateLeadStatusDto,
  AssignLeadDto,
  LeadQueryDto,
} from './dto/lead.dto';
import { FunnelQueryDto } from './dto/funnel.dto';
import { buildPaginatedResult, getPaginationParams } from '../common/utils/pagination.util';
import { EventsGateway } from '../events/events.gateway';
import { leadSourceCodesForPlatform } from '../common/utils/platform-lead-source.util';

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly audit: AuditService,
  ) {}

  async findAll(organizationId: string, query: LeadQueryDto) {
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const where: Prisma.LeadWhereInput = {
      organizationId,
      ...(query.pipelineStatus && { pipelineStatus: query.pipelineStatus }),
      ...(query.leadSourceId && { leadSourceId: query.leadSourceId }),
      ...(query.assignedToId && { assignedToId: query.assignedToId }),
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
    };

    const [items, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          leadSource: true,
          funnelStage: true,
          assignedTo: true,
          customer: true,
          branch: true,
        },
      }),
      this.prisma.lead.count({ where }),
    ]);

    return buildPaginatedResult(items, total, page, pageSize);
  }

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
    const lead = await this.prisma.lead.create({
      data: {
        organizationId,
        ...dto,
        estimatedValue: dto.estimatedValue,
      },
      include: { leadSource: true, assignedTo: true, branch: true },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'LEAD_CREATED',
      entityType: 'LEAD',
      entityId: lead.id,
      metadata: { name: lead.name, pipelineStatus: lead.pipelineStatus },
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

    const lead = await this.prisma.lead.update({
      where: { id },
      data: {
        pipelineStatus: dto.pipelineStatus,
        lostReason: dto.lostReason,
        convertedAt: dto.pipelineStatus === LeadPipelineStatus.PURCHASED ? new Date() : undefined,
      },
      include: { leadSource: true, assignedTo: true, branch: true, customer: true },
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

    return lead;
  }

  async assign(organizationId: string, id: string, dto: AssignLeadDto, userId?: string) {
    const existing = await this.findOne(organizationId, id);

    const lead = await this.prisma.lead.update({
      where: { id },
      data: { assignedToId: dto.assignedToId },
      include: { assignedTo: true, leadSource: true, branch: true },
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

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    return this.prisma.lead.delete({ where: { id } });
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
