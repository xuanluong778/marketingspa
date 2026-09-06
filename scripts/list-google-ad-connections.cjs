const { prisma } = require('../packages/database/dist');

async function main() {
  const rows = await prisma.adConnection.findMany({
    where: { provider: 'GOOGLE' },
    select: {
      id: true,
      organizationId: true,
      status: true,
      externalAccountId: true,
      externalAccountName: true,
      lastSyncAt: true,
      lastError: true,
      updatedAt: true,
      encryptedCredentials: true,
    },
  });
  console.log(
    JSON.stringify(
      rows.map((r) => ({
        ...r,
        hasCredentials: Boolean(r.encryptedCredentials),
        encryptedCredentials: r.encryptedCredentials ? '[redacted]' : null,
      })),
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
