const { prisma } = require('../packages/database/dist');
(async () => {
  const org = '4421a663-e724-4144-ba80-4d6b3f52c145';
  const oa = '526368405518511676';
  const identities = await prisma.messagingContactIdentity.findMany({
    where: { organizationId: org, channel: 'ZALO' },
    orderBy: { updatedAt: 'desc' },
    take: 20,
    select: {
      externalUserId: true,
      displayName: true,
      lastInboundAt: true,
      lastOutboundAt: true,
      chatbotConversationId: true,
    },
  });
  const recipients = await prisma.messagingCampaignRecipient.findMany({
    where: {
      campaign: { organizationId: org, channel: 'ZALO' },
    },
    orderBy: { updatedAt: 'desc' },
    take: 10,
    select: { externalUserId: true, status: true, updatedAt: true },
  });
  console.log(
    JSON.stringify(
      {
        identities: identities.map((i) => ({
          uidTail: i.externalUserId.slice(-6),
          uidLen: i.externalUserId.length,
          synthetic: i.externalUserId.startsWith('e2e_'),
          name: i.displayName,
          inbound: i.lastInboundAt,
        })),
        recipients: recipients.map((r) => ({
          uidTail: (r.externalUserId || '').slice(-6),
          uidLen: (r.externalUserId || '').length,
          status: r.status,
        })),
        envE2e: Boolean(process.env.ZALO_E2E_USER_ID),
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
