const { prisma } = require('../packages/database/dist');

(async () => {
  const user = await prisma.user.findFirst({
    where: { email: 'bao118221@gmail.com' },
    select: {
      id: true,
      email: true,
      name: true,
      organizationId: true,
      organization: { select: { name: true, email: true } },
    },
  });
  if (!user) {
    console.log(JSON.stringify({ error: 'USER_NOT_FOUND' }));
    await prisma.$disconnect();
    return;
  }

  const keys = Object.keys(prisma).filter((k) => /sub|gift|audit|plan|wallet/i.test(k));
  const subs = await prisma.subscription.findMany({
    where: { organizationId: user.organizationId },
    include: { plan: true },
    orderBy: { currentPeriodEnd: 'desc' },
  });

  let audits = [];
  try {
    audits = await prisma.adminAuditLog.findMany({
      where: {
        organizationId: user.organizationId,
        action: { contains: 'GIFT' },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  } catch {
    try {
      audits = await prisma.auditLog.findMany({
        where: {
          organizationId: user.organizationId,
          action: { contains: 'GIFT' },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
    } catch (e) {
      audits = [{ error: String(e.message || e) }];
    }
  }

  console.log(
    JSON.stringify(
      {
        prismaKeysSample: keys.slice(0, 40),
        user: {
          email: user.email,
          orgName: user.organization?.name,
          orgIdTail: user.organizationId.slice(-8),
        },
        subscriptions: subs.map((s) => ({
          id: s.id,
          status: s.status,
          planCode: s.plan.code,
          planName: s.plan.name,
          durationMonths: s.plan.durationMonths,
          periodStart: s.currentPeriodStart,
          periodEnd: s.currentPeriodEnd,
        })),
        audits: audits.map((g) =>
          g.error
            ? g
            : {
                action: g.action,
                createdAt: g.createdAt,
                metadata: g.metadata,
              },
        ),
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
