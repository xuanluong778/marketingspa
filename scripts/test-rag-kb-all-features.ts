/**
 * Smoke: Knowledge Base prompt block available for all AI features (org-scoped).
 *
 * Run:
 *   node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-rag-kb-all-features.ts
 */
import { PrismaClient } from '@prisma/client';
import { RagKbService } from '../apps/api/dist/rag-kb/rag-kb.service';
import {
  buildRagQuery,
  formatRagForPrompt,
  withKnowledgeOpenAi,
  prependKnowledgeToMessages,
} from '../apps/api/dist/rag-kb/rag-prompt.util';

type CaseResult = { name: string; pass: boolean; detail: string };

async function main() {
  const prisma = new PrismaClient();
  const results: CaseResult[] = [];
  const rag = new RagKbService(prisma as never);

  try {
    const doc = await prisma.ragKbDocument.findFirst({
      where: { status: { in: ['ready', 'active', 'indexed'] }, content: { not: '' } },
      orderBy: { updatedAt: 'desc' },
    });
    if (!doc) {
      results.push({ name: 'fixture', pass: false, detail: 'No KB doc' });
      print(results, 1);
      return;
    }

    const orgId = doc.organizationId;
    const keyword =
      (doc.content.match(/[A-Za-zÀ-ỹ0-9]{5,}/g) || []).find((w) => w.length >= 5) ||
      doc.title;

    // Content-style query (topic + product)
    const contentQuery = buildRagQuery(keyword, 'dịch vụ', 'ưu đãi');
    const contentBlock = await rag.getPromptBlock(orgId, contentQuery, {
      limit: 5,
      mode: 'content',
    });
    results.push({
      name: 'content_prompt_block',
      pass: contentBlock.includes('AI KNOWLEDGE BASE') && contentBlock.length > 80,
      detail: `chars=${contentBlock.length}`,
    });

    // Chat-style (assistant / messaging)
    const chatBlock = await rag.getPromptBlock(orgId, `Hỏi về ${keyword}`, {
      limit: 5,
      mode: 'chat',
    });
    results.push({
      name: 'chat_prompt_block',
      pass: chatBlock.includes('AI KNOWLEDGE BASE') && chatBlock.length > 80,
      detail: `chars=${chatBlock.length}`,
    });

    // Tenant isolation
    const other = await prisma.organization.findFirst({
      where: { id: { not: orgId } },
      select: { id: true },
    });
    if (other) {
      const foreign = await rag.getPromptBlock(other.id, keyword, { limit: 5 });
      const leaked = foreign.includes(doc.title) && foreign.includes(doc.id);
      // title might coincidentally appear — ensure document content unique slice not in foreign
      const uniqueSlice = doc.content.slice(40, 90).trim();
      const leakedContent = uniqueSlice.length > 10 && foreign.includes(uniqueSlice);
      results.push({
        name: 'tenant_isolation_prompt',
        pass: !leakedContent,
        detail: leaked || leakedContent ? 'LEAK' : `otherBlockChars=${foreign.length}`,
      });
    } else {
      results.push({
        name: 'tenant_isolation_prompt',
        pass: true,
        detail: 'single org — skipped',
      });
    }

    // OpenAI wrapper injects system message
    const calls: unknown[] = [];
    const fakeOpenAi = {
      chatCompletion: async (params: { messages: unknown[] }) => {
        calls.push(params.messages);
        return 'ok';
      },
      chatCompletionWithTools: async (params: { messages: unknown[] }) => {
        calls.push(params.messages);
        return { message: { content: 'ok' } };
      },
      isConfigured: () => true,
    };
    const wrapped = withKnowledgeOpenAi(fakeOpenAi as never, contentBlock);
    await (wrapped as { chatCompletion: (p: unknown) => Promise<string> }).chatCompletion({
      messages: [{ role: 'user', content: 'viết caption' }],
    });
    const msgs = calls[0] as Array<{ role: string; content: string }>;
    results.push({
      name: 'openai_proxy_injects_kb',
      pass: msgs?.[0]?.role === 'system' && msgs[0].content.includes('KNOWLEDGE BASE'),
      detail: `firstRole=${msgs?.[0]?.role}`,
    });

    // Format helper
    const formatted = formatRagForPrompt(
      [{ title: 't', content: 'hello world content about spa' }],
      'content',
    );
    results.push({
      name: 'format_helper',
      pass: formatted.includes('[KB 1:') && formatted.includes('hello world'),
      detail: 'ok',
    });

    // prepend helper
    const prepended = prependKnowledgeToMessages(
      [{ role: 'user', content: 'x' }],
      'KB BLOCK',
    );
    results.push({
      name: 'prepend_helper',
      pass: prepended.length === 2 && prepended[0].content === 'KB BLOCK',
      detail: `len=${prepended.length}`,
    });

    // Empty query fail-open
    const empty = await rag.getPromptBlock(orgId, '  ', { limit: 3 });
    results.push({
      name: 'empty_query_fail_open',
      pass: empty === '',
      detail: `empty=${JSON.stringify(empty)}`,
    });

    const failed = results.filter((r) => !r.pass).length;
    print(results, failed ? 1 : 0);
  } finally {
    await prisma.$disconnect();
  }
}

function print(results: CaseResult[], code: number) {
  console.log('\n=== RAG KB ALL FEATURES SMOKE ===');
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
