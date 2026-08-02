import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const paid = await p.paymentOrder.findFirst({
    where: { status: 'PAID' },
    orderBy: { paidAt: 'desc' },
    include: { plan: true },
  });
  if (!paid) {
    console.log('No PAID orders yet');
    return;
  }
  const sub = await p.subscription.findFirst({
    where: { organizationId: paid.organizationId },
    orderBy: { currentPeriodEnd: 'desc' },
    include: { plan: true },
  });
  console.log(
    JSON.stringify(
      {
        lastPaidOrder: {
          code: paid.code,
          amount: String(paid.amountVnd),
          paidAt: paid.paidAt,
          plan: paid.plan.name,
        },
        subscription: sub
          ? {
              status: sub.status,
              plan: sub.plan.name,
              periodEnd: sub.currentPeriodEnd,
              stillActive: sub.currentPeriodEnd > new Date(),
            }
          : null,
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
