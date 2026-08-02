import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const orgId = "a30aca1e-7c12-4950-a15e-b8d114d7af35";
  const count = await prisma.messagingContactIdentity.count({
    where: { organizationId: orgId }
  });
  console.log(`Identities count for ${orgId}:`, count);

  const list = await prisma.messagingContactIdentity.findMany({
    where: { organizationId: orgId },
    select: { id: true, displayName: true, integrationScopeKey: true, externalUserId: true }
  });
  console.log('List:', JSON.stringify(list, null, 2));

  const connections = await prisma.messagingChannelConnection.findMany({
    where: { organizationId: orgId }
  });
  console.log('Connections:', JSON.stringify(connections, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
