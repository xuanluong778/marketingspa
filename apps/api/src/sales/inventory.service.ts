import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SalesStockMovementType } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { buildPaginatedResult, getPaginationParams } from '../common/utils/pagination.util';
import { PaginationDto } from '../common/dto/pagination.dto';

export type StockTx = Prisma.TransactionClient;

type AllocateResult = { batchId: string; batchCode: string; quantity: number };

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private decimal(n: number) {
    return new Prisma.Decimal(Number(n) || 0);
  }

  /** Start of today (UTC date boundary for date-only expiry) */
  private todayStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Đồng bộ tồn = SUM(remainingQuantity) mọi lô còn hàng (kể cả hết hạn).
   * Xuất FEFO vẫn chỉ trừ lô còn hạn — hàng hết hạn nằm trong tồn cho đến khi kiểm kê/điều chỉnh.
   */
  async syncProductStock(tx: StockTx, organizationId: string, productId: string) {
    const agg = await tx.salesStockBatch.aggregate({
      where: {
        organizationId,
        productId,
        remainingQuantity: { gt: 0 },
      },
      _sum: { remainingQuantity: true },
    });
    const stockQty = agg._sum.remainingQuantity ?? 0;
    await tx.salesProduct.update({
      where: { id: productId },
      data: { stockQty },
    });
    return stockQty;
  }

  /** physical / sellable / expired — backend source of truth */
  async stockBreakdown(
    db: StockTx | PrismaService,
    organizationId: string,
    productId: string,
  ) {
    const map = await this.stockBreakdownMany(db, organizationId, [productId]);
    return map.get(productId) || { physicalQty: 0, sellableQty: 0, expiredQty: 0 };
  }

  /** Batch stock breakdown — avoids N+1 on reports/inventory lists. */
  async stockBreakdownMany(
    db: StockTx | PrismaService,
    organizationId: string,
    productIds: string[],
  ) {
    const out = new Map<
      string,
      { physicalQty: number; sellableQty: number; expiredQty: number }
    >();
    for (const id of productIds) {
      out.set(id, { physicalQty: 0, sellableQty: 0, expiredQty: 0 });
    }
    if (!productIds.length) return out;
    const today = this.todayStart();
    const batches = await db.salesStockBatch.findMany({
      where: {
        organizationId,
        productId: { in: productIds },
        remainingQuantity: { gt: 0 },
      },
      select: { productId: true, remainingQuantity: true, expiryDate: true },
    });
    for (const b of batches) {
      const row = out.get(b.productId) || {
        physicalQty: 0,
        sellableQty: 0,
        expiredQty: 0,
      };
      row.physicalQty += b.remainingQuantity;
      if (b.expiryDate && b.expiryDate < today) row.expiredQty += b.remainingQuantity;
      else row.sellableQty += b.remainingQuantity;
      out.set(b.productId, row);
    }
    return out;
  }

  /** Tồn bán được (chỉ lô còn hạn) — dùng kiểm tra xuất */
  async sellableStock(
    db: StockTx | PrismaService,
    organizationId: string,
    productId: string,
  ) {
    const b = await this.stockBreakdown(db, organizationId, productId);
    return b.sellableQty;
  }

  /**
   * Row-lock sản phẩm trong org — chặn 2 user xuất/điều chỉnh cùng lúc.
   * Phải gọi bên trong $transaction.
   */
  async lockProductForStock(tx: StockTx, organizationId: string, productId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM sales_products
      WHERE id = ${productId} AND organization_id = ${organizationId}
      FOR UPDATE
    `;
    if (!rows.length) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }
  }

  /**
   * Row-lock mọi lô còn hàng của SP (kể cả hết hạn) để FEFO/allocate atomic.
   */
  async lockBatchesForProduct(tx: StockTx, organizationId: string, productId: string) {
    await tx.$queryRaw`
      SELECT id FROM sales_stock_batches
      WHERE organization_id = ${organizationId}
        AND product_id = ${productId}
        AND remaining_quantity > 0
      ORDER BY id
      FOR UPDATE
    `;
  }

  /**
   * FEFO: expiryDate ASC (nulls last), then importedAt ASC.
   * Never allocate expired batches. Never allow negative remaining.
   * Locks product + batches before allocate (anti-oversell).
   */
  async allocateFefo(
    tx: StockTx,
    organizationId: string,
    productId: string,
    needQty: number,
  ): Promise<AllocateResult[]> {
    if (needQty <= 0) throw new BadRequestException('Số lượng xuất phải > 0');

    await this.lockProductForStock(tx, organizationId, productId);
    await this.lockBatchesForProduct(tx, organizationId, productId);

    const batches = await tx.salesStockBatch.findMany({
      where: {
        organizationId,
        productId,
        remainingQuantity: { gt: 0 },
        OR: [{ expiryDate: null }, { expiryDate: { gte: this.todayStart() } }],
      },
      orderBy: [{ expiryDate: 'asc' }, { importedAt: 'asc' }],
    });

    // Put null expiry last (Prisma ASC puts nulls first on Postgres by default)
    batches.sort((a, b) => {
      if (a.expiryDate && b.expiryDate) {
        const diff = a.expiryDate.getTime() - b.expiryDate.getTime();
        if (diff !== 0) return diff;
      } else if (a.expiryDate && !b.expiryDate) return -1;
      else if (!a.expiryDate && b.expiryDate) return 1;
      return a.importedAt.getTime() - b.importedAt.getTime();
    });

    let left = needQty;
    const alloc: AllocateResult[] = [];
    for (const batch of batches) {
      if (left <= 0) break;
      const take = Math.min(batch.remainingQuantity, left);
      if (take <= 0) continue;
      const nextRemaining = batch.remainingQuantity - take;
      if (nextRemaining < 0) {
        throw new BadRequestException('Không cho phép tồn âm');
      }
      await tx.salesStockBatch.update({
        where: { id: batch.id },
        data: { remainingQuantity: nextRemaining },
      });
      alloc.push({ batchId: batch.id, batchCode: batch.batchCode, quantity: take });
      left -= take;
    }

    if (left > 0) {
      const product = await tx.salesProduct.findFirst({
        where: { id: productId, organizationId },
        select: { name: true, stockQty: true },
      });
      throw new BadRequestException(
        `Không đủ tồn kho hợp lệ (chưa hết hạn) cho "${product?.name ?? productId}" — thiếu ${left} (tồn hiện ${product?.stockQty ?? 0})`,
      );
    }

    await this.syncProductStock(tx, organizationId, productId);
    return alloc;
  }

  async createOutboundMovement(
    tx: StockTx,
    opts: {
      organizationId: string;
      productId: string;
      allocations: AllocateResult[];
      reason?: string;
      note?: string;
      performedById?: string;
      referenceType?: string;
      referenceId?: string;
    },
  ) {
    const quantity = opts.allocations.reduce((s, a) => s + a.quantity, 0);
    return tx.salesStockMovement.create({
      data: {
        organizationId: opts.organizationId,
        type: SalesStockMovementType.OUTBOUND,
        productId: opts.productId,
        quantity,
        reason: opts.reason ?? null,
        note: opts.note ?? null,
        performedById: opts.performedById ?? null,
        referenceType: opts.referenceType ?? null,
        referenceId: opts.referenceId ?? null,
        lines: {
          create: opts.allocations.map((a) => ({
            batchId: a.batchId,
            quantity: a.quantity,
          })),
        },
      },
      include: { lines: true },
    });
  }

  /** Nhập kho — tạo/ cộng lô + ghi lịch sử INBOUND */
  async inbound(
    organizationId: string,
    dto: {
      productId: string;
      batchCode: string;
      quantity: number;
      expiryDate?: string | null;
      importedAt?: string | null;
      unitCost?: number;
      reason?: string;
      note?: string;
      referenceType?: string;
      referenceId?: string;
    },
    userId?: string,
  ) {
    const movement = await this.prisma.$transaction(
      async (tx) => this.applyInboundInTx(tx, organizationId, dto, userId),
      { timeout: 20_000 },
    );
    return this.serializeMovement(movement);
  }

  /** Dùng trong transaction PO receive / mở rộng */
  async applyInboundInTx(
    tx: StockTx,
    organizationId: string,
    dto: {
      productId: string;
      batchCode: string;
      quantity: number;
      expiryDate?: string | null;
      importedAt?: string | null;
      unitCost?: number;
      reason?: string;
      note?: string;
      referenceType?: string;
      referenceId?: string;
    },
    userId?: string,
  ) {
    const qty = Math.floor(Number(dto.quantity) || 0);
    if (qty <= 0) throw new BadRequestException('Số lượng nhập phải > 0');
    const batchCode = dto.batchCode.trim();
    if (!batchCode) throw new BadRequestException('Thiếu mã lô');

    const product = await tx.salesProduct.findFirst({
      where: { id: dto.productId, organizationId },
    });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');

    if (dto.expiryDate) {
      const exp = new Date(dto.expiryDate);
      if (exp < this.todayStart()) {
        throw new BadRequestException('Không nhập lô đã hết hạn');
      }
    }

    await this.lockProductForStock(tx, organizationId, product.id);

    const existing = await tx.salesStockBatch.findFirst({
      where: { organizationId, productId: product.id, batchCode },
    });

    let batchId: string;
    if (existing) {
      await tx.$queryRaw`
        SELECT id FROM sales_stock_batches
        WHERE id = ${existing.id} AND organization_id = ${organizationId}
        FOR UPDATE
      `;
      const locked = await tx.salesStockBatch.findFirstOrThrow({
        where: { id: existing.id, organizationId },
      });
      await tx.salesStockBatch.update({
        where: { id: locked.id },
        data: {
          quantity: locked.quantity + qty,
          remainingQuantity: locked.remainingQuantity + qty,
          ...(dto.expiryDate ? { expiryDate: new Date(dto.expiryDate) } : {}),
          ...(dto.unitCost !== undefined ? { unitCost: this.decimal(dto.unitCost) } : {}),
        },
      });
      batchId = locked.id;
    } else {
      const created = await tx.salesStockBatch.create({
        data: {
          organizationId,
          productId: product.id,
          batchCode,
          quantity: qty,
          remainingQuantity: qty,
          importedAt: dto.importedAt ? new Date(dto.importedAt) : new Date(),
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
          unitCost: this.decimal(dto.unitCost ?? Number(product.costPrice)),
        },
      });
      batchId = created.id;
    }

    await this.syncProductStock(tx, organizationId, product.id);

    const createdMovement = await tx.salesStockMovement.create({
      data: {
        organizationId,
        type: SalesStockMovementType.INBOUND,
        productId: product.id,
        quantity: qty,
        reason: dto.reason?.trim() || 'Nhập kho',
        note: dto.note?.trim() || null,
        performedById: userId ?? null,
        referenceType: dto.referenceType ?? 'MANUAL',
        referenceId: dto.referenceId ?? null,
        lines: { create: [{ batchId, quantity: qty }] },
      },
      include: {
        lines: { include: { batch: true } },
        product: { select: { id: true, name: true, sku: true, stockQty: true } },
      },
    });

    await this.audit.log(
      {
        organizationId,
        userId,
        action: 'SALES_STOCK_INBOUND',
        entityType: 'SALES_STOCK_MOVEMENT',
        entityId: createdMovement.id,
        metadata: {
          productId: dto.productId,
          batchCode,
          qty,
          referenceType: dto.referenceType,
          referenceId: dto.referenceId,
        },
      },
      tx,
    );

    return createdMovement;
  }

  /** Xuất kho thủ công — FEFO */
  async outbound(
    organizationId: string,
    dto: { productId: string; quantity: number; reason?: string; note?: string },
    userId?: string,
  ) {
    const qty = Math.floor(Number(dto.quantity) || 0);
    if (qty <= 0) throw new BadRequestException('Số lượng xuất phải > 0');

    const product = await this.prisma.salesProduct.findFirst({
      where: { id: dto.productId, organizationId },
    });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');

    const movement = await this.prisma.$transaction(
      async (tx) => {
        const allocations = await this.allocateFefo(tx, organizationId, product.id, qty);
        const created = await this.createOutboundMovement(tx, {
          organizationId,
          productId: product.id,
          allocations,
          reason: dto.reason?.trim() || 'Xuất kho',
          note: dto.note?.trim(),
          performedById: userId,
          referenceType: 'MANUAL',
        });
        await this.audit.log(
          {
            organizationId,
            userId,
            action: 'SALES_STOCK_OUTBOUND',
            entityType: 'SALES_STOCK_MOVEMENT',
            entityId: created.id,
            metadata: { productId: dto.productId, qty, allocations },
          },
          tx,
        );
        return created;
      },
      { timeout: 20_000 },
    );

    const full = await this.prisma.salesStockMovement.findFirst({
      where: { id: movement.id, organizationId },
      include: {
        lines: { include: { batch: true } },
        product: { select: { id: true, name: true, sku: true, stockQty: true } },
      },
    });

    return this.serializeMovement(full!);
  }

  /**
   * Điều chỉnh tồn: delta > 0 = tăng (lô ADJUST-xxx), delta < 0 = giảm FEFO.
   * Không cho tồn âm.
   */
  async adjust(
    organizationId: string,
    dto: { productId: string; delta: number; reason: string; note?: string },
    userId?: string,
  ) {
    const delta = Math.trunc(Number(dto.delta) || 0);
    if (delta === 0) throw new BadRequestException('Delta điều chỉnh phải khác 0');
    if (!dto.reason?.trim()) throw new BadRequestException('Bắt buộc nhập lý do điều chỉnh');

    const product = await this.prisma.salesProduct.findFirst({
      where: { id: dto.productId, organizationId },
    });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');

    const movement = await this.prisma.$transaction(
      async (tx) => {
        let created;
        if (delta > 0) {
          await this.lockProductForStock(tx, organizationId, product.id);
          const batchCode = `ADJ-${Date.now().toString(36).toUpperCase()}`;
          const batch = await tx.salesStockBatch.create({
            data: {
              organizationId,
              productId: product.id,
              batchCode,
              quantity: delta,
              remainingQuantity: delta,
              importedAt: new Date(),
              unitCost: product.costPrice,
            },
          });
          await this.syncProductStock(tx, organizationId, product.id);
          created = await tx.salesStockMovement.create({
            data: {
              organizationId,
              type: SalesStockMovementType.ADJUST,
              productId: product.id,
              quantity: delta,
              reason: dto.reason.trim(),
              note: dto.note?.trim() || null,
              performedById: userId ?? null,
              referenceType: 'MANUAL',
              lines: { create: [{ batchId: batch.id, quantity: delta }] },
            },
            include: {
              lines: { include: { batch: true } },
              product: { select: { id: true, name: true, sku: true, stockQty: true } },
            },
          });
        } else {
          // delta < 0 → giảm FEFO (allocateFefo đã lock)
          const need = Math.abs(delta);
          const allocations = await this.allocateFefo(tx, organizationId, product.id, need);
          created = await tx.salesStockMovement.create({
            data: {
              organizationId,
              type: SalesStockMovementType.ADJUST,
              productId: product.id,
              quantity: -need,
              reason: dto.reason.trim(),
              note: dto.note?.trim() || null,
              performedById: userId ?? null,
              referenceType: 'MANUAL',
              lines: {
                create: allocations.map((a) => ({
                  batchId: a.batchId,
                  quantity: a.quantity,
                })),
              },
            },
            include: {
              lines: { include: { batch: true } },
              product: { select: { id: true, name: true, sku: true, stockQty: true } },
            },
          });
        }

        await this.audit.log(
          {
            organizationId,
            userId,
            action: 'SALES_STOCK_ADJUST',
            entityType: 'SALES_STOCK_MOVEMENT',
            entityId: created.id,
            metadata: { productId: dto.productId, delta },
          },
          tx,
        );
        return created;
      },
      { timeout: 20_000 },
    );

    return this.serializeMovement(movement);
  }

  /**
   * Hoàn hàng sau xuất: tạo phiếu RETURN_IN mới (không sửa/xóa OUTBOUND cũ),
   * cộng lại đúng các batch đã trừ.
   * quantity: nếu truyền → hoàn một phần (theo thứ tự dòng outbound).
   * Idempotent:
   *  - full (không qty / qty = remaining): reference RETURN_OF + outboundId
   *  - partial keyed: opts.referenceType + opts.referenceId (vd SALES_RETURN + returnId)
   */
  async returnInboundFromOutbound(
    tx: StockTx,
    opts: {
      organizationId: string;
      outboundMovementId: string;
      performedById?: string;
      reason?: string;
      referenceType?: string;
      referenceId?: string;
      /** Số lượng hoàn; mặc định = phần còn lại chưa hoàn của outbound */
      quantity?: number;
    },
  ) {
    const outbound = await tx.salesStockMovement.findFirst({
      where: {
        id: opts.outboundMovementId,
        organizationId: opts.organizationId,
        type: SalesStockMovementType.OUTBOUND,
      },
      include: { lines: true },
    });
    if (!outbound) throw new NotFoundException('Không tìm thấy phiếu xuất gốc');

    const already = await this.returnedQtyAgainstOutbound(tx, opts.organizationId, outbound.id);
    const remaining = Math.max(0, outbound.quantity - already);

    // Idempotent by reference key first (retry after full return of this key)
    if (opts.referenceType && opts.referenceId) {
      const existingKeyed = await tx.salesStockMovement.findFirst({
        where: {
          organizationId: opts.organizationId,
          type: SalesStockMovementType.RETURN_IN,
          referenceType: opts.referenceType,
          referenceId: opts.referenceId,
          productId: outbound.productId,
        },
      });
      if (existingKeyed) return existingKeyed;
    }

    if (remaining <= 0) {
      const existingFull = await tx.salesStockMovement.findFirst({
        where: {
          organizationId: opts.organizationId,
          type: SalesStockMovementType.RETURN_IN,
          referenceType: 'RETURN_OF',
          referenceId: outbound.id,
        },
      });
      if (existingFull) return existingFull;
      throw new BadRequestException('Outbound đã được hoàn đủ');
    }

    const want =
      opts.quantity !== undefined
        ? Math.min(remaining, Math.max(0, Math.trunc(Number(opts.quantity) || 0)))
        : remaining;
    if (want <= 0) throw new BadRequestException('Số lượng hoàn phải > 0');

    const isFullRemaining = want === remaining && already === 0;

    if (isFullRemaining || (want === remaining && !opts.referenceType)) {
      const existingReturn = await tx.salesStockMovement.findFirst({
        where: {
          organizationId: opts.organizationId,
          type: SalesStockMovementType.RETURN_IN,
          referenceType: 'RETURN_OF',
          referenceId: outbound.id,
        },
      });
      if (existingReturn) return existingReturn;
    }

    // Allocate restore qty across outbound lines after skipping `already`
    let skip = already;
    let need = want;
    const alloc: Array<{ batchId: string; quantity: number }> = [];
    for (const line of outbound.lines) {
      if (need <= 0) break;
      let available = line.quantity;
      if (skip > 0) {
        const used = Math.min(skip, line.quantity);
        skip -= used;
        available = line.quantity - used;
      }
      if (available <= 0) continue;
      const take = Math.min(available, need);
      alloc.push({ batchId: line.batchId, quantity: take });
      need -= take;
    }
    if (need > 0) {
      throw new BadRequestException(`Không đủ dòng xuất để hoàn (thiếu ${need})`);
    }

    await this.lockProductForStock(tx, opts.organizationId, outbound.productId);

    for (const line of alloc) {
      await tx.$queryRaw`
        SELECT id FROM sales_stock_batches
        WHERE id = ${line.batchId} AND organization_id = ${opts.organizationId}
        FOR UPDATE
      `;
      const batch = await tx.salesStockBatch.findFirst({
        where: { id: line.batchId, organizationId: opts.organizationId },
      });
      if (!batch) {
        throw new BadRequestException(`Lô ${line.batchId} không còn để hoàn hàng`);
      }
      await tx.salesStockBatch.update({
        where: { id: batch.id },
        data: {
          remainingQuantity: batch.remainingQuantity + line.quantity,
          quantity: Math.max(batch.quantity, batch.remainingQuantity + line.quantity),
        },
      });
    }

    await this.syncProductStock(tx, opts.organizationId, outbound.productId);

    const refType = opts.referenceType ?? 'RETURN_OF';
    const refId = opts.referenceId ?? outbound.id;

    const created = await tx.salesStockMovement.create({
      data: {
        organizationId: opts.organizationId,
        type: SalesStockMovementType.RETURN_IN,
        productId: outbound.productId,
        quantity: want,
        reason: opts.reason ?? 'Hoàn hàng sau hủy/trả đơn',
        performedById: opts.performedById ?? null,
        referenceType: refType,
        referenceId: refId,
        note: `parentOutbound:${outbound.id}`,
        lines: {
          create: alloc.map((l) => ({
            batchId: l.batchId,
            quantity: l.quantity,
          })),
        },
      },
    });

    await this.audit.log(
      {
        organizationId: opts.organizationId,
        userId: opts.performedById,
        action: 'SALES_STOCK_RETURN_IN',
        entityType: 'SALES_STOCK_MOVEMENT',
        entityId: created.id,
        metadata: {
          outboundMovementId: outbound.id,
          productId: outbound.productId,
          quantity: want,
          alreadyReturned: already,
          referenceType: refType,
          referenceId: refId,
        },
      },
      tx,
    );

    return created;
  }

  /** Tổng qty đã RETURN_IN gắn outbound (RETURN_OF full hoặc note parentOutbound) */
  async returnedQtyAgainstOutbound(
    tx: StockTx,
    organizationId: string,
    outboundId: string,
  ) {
    const returns = await tx.salesStockMovement.findMany({
      where: {
        organizationId,
        type: SalesStockMovementType.RETURN_IN,
        OR: [
          { referenceType: 'RETURN_OF', referenceId: outboundId },
          { note: { startsWith: `parentOutbound:${outboundId}` } },
          { note: `parentOutbound:${outboundId}` },
        ],
      },
      select: { quantity: true, id: true },
    });
    // Deduplicate by id
    const seen = new Set<string>();
    let sum = 0;
    for (const r of returns) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      sum += r.quantity;
    }
    return sum;
  }

  /** Xuất hàng theo đơn — FEFO từng dòng có productId */
  async exportForSalesOrder(
    tx: StockTx,
    opts: {
      organizationId: string;
      orderId: string;
      orderCode: string;
      items: Array<{ productId: string | null; productName: string; quantity: number }>;
      performedById?: string;
    },
  ) {
    // Idempotent: đã có OUTBOUND gắn đơn → không trừ lại
    const existingOut = await tx.salesStockMovement.findFirst({
      where: {
        organizationId: opts.organizationId,
        type: SalesStockMovementType.OUTBOUND,
        referenceType: 'SALES_ORDER',
        referenceId: opts.orderId,
      },
    });
    if (existingOut) {
      return tx.salesStockMovement.findMany({
        where: {
          organizationId: opts.organizationId,
          type: SalesStockMovementType.OUTBOUND,
          referenceType: 'SALES_ORDER',
          referenceId: opts.orderId,
        },
        include: { lines: true },
      });
    }

    const movements = [];
    for (const item of opts.items) {
      if (!item.productId) continue;
      const allocations = await this.allocateFefo(
        tx,
        opts.organizationId,
        item.productId,
        item.quantity,
      );
      const mov = await this.createOutboundMovement(tx, {
        organizationId: opts.organizationId,
        productId: item.productId,
        allocations,
        reason: `Xuất hàng đơn ${opts.orderCode}`,
        performedById: opts.performedById,
        referenceType: 'SALES_ORDER',
        referenceId: opts.orderId,
      });
      await this.audit.log(
        {
          organizationId: opts.organizationId,
          userId: opts.performedById,
          action: 'SALES_STOCK_OUTBOUND',
          entityType: 'SALES_STOCK_MOVEMENT',
          entityId: mov.id,
          metadata: {
            productId: item.productId,
            qty: item.quantity,
            referenceType: 'SALES_ORDER',
            referenceId: opts.orderId,
            orderCode: opts.orderCode,
            allocations,
          },
        },
        tx,
      );
      movements.push(mov);
    }
    return movements;
  }

  /** Hoàn phần còn lại của mọi OUTBOUND gắn đơn (idempotent với partial đã có) */
  async returnForSalesOrder(
    tx: StockTx,
    opts: {
      organizationId: string;
      orderId: string;
      performedById?: string;
      reason?: string;
    },
  ) {
    const outbounds = await tx.salesStockMovement.findMany({
      where: {
        organizationId: opts.organizationId,
        type: SalesStockMovementType.OUTBOUND,
        referenceType: 'SALES_ORDER',
        referenceId: opts.orderId,
      },
    });
    const results = [];
    for (const ob of outbounds) {
      const already = await this.returnedQtyAgainstOutbound(tx, opts.organizationId, ob.id);
      const remaining = ob.quantity - already;
      if (remaining <= 0) continue;
      results.push(
        await this.returnInboundFromOutbound(tx, {
          organizationId: opts.organizationId,
          outboundMovementId: ob.id,
          performedById: opts.performedById,
          reason: opts.reason,
          referenceType: remaining === ob.quantity ? 'RETURN_OF' : 'SALES_ORDER_RETURN_REMAINING',
          referenceId: remaining === ob.quantity ? ob.id : `${opts.orderId}::${ob.id}::remain`,
          quantity: remaining,
        }),
      );
    }
    return results;
  }

  /**
   * Hoàn một phần theo product + qty từ OUTBOUND của đơn.
   * Idempotent key: referenceType + referenceId (thường SALES_RETURN + returnId+productId).
   */
  async returnPartialForSalesOrder(
    tx: StockTx,
    opts: {
      organizationId: string;
      orderId: string;
      productId: string;
      quantity: number;
      performedById?: string;
      reason?: string;
      referenceType: string;
      referenceId: string;
    },
  ) {
    const outbound = await tx.salesStockMovement.findFirst({
      where: {
        organizationId: opts.organizationId,
        type: SalesStockMovementType.OUTBOUND,
        referenceType: 'SALES_ORDER',
        referenceId: opts.orderId,
        productId: opts.productId,
      },
    });
    if (!outbound) {
      throw new BadRequestException(`Không có phiếu xuất cho sản phẩm ${opts.productId}`);
    }
    return this.returnInboundFromOutbound(tx, {
      organizationId: opts.organizationId,
      outboundMovementId: outbound.id,
      performedById: opts.performedById,
      reason: opts.reason,
      referenceType: opts.referenceType,
      referenceId: opts.referenceId,
      quantity: opts.quantity,
    });
  }

  async listBatches(
    organizationId: string,
    query: PaginationDto & { productId?: string; includeExpired?: string },
  ) {
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const where: Prisma.SalesStockBatchWhereInput = { organizationId };
    if (query.productId) where.productId = query.productId;
    if (query.includeExpired !== 'true') {
      where.OR = [{ expiryDate: null }, { expiryDate: { gte: this.todayStart() } }];
      where.remainingQuantity = { gt: 0 };
    }

    const [items, total] = await Promise.all([
      this.prisma.salesStockBatch.findMany({
        where,
        skip,
        take,
        orderBy: [{ expiryDate: 'asc' }, { importedAt: 'asc' }],
        include: {
          product: { select: { id: true, name: true, sku: true, barcode: true, unit: true } },
        },
      }),
      this.prisma.salesStockBatch.count({ where }),
    ]);

    return buildPaginatedResult(
      items.map((b) => ({
        ...b,
        unitCost: Number(b.unitCost),
        isExpired: b.expiryDate ? b.expiryDate < this.todayStart() : false,
        daysToExpiry: b.expiryDate
          ? Math.ceil((b.expiryDate.getTime() - this.todayStart().getTime()) / 86400000)
          : null,
      })),
      total,
      page,
      pageSize,
    );
  }

  async listMovements(
    organizationId: string,
    query: PaginationDto & { productId?: string; type?: SalesStockMovementType },
  ) {
    const { page, pageSize, skip, take } = getPaginationParams(query);
    const where: Prisma.SalesStockMovementWhereInput = { organizationId };
    if (query.productId) where.productId = query.productId;
    if (query.type) where.type = query.type;

    const [items, total] = await Promise.all([
      this.prisma.salesStockMovement.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          product: { select: { id: true, name: true, sku: true } },
          lines: { include: { batch: { select: { id: true, batchCode: true, expiryDate: true } } } },
        },
      }),
      this.prisma.salesStockMovement.count({ where }),
    ]);

    return buildPaginatedResult(
      items.map((m) => this.serializeMovement(m)),
      total,
      page,
      pageSize,
    );
  }

  async getAlerts(organizationId: string) {
    const today = this.todayStart();
    const d7 = new Date(today);
    d7.setDate(d7.getDate() + 7);
    const d30 = new Date(today);
    d30.setDate(d30.getDate() + 30);
    const d60 = new Date(today);
    d60.setDate(d60.getDate() + 60);

    const products = await this.prisma.salesProduct.findMany({
      where: { organizationId, isActive: true },
      select: {
        id: true,
        name: true,
        sku: true,
        stockQty: true,
        minStockQty: true,
        unit: true,
      },
    });

    const stockMap = await this.stockBreakdownMany(
      this.prisma,
      organizationId,
      products.map((p) => p.id),
    );
    const withSellable = products.map((p) => {
      const stock = stockMap.get(p.id) || {
        physicalQty: 0,
        sellableQty: 0,
        expiredQty: 0,
      };
      return { ...p, ...stock };
    });

    const outOfStock = withSellable
      .filter((p) => p.sellableQty <= 0)
      .map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        stockQty: p.stockQty,
        physicalQty: p.physicalQty,
        sellableQty: p.sellableQty,
        expiredQty: p.expiredQty,
        minStockQty: p.minStockQty,
        unit: p.unit,
      }));
    const lowStock = withSellable
      .filter((p) => p.sellableQty > 0 && p.sellableQty <= p.minStockQty)
      .map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        stockQty: p.stockQty,
        physicalQty: p.physicalQty,
        sellableQty: p.sellableQty,
        expiredQty: p.expiredQty,
        minStockQty: p.minStockQty,
        unit: p.unit,
      }));

    const batches = await this.prisma.salesStockBatch.findMany({
      where: {
        organizationId,
        remainingQuantity: { gt: 0 },
        expiryDate: { not: null },
      },
      include: { product: { select: { id: true, name: true, sku: true } } },
      orderBy: { expiryDate: 'asc' },
    });

    const expired = batches.filter((b) => b.expiryDate! < today);
    const expiring7 = batches.filter((b) => b.expiryDate! >= today && b.expiryDate! <= d7);
    const expiring30 = batches.filter(
      (b) => b.expiryDate! > d7 && b.expiryDate! <= d30,
    );
    const expiring60 = batches.filter(
      (b) => b.expiryDate! > d30 && b.expiryDate! <= d60,
    );

    const mapBatch = (b: (typeof batches)[0]) => ({
      batchId: b.id,
      batchCode: b.batchCode,
      productId: b.productId,
      productName: b.product.name,
      sku: b.product.sku,
      remainingQuantity: b.remainingQuantity,
      expiryDate: b.expiryDate,
      daysToExpiry: b.expiryDate
        ? Math.ceil((b.expiryDate.getTime() - today.getTime()) / 86400000)
        : null,
    });

    return {
      outOfStock,
      lowStock,
      expired: expired.map(mapBatch),
      expiring7: expiring7.map(mapBatch),
      expiring30: expiring30.map(mapBatch),
      expiring60: expiring60.map(mapBatch),
      counts: {
        outOfStock: outOfStock.length,
        lowStock: lowStock.length,
        expired: expired.length,
        expiring7: expiring7.length,
        expiring30: expiring30.length,
        expiring60: expiring60.length,
      },
    };
  }

  /**
   * Tra cứu SP theo SKU hoặc barcode (scan) — scoped organizationId.
   */
  async lookupProduct(organizationId: string, q: string) {
    const code = q.trim();
    if (!code) throw new BadRequestException('Thiếu mã SKU/barcode');
    const product = await this.prisma.salesProduct.findFirst({
      where: {
        organizationId,
        isActive: true,
        OR: [
          { sku: { equals: code, mode: 'insensitive' } },
          { barcode: { equals: code, mode: 'insensitive' } },
        ],
      },
      include: { category: { select: { id: true, name: true } } },
    });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm theo SKU/barcode');
    const stock = await this.stockBreakdown(this.prisma, organizationId, product.id);
    return {
      ...product,
      price: Number(product.price),
      costPrice: Number(product.costPrice),
      physicalQty: stock.physicalQty,
      sellableQty: stock.sellableQty,
      expiredQty: stock.expiredQty,
      isLowStock: stock.sellableQty > 0 && stock.sellableQty <= product.minStockQty,
      isOutOfStock: stock.sellableQty <= 0,
    };
  }

  /**
   * Stock reconciliation: phát hiện lệch stockQty vs SUM(batch.remaining).
   * Fix: ghi SalesStockReconciliation (before/expected/delta) + audit + sync stockQty.
   * Không sửa/xóa movement lịch sử. Idempotent khi không còn lệch.
   * Batches là SoT — không tạo ADJUST làm đổi batch (tránh lệch mới).
   */
  async reconcile(
    organizationId: string,
    opts?: { fix?: boolean; performedById?: string; reason?: string },
  ) {
    const products = await this.prisma.salesProduct.findMany({
      where: { organizationId },
      select: { id: true, name: true, sku: true, barcode: true, stockQty: true },
    });

    const mismatches: Array<{
      productId: string;
      name: string;
      sku: string | null;
      stockQty: number;
      batchSum: number;
      delta: number;
    }> = [];

    for (const p of products) {
      const agg = await this.prisma.salesStockBatch.aggregate({
        where: { organizationId, productId: p.id, remainingQuantity: { gt: 0 } },
        _sum: { remainingQuantity: true },
      });
      const batchSum = agg._sum.remainingQuantity ?? 0;
      if (batchSum !== p.stockQty) {
        mismatches.push({
          productId: p.id,
          name: p.name,
          sku: p.sku,
          stockQty: p.stockQty,
          batchSum,
          delta: batchSum - p.stockQty,
        });
      }
    }

    const negativeBatches = await this.prisma.salesStockBatch.findMany({
      where: { organizationId, remainingQuantity: { lt: 0 } },
      select: {
        id: true,
        productId: true,
        batchCode: true,
        remainingQuantity: true,
      },
      take: 50,
    });

    let fixed = 0;
    let reconciliationId: string | null = null;
    let reconciliationCode: string | null = null;

    if (opts?.fix) {
      if (!mismatches.length) {
        return {
          ok: negativeBatches.length === 0,
          counts: {
            productsChecked: products.length,
            mismatches: 0,
            negativeBatches: negativeBatches.length,
            fixed: 0,
          },
          mismatches: [],
          negativeBatches,
          reconciliationId: null,
          reconciliationCode: null,
          idempotent: true,
        };
      }

      const day = new Date();
      const y = day.getFullYear();
      const m = String(day.getMonth() + 1).padStart(2, '0');
      const d = String(day.getDate()).padStart(2, '0');
      const prefix = `RC-${y}${m}${d}-`;
      const count = await this.prisma.salesStockReconciliation.count({
        where: { organizationId, code: { startsWith: prefix } },
      });
      const code = `${prefix}${String(count + 1).padStart(4, '0')}`;

      await this.prisma.$transaction(async (tx) => {
        const rec = await tx.salesStockReconciliation.create({
          data: {
            organizationId,
            code,
            reason:
              opts.reason?.trim() ||
              'Đồng bộ stockQty = SUM(batch.remainingQuantity > 0)',
            performedById: opts.performedById ?? null,
            lines: {
              create: mismatches.map((m) => ({
                productId: m.productId,
                beforeQty: m.stockQty,
                expectedQty: m.batchSum,
                delta: m.delta,
                action: 'SYNC_STOCK_QTY_TO_BATCH_SUM',
              })),
            },
          },
        });
        reconciliationId = rec.id;
        reconciliationCode = code;

        for (const m of mismatches) {
          await this.lockProductForStock(tx, organizationId, m.productId);
          const after = await this.syncProductStock(tx, organizationId, m.productId);
          if (after !== m.batchSum) {
            throw new BadRequestException(
              `Reconcile thất bại product ${m.productId}: after=${after} expected=${m.batchSum}`,
            );
          }
          fixed += 1;
        }

        await this.audit.log(
          {
            organizationId,
            userId: opts.performedById,
            action: 'SALES_STOCK_RECONCILE_FIX',
            entityType: 'SALES_STOCK_RECONCILIATION',
            entityId: rec.id,
            metadata: {
              code,
              fixed,
              mismatchCount: mismatches.length,
              lines: mismatches.map((m) => ({
                productId: m.productId,
                before: m.stockQty,
                expected: m.batchSum,
                delta: m.delta,
              })),
              reason: opts.reason ?? null,
            },
          },
          tx,
        );
      });
    }

    return {
      ok: mismatches.length === 0 && negativeBatches.length === 0,
      counts: {
        productsChecked: products.length,
        mismatches: mismatches.length,
        negativeBatches: negativeBatches.length,
        fixed,
      },
      mismatches,
      negativeBatches,
      reconciliationId,
      reconciliationCode,
      idempotent: Boolean(opts?.fix && mismatches.length === 0),
    };
  }

  private serializeMovement<T extends { quantity: number }>(m: T) {
    return {
      ...m,
      quantity: Number(m.quantity),
    };
  }
}
