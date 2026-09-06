import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const org = '4421a663-e724-4144-ba80-4d6b3f52c145';
  try {
    const pages = await prisma.chatbotFacebookPage.findMany({
      where: { organizationId: org },
      include: { bot: { select: { botName: true } } },
      orderBy: { pageName: 'asc' },
    });
    const bots = await prisma.chatbotBot.findMany({
      where: { organizationId: org },
      select: { id: true, botName: true, websiteUrl: true, allowedDomains: true },
    });
    console.log(
      'FANPAGES',
      pages.map((p) => `${p.pageName} · ${p.bot.botName}`).join(' | '),
    );
    console.log(
      'WEBSITES',
      bots
        .map((b) => `${b.websiteUrl || b.allowedDomains || '(none)'} · ${b.botName}`)
        .join(' | '),
    );
    console.log('pageCount', pages.length, 'botCount', bots.length);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
