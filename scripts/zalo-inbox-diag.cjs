const { prisma } = require('../packages/database/dist');
(async () => {
  const org = '4421a663-e724-4144-ba80-4d6b3f52c145';
  const oa = '526368405518511676';
  const ids = await prisma.messagingContactIdentity.count({
    where: { organizationId: org, channel: 'ZALO' },
  });
  const conns = await prisma.messagingChannelConnection.findMany({
    where: { organizationId: org, channel: 'ZALO' },
    select: {
      id: true,
      accountRef: true,
      displayName: true,
      status: true,
      webhookSubscribed: true,
      lastSyncedAt: true,
      updatedAt: true,
      metadata: true,
    },
  });
  let webhookEvents = [];
  try {
    webhookEvents = await prisma.messagingWebhookEvent.findMany({
      where: { organizationId: org, channel: 'ZALO' },
      orderBy: { receivedAt: 'desc' },
      take: 15,
      select: {
        id: true,
        organizationId: true,
        channel: true,
        eventKey: true,
        processedAt: true,
        receivedAt: true,
      },
    });
  } catch (e) {
    webhookEvents = [{ error: String(e.message || e) }];
  }
  const bots = await prisma.chatbotBot.findMany({
    where: { organizationId: org },
    select: { id: true, botName: true, status: true },
  });
  console.log(
    JSON.stringify(
      {
        identities: ids,
        connections: conns.map((c) => ({
          id: c.id.slice(0, 8),
          accountRef: c.accountRef,
          name: c.displayName,
          status: c.status,
          hasWebhookSecret: Boolean(c.webhookSecret),
        })),
        bots,
        webhookEvents,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
