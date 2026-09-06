import { PrismaClient } from '@prisma/client';
import { RagKbService } from '../apps/api/dist/rag-kb/rag-kb.service';
import { generateAiReply } from '../apps/api/dist/chatbot-cskh/utils/chatbot-ai.util';
import { NO_DATA_REPLY } from '../apps/api/dist/chatbot-cskh/utils/chatbot-constants';

async function main() {
  const prisma = new PrismaClient();
  const rag = new RagKbService(prisma as never);
  const q = 'tôi muốn tư vấn dịch vụ marketing';

  const pages = await prisma.chatbotFacebookPage.findMany({
    include: { bot: true },
    take: 10,
  });
  console.log(
    'PAGES',
    pages.map((p) => ({
      pageName: p.pageName,
      pageId: p.pageId,
      org: p.organizationId.slice(0, 8),
      botId: p.botId.slice(0, 8),
      aiEnabled: p.aiEnabled,
      status: p.status,
      botName: p.bot?.botName,
    })),
  );

  const docs = await prisma.ragKbDocument.findMany({
    select: {
      id: true,
      organizationId: true,
      title: true,
      status: true,
      content: true,
      knowledgeBase: { select: { name: true } },
    },
  });
  for (const d of docs) {
    const c = d.content || '';
    console.log('DOC', {
      title: d.title,
      kb: d.knowledgeBase.name,
      org: d.organizationId.slice(0, 8),
      status: d.status,
      len: c.length,
      hasMarketing: /marketing/i.test(c),
      hasDichVu: /dịch\s*vụ|dich\s*vu/i.test(c),
      snip: c.slice(0, 180).replace(/\s+/g, ' '),
    });
  }

  for (const p of pages) {
    const hits = await rag.searchForChatContext(p.organizationId, q, { limit: 5 });
    console.log('SEARCH', {
      page: p.pageName,
      org: p.organizationId.slice(0, 8),
      hits: hits.length,
      top: hits.slice(0, 3).map((h) => ({
        title: h.title,
        score: h.score,
        snip: h.content.slice(0, 100).replace(/\s+/g, ' '),
      })),
    });

    const bot = p.bot;
    if (!bot) continue;
    const reply = await generateAiReply({
      bot,
      userText: q,
      sources: [],
      ragChunks: hits.map((h) => ({
        sourceId: h.sourceId,
        title: h.title,
        sourceType: h.sourceType,
        content: h.content,
        score: h.score,
      })),
      history: [],
      settings: { model: 'gpt-4o-mini', temperature: 0.3 },
      usageAllowed: true,
    });
    console.log('REPLY', {
      page: p.pageName,
      noData: reply.noData,
      usedAi: reply.usedAi,
      isFallback: reply.reply === NO_DATA_REPLY,
      reply: reply.reply.slice(0, 160),
    });
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
