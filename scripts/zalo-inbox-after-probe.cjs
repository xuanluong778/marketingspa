const { prisma } = require('../packages/database/dist');
const { decryptSecret } = require('../packages/database/dist');

// Fallback decrypt via API util if needed — try raw prisma credentials presence only
(async () => {
  const org = '4421a663-e724-4144-ba80-4d6b3f52c145';
  const oa = '526368405518511676';

  const events = await prisma.messagingWebhookEvent.findMany({
    where: { organizationId: org, channel: 'ZALO' },
    orderBy: { receivedAt: 'desc' },
    take: 10,
  });
  const ids = await prisma.messagingContactIdentity.findMany({
    where: { organizationId: org, channel: 'ZALO' },
    orderBy: { updatedAt: 'desc' },
    take: 10,
    select: {
      id: true,
      externalUserId: true,
      displayName: true,
      lastInboundAt: true,
      chatbotConversationId: true,
    },
  });
  const convs = await prisma.chatbotConversation.findMany({
    where: { organizationId: org, channel: 'zalo' },
    orderBy: { updatedAt: 'desc' },
    take: 10,
    select: {
      id: true,
      botId: true,
      visitorName: true,
      externalUserId: true,
      channelRef: true,
      updatedAt: true,
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { message: true, direction: true, status: true, createdAt: true },
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        webhookEvents: events.length,
        eventKeys: events.map((e) => ({
          key: e.eventKey.slice(0, 80),
          processed: Boolean(e.processedAt),
          at: e.receivedAt,
        })),
        identities: ids.map((i) => ({
          uidTail: i.externalUserId.slice(-6),
          name: i.displayName,
          inbound: i.lastInboundAt,
          conv: i.chatbotConversationId?.slice(0, 8) || null,
        })),
        convs: convs.map((c) => ({
          id: c.id.slice(0, 8),
          bot: c.botId.slice(0, 8),
          name: c.visitorName,
          oa: c.channelRef,
          uidTail: (c.externalUserId || '').slice(-6),
          msgs: c.messages.map((m) => ({
            d: m.direction,
            s: m.status,
            t: (m.message || '').slice(0, 40),
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
