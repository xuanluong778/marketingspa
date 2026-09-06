const { prisma } = require('../packages/database/dist');

async function main() {
  const live = process.env.MESSAGING_LIVE_SEND;
  const oas = (process.env.MESSAGING_LIVE_OA_IDS || '').trim();
  const stub = process.env.ZALO_TOKEN_REFRESH_STUB;
  console.log(
    JSON.stringify(
      {
        MESSAGING_LIVE_SEND: live,
        MESSAGING_LIVE_OA_IDS_set: Boolean(oas),
        MESSAGING_LIVE_OA_IDS_count: oas ? oas.split(/[,\s]+/).filter(Boolean).length : 0,
        ZALO_TOKEN_REFRESH_STUB: stub || '(unset)',
        ZALO_APP_ID_set: Boolean((process.env.ZALO_APP_ID || '').trim()),
        ZALO_APP_SECRET_set: Boolean((process.env.ZALO_APP_SECRET || '').trim()),
        ZALO_E2E_OA_ID_set: Boolean((process.env.ZALO_E2E_OA_ID || '').trim()),
        ZALO_E2E_USER_ID_set: Boolean((process.env.ZALO_E2E_USER_ID || '').trim()),
        ZALO_E2E_ACCESS_TOKEN_set: Boolean((process.env.ZALO_E2E_ACCESS_TOKEN || '').trim()),
        ZALO_E2E_REFRESH_TOKEN_set: Boolean((process.env.ZALO_E2E_REFRESH_TOKEN || '').trim()),
        ZALO_E2E_WEBHOOK_SECRET_set: Boolean((process.env.ZALO_E2E_WEBHOOK_SECRET || '').trim()),
      },
      null,
      2,
    ),
  );

  const conns = await prisma.messagingChannelConnection.findMany({
    where: { channel: 'ZALO', providerKind: { in: ['ZALO_OA', 'ZBS_TEMPLATE'] } },
    select: {
      id: true,
      organizationId: true,
      accountRef: true,
      providerKind: true,
      status: true,
      tokenExpiresAt: true,
      isPaused: true,
      displayName: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });
  console.log('CONNECTIONS', JSON.stringify(conns, null, 2));

  const recentRecipients = await prisma.messagingCampaignRecipient
    .findMany({
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        organizationId: true,
        status: true,
        providerMessageId: true,
        lastError: true,
        sentAt: true,
        deliveredAt: true,
        updatedAt: true,
        campaignId: true,
      },
    })
    .catch((e) => ({ error: String(e.message) }));
  console.log('RECENT_RECIPIENTS', JSON.stringify(recentRecipients, null, 2));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
