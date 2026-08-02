/**
 * Probe live /me/permissions vs DB scopes — never print tokens.
 */
import { prisma } from '@marketingspa/database';
import { decryptSecret } from '../apps/api/src/common/utils/encryption.util';

async function main() {
  const key = process.env.ENCRYPTION_KEY || '';
  const conn = await prisma.autoPostFacebookConnection.findFirst({
    where: { status: 'CONNECTED', scopes: { has: 'pages_read_engagement' } },
    orderBy: { updatedAt: 'desc' },
    include: { pages: { take: 1 } },
  });
  if (!conn) {
    console.log(JSON.stringify({ error: 'no_connected_with_engagement' }));
    return;
  }

  const version = process.env.META_API_VERSION || 'v21.0';
  const userToken = decryptSecret(conn.encryptedAccessToken, key);
  const permRes = await fetch(
    `https://graph.facebook.com/${version}/me/permissions`,
    { headers: { Authorization: `Bearer ${userToken}`, Accept: 'application/json' } },
  );
  const permBody = (await permRes.json()) as {
    data?: Array<{ permission?: string; status?: string }>;
    error?: { message?: string; code?: number };
  };

  const rows = permBody.data ?? [];
  const granted = rows.filter((r) => r.status === 'granted').map((r) => r.permission);
  const declined = rows.filter((r) => r.status === 'declined').map((r) => r.permission);

  let pageMetaStatus: number | null = null;
  let pageMetaError: string | null = null;
  let pageMetaName: string | null = null;
  if (conn.pages[0]) {
    const page = await prisma.autoPostFacebookPage.findUnique({ where: { id: conn.pages[0].id } });
    if (page) {
      const pageToken = decryptSecret(page.encryptedPageAccessToken, key);
      const metaRes = await fetch(
        `https://graph.facebook.com/${version}/${page.pageId}?fields=id,name,fan_count`,
        { headers: { Authorization: `Bearer ${pageToken}`, Accept: 'application/json' } },
      );
      pageMetaStatus = metaRes.status;
      const metaBody = (await metaRes.json()) as {
        id?: string;
        name?: string;
        error?: { message?: string; code?: number };
      };
      if (metaBody.error) {
        pageMetaError = `${metaBody.error.code}:${metaBody.error.message}`.slice(0, 200);
      } else {
        pageMetaName = metaBody.name ?? null;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        org: conn.organizationId,
        dbScopes: conn.scopes,
        dbHasEngagement: conn.scopes.includes('pages_read_engagement'),
        mePermissionsHttp: permRes.status,
        meError: permBody.error?.message?.slice(0, 160) ?? null,
        liveGranted: granted,
        liveDeclined: declined,
        liveHasEngagement: granted.includes('pages_read_engagement'),
        wouldOverwriteRemoveEngagement:
          granted.length > 0 && !granted.includes('pages_read_engagement'),
        pageMetaStatus,
        pageMetaName,
        pageMetaError,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(String(e).replace(/EAA[A-Za-z0-9]+/g, '[token]'));
  process.exit(1);
});
