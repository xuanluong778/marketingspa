import { Injectable } from '@nestjs/common';
import { Prisma, SalesOrderStatus } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from './inventory.service';
import { TenantKpiCacheService } from '../common/services/tenant-kpi-cache.service';

export type ReportRangePreset =
  | 'today'
  | '7d'
  | '30d'
  | 'month'
  | 'year'
  | 'custom';

@Injectable()
export class SalesReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly kpiCache?: TenantKpiCacheService,
  ) {}

  resolveRange(opts: {
    preset?: string;
    from?: string;
    to?: string;
  }): { from: Date; to: Date; preset: string } {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const startOfDay = (d: Date) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return x;
    };

    const preset = (opts.preset || '30d') as ReportRangePreset;
    if (preset === 'custom' && opts.from && opts.to) {
      return {
        from: startOfDay(new Date(opts.from)),
        to: new Date(new Date(opts.to).setHours(23, 59, 59, 999)),
        preset,
      };
    }
    if (preset === 'today') {
      return { from: startOfDay(now), to: end, preset };
    }
    if (preset === '7d') {
      const from = startOfDay(now);
      from.setDate(from.getDate() - 6);
      return { from, to: end, preset };
    }
    if (preset === 'month') {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from, to: end, preset };
    }
    if (preset === 'year') {
      const from = new Date(now.getFullYear(), 0, 1);
      return { from, to: end, preset };
    }
    // 30d default
    const from = startOfDay(now);
    from.setDate(from.getDate() - 29);
    return { from, to: end, preset: '30d' };
  }

  async summary(
    organizationId: string,
    opts: { preset?: string; from?: string; to?: string },
  ) {
    const { from, to, preset } = this.resolveRange(opts);
    const cacheName = `sales-sum:${preset}:${from.toISOString()}:${to.toISOString()}`;
    const cached = await this.kpiCache?.getJson<any>(organizationId, cacheName);
    if (cached) return cached;

    const orders = await this.prisma.salesOrder.findMany({
      where: {
        organizationId,
        createdAt: { gte: from, lte: to },
      },
      take: 5000,
      include: {
        items: true,
        customer: { select: { id: true, name: true, phone: true } },
      },
    });

    const countable = orders.filter(
      (o) =>
        o.status !== SalesOrderStatus.CANCELLED &&
        o.status !== SalesOrderStatus.DRAFT,
    );
    const revenueOrders = countable.filter(
      (o) =>
        o.status !== SalesOrderStatus.RETURNED ||
        Number(o.total) > 0,
    );

    // Doanh thu: đơn không hủy/draft; trừ đơn RETURNED full vẫn có thể có revenue 0 — dùng total của đơn shipped+
    const soldStatuses: SalesOrderStatus[] = [
      SalesOrderStatus.CONFIRMED,
      SalesOrderStatus.READY,
      SalesOrderStatus.SHIPPED,
      SalesOrderStatus.COMPLETED,
      SalesOrderStatus.PARTIALLY_RETURNED,
    ];
    const sold = orders.filter((o) => soldStatuses.includes(o.status));
    const revenue = sold.reduce((s, o) => s + Number(o.total), 0);
    const orderCount = sold.length;
    const aov = orderCount ? revenue / orderCount : 0;

    // COGS từ costPrice * (qty - returned) trên dòng có product
    let cogs = 0;
    const productIds = [
      ...new Set(
        sold.flatMap((o) =>
          o.items.map((i) => i.productId).filter(Boolean) as string[],
        ),
      ),
    ];
    const products = productIds.length
      ? await this.prisma.salesProduct.findMany({
          where: { organizationId, id: { in: productIds } },
          select: { id: true, costPrice: true, name: true },
        })
      : [];
    const costById = new Map(products.map((p) => [p.id, Number(p.costPrice)]));

    const productAgg = new Map<
      string,
      { productId: string; name: string; qty: number; revenue: number; cogs: number }
    >();
    const customerAgg = new Map<
      string,
      { customerId: string; name: string; orders: number; revenue: number }
    >();

    for (const o of sold) {
      const cid = o.customerId;
      const c = customerAgg.get(cid) || {
        customerId: cid,
        name: o.customerName,
        orders: 0,
        revenue: 0,
      };
      c.orders += 1;
      c.revenue += Number(o.total);
      customerAgg.set(cid, c);

      for (const it of o.items) {
        const netQty = Math.max(0, it.quantity - it.returnedQty);
        if (netQty <= 0) continue;
        const lineRev =
          Number(it.totalPrice) *
          (it.quantity > 0 ? netQty / it.quantity : 0);
        const unitCost = it.productId ? costById.get(it.productId) ?? 0 : 0;
        const lineCogs = unitCost * netQty;
        cogs += lineCogs;
        if (it.productId) {
          const key = it.productId;
          const row = productAgg.get(key) || {
            productId: key,
            name: it.productName,
            qty: 0,
            revenue: 0,
            cogs: 0,
          };
          row.qty += netQty;
          row.revenue += lineRev;
          row.cogs += lineCogs;
          productAgg.set(key, row);
        }
      }
    }

    const grossProfit = revenue - cogs;
    const cancelled = orders.filter((o) => o.status === SalesOrderStatus.CANCELLED).length;
    const returned = orders.filter(
      (o) =>
        o.status === SalesOrderStatus.RETURNED ||
        o.status === SalesOrderStatus.PARTIALLY_RETURNED,
    ).length;

    // Inventory value + alerts snapshot
    const allProducts = await this.prisma.salesProduct.findMany({
      where: { organizationId, isActive: true },
      select: {
        id: true,
        name: true,
        sku: true,
        stockQty: true,
        minStockQty: true,
        costPrice: true,
      },
    });

    let inventoryValue = 0;
    const stockRows = [];
    let outOfStock = 0;
    let lowStock = 0;
    const stockMap = await this.inventory.stockBreakdownMany(
      this.prisma,
      organizationId,
      allProducts.map((p) => p.id),
    );
    for (const p of allProducts) {
      const br = stockMap.get(p.id) || {
        physicalQty: 0,
        sellableQty: 0,
        expiredQty: 0,
      };
      inventoryValue += br.physicalQty * Number(p.costPrice);
      if (br.sellableQty <= 0) outOfStock += 1;
      else if (br.sellableQty <= p.minStockQty) lowStock += 1;
      stockRows.push({
        productId: p.id,
        name: p.name,
        sku: p.sku,
        ...br,
        stockQty: p.stockQty,
        minStockQty: p.minStockQty,
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30 = new Date(today);
    in30.setDate(in30.getDate() + 30);
    const expiredBatches = await this.prisma.salesStockBatch.findMany({
      where: {
        organizationId,
        remainingQuantity: { gt: 0 },
        expiryDate: { lt: today },
      },
      include: { product: { select: { id: true, name: true, sku: true } } },
      take: 50,
    });
    const expiringBatches = await this.prisma.salesStockBatch.findMany({
      where: {
        organizationId,
        remainingQuantity: { gt: 0 },
        expiryDate: { gte: today, lte: in30 },
      },
      include: { product: { select: { id: true, name: true, sku: true } } },
      take: 50,
    });

    const topProducts = [...productAgg.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
    const topCustomers = [...customerAgg.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const payload = {
      range: { preset, from: from.toISOString(), to: to.toISOString() },
      kpis: {
        revenue,
        orderCount,
        aov,
        cogs,
        grossProfit,
        cancelledOrders: cancelled,
        returnedOrders: returned,
        inventoryValue,
        outOfStock,
        lowStock,
        expiredBatches: expiredBatches.length,
        expiring30Batches: expiringBatches.length,
      },
      topProducts,
      topCustomers,
      expiredBatches: expiredBatches.map((b) => ({
        batchId: b.id,
        batchCode: b.batchCode,
        productId: b.productId,
        productName: b.product.name,
        remainingQuantity: b.remainingQuantity,
        expiryDate: b.expiryDate,
      })),
      expiringBatches: expiringBatches.map((b) => ({
        batchId: b.id,
        batchCode: b.batchCode,
        productId: b.productId,
        productName: b.product.name,
        remainingQuantity: b.remainingQuantity,
        expiryDate: b.expiryDate,
      })),
      lowSellable: stockRows
        .filter((r) => r.sellableQty > 0 && r.sellableQty <= r.minStockQty)
        .slice(0, 30),
      outOfSellable: stockRows.filter((r) => r.sellableQty <= 0).slice(0, 30),
    };
    await this.kpiCache?.setJson(organizationId, cacheName, payload, 20);
    return payload;
  }

  async exportCsv(
    organizationId: string,
    opts: { preset?: string; from?: string; to?: string },
  ) {
    const data = await this.summary(organizationId, opts);
    const lines: string[] = [];
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    lines.push('section,metric,value');
    lines.push(`kpi,revenue,${data.kpis.revenue}`);
    lines.push(`kpi,orderCount,${data.kpis.orderCount}`);
    lines.push(`kpi,aov,${data.kpis.aov}`);
    lines.push(`kpi,cogs,${data.kpis.cogs}`);
    lines.push(`kpi,grossProfit,${data.kpis.grossProfit}`);
    lines.push(`kpi,inventoryValue,${data.kpis.inventoryValue}`);
    lines.push(`kpi,cancelledOrders,${data.kpis.cancelledOrders}`);
    lines.push(`kpi,returnedOrders,${data.kpis.returnedOrders}`);
    lines.push('section,productId,name,qty,revenue,cogs');
    for (const p of data.topProducts) {
      lines.push(
        ['topProduct', p.productId, esc(p.name), p.qty, p.revenue, p.cogs].join(','),
      );
    }
    lines.push('section,customerId,name,orders,revenue');
    for (const c of data.topCustomers) {
      lines.push(
        ['topCustomer', c.customerId, esc(c.name), c.orders, c.revenue].join(','),
      );
    }
    return {
      filename: `sales-report-${data.range.preset}-${Date.now()}.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: '\uFEFF' + lines.join('\n'),
    };
  }
}

void Prisma;
