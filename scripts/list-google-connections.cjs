const { prisma } = require('../packages/database/dist');
const { AdConnectionProvider } = require('../packages/database/dist');

(async () => {
  const rows = await prisma.adConnection.findMany({
    where: { provider: AdConnectionProvider.GOOGLE },
    select: {
      id: true,
      organizationId: true,
      status: true,
      externalAccountId: true,
      externalAccountName: true,
      metadata: true,
      lastSyncAt: true,
      lastError: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  });
  console.log(JSON.stringify(rows, null, 2));
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
