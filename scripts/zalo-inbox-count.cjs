const { prisma } = require('../packages/database/dist');
(async () => {
  const org = '4421a663-e724-4144-ba80-4d6b3f52c145';
  const convs = await prisma.chatbotConversation.count({
    where: { organizationId: org, channel: 'zalo' },
  });
  const msgs = await prisma.chatbotMessage.count({
    where: { conversation: { organizationId: org, channel: 'zalo' } },
  });
  const recent = await prisma.chatbotConversation.findMany({
    where: { organizationId: org, channel: 'zalo' },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    select: {
      id: true,
      visitorName: true,
      channelRef: true,
      externalUserId: true,
      updatedAt: true,
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: { message: true, direction: true, status: true, createdAt: true },
      },
    },
  });
  console.log(
    JSON.stringify(
      {
        convs,
        msgs,
        recent: recent.map((c) => ({
          id: c.id.slice(0, 8),
          name: c.visitorName,
          oa: c.channelRef,
          uidTail: (c.externalUserId || '').slice(-4),
          updatedAt: c.updatedAt,
          lastMsgs: c.messages.map((m) => ({
            d: m.direction,
            s: m.status,
            t: (m.message || '').slice(0, 48),
          })),
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
