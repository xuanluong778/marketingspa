/**
 * Safe data migration: tách Project Digi / SEO khỏi bot Spa dùng chung.
 * Không xoá conversation/message — chỉ reassign botId + gắn KB.
 *
 * Run:
 *   node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/migrate-cskh-project-isolation.ts
 */
import { PrismaClient, ChatbotBotStatus } from '@prisma/client';

const ORG = '4421a663-e724-4144-ba80-4d6b3f52c145';
const SPA_BOT = '4a3c19a7-b568-432e-904c-b22da2019d3d';
const DIGI_PAGE = '103244355239559';
const SEO_PAGE = '541382312381287';

async function main() {
  const prisma = new PrismaClient();
  const log: string[] = [];
  try {
    const spa = await prisma.chatbotBot.findUnique({ where: { id: SPA_BOT } });
    if (!spa || spa.organizationId !== ORG) {
      throw new Error('Spa bot not found in expected org');
    }

    // --- Digi project/bot ---
    let digi = await prisma.chatbotBot.findFirst({
      where: {
        organizationId: ORG,
        OR: [
          { botName: { contains: 'DIGI', mode: 'insensitive' } },
          { businessName: { contains: 'DIGI', mode: 'insensitive' } },
        ],
      },
    });
    if (!digi) {
      digi = await prisma.chatbotBot.create({
        data: {
          organizationId: ORG,
          botName: 'Thế Giới DIGI',
          businessName: 'Thế Giới DIGI',
          industry: 'digital marketing / SEO / website',
          hotline: spa.hotline,
          consultationTone: 'friendly',
          greeting:
            'Xin chào! Em là trợ lý Thế Giới DIGI — hỗ trợ SEO, website, đào tạo và quảng cáo. Anh/chị cần tư vấn gì ạ?',
          websiteUrl: null,
          allowedDomains: null,
          status: ChatbotBotStatus.ACTIVE,
        },
      });
      log.push(`created_digi_bot=${digi.id}`);
    } else {
      log.push(`reuse_digi_bot=${digi.id}`);
    }

    // --- SEO Coaching project/bot ---
    let seo = await prisma.chatbotBot.findFirst({
      where: {
        organizationId: ORG,
        id: { not: digi.id },
        OR: [
          { botName: { contains: 'SEO Coaching', mode: 'insensitive' } },
          { businessName: { contains: 'SEO Coaching', mode: 'insensitive' } },
        ],
      },
    });
    if (!seo) {
      seo = await prisma.chatbotBot.create({
        data: {
          organizationId: ORG,
          botName: 'SEO Coaching',
          businessName: 'SEO Coaching',
          industry: 'SEO / coaching',
          consultationTone: 'friendly',
          greeting:
            'Xin chào! Em là trợ lý SEO Coaching. Anh/chị muốn tư vấn lộ trình SEO 1:1 không ạ?',
          status: ChatbotBotStatus.ACTIVE,
        },
      });
      log.push(`created_seo_bot=${seo.id}`);
    } else {
      log.push(`reuse_seo_bot=${seo.id}`);
    }

    // Reassign Fanpages (keep Spa on remaining pages)
    const digiPage = await prisma.chatbotFacebookPage.updateMany({
      where: { organizationId: ORG, pageId: DIGI_PAGE },
      data: { botId: digi.id },
    });
    log.push(`digi_page_reassigned=${digiPage.count}`);

    const seoPage = await prisma.chatbotFacebookPage.updateMany({
      where: { organizationId: ORG, pageId: SEO_PAGE },
      data: { botId: seo.id },
    });
    log.push(`seo_page_reassigned=${seoPage.count}`);

    // Move Facebook conversations for those pages → new bots (preserve messages)
    // Unique (botId, sessionId): sessionId already contains pageId so safe across bots
    const digiConvs = await prisma.chatbotConversation.findMany({
      where: { organizationId: ORG, channel: 'facebook', channelRef: DIGI_PAGE },
      select: { id: true, botId: true, sessionId: true },
    });
    for (const c of digiConvs) {
      if (c.botId === digi.id) continue;
      // Avoid unique conflict if somehow already exists
      const clash = await prisma.chatbotConversation.findUnique({
        where: { botId_sessionId: { botId: digi.id, sessionId: c.sessionId } },
      });
      if (clash) {
        log.push(`digi_conv_skip_clash=${c.id}`);
        continue;
      }
      await prisma.chatbotConversation.update({
        where: { id: c.id },
        data: { botId: digi.id },
      });
    }
    log.push(`digi_convs_moved=${digiConvs.filter((c) => c.botId !== digi.id).length}`);

    const seoConvs = await prisma.chatbotConversation.findMany({
      where: { organizationId: ORG, channel: 'facebook', channelRef: SEO_PAGE },
      select: { id: true, botId: true, sessionId: true },
    });
    for (const c of seoConvs) {
      if (c.botId === seo.id) continue;
      const clash = await prisma.chatbotConversation.findUnique({
        where: { botId_sessionId: { botId: seo.id, sessionId: c.sessionId } },
      });
      if (clash) {
        log.push(`seo_conv_skip_clash=${c.id}`);
        continue;
      }
      await prisma.chatbotConversation.update({
        where: { id: c.id },
        data: { botId: seo.id },
      });
    }
    log.push(`seo_convs_moved=${seoConvs.filter((c) => c.botId !== seo.id).length}`);

    // Bind Digi KB to Digi bot only
    const digiKb = await prisma.ragKnowledgeBase.updateMany({
      where: {
        organizationId: ORG,
        OR: [
          { name: { contains: 'digi', mode: 'insensitive' } },
          { name: { contains: 'Thế giới', mode: 'insensitive' } },
        ],
      },
      data: { botId: digi.id },
    });
    log.push(`digi_kb_bound=${digiKb.count}`);

    // Any remaining unbound KBs in org → stay null (won't be used by CSKH until assigned)
    const unbound = await prisma.ragKnowledgeBase.count({
      where: { organizationId: ORG, botId: null },
    });
    log.push(`unbound_kbs=${unbound}`);

    const summary = {
      spaBot: SPA_BOT,
      digiBot: digi.id,
      seoBot: seo.id,
      pages: await prisma.chatbotFacebookPage.findMany({
        where: { organizationId: ORG },
        select: { pageName: true, pageId: true, botId: true },
      }),
      kbs: await prisma.ragKnowledgeBase.findMany({
        where: { organizationId: ORG },
        select: { name: true, botId: true },
      }),
      convByBot: await prisma.chatbotConversation.groupBy({
        by: ['botId', 'channel'],
        where: { organizationId: ORG },
        _count: true,
      }),
      log,
    };
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
