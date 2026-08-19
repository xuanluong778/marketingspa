import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ExpenseCategory,
  LeadPipelineStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
} from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { TenantOwnershipService } from '../common/services/tenant-ownership.service';
import { AttributionHooksService } from '../attribution/attribution-hooks.service';
import { AuditService } from '../audit/audit.service';
import { PipelineService } from '../crm/pipeline.service';
import { FunnelCanvasRuntimeService } from '../crm/funnel-canvas-runtime.service';
import { EventsGateway } from '../events/events.gateway';
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
import {
  assertPaymentRefundable,
  orderStatusFromPaid,
} from '../common/utils/status-transitions.util';

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantOwnershipService,
    private readonly attributionHooks: AttributionHooksService,
    private readonly audit: AuditService,
    private readonly pipeline: PipelineService,
    private readonly events: EventsGateway,
    private readonly canvasRuntime: FunnelCanvasRuntimeService,
  ) {}

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

  async createOrder(organizationId: string, dto: CreateOrderDto, userId?: string) {
    await this.tenant.validateBranchBoundRelations(organizationId, {
      branchId: dto.branchId,
      customerId: dto.customerId,
    });
    if (dto.leadId) {
      await this.tenant.assertLead(organizationId, dto.leadId, dto.branchId);
    }
    for (const item of dto.items) {
      await this.tenant.assertService(organizationId, item.serviceId);
    }
    const subtotal = dto.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const discount = dto.discount ?? 0;
    const total = subtotal - discount;
    const count = await this.prisma.order.count({ where: { organizationId } });
    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${String(count + 1).padStart(4, '0')}`;

    const order = await this.prisma.order.create({
      data: {
        organizationId,
        customerId: dto.customerId,
        branchId: dto.branchId,
        leadId: dto.leadId,
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

    await this.audit.log({
      organizationId,
      userId,
      action: 'ORDER_CREATED',
      entityType: 'ORDER',
      entityId: order.id,
      metadata: { leadId: dto.leadId, total, orderNumber },
    });

    return order;
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

  async createPayment(organizationId: string, dto: CreatePaymentDto, userId?: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, organizationId },
      include: {
        items: true,
        payments: true,
        customer: true,
      },
    });
    if (!order) throw new NotFoundException('Đơn hàng không tồn tại');
    if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REFUNDED) {
      throw new BadRequestException('Đơn hàng đã hủy/hoàn — không thể thanh toán');
    }

    const idemKey = dto.idempotencyKey?.trim() || dto.reference?.trim() || null;
    if (idemKey) {
      const existing = await this.prisma.payment.findFirst({
        where: {
          organizationId,
          orderId: dto.orderId,
          reference: idemKey,
          status: { in: [PaymentStatus.COMPLETED, PaymentStatus.PENDING] },
        },
      });
      if (existing) return existing;
    }

    const alreadyPaid = order.payments
      .filter((p) => p.status === PaymentStatus.COMPLETED)
      .reduce((s, p) => s + Number(p.amount), 0);
    const orderTotal = Number(order.total);
    if (alreadyPaid + 0.001 >= orderTotal) {
      throw new BadRequestException('Đơn hàng đã thanh toán đủ');
    }

    const payment = await this.prisma.payment.create({
      data: {
        organizationId,
        orderId: dto.orderId,
        amount: new Prisma.Decimal(dto.amount),
        method: dto.method,
        status: PaymentStatus.COMPLETED,
        reference: idemKey ?? dto.reference,
        paidAt: new Date(),
      },
    });

    const paidNow = alreadyPaid + Number(dto.amount);
    const nextOrderStatus = orderStatusFromPaid(orderTotal, paidNow);
    await this.prisma.order.update({
      where: { id: order.id },
      data: { status: nextOrderStatus },
    });

    if (order.leadId && nextOrderStatus === OrderStatus.PAID) {
      await this.promoteLeadPurchased(organizationId, order.leadId, userId);
      void this.canvasRuntime.advance({
        organizationId,
        leadId: order.leadId,
        event: 'PURCHASE',
        orderId: order.id,
        paymentId: payment.id,
        revenue: Number(dto.amount),
      });
    }

    const priorOrders = await this.prisma.order.count({
      where: {
        organizationId,
        customerId: order.customerId,
        id: { not: order.id },
        payments: { some: { status: PaymentStatus.COMPLETED } },
      },
    });

    await this.attributionHooks.onPayment(organizationId, {
      id: payment.id,
      orderId: order.id,
      amount: Number(dto.amount),
      status: PaymentStatus.COMPLETED,
      leadId: order.leadId,
      customerId: order.customerId,
      branchId: order.branchId,
      serviceIds: order.items.map((i) => i.serviceId).filter(Boolean) as string[],
      isReturningCustomer: priorOrders > 0,
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'PAYMENT_CREATED',
      entityType: 'PAYMENT',
      entityId: payment.id,
      metadata: {
        orderId: order.id,
        amount: dto.amount,
        reference: payment.reference,
        orderStatus: nextOrderStatus,
      },
    });

    return payment;
  }

  async refundPayment(organizationId: string, paymentId: string, userId?: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, organizationId },
      include: { order: true },
    });
    if (!payment) throw new NotFoundException('Thanh toán không tồn tại');
    assertPaymentRefundable(payment.status);

    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: PaymentStatus.REFUNDED },
    });

    const completed = await this.prisma.payment.findMany({
      where: {
        organizationId,
        orderId: payment.orderId,
        status: PaymentStatus.COMPLETED,
      },
    });
    const paid = completed.reduce((s, p) => s + Number(p.amount), 0);
    const orderTotal = Number(payment.order.total);
    const nextStatus =
      paid <= 0 ? OrderStatus.REFUNDED : orderStatusFromPaid(orderTotal, paid);
    await this.prisma.order.update({
      where: { id: payment.orderId },
      data: { status: nextStatus },
    });

    await this.attributionHooks.onPayment(organizationId, {
      id: updated.id,
      orderId: payment.orderId,
      amount: Number(payment.amount),
      status: PaymentStatus.REFUNDED,
      leadId: payment.order.leadId,
      customerId: payment.order.customerId,
      branchId: payment.order.branchId,
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'PAYMENT_REFUNDED',
      entityType: 'PAYMENT',
      entityId: paymentId,
      metadata: { orderId: payment.orderId, amount: Number(payment.amount), orderStatus: nextStatus },
    });

    return updated;
  }

  async cancelOrder(organizationId: string, orderId: string, userId?: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, organizationId },
      include: { payments: true },
    });
    if (!order) throw new NotFoundException('Đơn hàng không tồn tại');
    if (order.status === OrderStatus.CANCELLED) return order;

    const hasCompleted = order.payments.some((p) => p.status === PaymentStatus.COMPLETED);
    if (hasCompleted) {
      throw new BadRequestException('Đơn đã thanh toán — hãy hoàn tiền trước khi hủy');
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'ORDER_CANCELLED',
      entityType: 'ORDER',
      entityId: orderId,
      metadata: { previousStatus: order.status },
    });

    return updated;
  }

  private async promoteLeadPurchased(
    organizationId: string,
    leadId: string,
    userId?: string,
  ) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, organizationId },
    });
    if (!lead || lead.pipelineStatus === LeadPipelineStatus.PURCHASED) return;

    const stage = await this.pipeline.resolveStageForStatus(
      organizationId,
      LeadPipelineStatus.PURCHASED,
    );
    const previousStatus = lead.pipelineStatus;
    await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        pipelineStatus: LeadPipelineStatus.PURCHASED,
        stageId: stage?.id,
        pipelineId: stage?.pipelineId,
        convertedAt: new Date(),
      },
    });
    await this.prisma.leadActivity.create({
      data: {
        organizationId,
        leadId,
        actorUserId: userId,
        action: 'STATUS_CHANGED',
        fromValue: previousStatus,
        toValue: LeadPipelineStatus.PURCHASED,
        metadata: { source: 'payment' },
      },
    });
    await this.attributionHooks.onLeadQualified(organizationId, leadId);
    this.events.broadcastLeadStatusChanged(organizationId, {
      leadId,
      name: lead.name,
      previousStatus,
      pipelineStatus: LeadPipelineStatus.PURCHASED,
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

  async createExpense(organizationId: string, dto: CreateExpenseDto) {
    await this.tenant.validateBranchBoundRelations(organizationId, {
      branchId: dto.branchId,
      adCampaignId: dto.adCampaignId,
    });
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
