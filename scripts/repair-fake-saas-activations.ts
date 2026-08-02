/**
 * Gỡ kích hoạt gói giả do smoke test (ops-dup / ops test) trên org thật.
 *
 * node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/repair-fake-saas-activations.ts
 * REPAIR_EMAIL=bao118221@gmail.com ...
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EMAIL = process.env.REPAIR_EMAIL || 'bao118221@gmail.com';
const REPAIR_ALL_OPS = process.env.REPAIR_ALL_OPS === '1';

async function repairOrg(organizationId: string, email?: string) {
  const fakeTxns = await prisma.paymentTransaction.findMany({
    where: {
      organizationId,
      sepayTransactionId: { startsWith: 'ops-' },
    },
  });

  const orderIds = new Set<string>();
  for (const t of fakeTxns) {
    if (t.paymentOrderId) orderIds.add(t.paymentOrderId);
  }

  // Order PAID cùng lúc với txn ops (cửa sổ smoke)
  const paidAroundSmoke = await prisma.paymentOrder.findMany({
    where: {
      organizationId,
      status: 'PAID',
      paidAt: {
        gte: new Date('2026-07-25T05:20:00.000Z'),
        lte: new Date('2026-07-25T05:40:00.000Z'),
      },
    },
  });
  for (const o of paidAroundSmoke) orderIds.add(o.id);

  const commissions = await prisma.affiliateCommission.findMany({
    where: {
      organizationId,
      OR: [
        { sepayTransactionId: { startsWith: 'ops-' } },
        ...(orderIds.size ? [{ orderId: { in: [...orderIds] } }] : []),
      ],
    },
  });

  const hasRealPaid = await prisma.paymentOrder.count({
    where: {
      organizationId,
      status: 'PAID',
      id: { notIn: [...orderIds] },
      NOT: {
        transactions: { some: { sepayTransactionId: { startsWith: 'ops-' } } },
      },
    },
  });

  await prisma.$transaction(async (tx) => {
    if (commissions.length) {
      await tx.affiliateCommission.deleteMany({
        where: { id: { in: commissions.map((c) => c.id) } },
      });
    }
    if (fakeTxns.length) {
      await tx.paymentTransaction.deleteMany({
        where: { id: { in: fakeTxns.map((t) => t.id) } },
      });
    }
    if (orderIds.size) {
      await tx.paymentOrder.deleteMany({
        where: { id: { in: [...orderIds] } },
      });
    }

    // Không còn thanh toán thật → xóa subscription smoke
    if (hasRealPaid === 0) {
      await tx.subscription.deleteMany({ where: { organizationId } });
    }

    await tx.auditLog.create({
      data: {
        organizationId,
        action: 'REPAIR_FAKE_SAAS_ACTIVATION',
        entityType: 'ORGANIZATION',
        entityId: organizationId,
        metadata: {
          email: email ?? null,
          reason: 'Remove ops/smoke fake SePay activation from production org',
          deletedTxns: fakeTxns.length,
          deletedOrders: orderIds.size,
          deletedCommissions: commissions.length,
          deletedSubscriptions: hasRealPaid === 0,
        },
      },
    });
  });

  return {
    organizationId,
    email: email ?? null,
    deletedTxns: fakeTxns.length,
    deletedOrders: orderIds.size,
    deletedCommissions: commissions.length,
    clearedSubscription: hasRealPaid === 0,
  };
}

async function main() {
  const results: Array<Record<string, unknown>> = [];

  if (REPAIR_ALL_OPS) {
    const opsOrgs = await prisma.paymentTransaction.findMany({
      where: { sepayTransactionId: { startsWith: 'ops-' }, organizationId: { not: null } },
      select: { organizationId: true },
      distinct: ['organizationId'],
    });
    for (const row of opsOrgs) {
      if (!row.organizationId) continue;
      const owner = await prisma.user.findFirst({
        where: { organizationId: row.organizationId },
        orderBy: { createdAt: 'asc' },
        select: { email: true },
      });
      results.push(await repairOrg(row.organizationId, owner?.email));
    }
  } else {
    const user = await prisma.user.findUnique({
      where: { email: EMAIL },
      select: { organizationId: true, email: true },
    });
    if (!user) throw new Error(`User not found: ${EMAIL}`);
    results.push(await repairOrg(user.organizationId, user.email));
  }

  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
