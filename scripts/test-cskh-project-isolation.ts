/**
 * E2E: Project isolation — Digi bot không thấy Spa KB / inbox không trộn.
 * Run: node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-cskh-project-isolation.ts
 */
import { PrismaClient } from '@prisma/client';
import { RagKbService } from '../apps/api/dist/rag-kb/rag-kb.service';

type Case = { name: string; pass: boolean; detail: string };

const ORG = '4421a663-e724-4144-ba80-4d6b3f52c145';
const DIGI_PAGE = '103244355239559';
const SPA_LEAK = /suong\s*spa|sương\s*spa|\bspa\b|thẩm mỹ|tham my/i;

async function main() {
  const prisma = new PrismaClient();
  const rag = new RagKbService(prisma as never);
  const results: Case[] = [];

  try {
    const digiBot = await prisma.chatbotBot.findFirst({
      where: {
        organizationId: ORG,
        OR: [
          { botName: { contains: 'DIGI', mode: 'insensitive' } },
          { businessName: { contains: 'DIGI', mode: 'insensitive' } },
        ],
      },
    });
    const spaBot = await prisma.chatbotBot.findFirst({
      where: {
        organizationId: ORG,
        OR: [
          { botName: { contains: 'Spa', mode: 'insensitive' } },
          { businessName: { contains: 'Spa', mode: 'insensitive' } },
        ],
      },
    });
    const seoBot = await prisma.chatbotBot.findFirst({
      where: {
        organizationId: ORG,
        botName: { contains: 'SEO Coaching', mode: 'insensitive' },
      },
    });

    results.push({
      name: 'bots_split',
      pass: Boolean(digiBot && spaBot && digiBot.id !== spaBot.id),
      detail: `digi=${digiBot?.id?.slice(0, 8)} spa=${spaBot?.id?.slice(0, 8)} seo=${seoBot?.id?.slice(0, 8)}`,
    });

    const digiPage = await prisma.chatbotFacebookPage.findFirst({
      where: { pageId: DIGI_PAGE },
    });
    results.push({
      name: 'digi_page_bound_to_digi_bot',
      pass: Boolean(digiBot && digiPage?.botId === digiBot.id),
      detail: `pageBot=${digiPage?.botId?.slice(0, 8)} digiBot=${digiBot?.id?.slice(0, 8)}`,
    });

    const digiKb = await prisma.ragKnowledgeBase.findFirst({
      where: { organizationId: ORG, name: { contains: 'digi', mode: 'insensitive' } },
    });
    results.push({
      name: 'digi_kb_bound_to_digi_bot',
      pass: Boolean(digiBot && digiKb?.botId === digiBot.id),
      detail: `kbBot=${digiKb?.botId?.slice(0, 8)}`,
    });

    if (digiBot && spaBot) {
      const digiHits = await rag.searchForChatContext(ORG, 'bên mình có dịch vụ gì?', {
        botId: digiBot.id,
        limit: 5,
        minScore: 1,
        pageName: 'Thế Giới DIGI',
      });
      const spaHits = await rag.searchForChatContext(ORG, 'bên mình có dịch vụ gì?', {
        botId: spaBot.id,
        limit: 5,
        minScore: 1,
        pageName: 'Sương Spa',
      });

      const digiBlob = digiHits.map((h) => h.content).join('\n');
      results.push({
        name: 'digi_kb_search_has_digi_services',
        pass: digiHits.length > 0 && /seo|website|marketing/i.test(digiBlob) && !SPA_LEAK.test(digiBlob),
        detail: `hits=${digiHits.length} top=${digiHits[0]?.knowledgeBaseName || '-'}`,
      });
      results.push({
        name: 'spa_bot_cannot_read_digi_kb',
        pass: spaHits.every((h) => h.knowledgeBaseId !== digiKb?.id),
        detail: `spaHits=${spaHits.length} digiKbInSpa=${spaHits.some((h) => h.knowledgeBaseId === digiKb?.id)}`,
      });

      const digiInbox = await prisma.chatbotConversation.count({
        where: { organizationId: ORG, botId: digiBot.id },
      });
      const spaInbox = await prisma.chatbotConversation.count({
        where: { organizationId: ORG, botId: spaBot.id },
      });
      const digiFbWrong = await prisma.chatbotConversation.count({
        where: {
          organizationId: ORG,
          botId: digiBot.id,
          channel: 'facebook',
          channelRef: { not: DIGI_PAGE },
        },
      });
      results.push({
        name: 'inbox_scoped_counts',
        pass: digiInbox >= 0 && spaInbox >= 0 && digiFbWrong === 0,
        detail: `digiConv=${digiInbox} spaConv=${spaInbox} digiFbWrongPage=${digiFbWrong}`,
      });

      // Widget domain scope
      const widget = await prisma.chatbotConversation.create({
        data: {
          organizationId: ORG,
          botId: digiBot.id,
          sessionId: `e2e-web-${Date.now()}`,
          channel: 'website',
          channelRef: 'thegioidigi.example',
          status: 'OPEN',
        },
      });
      const webOnly = await prisma.chatbotConversation.count({
        where: {
          organizationId: ORG,
          botId: digiBot.id,
          channel: 'website',
          channelRef: 'thegioidigi.example',
        },
      });
      results.push({
        name: 'website_channel_ref_scoped',
        pass: webOnly >= 1,
        detail: `webOnly=${webOnly}`,
      });
      await prisma.chatbotConversation.delete({ where: { id: widget.id } });
    }

    const failed = results.filter((r) => !r.pass).length;
    print(results, failed ? 1 : 0);
  } finally {
    await prisma.$disconnect();
  }
}

function print(results: Case[], code: number) {
  console.log('\n=== CSKH PROJECT ISOLATION E2E ===');
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
