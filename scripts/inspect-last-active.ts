import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const lastCampaign = await prisma.messagingCampaign.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, organizationId: true, updatedAt: true }
  });
  console.log('Last Campaign:', JSON.stringify(lastCampaign, null, 2));

  if (lastCampaign) {
    const org = await prisma.organization.findUnique({
      where: { id: lastCampaign.organizationId }
    });
    console.log('Active Org:', JSON.stringify(org, null, 2));

    const templates = await prisma.messageTemplate.findMany({
      where: { organizationId: lastCampaign.organizationId }
    });
    console.log('Templates in Active Org:', JSON.stringify(templates, null, 2));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
