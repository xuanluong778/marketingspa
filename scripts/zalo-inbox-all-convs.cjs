const { prisma } = require('../packages/database/dist');
(async () => {
  const all = await prisma.chatbotConversation.findMany({
    where: { channel: 'zalo' },
    orderBy: { updatedAt: 'desc' },
    take: 20,
    select: {
      id: true,
      organizationId: true,
      visitorName: true,
      externalUserId: true,
      channelRef: true,
      botId: true,
      updatedAt: true,
      createdAt: true,
    },
  });
  const recentEvents = await prisma.messagingWebhookEvent.findMany({
    where: { channel: 'ZALO' },
    orderBy: { receivedAt: 'desc' },
    take: 15,
    select: {
      organizationId: true,
      eventKey: true,
      receivedAt: true,
      processedAt: true,
    },
  });
  console.log(
    JSON.stringify(
      {
        allZaloConvs: all.map((c) => ({
          id: c.id.slice(0, 8),
          org: c.organizationId.slice(0, 8),
          name: c.visitorName,
          uidLen: (c.externalUserId || '').length,
          uidTail: (c.externalUserId || '').slice(-6),
          synthetic: (c.externalUserId || '').startsWith('e2e_'),
          numericUid: /^\d+$/.test(c.externalUserId || ''),
          oa: c.channelRef,
          updatedAt: c.updatedAt,
        })),
        recentEvents: recentEvents.map((e) => ({
          org: e.organizationId.slice(0, 8),
          key: e.eventKey.slice(0, 100),
          at: e.receivedAt,
          processed: Boolean(e.processedAt),
        })),
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
