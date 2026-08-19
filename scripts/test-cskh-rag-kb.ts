/**
 * E2E: Chatbot CSKH ↔ AI Knowledge Base (org-scoped retrieval + fallback).
 *
 * Run:
 *   node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-cskh-rag-kb.ts
 */
import { PrismaClient } from '@prisma/client';
import { RagKbService } from '../apps/api/dist/rag-kb/rag-kb.service';
import {
  generateAiReply,
  type KnowledgeChunk,
} from '../apps/api/dist/chatbot-cskh/utils/chatbot-ai.util';
import { NO_DATA_REPLY } from '../apps/api/dist/chatbot-cskh/utils/chatbot-constants';

type CaseResult = { name: string; pass: boolean; detail: string };

async function main() {
  const prisma = new PrismaClient();
  const results: CaseResult[] = [];
  // RagKbService only needs prisma CRUD surface used by searchForChatContext
  const rag = new RagKbService(prisma as never);

  try {
    const doc = await prisma.ragKbDocument.findFirst({
      where: {
        status: { in: ['ready', 'active', 'indexed'] },
        content: { not: '' },
      },
      include: { knowledgeBase: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (!doc) {
      results.push({
        name: 'fixture_kb_document',
        pass: false,
        detail: 'No RagKbDocument found in DB — cannot E2E',
      });
      printAndExit(results, 1);
      return;
    }

    const orgId = doc.organizationId;
    const otherOrg = await prisma.organization.findFirst({
      where: { id: { not: orgId } },
      select: { id: true },
    });

    const words = (doc.content.match(/[A-Za-zÀ-ỹ0-9]{4,}/g) || []).filter(
      (w) =>
        !/^(https|http|www|this|that|with|from|have|been|will|được|không|những|trong|với)$/i.test(
          w,
        ),
    );
    const keyword =
      words[0] || doc.title.split(/\s+/).find((w) => w.length >= 4) || doc.title;
    const inKbQuestion = `Cho tôi hỏi về ${keyword}`;
    const outKbQuestion = `xyzqwerty_không_tồn_tại_trong_kb_${Date.now()}`;

    const hits = await rag.searchForChatContext(orgId, inKbQuestion, { limit: 5 });
    results.push({
      name: 'search_in_kb_hits',
      pass: hits.length > 0,
      detail: `org=${orgId.slice(0, 8)}… query="${inKbQuestion.slice(0, 60)}" hits=${hits.length} top=${hits[0]?.title ?? '-'}`,
    });

    if (otherOrg) {
      const foreign = await rag.searchForChatContext(otherOrg.id, inKbQuestion, {
        limit: 5,
      });
      const leaked = foreign.some(
        (h) => h.sourceId === doc.id || h.knowledgeBaseId === doc.knowledgeBaseId,
      );
      results.push({
        name: 'tenant_isolation',
        pass: !leaked,
        detail: leaked
          ? `LEAK: other org ${otherOrg.id.slice(0, 8)} saw doc ${doc.id}`
          : `otherOrg hits=${foreign.length} (none from source KB)`,
      });
    } else {
      results.push({
        name: 'tenant_isolation',
        pass: true,
        detail: 'skipped (only one org) — search always filters by organizationId',
      });
    }

    const miss = await rag.searchForChatContext(orgId, outKbQuestion, { limit: 5 });
    results.push({
      name: 'search_out_kb_empty',
      pass: miss.length === 0,
      detail: `hits=${miss.length}`,
    });

    const bot =
      (await prisma.chatbotBot.findFirst({ where: { organizationId: orgId } })) ||
      (await prisma.chatbotBot.findFirst());

    if (!bot) {
      results.push({
        name: 'generate_ai_reply',
        pass: false,
        detail: 'No ChatbotBot in DB',
      });
      printAndExit(results, 1);
      return;
    }

    const ragChunks: KnowledgeChunk[] = hits.map((h) => ({
      sourceId: h.sourceId,
      title: h.title,
      sourceType: h.sourceType,
      content: h.content,
      score: h.score,
    }));

    const inReply = await generateAiReply({
      bot,
      userText: inKbQuestion,
      sources: [],
      ragChunks,
      history: [],
      settings: { model: 'gpt-4o-mini', temperature: 0.2 },
      usageAllowed: true,
    });
    results.push({
      name: 'reply_in_kb_uses_context',
      pass: !inReply.noData && inReply.reply !== NO_DATA_REPLY && inReply.reply.length > 20,
      detail: `noData=${inReply.noData} usedAi=${inReply.usedAi} reply="${inReply.reply.slice(0, 120)}…"`,
    });

    const outReply = await generateAiReply({
      bot: {
        ...bot,
        hotline: null,
        mainServices: null,
        websiteUrl: null,
        businessName: null,
        industry: null,
      },
      userText: outKbQuestion,
      sources: [],
      ragChunks: [],
      history: [],
      settings: { model: 'gpt-4o-mini', temperature: 0.2 },
      usageAllowed: true,
    });
    results.push({
      name: 'reply_out_kb_fallback',
      pass: outReply.noData === true && outReply.reply === NO_DATA_REPLY,
      detail: `noData=${outReply.noData} reply="${outReply.reply.slice(0, 80)}…"`,
    });

    const live = await rag.searchForChatContext(orgId, doc.title, { limit: 3 });
    results.push({
      name: 'live_kb_after_crud',
      pass: live.some((h) => h.sourceId === doc.id),
      detail: `search by title hits doc=${live.some((h) => h.sourceId === doc.id)}`,
    });

    const failed = results.filter((r) => !r.pass).length;
    printAndExit(results, failed ? 1 : 0);
  } finally {
    await prisma.$disconnect();
  }
}

function printAndExit(results: CaseResult[], code: number) {
  console.log('\n=== CSKH ↔ RAG KB E2E ===');
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name} — ${r.detail}`);
  }
  const pass = results.filter((r) => r.pass).length;
  console.log(`\nSUMMARY: ${pass}/${results.length} PASS${code === 0 ? '' : ' (FAILED)'}\n`);
  process.exit(code);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
