import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SalesPurchaseOrderStatus } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from './inventory.service';
import { buildPaginatedResult, getPaginationParams } from '../common/utils/pagination.util';
import { PaginationDto } from '../common/dto/pagination.dto';

@Injectable()
export class SalesPurchaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
  ) {}

  private decimal(n: number) {
    return new Prisma.Decimal(Number(n) || 0);
  }

  // ── Suppliers ────────────────────────────────────────────────────────────

  async listSuppliers(organizationId: string, query?: PaginationDto & { search?: string }) {
    const { page, pageSize, skip, take } = getPaginationParams(query ?? {});
    const where: Prisma.SalesSupplierWhereInput = { organizationId, isActive: true };
    if (query?.search?.trim()) {
      where.name = { contains: query.search.trim(), mode: 'insensitive' };
    }
    const [items, total] = await Promise.all([
      this.prisma.salesSupplier.findMany({
        where,
        skip,
        take,
        orderBy: { name: 'asc' },
      }),
      this.prisma.salesSupplier.count({ where }),
    ]);
    return buildPaginatedResult(items, total, page, pageSize);
  }

  async createSupplier(
    organizationId: string,
    dto: {
      name: string;
      phone?: string;
      email?: string;
      address?: string;
      taxCode?: string;
      note?: string;
    },
    userId?: string,
  ) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Thiếu tên NCC');
    const created = await this.prisma.salesSupplier.create({
      data: {
        organizationId,
        name,
        phone: dto.phone?.trim() || null,
        email: dto.email?.trim() || null,
        address: dto.address?.trim() || null,
        taxCode: dto.taxCode?.trim() || null,
        note: dto.note?.trim() || null,
      },
    });
    await this.audit.log({
      organizationId,
      userId,
      action: 'SALES_SUPPLIER_CREATED',
      entityType: 'SALES_SUPPLIER',
      entityId: created.id,
    });
    return created;
  }

  async updateSupplier(
    organizationId: string,
    id: string,
    dto: Partial<{
      name: string;
      phone: string;
      email: string;
      address: string;
      taxCode: string;
      note: string;
      isActive: boolean;
    }>,
  ) {
    const existing = await this.prisma.salesSupplier.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException('Không tìm thấy NCC');
    return this.prisma.salesSupplier.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
        ...(dto.email !== undefined ? { email: dto.email?.trim() || null } : {}),
        ...(dto.address !== undefined ? { address: dto.address?.trim() || null } : {}),
        ...(dto.taxCode !== undefined ? { taxCode: dto.taxCode?.trim() || null } : {}),
        ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  // ── Purchase Orders ──────────────────────────────────────────────────────

  private async nextPoCode(organizationId: string) {
    const day = new Date();
    const y = day.getFullYear();
    const m = String(day.getMonth() + 1).padStart(2, '0');
    const d = String(day.getDate()).padStart(2, '0');
    const prefix = `PO-${y}${m}${d}-`;
    const count = await this.prisma.salesPurchaseOrder.count({
      where: { organizationId, code: { startsWith: prefix } },
    });
    return `${prefix}${String(count + 1).padStart(4, '0')}`;
  }

  async listPurchaseOrders(
    organizationId: string,
    query: PaginationDto & { status?: string },
  ) {
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const where: Prisma.SalesPurchaseOrderWhereInput = { organizationId };
    if (query.status) where.status = query.status as SalesPurchaseOrderStatus;
    const [items, total] = await Promise.all([
      this.prisma.salesPurchaseOrder.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: { select: { id: true, name: true, phone: true } },
          items: true,
        },
      }),
      this.prisma.salesPurchaseOrder.count({ where }),
    ]);
    return buildPaginatedResult(
      items.map((po) => this.serializePo(po)),
      total,
      page,
      pageSize,
    );
  }

  async getPurchaseOrder(organizationId: string, id: string) {
    const po = await this.prisma.salesPurchaseOrder.findFirst({
      where: { id, organizationId },
      include: {
        supplier: true,
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
      },
    });
    if (!po) throw new NotFoundException('Không tìm thấy PO');
    return this.serializePo(po);
  }

  async createPurchaseOrder(
    organizationId: string,
    dto: {
      supplierId: string;
      expectedDate?: string;
      note?: string;
      items: Array<{ productId: string; quantity: number; unitCost: number }>;
    },
    userId?: string,
  ) {
    if (!dto.items?.length) throw new BadRequestException('PO cần ít nhất 1 dòng');
    const supplier = await this.prisma.salesSupplier.findFirst({
      where: { id: dto.supplierId, organizationId, isActive: true },
    });
    if (!supplier) throw new BadRequestException('NCC không hợp lệ');

    const productIds = [...new Set(dto.items.map((i) => i.productId))];
    const products = await this.prisma.salesProduct.findMany({
      where: { organizationId, id: { in: productIds } },
    });
    if (products.length !== productIds.length) {
      throw new BadRequestException('Sản phẩm không thuộc tổ chức');
    }
    const byId = new Map(products.map((p) => [p.id, p]));

    const code = await this.nextPoCode(organizationId);
    const lines = dto.items.map((it) => {
      const qty = Math.max(1, Math.trunc(Number(it.quantity) || 0));
      const unitCost = Math.max(0, Number(it.unitCost) || 0);
      const p = byId.get(it.productId)!;
      return {
        productId: p.id,
        productName: p.name,
        quantity: qty,
        unitCost,
        lineTotal: qty * unitCost,
      };
    });
    const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);

    const po = await this.prisma.$transaction(async (tx) => {
      const created = await tx.salesPurchaseOrder.create({
        data: {
          organizationId,
          supplierId: supplier.id,
          code,
          status: SalesPurchaseOrderStatus.ORDERED,
          expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
          note: dto.note?.trim() || null,
          subtotal: this.decimal(subtotal),
          createdById: userId ?? null,
          orderedAt: new Date(),
          items: {
            create: lines.map((l) => ({
              productId: l.productId,
              productName: l.productName,
              quantity: l.quantity,
              unitCost: this.decimal(l.unitCost),
              lineTotal: this.decimal(l.lineTotal),
            })),
          },
        },
        include: { supplier: true, items: true },
      });
      await this.audit.log(
        {
          organizationId,
          userId,
          action: 'SALES_PO_CREATED',
          entityType: 'SALES_PURCHASE_ORDER',
          entityId: created.id,
          metadata: { code, subtotal, lineCount: lines.length },
        },
        tx,
      );
      return created;
    });

    return this.serializePo(po);
  }

  /**
   * Nhận hàng PO → InventoryService.applyInboundInTx (INBOUND).
   * Idempotent theo receivedQty: không nhận vượt; retry an toàn.
   */
  async receiveGoods(
    organizationId: string,
    poId: string,
    dto: {
      items: Array<{
        productId: string;
        quantity: number;
        batchCode?: string;
        expiryDate?: string;
      }>;
      note?: string;
    },
    userId?: string,
  ) {
    if (!dto.items?.length) throw new BadRequestException('Thiếu dòng nhận hàng');

    return this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: string; status: string; code: string }>>`
          SELECT id, status, code FROM sales_purchase_orders
          WHERE id = ${poId} AND organization_id = ${organizationId}
          FOR UPDATE
        `;
        if (!locked.length) throw new NotFoundException('Không tìm thấy PO');
        const header = locked[0]!;
        if (
          header.status === SalesPurchaseOrderStatus.CANCELLED ||
          header.status === SalesPurchaseOrderStatus.RECEIVED
        ) {
          // Idempotent: already fully received
          if (header.status === SalesPurchaseOrderStatus.RECEIVED) {
            return this.getPurchaseOrder(organizationId, poId);
          }
          throw new BadRequestException('PO đã hủy');
        }

        const poItems = await tx.salesPurchaseOrderItem.findMany({
          where: { purchaseOrderId: poId },
        });
        const byProduct = new Map(poItems.map((i) => [i.productId, i]));

        for (const recv of dto.items) {
          const line = byProduct.get(recv.productId);
          if (!line) throw new BadRequestException(`SP không có trên PO: ${recv.productId}`);
          const qty = Math.trunc(Number(recv.quantity) || 0);
          if (qty <= 0) continue;
          const remain = line.quantity - line.receivedQty;
          if (qty > remain) {
            throw new BadRequestException(
              `Nhận vượt PO cho ${line.productName} (còn ${remain})`,
            );
          }

          const batchCode =
            recv.batchCode?.trim() ||
            `PO-${header.code}-${line.productId.slice(0, 6).toUpperCase()}`;

          await this.inventory.applyInboundInTx(
            tx,
            organizationId,
            {
              productId: line.productId,
              batchCode,
              quantity: qty,
              unitCost: Number(line.unitCost),
              expiryDate: recv.expiryDate,
              reason: `Nhận hàng PO ${header.code}`,
              note: dto.note?.trim() || undefined,
              referenceType: 'PURCHASE_ORDER',
              referenceId: poId,
            },
            userId,
          );

          await tx.salesPurchaseOrderItem.update({
            where: { id: line.id },
            data: { receivedQty: { increment: qty } },
          });
        }

        const refreshed = await tx.salesPurchaseOrderItem.findMany({
          where: { purchaseOrderId: poId },
        });
        const allRecv = refreshed.every((i) => i.receivedQty >= i.quantity);
        const anyRecv = refreshed.some((i) => i.receivedQty > 0);
        const status = allRecv
          ? SalesPurchaseOrderStatus.RECEIVED
          : anyRecv
            ? SalesPurchaseOrderStatus.PARTIAL_RECEIVED
            : SalesPurchaseOrderStatus.ORDERED;

        await tx.salesPurchaseOrder.update({
          where: { id: poId },
          data: {
            status,
            ...(allRecv ? { receivedAt: new Date() } : {}),
          },
        });

        await this.audit.log(
          {
            organizationId,
            userId,
            action: 'SALES_PO_RECEIVED',
            entityType: 'SALES_PURCHASE_ORDER',
            entityId: poId,
            metadata: { code: header.code, status, items: dto.items },
          },
          tx,
        );

        return tx.salesPurchaseOrder.findFirstOrThrow({
          where: { id: poId, organizationId },
          include: {
            supplier: true,
            items: true,
          },
        }).then((po) => this.serializePo(po));
      },
      { timeout: 30_000 },
    );
  }

  private serializePo<
    T extends {
      subtotal: Prisma.Decimal;
      items?: Array<{ unitCost: Prisma.Decimal; lineTotal: Prisma.Decimal }>;
    },
  >(po: T) {
    return {
      ...po,
      subtotal: Number(po.subtotal),
      items: po.items?.map((i) => ({
        ...i,
        unitCost: Number(i.unitCost),
        lineTotal: Number(i.lineTotal),
      })),
    };
  }
}
