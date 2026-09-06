/**
 * Bind Digi OA → Project "Thế Giới DIGI" for CSKH inbox routing.
 * No tokens logged.
 */
const { prisma } = require('../packages/database/dist');

const ORG = '4421a663-e724-4144-ba80-4d6b3f52c145';
const OA = '526368405518511676';
const BOT = '622aba28-4702-4f95-b367-9c1f5c282ed3';

(async () => {
  const conn = await prisma.messagingChannelConnection.findFirst({
    where: { organizationId: ORG, accountRef: OA, channel: 'ZALO' },
  });
  if (!conn) {
    console.log(JSON.stringify({ ok: false, reason: 'connection_missing' }));
    process.exit(1);
  }
  const prev = (conn.metadata && typeof conn.metadata === 'object' ? conn.metadata : {}) || {};
  const metadata = { ...prev, botId: BOT };
  await prisma.messagingChannelConnection.update({
    where: { id: conn.id },
    data: { metadata },
  });
  console.log(
    JSON.stringify({
      ok: true,
      connectionId: conn.id.slice(0, 8),
      accountRef: OA,
      botId: BOT,
      botName: 'Thế Giới DIGI',
    }),
  );
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
