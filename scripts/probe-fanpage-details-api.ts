/**
 * Call page details as the org that has pages_read_engagement.
 * Never prints tokens.
 */
import { prisma } from '@marketingspa/database';
import { createHash, randomBytes } from 'crypto';

const API = (process.env.API_URL || 'http://127.0.0.1:4000').replace(/\/$/, '').replace(/\/api\/v1$/, '');

async function main() {
  const conn = await prisma.autoPostFacebookConnection.findFirst({
    where: { status: 'CONNECTED', scopes: { has: 'pages_read_engagement' } },
    orderBy: { updatedAt: 'desc' },
    include: {
      pages: { take: 1 },
      user: { select: { id: true, email: true, organizationId: true } },
    },
  });
  if (!conn?.pages[0] || !conn.user) {
    console.log(JSON.stringify({ error: 'no_conn' }));
    return;
  }

  // Create short-lived session via direct password login if reviewer, else skip
  const email = process.env.META_REVIEWER_EMAIL;
  const password = process.env.META_REVIEWER_PASSWORD;
  let token: string | null = null;
  if (email && password) {
    const login = await fetch(`${API}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = (await login.json()) as {
      accessToken?: string;
      token?: string;
      data?: { accessToken?: string };
      user?: { organizationId?: string; email?: string };
    };
    token = body.accessToken || body.token || body.data?.accessToken || null;
    console.log(
      JSON.stringify({
        loginStatus: login.status,
        reviewerOrg: body.user?.organizationId ?? null,
        targetOrg: conn.organizationId,
        sameOrg: body.user?.organizationId === conn.organizationId,
        pageRowId: conn.pages[0].id,
        pageId: conn.pages[0].pageId,
      }),
    );
  }

  if (!token) {
    console.log(JSON.stringify({ error: 'no_token_for_api_call' }));
    await prisma.$disconnect();
    return;
  }

  const details = await fetch(
    `${API}/api/v1/auto-post/facebook/pages/${conn.pages[0].id}/details?refresh=true`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
  );
  const json = await details.json();
  const safe = JSON.stringify(json)
    .replace(/\b(?:EAAG|EAAD|EAA|EBA)[A-Za-z0-9_-]{10,}\b/g, '[token]')
    .slice(0, 800);
  console.log(JSON.stringify({ detailsStatus: details.status, body: JSON.parse(safe) }, null, 2));

  const diag = await fetch(`${API}/api/v1/auto-post/facebook/permissions-diagnostics`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const diagJson = await diag.json();
  console.log(
    JSON.stringify(
      {
        diagStatus: diag.status,
        pagesReadEngagement: diagJson.pagesReadEngagement,
        granted: diagJson.granted,
        declined: diagJson.declined,
        missingRequired: diagJson.missingRequired,
        source: diagJson.source,
        loginConfigId: diagJson.loginConfigId,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(String(e).slice(0, 300));
  process.exit(1);
});
