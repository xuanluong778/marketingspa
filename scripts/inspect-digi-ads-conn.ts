import { prisma } from '@marketingspa/database';

async function main() {
  const org = '2b8fa4ec-976e-4ba3-910f-94bf30d2dbce';
  const ad = await prisma.adConnection.findMany({
    where: { organizationId: org },
    select: {
      provider: true,
      status: true,
      externalAccountId: true,
      externalAccountName: true,
      tokenExpiresAt: true,
      scopes: true,
      updatedAt: true,
    },
  });
  const fb = await prisma.facebookAdsConnection.findUnique({
    where: { organizationId: org },
    select: {
      status: true,
      selectedAdAccountId: true,
      selectedAdAccountName: true,
      facebookUserId: true,
      scopes: true,
    },
  });
  console.log(JSON.stringify({ ad, fb }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(String(e).slice(0, 300));
  process.exit(1);
});
