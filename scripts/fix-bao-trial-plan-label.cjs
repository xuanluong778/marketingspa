/** One-off: upgrade Bao spa from stuck trial label after gift kept planId. */
const { prisma } = require('../packages/database/dist');

(async () => {
  const subId = 'a72fb27d-6b55-4078-9517-60a27e13a439';
  const plan6 = await prisma.subscriptionPlan.findFirst({
    where: { code: 'msp-pro-6m', isActive: true },
  });
  if (!plan6) throw new Error('msp-pro-6m missing');

  const before = await prisma.subscription.findUnique({
    where: { id: subId },
    include: { plan: true },
  });
  if (!before) throw new Error('subscription missing');

  const after = await prisma.subscription.update({
    where: { id: subId },
    data: {
      planId: plan6.id,
      status: 'ACTIVE',
      cancelledAt: null,
    },
    include: { plan: true },
  });

  console.log(
    JSON.stringify(
      {
        before: { planCode: before.plan.code, status: before.status, end: before.currentPeriodEnd },
        after: { planCode: after.plan.code, planName: after.plan.name, status: after.status, end: after.currentPeriodEnd },
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
