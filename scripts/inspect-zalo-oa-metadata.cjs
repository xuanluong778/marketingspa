const { prisma } = require('../packages/database/dist');
const ORG = '4421a663-e724-4144-ba80-4d6b3f52c145';

(async () => {
  const rows = await prisma.messagingChannelConnection.findMany({
    where: { organizationId: ORG, providerKind: 'ZALO_OA' },
    select: {
      id: true,
      accountRef: true,
      displayName: true,
      status: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const safe = rows.map((r) => ({
    idTail: r.id.slice(-8),
    accountRefTail: String(r.accountRef).slice(-8),
    displayName: r.displayName,
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    metadataKeys:
      r.metadata && typeof r.metadata === 'object' ? Object.keys(r.metadata) : [],
    metadataPublic:
      r.metadata && typeof r.metadata === 'object'
        ? Object.fromEntries(
            Object.entries(r.metadata).filter(
              ([k]) =>
                !/token|secret|key|password|credential|refresh|access/i.test(k),
            ),
          )
        : null,
  }));
  console.log(JSON.stringify(safe, null, 2));
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
