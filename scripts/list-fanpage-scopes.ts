import { prisma } from '@marketingspa/database';

async function main() {
  const conns = await prisma.autoPostFacebookConnection.findMany({
    where: { status: 'CONNECTED' },
    orderBy: { updatedAt: 'desc' },
    take: 25,
    select: {
      id: true,
      organizationId: true,
      facebookUserId: true,
      facebookUserName: true,
      scopes: true,
      updatedAt: true,
      lastError: true,
      pages: { select: { id: true, pageId: true, pageName: true } },
    },
  });
  for (const c of conns) {
    console.log(
      JSON.stringify({
        org: c.organizationId,
        name: c.facebookUserName,
        updatedAt: c.updatedAt,
        lastError: c.lastError,
        scopeCount: c.scopes.length,
        hasEngagement: c.scopes.includes('pages_read_engagement'),
        scopes: c.scopes,
        pages: c.pages.map((p) => ({ id: p.id, pageId: p.pageId, name: p.pageName })),
      }),
    );
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(String(e).slice(0, 400));
  process.exit(1);
});
