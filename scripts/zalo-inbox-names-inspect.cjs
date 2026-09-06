const { prisma } = require('../packages/database/dist');
(async () => {
  const org = '4421a663-e724-4144-ba80-4d6b3f52c145';
  const convs = await prisma.chatbotConversation.findMany({
    where: { organizationId: org, channel: 'zalo' },
    orderBy: { updatedAt: 'desc' },
    take: 10,
    select: {
      id: true,
      visitorName: true,
      visitorAvatarUrl: true,
      externalUserId: true,
      channelRef: true,
      updatedAt: true,
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 2,
        select: { message: true, direction: true },
      },
    },
  });
  const ids = await prisma.messagingContactIdentity.findMany({
    where: { organizationId: org, channel: 'ZALO' },
    orderBy: { updatedAt: 'desc' },
    take: 10,
    select: {
      id: true,
      externalUserId: true,
      displayName: true,
      avatarUrl: true,
      chatbotConversationId: true,
      lastInboundAt: true,
      metadata: true,
    },
  });
  const events = await prisma.messagingWebhookEvent.findMany({
    where: { organizationId: org, channel: 'ZALO' },
    orderBy: { receivedAt: 'desc' },
    take: 8,
    select: { eventKey: true, receivedAt: true, processedAt: true },
  });
  console.log(
    JSON.stringify(
      {
        convs: convs.map((c) => ({
          id: c.id.slice(0, 8),
          name: c.visitorName,
          hasAvatar: Boolean(c.visitorAvatarUrl),
          uidLen: (c.externalUserId || '').length,
          uidTail: (c.externalUserId || '').slice(-6),
          synthetic: (c.externalUserId || '').startsWith('e2e_'),
          oa: c.channelRef,
          updatedAt: c.updatedAt,
          last: c.messages.map((m) => ({
            d: m.direction,
            t: (m.message || '').slice(0, 40),
          })),
        })),
        ids: ids.map((i) => ({
          id: i.id.slice(0, 8),
          uidLen: i.externalUserId.length,
          uidTail: i.externalUserId.slice(-6),
          synthetic: i.externalUserId.startsWith('e2e_'),
          name: i.displayName,
          hasAvatar: Boolean(i.avatarUrl),
          conv: i.chatbotConversationId?.slice(0, 8) || null,
          inbound: i.lastInboundAt,
        })),
        events: events.map((e) => ({
          key: e.eventKey.slice(0, 90),
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
