import { Injectable, NotFoundException } from '@nestjs/common';
import { ExpenseCategory, PaymentStatus, Prisma } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateOrderDto,
  CreatePaymentDto,
  CreateExpenseDto,
  UpdateExpenseDto,
  FinanceQueryDto,
  DashboardQueryDto,
} from './dto/finance.dto';
import { buildPaginatedResult, getPaginationParams } from '../common/utils/pagination.util';
import { resolveDateRange } from '../common/utils/date-range.util';

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async listOrders(organizationId: string, query: FinanceQueryDto) {
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const where = this.dateFilter(organizationId, query, 'orderedAt');
    if (query.orderStatus) where.status = query.orderStatus;
    if (query.customerId) where.customerId = query.customerId;

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take,
        orderBy: { orderedAt: 'desc' },
        include: {
          customer: {
            include: {
              leads: {
                take: 1,
                orderBy: { createdAt: 'desc' },
                include: { assignedTo: true },
              },
            },
          },
          items: { include: { service: true } },
          payments: true,
        },
      }),
      this.prisma.order.count({ where }),
    ]);
    return buildPaginatedResult(items, total, page, pageSize);
  }

  async createOrder(organizationId: string, dto: CreateOrderDto) {
    const subtotal = dto.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const discount = dto.discount ?? 0;
    const total = subtotal - discount;
    const count = await this.prisma.order.count({ where: { organizationId } });
    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${String(count + 1).padStart(4, '0')}`;

    return this.prisma.order.create({
      data: {
        organizationId,
        customerId: dto.customerId,
        branchId: dto.branchId,
        orderNumber,
        subtotal: new Prisma.Decimal(subtotal),
        discount: new Prisma.Decimal(discount),
        total: new Prisma.Decimal(total),
        note: dto.note,
        items: {
          create: dto.items.map((i) => ({
            serviceId: i.serviceId,
            name: i.name,
            quantity: i.quantity,
            unitPrice: new Prisma.Decimal(i.unitPrice),
            totalPrice: new Prisma.Decimal(i.unitPrice * i.quantity),
          })),
        },
      },
      include: { items: true, customer: true },
    });
  }

  async listPayments(organizationId: string, query: FinanceQueryDto) {
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const where: Prisma.PaymentWhereInput = {
      organizationId,
      ...(query.paymentStatus && { status: query.paymentStatus }),
      ...(query.from || query.to
        ? {
            paidAt: {
              ...(query.from && { gte: new Date(query.from) }),
              ...(query.to && { lte: new Date(query.to) }),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          order: {
            include: {
              customer: true,
              items: true,
            },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);
    return buildPaginatedResult(items, total, page, pageSize);
  }

  async createPayment(organizationId: string, dto: CreatePaymentDto) {
    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, organizationId },
    });
    if (!order) throw new NotFoundException('Đơn hàng không tồn tại');

    return this.prisma.payment.create({
      data: {
        organizationId,
        orderId: dto.orderId,
        amount: new Prisma.Decimal(dto.amount),
        method: dto.method,
        status: PaymentStatus.COMPLETED,
        reference: dto.reference,
        paidAt: new Date(),
      },
    });
  }

  async listExpenses(organizationId: string, query: FinanceQueryDto) {
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const where = this.dateFilter(organizationId, query, 'expenseDate');
    if (query.expenseCategory) where.category = query.expenseCategory;

    const [items, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        skip,
        take,
        orderBy: { expenseDate: 'desc' },
        include: { adCampaign: true, branch: true },
      }),
      this.prisma.expense.count({ where }),
    ]);
    return buildPaginatedResult(items, total, page, pageSize);
  }

  createExpense(organizationId: string, dto: CreateExpenseDto) {
    return this.prisma.expense.create({
      data: {
        organizationId,
        category: dto.category,
        description: dto.description,
        amount: new Prisma.Decimal(dto.amount),
        expenseDate: new Date(dto.expenseDate),
        branchId: dto.branchId,
        adCampaignId: dto.adCampaignId,
        note: dto.note,
      },
      include: { adCampaign: true, branch: true },
    });
  }

  async updateExpense(organizationId: string, id: string, dto: UpdateExpenseDto) {
    await this.ensureExpense(organizationId, id);
    return this.prisma.expense.update({
      where: { id },
      data: {
        ...dto,
        amount: dto.amount != null ? new Prisma.Decimal(dto.amount) : undefined,
        expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : undefined,
      },
      include: { adCampaign: true, branch: true },
    });
  }

  async removeExpense(organizationId: string, id: string) {
    await this.ensureExpense(organizationId, id);
    return this.prisma.expense.delete({ where: { id } });
  }

  async getDashboard(organizationId: string, query: DashboardQueryDto) {
    const { from, to } = this.resolveDashboardRange(query);
    const branchFilter = query.branchId ? { branchId: query.branchId } : {};

    const paymentWhere: Prisma.PaymentWhereInput = {
      organizationId,
      status: PaymentStatus.COMPLETED,
      paidAt: { gte: from, lte: to },
    };

    const expenseWhere: Prisma.ExpenseWhereInput = {
      organizationId,
      expenseDate: { gte: from, lte: to },
      ...branchFilter,
    };

    const [payments, expensesByCategory] = await Promise.all([
      this.prisma.payment.aggregate({
        where: paymentWhere,
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.expense.groupBy({
        by: ['category'],
        where: expenseWhere,
        _sum: { amount: true },
      }),
    ]);

    const sumCategory = (cats: ExpenseCategory[]) =>
      expensesByCategory
        .filter((e) => cats.includes(e.category))
        .reduce((s, e) => s + Number(e._sum.amount ?? 0), 0);

    const adSpend = sumCategory([ExpenseCategory.ADVERTISING]);
    const salarySpend = sumCategory([ExpenseCategory.SALARY]);
    const materialSpend = sumCategory([ExpenseCategory.SUPPLIES]);
    const operatingSpend = sumCategory([
      ExpenseCategory.RENT,
      ExpenseCategory.UTILITIES,
      ExpenseCategory.MAINTENANCE,
    ]);
    const otherSpend = sumCategory([ExpenseCategory.OTHER]);

    const expenseTotal = expensesByCategory.reduce((s, e) => s + Number(e._sum.amount ?? 0), 0);
    const revenue = Number(payments._sum.amount ?? 0);
    const profit = revenue - expenseTotal;

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      revenue,
      adSpend,
      salarySpend,
      materialSpend,
      operatingSpend,
      otherSpend,
      expense: expenseTotal,
      profit,
      paymentCount: payments._count,
      expenseCount: expensesByCategory.reduce((s, e) => s + 1, 0),
      margin: revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : '0',
    };
  }

  private resolveDashboardRange(query: DashboardQueryDto): { from: Date; to: Date } {
    if (query.from && query.to) {
      const from = new Date(query.from);
      from.setHours(0, 0, 0, 0);
      const to = new Date(query.to);
      to.setHours(23, 59, 59, 999);
      return { from, to };
    }
    return resolveDateRange(query.period ?? 'month', query.date);
  }

  private async ensureExpense(organizationId: string, id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, organizationId },
    });
    if (!expense) throw new NotFoundException('Chi phí không tồn tại');
    return expense;
  }

  private dateFilter(
    organizationId: string,
    query: FinanceQueryDto,
    field: 'orderedAt' | 'expenseDate',
  ): Prisma.OrderWhereInput & Prisma.ExpenseWhereInput {
    return {
      organizationId,
      ...(query.from || query.to
        ? {
            [field]: {
              ...(query.from && { gte: new Date(query.from) }),
              ...(query.to && { lte: new Date(query.to) }),
            },
          }
        : {}),
    };
  }
}
