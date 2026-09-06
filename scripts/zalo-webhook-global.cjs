const { prisma } = require('../packages/database/dist');
(async () => {
  const oa = '526368405518511676';
  const conns = await prisma.messagingChannelConnection.findMany({
    where: { accountRef: oa },
    select: {
      id: true,
      organizationId: true,
      channel: true,
      providerKind: true,
      status: true,
      isPaused: true,
      displayName: true,
    },
  });
  const recent = await prisma.messagingWebhookEvent.findMany({
    orderBy: { receivedAt: 'desc' },
    take: 20,
    select: {
      id: true,
      organizationId: true,
      channel: true,
      eventKey: true,
      receivedAt: true,
      processedAt: true,
    },
  });
  const redisInfo = { note: 'check bull queue separately' };
  console.log(JSON.stringify({ conns, recentCount: recent.length, recent }, null, 2));
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
