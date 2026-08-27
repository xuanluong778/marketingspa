import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SalesOrderStatus,
  SalesReturnDocStatus,
} from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from './inventory.service';

@Injectable()
export class SalesReturnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
  ) {}

  private decimal(n: number) {
    return new Prisma.Decimal(Number(n) || 0);
  }

  private async nextCode(organizationId: string) {
    const day = new Date();
    const y = day.getFullYear();
    const m = String(day.getMonth() + 1).padStart(2, '0');
    const d = String(day.getDate()).padStart(2, '0');
    const prefix = `RT-${y}${m}${d}-`;
    const count = await this.prisma.salesReturn.count({
      where: { organizationId, code: { startsWith: prefix } },
    });
    return `${prefix}${String(count + 1).padStart(4, '0')}`;
  }

  async list(organizationId: string, orderId?: string) {
    return this.prisma.salesReturn.findMany({
      where: {
        organizationId,
        ...(orderId ? { orderId } : {}),
      },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async get(organizationId: string, id: string) {
    const row = await this.prisma.salesReturn.findFirst({
      where: { id, organizationId },
      include: {
        items: true,
        order: { select: { id: true, code: true, status: true, exportedAt: true } },
      },
    });
    if (!row) throw new NotFoundException('Không tìm thấy phiếu trả');
    return {
      ...row,
      refundAmount: Number(row.refundAmount),
      items: row.items.map((i) => ({ ...i, refundAmount: Number(i.refundAmount) })),
    };
  }

  /**
   * Tạo + xác nhận phiếu trả (một phần/toàn phần) trong 1 transaction.
   * Stock: RETURN_IN idempotent theo SALES_RETURN + returnId::productId.
   */
  async createAndConfirm(
    organizationId: string,
    dto: {
      orderId: string;
      reason?: string;
      note?: string;
      refundAmount?: number;
      items: Array<{
        orderItemId: string;
        quantity: number;
        refundAmount?: number;
        reason?: string;
      }>;
    },
    userId?: string,
  ) {
    if (!dto.items?.length) throw new BadRequestException('Thiếu dòng trả hàng');

    return this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<
          Array<{
            id: string;
            code: string;
            status: SalesOrderStatus;
            exported_at: Date | null;
          }>
        >`
          SELECT id, code, status, exported_at
          FROM sales_orders
          WHERE id = ${dto.orderId} AND organization_id = ${organizationId}
          FOR UPDATE
        `;
        if (!locked.length) throw new NotFoundException('Không tìm thấy đơn hàng');
        const order = locked[0]!;
        if (!order.exported_at) {
          throw new BadRequestException('Đơn chưa xuất kho — không trả hàng kho');
        }
        if (
          order.status === SalesOrderStatus.CANCELLED ||
          order.status === SalesOrderStatus.RETURNED
        ) {
          throw new BadRequestException('Đơn đã hủy/trả hết — không trả thêm');
        }

        const code = await this.nextCode(organizationId);
        const orderItems = await tx.salesOrderItem.findMany({
          where: { orderId: dto.orderId },
        });
        const byId = new Map(orderItems.map((i) => [i.id, i]));

        const lines: Array<{
          orderItemId: string;
          productId: string | null;
          quantity: number;
          refundAmount: number;
          reason?: string;
        }> = [];

        for (const it of dto.items) {
          const oi = byId.get(it.orderItemId);
          if (!oi) throw new BadRequestException(`Dòng đơn không hợp lệ: ${it.orderItemId}`);
          const qty = Math.trunc(Number(it.quantity) || 0);
          if (qty <= 0) throw new BadRequestException('Số lượng trả phải > 0');
          const remain = oi.quantity - oi.returnedQty;
          if (qty > remain) {
            throw new BadRequestException(
              `Trả vượt số còn lại của dòng ${oi.productName} (còn ${remain})`,
            );
          }
          lines.push({
            orderItemId: oi.id,
            productId: oi.productId,
            quantity: qty,
            refundAmount: Math.max(0, Number(it.refundAmount) || 0),
            reason: it.reason,
          });
        }

        const refundAmount =
          dto.refundAmount !== undefined
            ? Math.max(0, Number(dto.refundAmount) || 0)
            : lines.reduce((s, l) => s + l.refundAmount, 0);

        const ret = await tx.salesReturn.create({
          data: {
            organizationId,
            orderId: dto.orderId,
            code,
            status: SalesReturnDocStatus.CONFIRMED,
            reason: dto.reason?.trim() || null,
            note: dto.note?.trim() || null,
            refundAmount: this.decimal(refundAmount),
            processedById: userId ?? null,
            confirmedAt: new Date(),
            items: {
              create: lines.map((l) => ({
                orderItemId: l.orderItemId,
                productId: l.productId,
                quantity: l.quantity,
                refundAmount: this.decimal(l.refundAmount),
                reason: l.reason?.trim() || null,
              })),
            },
          },
          include: { items: true },
        });

        for (const l of lines) {
          if (!l.productId) continue;
          await this.inventory.returnPartialForSalesOrder(tx, {
            organizationId,
            orderId: dto.orderId,
            productId: l.productId,
            quantity: l.quantity,
            performedById: userId,
            reason: dto.reason || `Trả hàng ${code}`,
            referenceType: 'SALES_RETURN',
            referenceId: `${ret.id}::${l.productId}`,
          });
          await tx.salesOrderItem.update({
            where: { id: l.orderItemId },
            data: { returnedQty: { increment: l.quantity } },
          });
        }

        const refreshed = await tx.salesOrderItem.findMany({ where: { orderId: dto.orderId } });
        const allReturned = refreshed.every((i) => i.returnedQty >= i.quantity);
        const anyReturned = refreshed.some((i) => i.returnedQty > 0);

        let nextStatus: SalesOrderStatus = order.status;
        if (allReturned) nextStatus = SalesOrderStatus.RETURNED;
        else if (anyReturned) nextStatus = SalesOrderStatus.PARTIALLY_RETURNED;

        await tx.salesOrder.update({
          where: { id: dto.orderId },
          data: {
            status: nextStatus,
            ...(allReturned ? { returnedAt: new Date() } : {}),
          },
        });

        await this.audit.log(
          {
            organizationId,
            userId,
            action: 'SALES_RETURN_CONFIRMED',
            entityType: 'SALES_RETURN',
            entityId: ret.id,
            metadata: {
              code,
              orderId: dto.orderId,
              refundAmount,
              lines: lines.map((l) => ({
                orderItemId: l.orderItemId,
                productId: l.productId,
                quantity: l.quantity,
              })),
              nextStatus,
            },
          },
          tx,
        );

        return {
          ...ret,
          refundAmount: Number(ret.refundAmount),
          items: ret.items.map((i) => ({ ...i, refundAmount: Number(i.refundAmount) })),
          orderStatus: nextStatus,
        };
      },
      { timeout: 30_000 },
    );
  }
}
