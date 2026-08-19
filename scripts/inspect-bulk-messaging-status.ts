import { PrismaClient } from '@prisma/client';

async function main() {
  const p = new PrismaClient();
  try {
    const campaigns = await p.messagingCampaign.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 8,
      select: {
        id: true,
        name: true,
        status: true,
        channel: true,
        campaignType: true,
        sentCount: true,
        totalRecipients: true,
        failedCount: true,
        createdAt: true,
        updatedAt: true,
        organizationId: true,
      },
    });
    const recipients = await p.messagingCampaignRecipient.groupBy({
      by: ['status'],
      _count: true,
    });
    const connections = await p.messagingChannelConnection.findMany({
      take: 20,
      select: {
        id: true,
        channel: true,
        providerKind: true,
        status: true,
        displayName: true,
        organizationId: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
    const policies = await p.messagingOrgPolicy.count();
    console.log(
      JSON.stringify(
        {
          campaignCount: await p.messagingCampaign.count(),
          recentCampaigns: campaigns,
          recipientStatusTally: recipients,
          connections,
          policyCount: policies,
        },
        null,
        2,
      ),
    );
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
