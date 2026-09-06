const { prisma } = require('../packages/database/dist');

function mask(id) {
  const s = String(id || '');
  if (s.length <= 6) return '***';
  return `${s.slice(0, 2)}…${s.slice(-4)}`;
}

async function main() {
  const org = '4421a663-e724-4144-ba80-4d6b3f52c145';
  const byChannel = await prisma.messagingContactIdentity.groupBy({
    by: ['channel'],
    where: { organizationId: org },
    _count: true,
  });
  const anyZalo = await prisma.messagingContactIdentity.count({
    where: { organizationId: org, channel: 'ZALO' },
  });
  const wh = await prisma.messagingWebhookEvent.count({
    where: { organizationId: org, channel: 'ZALO' },
  });
  const wh7 = await prisma.messagingWebhookEvent.count({
    where: {
      organizationId: org,
      channel: 'ZALO',
      receivedAt: { gte: new Date(Date.now() - 7 * 24 * 3600_000) },
    },
  });
  const sampleWh = await prisma.messagingWebhookEvent.findFirst({
    where: { organizationId: org, channel: 'ZALO' },
    orderBy: { receivedAt: 'desc' },
    select: { eventType: true, receivedAt: true, eventKey: true },
  });
  const campaigns = await prisma.messagingCampaign.count({
    where: { organizationId: org, channel: 'ZALO' },
  });
  console.log(
    JSON.stringify(
      {
        identitiesByChannel: byChannel,
        zaloIdentitiesIncludingMerged: anyZalo,
        webhookEventsAll: wh,
        webhookEvents7d: wh7,
        latestWebhook: sampleWh
          ? { type: sampleWh.eventType, at: sampleWh.receivedAt, key: mask(sampleWh.eventKey) }
          : null,
        zaloCampaigns: campaigns,
        e2eUserEnvSet: Boolean((process.env.ZALO_E2E_USER_ID || '').trim()),
        e2ePhoneSet: Boolean((process.env.ZALO_E2E_PHONE || '').trim()),
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
