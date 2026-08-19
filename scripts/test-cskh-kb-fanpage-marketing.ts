/**
 * Fanpage CSKH ↔ KB — test câu marketing + override NO_DATA.
 * Run: node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-cskh-kb-fanpage-marketing.ts
 */
import { PrismaClient } from '@prisma/client';
import { RagKbService } from '../apps/api/dist/rag-kb/rag-kb.service';
import { generateAiReply } from '../apps/api/dist/chatbot-cskh/utils/chatbot-ai.util';
import { NO_DATA_REPLY } from '../apps/api/dist/chatbot-cskh/utils/chatbot-constants';

type Case = { name: string; pass: boolean; detail: string };

async function main() {
  const prisma = new PrismaClient();
  const rag = new RagKbService(prisma as never);
  const results: Case[] = [];
  const queries = [
    'tôi muốn tư vấn dịch vụ marketing',
    'bên mình có những dịch vụ gì',
    'cho hỏi về SEO',
  ];

  try {
    const page = await prisma.chatbotFacebookPage.findFirst({
      where: { pageName: { contains: 'DIGI' } },
      include: { bot: true },
    });
    if (!page?.bot) {
      results.push({ name: 'fixture_page', pass: false, detail: 'No DIGI fanpage' });
      print(results, 1);
      return;
    }

    const orgId = page.organizationId;
    const otherOrg = await prisma.organization.findFirst({
      where: { id: { not: orgId } },
      select: { id: true },
    });

    for (const q of queries) {
      const hits = await rag.searchForChatContext(orgId, q, {
        limit: 5,
        minScore: 1,
        botId: page.botId,
        pageName: page.pageName || undefined,
      });
      results.push({
        name: `search:${q.slice(0, 28)}`,
        pass: hits.length > 0 && hits[0].score >= 1,
        detail: `hits=${hits.length} topScore=${hits[0]?.score ?? 0} snip=${(hits[0]?.content || '')
          .replace(/\s+/g, ' ')
          .slice(0, 90)}`,
      });

      const ragChunks = hits.map((h) => ({
        sourceId: h.sourceId,
        title: h.title,
        sourceType: h.sourceType,
        content: h.content,
        score: h.score,
      }));

      // Simulate OpenAI wrongly returning NO_DATA despite KB
      const channel = {
        pageId: page.pageId,
        pageName: page.pageName || undefined,
        channel: 'messenger',
      };
      const forced = await generateAiReply({
        bot: page.bot,
        userText: q,
        sources: [],
        ragChunks,
        channel,
        history: [],
        settings: { model: 'gpt-4o-mini', temperature: 0.2 },
        usageAllowed: true,
        openAiChat: async () => NO_DATA_REPLY,
      });
      results.push({
        name: `override_nodata:${q.slice(0, 20)}`,
        pass: !forced.noData && forced.reply !== NO_DATA_REPLY && forced.reply.length > 30,
        detail: `blocked=${forced.blockedCode} reply="${forced.reply.slice(0, 100).replace(/\s+/g, ' ')}"`,
      });

      // Without OpenAI — must use KB excerpt/list
      const offline = await generateAiReply({
        bot: page.bot,
        userText: q,
        sources: [],
        ragChunks,
        channel,
        history: [],
        settings: { model: 'gpt-4o-mini', temperature: 0.2 },
        usageAllowed: true,
      });
      results.push({
        name: `offline:${q.slice(0, 20)}`,
        pass: !offline.noData && offline.reply !== NO_DATA_REPLY,
        detail: `reply="${offline.reply.slice(0, 100).replace(/\s+/g, ' ')}"`,
      });
    }

    if (otherOrg) {
      const foreign = await rag.searchForChatContext(
        otherOrg.id,
        'tôi muốn tư vấn dịch vụ marketing',
        { limit: 5 },
      );
      results.push({
        name: 'tenant_isolation',
        pass: foreign.length === 0,
        detail: `otherHits=${foreign.length}`,
      });
    }

    // Empty / unrelated → fallback OK
    const miss = await rag.searchForChatContext(orgId, 'xyzqwerty_quantum_banana_999', {
      limit: 5,
      botId: page.botId,
    });
    const missReply = await generateAiReply({
      bot: {
        ...page.bot,
        hotline: null,
        mainServices: null,
        websiteUrl: null,
        businessName: null,
        industry: null,
      },
      userText: 'xyzqwerty_quantum_banana_999',
      sources: [],
      ragChunks: [],
      history: [],
      settings: { model: 'gpt-4o-mini', temperature: 0.2 },
      usageAllowed: true,
    });
    results.push({
      name: 'true_miss_fallback',
      pass: miss.length === 0 && missReply.noData && missReply.reply === NO_DATA_REPLY,
      detail: `hits=${miss.length} noData=${missReply.noData}`,
    });

    const failed = results.filter((r) => !r.pass).length;
    print(results, failed ? 1 : 0);
  } finally {
    await prisma.$disconnect();
  }
}

function print(results: Case[], code: number) {
  console.log('\n=== FANPAGE KB MARKETING E2E ===');
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name} — ${r.detail}`);
  }
  console.log(
    `\nSUMMARY: ${results.filter((r) => r.pass).length}/${results.length} PASS${code ? ' (FAILED)' : ''}\n`,
  );
  process.exit(code);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
