/**
 * Audit KB tenant isolation for Fanpage Thế Giới Digi vs Sương Spa.
 */
import { PrismaClient } from '@prisma/client';
import { RagKbService } from '../apps/api/dist/rag-kb/rag-kb.service';

async function main() {
  const prisma = new PrismaClient();
  const rag = new RagKbService(prisma as never);

  const pages = await prisma.chatbotFacebookPage.findMany({
    include: {
      bot: { select: { id: true, botName: true, businessName: true, organizationId: true } },
      organization: { select: { id: true, name: true } },
    },
  });

  console.log('\n=== FANPAGES ===');
  for (const p of pages) {
    console.log(
      JSON.stringify({
        pageName: p.pageName,
        pageId: p.pageId,
        pageOrg: p.organizationId,
        orgName: p.organization?.name,
        botId: p.botId,
        botOrg: p.bot?.organizationId,
        botName: p.bot?.botName,
        businessName: p.bot?.businessName,
        orgMismatch: p.organizationId !== p.bot?.organizationId,
      }),
    );
  }

  const kbs = await prisma.ragKnowledgeBase.findMany({
    include: {
      organization: { select: { id: true, name: true } },
      documents: { select: { id: true, title: true, organizationId: true, status: true } },
    },
  });

  console.log('\n=== KNOWLEDGE BASES ===');
  for (const kb of kbs) {
    const docOrgMismatch = kb.documents.filter((d) => d.organizationId !== kb.organizationId);
    console.log(
      JSON.stringify({
        kbId: kb.id,
        name: kb.name,
        orgId: kb.organizationId,
        orgName: kb.organization?.name,
        isDefault: kb.isDefault,
        docs: kb.documents.map((d) => ({
          title: d.title,
          docOrg: d.organizationId,
          status: d.status,
          mismatch: d.organizationId !== kb.organizationId,
        })),
        mismatchCount: docOrgMismatch.length,
      }),
    );
  }

  const digiPage =
    pages.find((p) => /thế\s*giới\s*digi|thegioidigi/i.test(p.pageName || '')) ||
    pages.find((p) => /digi/i.test(p.pageName || ''));

  if (!digiPage) {
    console.log('NO DIGI PAGE');
    await prisma.$disconnect();
    process.exit(1);
  }

  const q = 'bên mình có dịch vụ gì?';
  const hits = await rag.searchForChatContext(digiPage.organizationId, q, { limit: 8 });

  console.log('\n=== SEARCH FOR DIGI ORG ===');
  console.log(
    JSON.stringify({
      page: digiPage.pageName,
      orgId: digiPage.organizationId,
      orgName: digiPage.organization?.name,
      query: q,
      hits: hits.map((h) => ({
        title: h.title,
        kbId: h.knowledgeBaseId,
        kbName: h.knowledgeBaseName,
        score: h.score,
        snip: h.content.replace(/\s+/g, ' ').slice(0, 140),
      })),
    }),
  );

  // Detect Spa leakage in hit content
  const spaLeak = hits.filter((h) =>
    /sương\s*spa|suong\s*spa|spa\s*sương|thẩm mỹ viện|massage|nail|gội đầu/i.test(
      `${h.title} ${h.content} ${h.knowledgeBaseName}`,
    ),
  );
  console.log('\n=== SPA LEAK IN DIGI HITS ===', spaLeak.length);
  for (const h of spaLeak) {
    console.log(JSON.stringify({ title: h.title, kb: h.knowledgeBaseName, snip: h.content.slice(0, 100) }));
  }

  // Search ALL orgs for same query — see if Spa KB exists
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true }, take: 50 });
  console.log('\n=== SEARCH ALL ORGS ===');
  for (const org of orgs) {
    const oh = await rag.searchForChatContext(org.id, q, { limit: 3 });
    if (!oh.length) continue;
    const looksSpa = oh.some((h) =>
      /sương|spa|thẩm mỹ|massage/i.test(`${h.title} ${h.content} ${h.knowledgeBaseName}`),
    );
    const looksDigi = oh.some((h) =>
      /digi|seo|thiết kế website|thế giới/i.test(`${h.title} ${h.content} ${h.knowledgeBaseName}`),
    );
    console.log(
      JSON.stringify({
        org: org.name,
        orgId: org.id.slice(0, 8),
        hits: oh.length,
        looksSpa,
        looksDigi,
        top: oh[0]?.title,
        snip: oh[0]?.content.replace(/\s+/g, ' ').slice(0, 80),
      }),
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
