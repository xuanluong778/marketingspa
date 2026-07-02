import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  BusinessGoalInputDto,
  BusinessGoalQueryDto,
  CreateBusinessGoalScenarioDto,
} from './dto/business-goal.dto';
import { calculateBusinessGoals } from './utils/calculate.util';
import { buildPaginatedResult, getPaginationParams } from '../common/utils/pagination.util';

@Injectable()
export class BusinessGoalsService {
  constructor(private readonly prisma: PrismaService) {}

  calculate(dto: BusinessGoalInputDto) {
    const result = calculateBusinessGoals(dto);
    return {
      inputs: dto,
      ...result,
    };
  }

  async findAll(organizationId: string, query: BusinessGoalQueryDto) {
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const where: Prisma.BusinessGoalScenarioWhereInput = { organizationId };

    const [items, total] = await Promise.all([
      this.prisma.businessGoalScenario.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          branch: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
        },
      }),
      this.prisma.businessGoalScenario.count({ where }),
    ]);

    return buildPaginatedResult(items, total, page, pageSize);
  }

  async findOne(organizationId: string, id: string) {
    const scenario = await this.prisma.businessGoalScenario.findFirst({
      where: { id, organizationId },
      include: {
        branch: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (!scenario) {
      throw new NotFoundException('Không tìm thấy kịch bản mục tiêu kinh doanh');
    }
    return scenario;
  }

  async create(user: AuthUser, dto: CreateBusinessGoalScenarioDto) {
    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, organizationId: user.organizationId },
      });
      if (!branch) {
        throw new NotFoundException('Chi nhánh không tồn tại');
      }
    }

    const calc = calculateBusinessGoals(dto);

    return this.prisma.businessGoalScenario.create({
      data: {
        organizationId: user.organizationId,
        branchId: dto.branchId ?? null,
        name: dto.name,
        averageRevenuePerTransaction: dto.averageRevenuePerTransaction,
        currentTransactionCount: dto.currentTransactionCount,
        variableCostRate: dto.variableCostRate,
        fixedCost: dto.fixedCost,
        leadConversionRate: dto.leadConversionRate,
        targetProfit: dto.targetProfit,
        calculatedRevenue: calc.totalRevenue,
        calculatedGrossProfit: calc.grossProfit,
        calculatedNetProfit: calc.netProfit,
        breakEvenTransactions: calc.breakEvenTransactions,
        breakEvenLeads: calc.breakEvenLeads,
        targetTransactions: calc.targetTransactions,
        targetLeads: calc.targetLeads,
        createdById: user.id,
      },
      include: {
        branch: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  async remove(organizationId: string, id: string) {
    const existing = await this.prisma.businessGoalScenario.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy kịch bản mục tiêu kinh doanh');
    }
    await this.prisma.businessGoalScenario.delete({ where: { id } });
    return { success: true };
  }
}
