import { PrismaClient } from '@prisma/client';

async function main() {
  const p = new PrismaClient();
  const botId = '4a3c19a7-b568-432e-904c-b22da2019d3d';
  const bot = await p.chatbotBot.findUnique({ where: { id: botId } });
  console.log(
    'BOT',
    JSON.stringify(
      {
        botName: bot?.botName,
        businessName: bot?.businessName,
        industry: bot?.industry,
        mainServices: bot?.mainServices?.slice(0, 200),
        hotline: bot?.hotline,
        websiteUrl: bot?.websiteUrl,
      },
      null,
      2,
    ),
  );
  const src = await p.chatbotKnowledgeSource.findMany({
    where: { botId },
    select: { title: true, sourceType: true, status: true, content: true },
  });
  console.log('SRC_COUNT', src.length);
  for (const s of src) {
    console.log(
      JSON.stringify({
        title: s.title,
        status: s.status,
        hasSpa: /sương|spa|thẩm mỹ|massage/i.test(`${s.title} ${s.content || ''}`),
        hasDigi: /digi|seo/i.test(`${s.title} ${s.content || ''}`),
        snip: (s.content || '').slice(0, 120).replace(/\s+/g, ' '),
      }),
    );
  }
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
