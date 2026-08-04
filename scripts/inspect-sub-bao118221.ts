import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
const EMAIL = 'bao118221@gmail.com';

async function main() {
  const user = await p.user.findUnique({
    where: { email: EMAIL },
    include: {
      organization: true,
      role: true,
    },
  });
  if (!user) {
    console.log('USER_NOT_FOUND');
    return;
  }

  const subs = await p.subscription.findMany({
    where: { organizationId: user.organizationId },
    include: { plan: true },
    orderBy: { createdAt: 'desc' },
  });

  const orders = await p.paymentOrder.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const txns = await p.paymentTransaction.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const audits = await p.auditLog.findMany({
    where: {
      OR: [
        { organizationId: user.organizationId },
        { userId: user.id },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 40,
  });

  console.log(
    JSON.stringify(
      {
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.createdAt,
          authProvider: user.authProvider,
          org: {
            id: user.organization.id,
            name: user.organization.name,
            slug: user.organization.slug,
            createdAt: user.organization.createdAt,
            referredByCode: user.organization.referredByCode,
          },
        },
        subscriptions: subs.map((s) => ({
          id: s.id,
          status: s.status,
          plan: s.plan ? { code: s.plan.code, name: s.plan.name, durationMonths: s.plan.durationMonths } : null,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          cancelledAt: (s as { cancelledAt?: Date | null }).cancelledAt ?? null,
          metadata: (s as { metadata?: unknown }).metadata ?? null,
        })),
        paymentOrders: orders.map((o) => ({
          id: o.id,
          code: o.code,
          status: o.status,
          amount: o.amount,
          planCode: (o as { planCode?: string | null }).planCode ?? null,
          createdAt: o.createdAt,
          paidAt: (o as { paidAt?: Date | null }).paidAt ?? null,
        })),
        paymentTransactions: txns.map((t) => ({
          id: t.id,
          status: t.status,
          amount: t.amount,
          sepayId: (t as { sepayTransactionId?: string | null }).sepayTransactionId ?? null,
          orderId: (t as { orderId?: string | null }).orderId ?? null,
          createdAt: t.createdAt,
        })),
        recentAudits: audits.map((a) => ({
          action: a.action,
          entityType: a.entityType,
          entityId: a.entityId,
          createdAt: a.createdAt,
          meta: a.metadata,
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
