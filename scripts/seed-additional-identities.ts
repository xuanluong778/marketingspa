import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const orgId = "a30aca1e-7c12-4950-a15e-b8d114d7af35";
  const sourceIdentities = await prisma.messagingContactIdentity.findMany({
    where: { organizationId: orgId, integrationScopeKey: 'messenger:dryrun-page-1784888812310' }
  });

  for (const iden of sourceIdentities) {
    const targetKey = 'messenger:103244355239559';
    const exists = await prisma.messagingContactIdentity.findFirst({
      where: { organizationId: orgId, integrationScopeKey: targetKey, externalUserId: iden.externalUserId + '-digi' }
    });

    if (!exists) {
      await prisma.messagingContactIdentity.create({
        data: {
          organizationId: orgId,
          channel: 'MESSENGER',
          integrationScopeKey: targetKey,
          externalUserId: iden.externalUserId + '-digi',
          displayName: iden.displayName,
          customerId: iden.customerId,
          leadId: iden.leadId,
          lastInboundAt: new Date(),
        }
      });
      console.log(`Duplicated identity ${iden.displayName} for connection Thế Giới DIGI`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
