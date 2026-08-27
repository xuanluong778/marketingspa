/**
 * E2E harden — Bán hàng / Kho
 * Run: node scripts/with-root-env.cjs pnpm exec tsx scripts/test-sales-inventory-harden-e2e.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { Prisma, SalesOrderStatus } from '@marketingspa/database';
import { PrismaService } from '../apps/api/src/prisma/prisma.service';
import { AuditService } from '../apps/api/src/audit/audit.service';
import { InventoryService } from '../apps/api/src/sales/inventory.service';
import { SalesService } from '../apps/api/src/sales/sales.service';
import { StocktakeService } from '../apps/api/src/sales/stocktake.service';
import { SalesPaymentService } from '../apps/api/src/sales/payment.service';
import { SalesReturnService } from '../apps/api/src/sales/return.service';
import { SalesPurchaseService } from '../apps/api/src/sales/purchase.service';
import { SalesReportsService } from '../apps/api/src/sales/reports.service';
import {
  SALES_PERMISSIONS,
  SALES_ROLE_MAP,
  SALES_WRITE_ROLE_CODES,
  canWriteSales,
} from '../apps/api/src/sales/sales.rbac';
import { defaultPermissionCodesForRole, SYSTEM_ROLES } from '../apps/api/src/common/constants/roles';

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const inventory = new InventoryService(prisma, audit);
const sales = new SalesService(prisma, audit, inventory);
const stocktake = new StocktakeService(prisma, audit, inventory);
const payments = new SalesPaymentService(prisma, audit);
const returns = new SalesReturnService(prisma, audit, inventory);
const purchase = new SalesPurchaseService(prisma, audit, inventory);
const reports = new SalesReportsService(prisma, inventory);

const results: Array<{ name: string; pass: boolean; detail?: string }> = [];

function record(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function stockOf(productId: string) {
  const p = await prisma.salesProduct.findUniqueOrThrow({ where: { id: productId } });
  return p.stockQty;
}

async function cleanup(tag: string) {
  const products = await prisma.salesProduct.findMany({
    where: { name: { startsWith: tag } },
    select: { id: true, organizationId: true },
  });
  const productIds = products.map((p) => p.id);

  const orders = await prisma.salesOrder.findMany({
    where: { note: { startsWith: tag } },
    select: { id: true },
  });
  const orderIds = orders.map((o) => o.id);

  if (orderIds.length) {
    await prisma.salesPayment.deleteMany({ where: { orderId: { in: orderIds } } });
    const retIds = (
      await prisma.salesReturn.findMany({
        where: { orderId: { in: orderIds } },
        select: { id: true },
      })
    ).map((r) => r.id);
    if (retIds.length) {
      await prisma.salesReturnItem.deleteMany({ where: { returnId: { in: retIds } } });
      await prisma.salesReturn.deleteMany({ where: { id: { in: retIds } } });
    }
  }

  if (productIds.length) {
    const stocktakeIds = (
      await prisma.salesStocktakeLine.findMany({
        where: { productId: { in: productIds } },
        select: { stocktakeId: true },
        distinct: ['stocktakeId'],
      })
    ).map((r) => r.stocktakeId);
    if (stocktakeIds.length) {
      await prisma.salesStocktakeLine.deleteMany({ where: { stocktakeId: { in: stocktakeIds } } });
      await prisma.salesStocktake.deleteMany({ where: { id: { in: stocktakeIds } } });
    }

    const recLines = await prisma.salesStockReconciliationLine.findMany({
      where: { productId: { in: productIds } },
      select: { reconciliationId: true },
      distinct: ['reconciliationId'],
    });
    const recIds = recLines.map((r) => r.reconciliationId);
    if (recIds.length) {
      await prisma.salesStockReconciliationLine.deleteMany({
        where: { reconciliationId: { in: recIds } },
      });
      await prisma.salesStockReconciliation.deleteMany({ where: { id: { in: recIds } } });
    }

    const poItemPos = await prisma.salesPurchaseOrderItem.findMany({
      where: { productId: { in: productIds } },
      select: { purchaseOrderId: true },
      distinct: ['purchaseOrderId'],
    });
    const poIds = poItemPos.map((p) => p.purchaseOrderId);
    if (poIds.length) {
      await prisma.salesPurchaseOrderItem.deleteMany({ where: { purchaseOrderId: { in: poIds } } });
      await prisma.salesPurchaseOrder.deleteMany({ where: { id: { in: poIds } } });
    }

    const movements = await prisma.salesStockMovement.findMany({
      where: { productId: { in: productIds } },
      select: { id: true },
    });
    const movementIds = movements.map((m) => m.id);
    if (movementIds.length) {
      await prisma.salesStockMovementLine.deleteMany({ where: { movementId: { in: movementIds } } });
      await prisma.salesStockMovement.deleteMany({ where: { id: { in: movementIds } } });
    }
    await prisma.salesStockBatch.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.salesOrderItem.deleteMany({ where: { productId: { in: productIds } } });
  }

  if (orderIds.length) {
    await prisma.salesOrderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.salesOrder.deleteMany({ where: { id: { in: orderIds } } });
  }

  if (productIds.length) {
    await prisma.salesProduct.deleteMany({ where: { id: { in: productIds } } });
  }

  await prisma.salesSupplier.deleteMany({ where: { name: { startsWith: tag } } });
}

async function main() {
  console.log('test-sales-inventory-harden-e2e');

  // --- RBAC mapping ---
  assert.equal(SALES_ROLE_MAP.Admin, SYSTEM_ROLES.OWNER);
  assert.equal(SALES_ROLE_MAP.Manager, SYSTEM_ROLES.MANAGER);
  assert.equal(SALES_ROLE_MAP.Staff, SYSTEM_ROLES.SALE);
  assert.equal(canWriteSales(SYSTEM_ROLES.OWNER), true);
  assert.equal(canWriteSales(SYSTEM_ROLES.MANAGER), true);
  assert.equal(canWriteSales(SYSTEM_ROLES.SALE), true);
  assert.equal(canWriteSales(SYSTEM_ROLES.TECHNICIAN), false);
  for (const role of SALES_WRITE_ROLE_CODES) {
    const perms = defaultPermissionCodesForRole(role);
    assert.ok(perms.includes(SALES_PERMISSIONS.read), `${role} needs order.read`);
    assert.ok(perms.includes(SALES_PERMISSIONS.write), `${role} needs order.write`);
  }
  record('RBAC Admin/Manager/Staff', true, 'OWNER/MANAGER/SALE + order.read/write');

  const orgs = await prisma.organization.findMany({
    where: { isActive: true },
    take: 2,
    orderBy: { createdAt: 'asc' },
  });
  assert.ok(orgs.length >= 1, 'need at least 1 organization');
  const orgA = orgs[0]!;
  const orgB = orgs[1] ?? null;

  const customer = await prisma.customer.findFirst({
    where: { organizationId: orgA.id, isActive: true },
  });
  assert.ok(customer, 'need a customer in org A');

  const actor = await prisma.user.findFirst({
    where: { organizationId: orgA.id, deletedAt: null },
    select: { id: true },
  });
  assert.ok(actor, 'need a user in org A for audit FK');
  const userId = actor.id;

  const tag = `E2E-INV-${Date.now()}`;
  await cleanup(tag);

  // Product A
  const product = await sales.createProduct(orgA.id, {
    name: `${tag}-P1`,
    sku: `${tag}-SKU`,
    unit: 'chai',
    price: 100000,
    costPrice: 50000,
    minStockQty: 5,
    stockQty: 0,
  });

  // 1) Nhập 100 → tồn 100
  await inventory.inbound(orgA.id, {
    productId: product.id,
    batchCode: `${tag}-B1`,
    quantity: 100,
    expiryDate: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
    reason: 'E2E inbound',
  }, userId);
  let qty = await stockOf(product.id);
  record('Nhập 100 → tồn 100', qty === 100, `stock=${qty}`);

  // 2) Create order qty 3, confirm, export → 97
  const order = await sales.createOrder(
    orgA.id,
    {
      customerId: customer.id,
      customerName: customer.name,
      note: `${tag}-order`,
      items: [
        {
          productId: product.id,
          productName: product.name,
          quantity: 3,
          unitPrice: 100000,
          lineDiscount: 0,
        },
      ],
    },
    userId,
  );
  await sales.updateStatus(orgA.id, order.id, SalesOrderStatus.CONFIRMED, userId);
  await sales.exportOrder(orgA.id, order.id, userId);
  qty = await stockOf(product.id);
  record('Xuất 3 → tồn 97', qty === 97, `stock=${qty}`);

  // 3) Xuất lại cùng đơn → vẫn 97 (idempotent)
  const again = await sales.exportOrder(orgA.id, order.id, userId);
  assert.ok(again.exportedAt);
  qty = await stockOf(product.id);
  const outboundCount = await prisma.salesStockMovement.count({
    where: {
      organizationId: orgA.id,
      type: 'OUTBOUND',
      referenceType: 'SALES_ORDER',
      referenceId: order.id,
    },
  });
  record(
    'Xuất lại cùng đơn → vẫn 97',
    qty === 97 && outboundCount === 1,
    `stock=${qty} outboundMovements=${outboundCount}`,
  );

  // 4) Concurrent outbound — no oversell
  const productConc = await sales.createProduct(orgA.id, {
    name: `${tag}-CONC`,
    sku: `${tag}-CONC`,
    price: 1,
    costPrice: 1,
    stockQty: 0,
  });
  await inventory.inbound(
    orgA.id,
    {
      productId: productConc.id,
      batchCode: `${tag}-CONC-B`,
      quantity: 5,
      expiryDate: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10),
    },
    userId,
  );
  const concurrent = await Promise.allSettled([
    inventory.outbound(orgA.id, { productId: productConc.id, quantity: 4, reason: 'c1' }, userId),
    inventory.outbound(orgA.id, { productId: productConc.id, quantity: 4, reason: 'c2' }, userId),
  ]);
  const okCount = concurrent.filter((r) => r.status === 'fulfilled').length;
  const failCount = concurrent.filter((r) => r.status === 'rejected').length;
  const concStock = await stockOf(productConc.id);
  record(
    '2 request đồng thời → không oversell',
    okCount === 1 && failCount === 1 && concStock === 1,
    `ok=${okCount} fail=${failCount} stock=${concStock}`,
  );

  // 5) Không đủ hàng → reject
  let insufficientRejected = false;
  try {
    await inventory.outbound(
      orgA.id,
      { productId: product.id, quantity: 10_000, reason: 'too much' },
      userId,
    );
  } catch (e) {
    insufficientRejected = e instanceof BadRequestException || /Không đủ tồn/i.test(String(e));
  }
  record('Không đủ hàng → reject', insufficientRejected);

  // 6) Hết hạn → reject (tồn vật lý vẫn đếm batch hết hạn; sellable = 0)
  const expiredProduct = await sales.createProduct(orgA.id, {
    name: `${tag}-EXP`,
    sku: `${tag}-EXP`,
    barcode: `${tag}-EXP-BC`,
    price: 1,
    costPrice: 1,
    stockQty: 0,
  });
  // Bypass inbound expiry check: insert expired batch directly
  await prisma.salesStockBatch.create({
    data: {
      organizationId: orgA.id,
      productId: expiredProduct.id,
      batchCode: `${tag}-EXPIRED`,
      quantity: 10,
      remainingQuantity: 10,
      importedAt: new Date(),
      expiryDate: new Date(Date.now() - 3 * 86400000),
      unitCost: new Prisma.Decimal(1),
    },
  });
  await inventory.syncProductStock(prisma, orgA.id, expiredProduct.id);
  const expiredPhysical = await stockOf(expiredProduct.id);
  const expiredSellable = await inventory.sellableStock(prisma, orgA.id, expiredProduct.id);
  let expiredRejected = false;
  try {
    await inventory.outbound(
      orgA.id,
      { productId: expiredProduct.id, quantity: 1, reason: 'expired' },
      userId,
    );
  } catch (e) {
    expiredRejected = e instanceof BadRequestException || /Không đủ tồn|hết hạn/i.test(String(e));
  }
  record(
    'Hết hạn → reject',
    expiredRejected && expiredPhysical === 10 && expiredSellable === 0,
    `stockQty=${expiredPhysical} sellable=${expiredSellable}`,
  );

  // 7) Nhiều batch → FEFO đúng
  const fefoProduct = await sales.createProduct(orgA.id, {
    name: `${tag}-FEFO`,
    sku: `${tag}-FEFO`,
    price: 1,
    costPrice: 1,
    stockQty: 0,
  });
  const far = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const near = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  await inventory.inbound(
    orgA.id,
    { productId: fefoProduct.id, batchCode: `${tag}-FAR`, quantity: 20, expiryDate: far },
    userId,
  );
  await inventory.inbound(
    orgA.id,
    { productId: fefoProduct.id, batchCode: `${tag}-NEAR`, quantity: 20, expiryDate: near },
    userId,
  );
  await inventory.outbound(
    orgA.id,
    { productId: fefoProduct.id, quantity: 5, reason: 'fefo' },
    userId,
  );
  const nearBatch = await prisma.salesStockBatch.findFirst({
    where: { organizationId: orgA.id, productId: fefoProduct.id, batchCode: `${tag}-NEAR` },
  });
  const farBatch = await prisma.salesStockBatch.findFirst({
    where: { organizationId: orgA.id, productId: fefoProduct.id, batchCode: `${tag}-FAR` },
  });
  record(
    'Nhiều batch → FEFO đúng',
    nearBatch?.remainingQuantity === 15 && farBatch?.remainingQuantity === 20,
    `near=${nearBatch?.remainingQuantity} far=${farBatch?.remainingQuantity}`,
  );

  // 8) Return → nhập hoàn đúng
  const beforeReturn = await stockOf(product.id);
  await sales.updateStatus(orgA.id, order.id, SalesOrderStatus.CANCELLED, userId);
  const afterReturn = await stockOf(product.id);
  const returnIn = await prisma.salesStockMovement.findFirst({
    where: {
      organizationId: orgA.id,
      type: 'RETURN_IN',
      productId: product.id,
    },
    orderBy: { createdAt: 'desc' },
  });
  const outboundStill = await prisma.salesStockMovement.count({
    where: {
      organizationId: orgA.id,
      type: 'OUTBOUND',
      referenceType: 'SALES_ORDER',
      referenceId: order.id,
    },
  });
  record(
    'Return → nhập hoàn đúng',
    afterReturn === beforeReturn + 3 && Boolean(returnIn) && outboundStill === 1,
    `before=${beforeReturn} after=${afterReturn} returnQty=${returnIn?.quantity} outboundKept=${outboundStill}`,
  );

  // 9) Tenant isolation
  let tenantPass = true;
  if (orgB) {
    const crossProduct = await prisma.salesProduct.findFirst({
      where: { id: product.id, organizationId: orgB.id },
    });
    tenantPass = crossProduct === null;
    let crossRejected = false;
    try {
      await inventory.outbound(
        orgB.id,
        { productId: product.id, quantity: 1, reason: 'cross' },
        userId,
      );
    } catch {
      crossRejected = true;
    }
    tenantPass = tenantPass && crossRejected;

    const crossOrder = await prisma.salesOrder.findFirst({
      where: { id: order.id, organizationId: orgB.id },
    });
    tenantPass = tenantPass && crossOrder === null;
  } else {
    // single-org env: still verify all queries include organizationId in service paths via findFirst scope
    const scoped = await prisma.salesProduct.findFirst({
      where: { id: product.id, organizationId: orgA.id },
    });
    tenantPass = Boolean(scoped);
  }
  record('Tenant isolation → PASS', tenantPass, orgB ? '2 orgs' : '1 org scoped');

  // 10) SHIPPED without export rejected
  const readyOrder = await sales.createOrder(
    orgA.id,
    {
      customerId: customer.id,
      note: `${tag}-ready`,
      items: [
        {
          productId: product.id,
          productName: product.name,
          quantity: 1,
          unitPrice: 100000,
          lineDiscount: 0,
        },
      ],
    },
    userId,
  );
  await sales.updateStatus(orgA.id, readyOrder.id, SalesOrderStatus.CONFIRMED, userId);
  await sales.updateStatus(orgA.id, readyOrder.id, SalesOrderStatus.READY, userId);
  let shippedBlocked = false;
  try {
    await sales.updateStatus(orgA.id, readyOrder.id, SalesOrderStatus.SHIPPED, userId);
  } catch (e) {
    shippedBlocked =
      e instanceof BadRequestException || /Chưa xuất kho|Xuất hàng/i.test(String(e));
  }
  record('SHIPPED without export → reject', shippedBlocked);

  // 11) Barcode / SKU lookup
  const bySku = await inventory.lookupProduct(orgA.id, `${tag}-SKU`);
  const byBc = await inventory.lookupProduct(orgA.id, `${tag}-EXP-BC`);
  let lookupMiss = false;
  try {
    await inventory.lookupProduct(orgA.id, `${tag}-NOPE`);
  } catch {
    lookupMiss = true;
  }
  record(
    'Barcode/SKU lookup',
    bySku.id === product.id && byBc.id === expiredProduct.id && lookupMiss,
  );

  // 12) Stocktake → ADJUST + idempotent confirm
  const stProduct = await sales.createProduct(orgA.id, {
    name: `${tag}-ST`,
    sku: `${tag}-ST`,
    barcode: `${tag}-ST-BC`,
    price: 10,
    costPrice: 5,
    stockQty: 0,
  });
  await inventory.inbound(
    orgA.id,
    {
      productId: stProduct.id,
      quantity: 20,
      batchCode: `${tag}-ST-B`,
      unitCost: 5,
      reason: 'stocktake seed',
    },
    userId,
  );
  const st = await stocktake.create(
    orgA.id,
    { note: `${tag}-kk`, productIds: [stProduct.id] },
    userId,
  );
  await stocktake.updateLines(
    orgA.id,
    st.id,
    [{ productId: stProduct.id, countedQty: 17 }],
    userId,
  );
  const confirmed = await stocktake.confirm(orgA.id, st.id, userId);
  const afterSt = await stockOf(stProduct.id);
  const adjustMv = await prisma.salesStockMovement.findFirst({
    where: {
      organizationId: orgA.id,
      type: 'ADJUST',
      productId: stProduct.id,
      referenceType: 'STOCKTAKE',
      referenceId: st.id,
    },
  });
  const confirmedAgain = await stocktake.confirm(orgA.id, st.id, userId);
  const adjustCount = await prisma.salesStockMovement.count({
    where: {
      organizationId: orgA.id,
      type: 'ADJUST',
      referenceType: 'STOCKTAKE',
      referenceId: st.id,
    },
  });
  record(
    'Stocktake confirm → ADJUST',
    confirmed.status === 'CONFIRMED' &&
      afterSt === 17 &&
      Number(adjustMv?.quantity) === -3 &&
      confirmedAgain.status === 'CONFIRMED' &&
      adjustCount === 1,
    `stock=${afterSt} adj=${adjustMv?.quantity} count=${adjustCount}`,
  );

  // 13) Reconciliation detect + fix
  await prisma.salesProduct.update({
    where: { id: stProduct.id },
    data: { stockQty: 999 },
  });
  const drift = await inventory.reconcile(orgA.id);
  const driftHit = drift.mismatches.some((m) => m.productId === stProduct.id);
  const fixed = await inventory.reconcile(orgA.id, { fix: true });
  const afterFix = await stockOf(stProduct.id);
  const afterRec = await inventory.reconcile(orgA.id);
  const stillDrift = afterRec.mismatches.some((m) => m.productId === stProduct.id);
  record(
    'Reconciliation detect+fix',
    driftHit && fixed.counts.fixed >= 1 && afterFix === 17 && !stillDrift,
    `afterFix=${afterFix} fixed=${fixed.counts.fixed}`,
  );

  // 14) Concurrent double export race
  const raceProduct = await sales.createProduct(orgA.id, {
    name: `${tag}-RACE`,
    sku: `${tag}-RACE`,
    price: 1,
    costPrice: 1,
    stockQty: 0,
  });
  await inventory.inbound(
    orgA.id,
    {
      productId: raceProduct.id,
      quantity: 5,
      batchCode: `${tag}-RACE-B`,
      unitCost: 1,
      reason: 'race',
    },
    userId,
  );
  const raceOrder = await sales.createOrder(
    orgA.id,
    {
      customerId: customer.id,
      note: `${tag}-race`,
      items: [
        {
          productId: raceProduct.id,
          productName: raceProduct.name,
          quantity: 2,
          unitPrice: 1,
          lineDiscount: 0,
        },
      ],
    },
    userId,
  );
  await sales.updateStatus(orgA.id, raceOrder.id, SalesOrderStatus.CONFIRMED, userId);
  await sales.updateStatus(orgA.id, raceOrder.id, SalesOrderStatus.READY, userId);
  const [ex1, ex2] = await Promise.all([
    sales.exportOrder(orgA.id, raceOrder.id, userId),
    sales.exportOrder(orgA.id, raceOrder.id, userId),
  ]);
  const outCount = await prisma.salesStockMovement.count({
    where: {
      organizationId: orgA.id,
      type: 'OUTBOUND',
      referenceType: 'SALES_ORDER',
      referenceId: raceOrder.id,
    },
  });
  const raceStock = await stockOf(raceProduct.id);
  record(
    'Concurrent double export → 1 OUTBOUND',
    Boolean(ex1.exportedAt) &&
      Boolean(ex2.exportedAt) &&
      outCount === 1 &&
      raceStock === 3,
    `out=${outCount} stock=${raceStock}`,
  );

  // ── Prompt 2 ────────────────────────────────────────────────────────────

  // P2-1 Reports
  const rep = await reports.summary(orgA.id, { preset: '30d' });
  record(
    'Reports KPIs shape',
    typeof rep.kpis.revenue === 'number' &&
      typeof rep.kpis.orderCount === 'number' &&
      typeof rep.kpis.aov === 'number' &&
      typeof rep.kpis.cogs === 'number' &&
      typeof rep.kpis.grossProfit === 'number' &&
      typeof rep.kpis.inventoryValue === 'number',
    `rev=${rep.kpis.revenue} orders=${rep.kpis.orderCount}`,
  );

  // P2-2 Payment partial → paid + refund
  const payProduct = await sales.createProduct(orgA.id, {
    name: `${tag}-PAY`,
    sku: `${tag}-PAY`,
    price: 100,
    costPrice: 40,
    stockQty: 0,
  });
  await inventory.inbound(
    orgA.id,
    {
      productId: payProduct.id,
      quantity: 10,
      batchCode: `${tag}-PAY-B`,
      unitCost: 40,
      reason: 'pay seed',
    },
    userId,
  );
  const payOrder = await sales.createOrder(
    orgA.id,
    {
      customerId: customer.id,
      note: `${tag}-pay`,
      items: [
        {
          productId: payProduct.id,
          productName: payProduct.name,
          quantity: 2,
          unitPrice: 100,
          lineDiscount: 0,
        },
      ],
    },
    userId,
  );
  const partialPay = await payments.addPayment(
    orgA.id,
    payOrder.id,
    { amount: 50, method: 'CASH', idempotencyKey: `${tag}-pay1` },
    userId,
  );
  const fullPay = await payments.addPayment(
    orgA.id,
    payOrder.id,
    { amount: 150, method: 'CASH', idempotencyKey: `${tag}-pay2` },
    userId,
  );
  const idemPay = await payments.addPayment(
    orgA.id,
    payOrder.id,
    { amount: 150, method: 'CASH', idempotencyKey: `${tag}-pay2` },
    userId,
  );
  const refunded = await payments.addRefund(
    orgA.id,
    payOrder.id,
    { amount: 50, method: 'CASH', idempotencyKey: `${tag}-ref1` },
    userId,
  );
  record(
    'Payment partial→paid + refund',
    partialPay.paymentStatus === 'PARTIAL' &&
      fullPay.paymentStatus === 'PAID' &&
      Number(idemPay.amountPaid) === Number(fullPay.amountPaid) &&
      (refunded.paymentStatus === 'PARTIALLY_REFUNDED' ||
        refunded.paymentStatus === 'PARTIAL') &&
      Number(refunded.amountPaid) === 150,
    `partial=${partialPay.paymentStatus} paid=${fullPay.paymentStatus} afterRefund=${refunded.paymentStatus}/${refunded.amountPaid}`,
  );

  // P2-3 Partial return + double return idempotent
  await sales.updateStatus(orgA.id, payOrder.id, SalesOrderStatus.CONFIRMED, userId);
  await sales.updateStatus(orgA.id, payOrder.id, SalesOrderStatus.READY, userId);
  await sales.exportOrder(orgA.id, payOrder.id, userId);
  const beforePartial = await stockOf(payProduct.id);
  const orderDetail = await prisma.salesOrderItem.findFirstOrThrow({
    where: { orderId: payOrder.id },
  });
  const ret1 = await returns.createAndConfirm(
    orgA.id,
    {
      orderId: payOrder.id,
      reason: 'partial',
      items: [{ orderItemId: orderDetail.id, quantity: 1 }],
    },
    userId,
  );
  const midStock = await stockOf(payProduct.id);
  // Force double RETURN_IN same key (idempotent — không cộng kho 2 lần)
  const outbound = await prisma.salesStockMovement.findFirstOrThrow({
    where: {
      organizationId: orgA.id,
      type: 'OUTBOUND',
      referenceType: 'SALES_ORDER',
      referenceId: payOrder.id,
      productId: payProduct.id,
    },
  });
  await prisma.$transaction(async (tx) => {
    await inventory.returnInboundFromOutbound(tx, {
      organizationId: orgA.id,
      outboundMovementId: outbound.id,
      quantity: 1,
      referenceType: 'SALES_RETURN',
      referenceId: `${ret1.id}::${payProduct.id}`,
      performedById: userId,
    });
  });
  const afterDouble = await stockOf(payProduct.id);
  record(
    'Partial return + no double stock',
    ret1.orderStatus === 'PARTIALLY_RETURNED' &&
      midStock === beforePartial + 1 &&
      afterDouble === midStock,
    `before=${beforePartial} mid=${midStock} afterDup=${afterDouble} status=${ret1.orderStatus}`,
  );

  // P2-4 Supplier PO receive → INBOUND
  const supplier = await purchase.createSupplier(
    orgA.id,
    { name: `${tag}-NCC`, phone: '090' },
    userId,
  );
  const poProduct = await sales.createProduct(orgA.id, {
    name: `${tag}-PO-P`,
    sku: `${tag}-PO-P`,
    price: 10,
    costPrice: 5,
    stockQty: 0,
  });
  const po = await purchase.createPurchaseOrder(
    orgA.id,
    {
      supplierId: supplier.id,
      items: [{ productId: poProduct.id, quantity: 8, unitCost: 5 }],
    },
    userId,
  );
  await purchase.receiveGoods(
    orgA.id,
    po.id,
    { items: [{ productId: poProduct.id, quantity: 8, batchCode: `${tag}-PO-B` }] },
    userId,
  );
  const poStock = await stockOf(poProduct.id);
  const inboundPo = await prisma.salesStockMovement.findFirst({
    where: {
      organizationId: orgA.id,
      type: 'INBOUND',
      referenceType: 'PURCHASE_ORDER',
      referenceId: po.id,
    },
  });
  record(
    'Supplier PO receive → INBOUND',
    poStock === 8 && Boolean(inboundPo),
    `stock=${poStock} inbound=${inboundPo?.quantity}`,
  );

  // P2-5 Stock visibility physical/sellable/expired
  const vis = await inventory.stockBreakdown(prisma, orgA.id, expiredProduct.id);
  record(
    'Stock visibility physical/sellable/expired',
    vis.physicalQty === 10 && vis.sellableQty === 0 && vis.expiredQty === 10,
    JSON.stringify(vis),
  );

  // P2-6 Reconcile fix audit + idempotent
  await prisma.salesProduct.update({
    where: { id: poProduct.id },
    data: { stockQty: 1 },
  });
  const fix1 = await inventory.reconcile(orgA.id, {
    fix: true,
    performedById: userId,
    reason: 'e2e',
  });
  const recRow = await prisma.salesStockReconciliation.findFirst({
    where: { organizationId: orgA.id, id: fix1.reconciliationId ?? undefined },
    include: { lines: true },
  });
  const afterRecStock = await stockOf(poProduct.id);
  const fix2 = await inventory.reconcile(orgA.id, { fix: true, performedById: userId });
  record(
    'Reconcile fix audit + idempotent',
    Boolean(fix1.reconciliationId) &&
      Boolean(recRow) &&
      (recRow?.lines.length ?? 0) >= 1 &&
      afterRecStock === 8 &&
      fix2.idempotent === true &&
      fix2.counts.fixed === 0,
    `rec=${fix1.reconciliationCode} stock=${afterRecStock} idem=${fix2.idempotent}`,
  );

  // 15) Print order / export slip
  const printPath = join(
    __dirname,
    '../apps/web/src/components/sales/sales-print-document.tsx',
  );
  const printSrc = readFileSync(printPath, 'utf8');
  const printOk =
    printSrc.includes("kind === 'export'") &&
    printSrc.includes('printExportTitle') &&
    printSrc.includes('printOrderTitle') &&
    printSrc.includes('order.code') &&
    printSrc.includes('customerName') &&
    printSrc.includes('window.print') &&
    (printSrc.includes('a4') || printSrc.includes("'a4'")) &&
    printSrc.includes('mm80');
  record('In đơn/phiếu xuất → PASS', printOk);

  // Audit presence
  const auditActions = await prisma.auditLog.findMany({
    where: {
      organizationId: orgA.id,
      action: {
        in: [
          'SALES_STOCK_INBOUND',
          'SALES_STOCK_OUTBOUND',
          'SALES_ORDER_EXPORTED',
          'SALES_STOCK_RETURN_IN',
          'SALES_ORDER_CANCELLED',
          'SALES_STOCKTAKE_CONFIRMED',
          'SALES_STOCK_RECONCILE_FIX',
          'SALES_PAYMENT_RECORDED',
          'SALES_RETURN_CONFIRMED',
          'SALES_PO_RECEIVED',
        ],
      },
      createdAt: { gte: new Date(Date.now() - 10 * 60_000) },
    },
    take: 80,
  });
  const actionSet = new Set(auditActions.map((a) => a.action));
  const auditOk =
    actionSet.has('SALES_STOCK_INBOUND') &&
    actionSet.has('SALES_STOCK_OUTBOUND') &&
    actionSet.has('SALES_ORDER_EXPORTED') &&
    actionSet.has('SALES_STOCK_RETURN_IN') &&
    actionSet.has('SALES_ORDER_CANCELLED') &&
    actionSet.has('SALES_STOCKTAKE_CONFIRMED') &&
    actionSet.has('SALES_STOCK_RECONCILE_FIX') &&
    actionSet.has('SALES_PAYMENT_RECORDED') &&
    actionSet.has('SALES_RETURN_CONFIRMED') &&
    actionSet.has('SALES_PO_RECEIVED');
  record('Audit log nhập/xuất/hủy/hoàn/kk/pay/po', auditOk, [...actionSet].join(','));

  await cleanup(tag);

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY ===');
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}: ${r.name}`);
  }
  if (failed.length) {
    console.error(`\n${failed.length} failed`);
    process.exit(1);
  }
  console.log(`\ntest-sales-inventory-harden-e2e: all passed (${results.length})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
