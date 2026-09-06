import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SalesPaymentKind,
  SalesPaymentStatus,
} from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class SalesPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private decimal(n: number) {
    return new Prisma.Decimal(Number(n) || 0);
  }

  private deriveStatus(total: number, netPaid: number): SalesPaymentStatus {
    const t = Math.round(total * 100) / 100;
    const p = Math.round(netPaid * 100) / 100;
    if (p <= 0) return SalesPaymentStatus.UNPAID;
    if (p >= t) return SalesPaymentStatus.PAID;
    return SalesPaymentStatus.PARTIAL;
  }

  private deriveAfterRefund(
    total: number,
    netPaid: number,
    hadPayment: boolean,
  ): SalesPaymentStatus {
    const t = Math.round(total * 100) / 100;
    const p = Math.round(netPaid * 100) / 100;
    if (p <= 0) {
      return hadPayment ? SalesPaymentStatus.REFUNDED : SalesPaymentStatus.UNPAID;
    }
    if (p >= t) return SalesPaymentStatus.PAID;
    // có refund nhưng vẫn còn tiền đã thu
    return SalesPaymentStatus.PARTIALLY_REFUNDED;
  }

  async list(organizationId: string, orderId: string) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: orderId, organizationId },
      select: { id: true },
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    const items = await this.prisma.salesPayment.findMany({
      where: { organizationId, orderId },
      orderBy: { paidAt: 'asc' },
    });
    return items.map((p) => ({
      ...p,
      amount: Number(p.amount),
    }));
  }

  async addPayment(
    organizationId: string,
    orderId: string,
    dto: {
      amount: number;
      method?: string;
      transactionRef?: string;
      paidAt?: string;
      note?: string;
      idempotencyKey?: string;
    },
    userId?: string,
  ) {
    const amount = Math.round((Number(dto.amount) || 0) * 100) / 100;
    if (amount <= 0) throw new BadRequestException('Số tiền thu phải > 0');

    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{
          id: string;
          total: Prisma.Decimal;
          amount_paid: Prisma.Decimal;
          payment_status: SalesPaymentStatus;
        }>
      >`
        SELECT id, total, amount_paid, payment_status
        FROM sales_orders
        WHERE id = ${orderId} AND organization_id = ${organizationId}
        FOR UPDATE
      `;
      if (!locked.length) throw new NotFoundException('Không tìm thấy đơn hàng');
      const row = locked[0]!;

      if (dto.idempotencyKey) {
        const existing = await tx.salesPayment.findFirst({
          where: {
            organizationId,
            orderId,
            kind: SalesPaymentKind.PAYMENT,
            transactionRef: dto.idempotencyKey,
          },
        });
        if (existing) {
          const order = await tx.salesOrder.findFirstOrThrow({
            where: { id: orderId, organizationId },
            include: { payments: true, items: true },
          });
          return this.serializeOrderMoney(order);
        }
      }

      const total = Number(row.total);
      const prevPaid = Number(row.amount_paid);
      const nextPaid = Math.round((prevPaid + amount) * 100) / 100;
      if (nextPaid > total + 0.009) {
        throw new BadRequestException(
          `Thu vượt tổng đơn (đã thu ${prevPaid}, thu thêm ${amount}, tổng ${total})`,
        );
      }

      const method = dto.method?.trim() || null;
      const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
      const txRef = dto.idempotencyKey?.trim() || dto.transactionRef?.trim() || null;

      await tx.salesPayment.create({
        data: {
          organizationId,
          orderId,
          kind: SalesPaymentKind.PAYMENT,
          amount: this.decimal(amount),
          method,
          transactionRef: txRef,
          paidAt,
          note: dto.note?.trim() || null,
          performedById: userId ?? null,
        },
      });

      const status = this.deriveStatus(total, nextPaid);
      const updated = await tx.salesOrder.update({
        where: { id: orderId },
        data: {
          amountPaid: this.decimal(nextPaid),
          paymentStatus: status,
          paymentMethod: method ?? undefined,
          paidAt: status === SalesPaymentStatus.PAID ? paidAt : row.payment_status === SalesPaymentStatus.PAID ? undefined : paidAt,
          transactionRef: txRef ?? undefined,
        },
        include: {
          payments: { orderBy: { paidAt: 'asc' } },
          items: true,
          customer: { select: { id: true, name: true, phone: true } },
        },
      });

      await this.audit.log(
        {
          organizationId,
          userId,
          action: 'SALES_PAYMENT_RECORDED',
          entityType: 'SALES_ORDER',
          entityId: orderId,
          metadata: { amount, nextPaid, status, method, transactionRef: txRef },
        },
        tx,
      );

      return this.serializeOrderMoney(updated);
    });
  }

  async addRefund(
    organizationId: string,
    orderId: string,
    dto: {
      amount: number;
      method?: string;
      transactionRef?: string;
      paidAt?: string;
      note?: string;
      idempotencyKey?: string;
    },
    userId?: string,
  ) {
    const amount = Math.round((Number(dto.amount) || 0) * 100) / 100;
    if (amount <= 0) throw new BadRequestException('Số tiền hoàn phải > 0');

    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{
          id: string;
          total: Prisma.Decimal;
          amount_paid: Prisma.Decimal;
        }>
      >`
        SELECT id, total, amount_paid
        FROM sales_orders
        WHERE id = ${orderId} AND organization_id = ${organizationId}
        FOR UPDATE
      `;
      if (!locked.length) throw new NotFoundException('Không tìm thấy đơn hàng');
      const row = locked[0]!;
      const total = Number(row.total);
      const prevPaid = Number(row.amount_paid);
      if (amount > prevPaid + 0.009) {
        throw new BadRequestException(`Hoàn vượt số đã thu (${prevPaid})`);
      }

      if (dto.idempotencyKey) {
        const existing = await tx.salesPayment.findFirst({
          where: {
            organizationId,
            orderId,
            kind: SalesPaymentKind.REFUND,
            transactionRef: dto.idempotencyKey,
          },
        });
        if (existing) {
          const order = await tx.salesOrder.findFirstOrThrow({
            where: { id: orderId, organizationId },
            include: { payments: true, items: true },
          });
          return this.serializeOrderMoney(order);
        }
      }

      const nextPaid = Math.round((prevPaid - amount) * 100) / 100;
      const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
      const txRef = dto.idempotencyKey?.trim() || dto.transactionRef?.trim() || null;

      await tx.salesPayment.create({
        data: {
          organizationId,
          orderId,
          kind: SalesPaymentKind.REFUND,
          amount: this.decimal(amount),
          method: dto.method?.trim() || null,
          transactionRef: txRef,
          paidAt,
          note: dto.note?.trim() || null,
          performedById: userId ?? null,
        },
      });

      const hadPayment = prevPaid > 0;
      const status = this.deriveAfterRefund(total, nextPaid, hadPayment);
      const updated = await tx.salesOrder.update({
        where: { id: orderId },
        data: {
          amountPaid: this.decimal(nextPaid),
          paymentStatus: status,
          paymentMethod: dto.method?.trim() || undefined,
          transactionRef: txRef ?? undefined,
        },
        include: {
          payments: { orderBy: { paidAt: 'asc' } },
          items: true,
          customer: { select: { id: true, name: true, phone: true } },
        },
      });

      await this.audit.log(
        {
          organizationId,
          userId,
          action: 'SALES_PAYMENT_REFUNDED',
          entityType: 'SALES_ORDER',
          entityId: orderId,
          metadata: { amount, nextPaid, status },
        },
        tx,
      );

      return this.serializeOrderMoney(updated);
    });
  }

  serializeOrderMoney<
    T extends {
      subtotal: Prisma.Decimal;
      discount: Prisma.Decimal;
      shippingFee: Prisma.Decimal;
      total: Prisma.Decimal;
      amountPaid: Prisma.Decimal;
      payments?: Array<{ amount: Prisma.Decimal }>;
      items?: Array<{
        unitPrice: Prisma.Decimal;
        lineDiscount: Prisma.Decimal;
        totalPrice: Prisma.Decimal;
      }>;
    },
  >(order: T) {
    const total = Number(order.total);
    const amountPaid = Number(order.amountPaid);
    return {
      ...order,
      subtotal: Number(order.subtotal),
      discount: Number(order.discount),
      shippingFee: Number(order.shippingFee),
      total,
      amountPaid,
      amountDue: Math.max(0, Math.round((total - amountPaid) * 100) / 100),
      payments: order.payments?.map((p) => ({ ...p, amount: Number(p.amount) })),
      items: order.items?.map((it) => ({
        ...it,
        unitPrice: Number(it.unitPrice),
        lineDiscount: Number(it.lineDiscount),
        totalPrice: Number(it.totalPrice),
      })),
    };
  }
}
