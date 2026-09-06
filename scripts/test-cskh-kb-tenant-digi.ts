/**
 * E2E: Fanpage Thế Giới Digi — đúng KB org, không lẫn Sương Spa.
 * Run: node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-cskh-kb-tenant-digi.ts
 */
import { PrismaClient } from '@prisma/client';
import { RagKbService } from '../apps/api/dist/rag-kb/rag-kb.service';
import {
  generateAiReply,
  resolveChannelBrand,
} from '../apps/api/dist/chatbot-cskh/utils/chatbot-ai.util';
import { NO_DATA_REPLY } from '../apps/api/dist/chatbot-cskh/utils/chatbot-constants';

type Case = { name: string; pass: boolean; detail: string };

const SPA_LEAK =
  /suong\s*spa|sương\s*spa|\bspa\b|thẩm mỹ|tham my|massage|nail|gội đầu|goi dau/i;
const DIGI_SIGNAL =
  /digi|seo|website|marketing|facebook ads|quảng cáo|entity|backlink|đào tạo|dao tao/i;

function fold(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

async function main() {
  const prisma = new PrismaClient();
  const rag = new RagKbService(prisma as never);
  const results: Case[] = [];
  const query = 'bên mình có dịch vụ gì?';

  try {
    const page = await prisma.chatbotFacebookPage.findFirst({
      where: {
        OR: [
          { pageName: { contains: 'DIGI', mode: 'insensitive' } },
          { pageName: { contains: 'Digi', mode: 'insensitive' } },
          { pageId: '103244355239559' },
        ],
      },
      include: { bot: true },
    });
    if (!page?.bot) {
      results.push({ name: 'fixture_digi_page', pass: false, detail: 'No Thế Giới Digi fanpage' });
      print(results, 1);
      return;
    }

    results.push({
      name: 'trace_page_org',
      pass: Boolean(page.organizationId && page.pageId),
      detail: `pageId=…${page.pageId.slice(-4)} page="${page.pageName}" org=${page.organizationId.slice(0, 8)}… bot="${page.bot.botName}" business="${page.bot.businessName}" industry="${page.bot.industry}"`,
    });

    const orgId = page.organizationId;
    const channel = {
      pageId: page.pageId,
      pageName: page.pageName || undefined,
      channel: 'messenger',
    };

    const brand = resolveChannelBrand({ bot: page.bot, channel, ragChunks: [] });
    results.push({
      name: 'brand_resolve_digi_not_spa',
      pass:
        !SPA_LEAK.test(brand.businessName) &&
        !/spa|thẩm mỹ/i.test(brand.industry) &&
        brand.blockSpaBleed === true,
      detail: `business="${brand.businessName}" industry="${brand.industry}" blockSpa=${brand.blockSpaBleed} suppress=${brand.suppressConflictingBotProfile}`,
    });

    const hits = await rag.searchForChatContext(orgId, query, {
      limit: 5,
      minScore: 1,
      botId: page.botId,
      pageName: page.pageName || undefined,
    });
    const hitBlob = hits.map((h) => `${h.knowledgeBaseName} ${h.title} ${h.content}`).join('\n');
    results.push({
      name: 'kb_hits_for_services',
      pass: hits.length > 0 && DIGI_SIGNAL.test(hitBlob) && !SPA_LEAK.test(fold(hitBlob)),
      detail: `hits=${hits.length} topKb="${hits[0]?.knowledgeBaseName}" snip=${(hits[0]?.content || '')
        .replace(/\s+/g, ' ')
        .slice(0, 100)}`,
    });

    // Tenant isolation: org khác không thấy Digi docs
    const otherOrg = await prisma.organization.findFirst({
      where: { id: { not: orgId } },
      select: { id: true },
    });
    if (otherOrg) {
      const foreign = await rag.searchForChatContext(otherOrg.id, query, {
        limit: 5,
        pageName: page.pageName || undefined,
      });
      const foreignBlob = foreign.map((h) => h.content).join(' ');
      results.push({
        name: 'tenant_isolation_other_org',
        pass: foreign.length === 0 || !/thegioidigi|the gioi digi/i.test(fold(foreignBlob)),
        detail: `otherHits=${foreign.length}`,
      });
    }

    // Docs org này không chứa spa content trong top Digi hits
    const spaDocs = await prisma.ragKbDocument.findMany({
      where: {
        organizationId: orgId,
        OR: [
          { title: { contains: 'spa', mode: 'insensitive' } },
          { content: { contains: 'Sương Spa', mode: 'insensitive' } },
          { knowledgeBase: { name: { contains: 'Spa', mode: 'insensitive' } } },
        ],
      },
      select: { id: true, title: true, knowledgeBase: { select: { name: true } } },
      take: 5,
    });
    results.push({
      name: 'org_kb_no_suong_spa_docs',
      pass: spaDocs.every((d) => !/suong/i.test(`${d.title} ${d.knowledgeBase.name}`)),
      detail: `spaLikeDocs=${spaDocs.length} sample=${spaDocs
        .map((d) => d.knowledgeBase.name)
        .slice(0, 3)
        .join(',')}`,
    });

    const ragChunks = hits.map((h) => ({
      sourceId: h.sourceId,
      title: h.title,
      sourceType: h.sourceType,
      content: h.content,
      score: h.score,
      knowledgeBaseName: h.knowledgeBaseName,
    }));

    // Offline AI path (no OpenAI) — phải trả Digi services, không Spa
    const offline = await generateAiReply({
      bot: page.bot,
      userText: query,
      sources: [],
      ragChunks,
      channel,
      history: [],
      settings: { model: 'gpt-4o-mini', temperature: 0.2 },
      usageAllowed: true,
    });
    results.push({
      name: 'offline_reply_digi_services',
      pass:
        !offline.noData &&
        offline.reply !== NO_DATA_REPLY &&
        DIGI_SIGNAL.test(offline.reply) &&
        !SPA_LEAK.test(fold(offline.reply)),
      detail: `reply="${offline.reply.slice(0, 160).replace(/\s+/g, ' ')}"`,
    });

    // Simulate OpenAI returning Spa brand → must override
    const spaLeakAi = await generateAiReply({
      bot: page.bot,
      userText: query,
      sources: [],
      ragChunks,
      channel,
      history: [],
      settings: { model: 'gpt-4o-mini', temperature: 0.2 },
      usageAllowed: true,
      openAiChat: async () =>
        'Dạ em là CSKH Sương Spa. Bên mình có gói massage và liệu trình thẩm mỹ ạ.',
    });
    results.push({
      name: 'override_spa_leak_from_llm',
      pass:
        spaLeakAi.blockedCode === 'kb_override_cross_brand' &&
        !SPA_LEAK.test(fold(spaLeakAi.reply)) &&
        DIGI_SIGNAL.test(spaLeakAi.reply),
      detail: `blocked=${spaLeakAi.blockedCode} reply="${spaLeakAi.reply.slice(0, 140).replace(/\s+/g, ' ')}"`,
    });

    // Live OpenAI if configured
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
    if (apiKey) {
      const live = await generateAiReply({
        bot: page.bot,
        userText: query,
        sources: [],
        ragChunks,
        channel,
        history: [],
        settings: { model: 'gpt-4o-mini', temperature: 0.2 },
        usageAllowed: true,
        openAiChat: async (input) => {
          const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: input.model,
              temperature: input.temperature,
              max_tokens: 400,
              messages: [
                { role: 'system', content: input.systemPrompt },
                ...input.history.slice(-8),
                { role: 'user', content: input.userText },
              ],
            }),
          });
          if (!res.ok) throw new Error(`OpenAI ${res.status}`);
          const data = (await res.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          return data.choices?.[0]?.message?.content?.trim() || '';
        },
        maxRetries: 1,
      });
      results.push({
        name: 'live_openai_digi_no_spa',
        pass:
          !live.noData &&
          live.reply !== NO_DATA_REPLY &&
          DIGI_SIGNAL.test(live.reply) &&
          !SPA_LEAK.test(fold(live.reply)),
        detail: `usedAi=${live.usedAi} blocked=${live.blockedCode || '-'} reply="${live.reply
          .slice(0, 180)
          .replace(/\s+/g, ' ')}"`,
      });
    } else {
      results.push({
        name: 'live_openai_digi_no_spa',
        pass: true,
        detail: 'SKIPPED (no OPENAI_API_KEY) — offline+override covered',
      });
    }

    // Bot knowledge sources must not inject spa when suppress
    const botSources = await prisma.chatbotKnowledgeSource.findMany({
      where: { botId: page.botId, status: { in: ['active', 'ready'] } },
    });
    const withBotSrc = await generateAiReply({
      bot: page.bot,
      userText: query,
      sources: botSources,
      ragChunks,
      channel,
      history: [],
      settings: { model: 'gpt-4o-mini', temperature: 0.2 },
      usageAllowed: true,
    });
    results.push({
      name: 'with_bot_sources_no_spa',
      pass: !SPA_LEAK.test(fold(withBotSrc.reply)) && !withBotSrc.noData,
      detail: `botSources=${botSources.length} reply="${withBotSrc.reply.slice(0, 120).replace(/\s+/g, ' ')}"`,
    });

    const failed = results.filter((r) => !r.pass).length;
    print(results, failed ? 1 : 0);
  } finally {
    await prisma.$disconnect();
  }
}

function print(results: Case[], code: number) {
  console.log('\n=== DIGI TENANT KB E2E ===');
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
