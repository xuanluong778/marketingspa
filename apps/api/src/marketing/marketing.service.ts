import { Injectable, NotFoundException } from '@nestjs/common';
import { LeadPipelineStatus, OrderStatus, Prisma } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateLeadSourceDto,
  UpdateLeadSourceDto,
  LeadSourceQueryDto,
} from './dto/lead-source.dto';
import {
  CreateAdAccountDto,
  CreateAdCampaignDto,
  CreateAdDailyStatDto,
  AdCampaignQueryDto,
  MarketingReportQueryDto,
} from './dto/ad-campaign.dto';
import { buildPaginatedResult, getPaginationParams } from '../common/utils/pagination.util';
import { leadSourceCodesForPlatform } from '../common/utils/platform-lead-source.util';

@Injectable()
export class MarketingService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Lead Sources ---
  async listLeadSources(organizationId: string, query: LeadSourceQueryDto) {
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const where = { organizationId };
    const [items, total] = await Promise.all([
      this.prisma.leadSource.findMany({ where, skip, take, orderBy: { name: 'asc' } }),
      this.prisma.leadSource.count({ where }),
    ]);
    return buildPaginatedResult(items, total, page, pageSize);
  }

  createLeadSource(organizationId: string, dto: CreateLeadSourceDto) {
    return this.prisma.leadSource.create({
      data: { organizationId, name: dto.name, code: dto.code },
    });
  }

  async updateLeadSource(organizationId: string, id: string, dto: UpdateLeadSourceDto) {
    await this.ensureLeadSource(organizationId, id);
    return this.prisma.leadSource.update({ where: { id }, data: dto });
  }

  // --- Ad Accounts ---
  listAdAccounts(organizationId: string) {
    return this.prisma.adAccount.findMany({
      where: { organizationId },
      include: { campaigns: true },
    });
  }

  createAdAccount(organizationId: string, dto: CreateAdAccountDto) {
    return this.prisma.adAccount.create({ data: { organizationId, ...dto } });
  }

  // --- Ad Campaigns ---
  async listAdCampaigns(organizationId: string, query: AdCampaignQueryDto) {
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const where = {
      organizationId,
      ...(query.status && { status: query.status }),
      ...(query.platform && { platform: query.platform }),
    };
    const [items, total] = await Promise.all([
      this.prisma.adCampaign.findMany({
        where,
        skip,
        take,
        include: { adAccount: true, dailyStats: { take: 7, orderBy: { date: 'desc' } } },
      }),
      this.prisma.adCampaign.count({ where }),
    ]);
    return buildPaginatedResult(items, total, page, pageSize);
  }

  createAdCampaign(organizationId: string, dto: CreateAdCampaignDto) {
    return this.prisma.adCampaign.create({
      data: {
        organizationId,
        adAccountId: dto.adAccountId,
        name: dto.name,
        platform: dto.platform,
        budget: dto.budget != null ? new Prisma.Decimal(dto.budget) : undefined,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        note: dto.note,
      },
    });
  }

  createAdDailyStat(organizationId: string, dto: CreateAdDailyStatDto) {
    return this.prisma.adDailyStat.create({
      data: {
        organizationId,
        adCampaignId: dto.adCampaignId,
        date: new Date(dto.date),
        impressions: dto.impressions ?? 0,
        clicks: dto.clicks ?? 0,
        spend: new Prisma.Decimal(dto.spend),
        leads: dto.leads ?? 0,
        conversions: dto.conversions ?? 0,
      },
    });
  }

  /** CPL, cost/booking, cost/purchase, revenue/campaign */
  async getCampaignReports(organizationId: string, query: MarketingReportQueryDto) {
    const from = query.from ? new Date(query.from) : new Date(Date.now() - 30 * 86400000);
    const to = query.to ? new Date(query.to) : new Date();

    const campaigns = await this.prisma.adCampaign.findMany({
      where: {
        organizationId,
        ...(query.adCampaignId && { id: query.adCampaignId }),
      },
      include: {
        dailyStats: {
          where: { date: { gte: from, lte: to } },
        },
        expenses: {
          where: { expenseDate: { gte: from, lte: to } },
        },
      },
    });

    const reports = await Promise.all(
      campaigns.map(async (c) => {
        const spendFromStats = c.dailyStats.reduce((s, d) => s + Number(d.spend), 0);
        const spendFromExpenses = c.expenses.reduce((s, e) => s + Number(e.amount), 0);
        const totalSpend = spendFromStats + spendFromExpenses;
        const leadsFromStats = c.dailyStats.reduce((s, d) => s + d.leads, 0);

        const codes = leadSourceCodesForPlatform(c.platform);
        const sources =
          codes.length > 0
            ? await this.prisma.leadSource.findMany({
                where: { organizationId, code: { in: codes } },
                select: { id: true },
              })
            : [];
        const sourceIds = sources.map((s) => s.id);

        const leadWhere = {
          organizationId,
          createdAt: { gte: from, lte: to },
          ...(sourceIds.length > 0 && { leadSourceId: { in: sourceIds } }),
        };

        const [crmLeads, bookedLeads, purchasedLeads, revenue] = await Promise.all([
          sourceIds.length > 0 ? this.prisma.lead.count({ where: leadWhere }) : Promise.resolve(0),
          this.prisma.lead.count({
            where: {
              ...leadWhere,
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
            where: { ...leadWhere, pipelineStatus: LeadPipelineStatus.PURCHASED },
          }),
          sourceIds.length > 0
            ? this.prisma.order.aggregate({
                where: {
                  organizationId,
                  status: OrderStatus.PAID,
                  orderedAt: { gte: from, lte: to },
                  customer: { leadSourceId: { in: sourceIds } },
                },
                _sum: { total: true },
              })
            : Promise.resolve({ _sum: { total: null } }),
        ]);

        const totalLeads = Math.max(leadsFromStats, crmLeads);
        const totalRevenue = Number(revenue._sum.total ?? 0);
        const profit = totalRevenue - totalSpend;

        return {
          campaignId: c.id,
          campaignName: c.name,
          platform: c.platform,
          totalSpend,
          totalLeads,
          bookedLeads,
          purchasedLeads,
          revenue: totalRevenue,
          profit,
          cpl: totalLeads > 0 ? totalSpend / totalLeads : null,
          costPerBooking: bookedLeads > 0 ? totalSpend / bookedLeads : null,
          costPerPurchase: purchasedLeads > 0 ? totalSpend / purchasedLeads : null,
        };
      }),
    );

    return { from: from.toISOString(), to: to.toISOString(), campaigns: reports };
  }

  private async ensureLeadSource(organizationId: string, id: string) {
    const src = await this.prisma.leadSource.findFirst({ where: { id, organizationId } });
    if (!src) throw new NotFoundException('Nguồn lead không tồn tại');
    return src;
  }
}
