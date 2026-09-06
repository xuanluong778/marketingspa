import { PrismaClient } from '@prisma/client';

async function main() {
  const p = new PrismaClient();
  const org = '4421a663-e724-4144-ba80-4d6b3f52c145';
  try {
    const bots = await p.chatbotBot.findMany({
      where: { organizationId: org },
      select: {
        id: true,
        botName: true,
        businessName: true,
        status: true,
        websiteUrl: true,
        allowedDomains: true,
      },
    });
    const pages = await p.chatbotFacebookPage.findMany({
      where: { organizationId: org },
      select: { pageId: true, pageName: true, botId: true, status: true },
    });
    const kbs = await p.ragKnowledgeBase.findMany({
      where: { organizationId: org },
      select: {
        id: true,
        name: true,
        isDefault: true,
        _count: { select: { documents: true } },
      },
    });
    const convByBot = await p.chatbotConversation.groupBy({
      by: ['botId', 'channel'],
      where: { organizationId: org },
      _count: true,
    });
    console.log(JSON.stringify({ bots, pages, kbs, convByBot }, null, 2));
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
