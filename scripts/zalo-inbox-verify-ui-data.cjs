const { prisma } = require('../packages/database/dist');
(async () => {
  const org = '4421a663-e724-4144-ba80-4d6b3f52c145';
  const bot = '622aba28-4702-4f95-b367-9c1f5c282ed3';
  const zalo = await prisma.chatbotConversation.findMany({
    where: { organizationId: org, botId: bot, channel: 'zalo' },
    include: {
      messages: { orderBy: { createdAt: 'asc' }, take: 10 },
    },
    take: 5,
  });
  const fb = await prisma.chatbotConversation.count({
    where: { organizationId: org, botId: bot, channel: 'facebook' },
  });
  const web = await prisma.chatbotConversation.count({
    where: { organizationId: org, botId: bot, channel: 'website' },
  });
  const otherOrgLeak = await prisma.chatbotConversation.count({
    where: {
      channel: 'zalo',
      channelRef: '526368405518511676',
      NOT: { organizationId: org },
    },
  });
  console.log(
    JSON.stringify(
      {
        zaloConvs: zalo.map((c) => ({
          id: c.id.slice(0, 8),
          name: c.visitorName,
          oa: c.channelRef,
          msgs: c.messages.map((m) => ({
            d: m.direction,
            s: m.status,
            t: m.message.slice(0, 40),
          })),
        })),
        facebookCountSameBot: fb,
        websiteCountSameBot: web,
        otherOrgLeak,
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
