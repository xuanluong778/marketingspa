import { prisma } from '@marketingspa/database';

async function main() {
  const conns = await prisma.autoPostFacebookConnection.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 8,
    select: {
      id: true,
      organizationId: true,
      status: true,
      scopes: true,
      facebookUserName: true,
      tokenExpiresAt: true,
      updatedAt: true,
      lastError: true,
      pages: {
        select: { id: true, pageId: true, pageName: true, updatedAt: true },
      },
    },
  });
  for (const c of conns) {
    console.log(
      JSON.stringify({
        org: c.organizationId,
        status: c.status,
        scopes: c.scopes,
        hasReadEngagement: c.scopes.includes('pages_read_engagement'),
        fbUser: c.facebookUserName,
        tokenExpiresAt: c.tokenExpiresAt,
        updatedAt: c.updatedAt,
        lastError: c.lastError,
        pages: c.pages.map((p) => ({
          rowId: p.id,
          pageId: p.pageId,
          name: p.pageName,
          updatedAt: p.updatedAt,
        })),
      }),
    );
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
