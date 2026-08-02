/**
 * Mint JWT for DIGI org user and call page-details API.
 * Never prints tokens / JWT.
 */
import { createHmac } from 'crypto';
import { prisma } from '@marketingspa/database';

const API = (process.env.API_URL || 'http://127.0.0.1:4000')
  .replace(/\/$/, '')
  .replace(/\/api\/v1$/, '');
const ORG = '2b8fa4ec-976e-4ba3-910f-94bf30d2dbce';
const PAGE_ROW = '1c1116b2-0f5c-41b6-97ab-bf2e3ac354b6';

function b64url(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64url');
}

function signJwt(payload: Record<string, unknown>, secret: string, expiresInSec: number) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expiresInSec };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(body));
  const data = `${h}.${p}`;
  const sig = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

async function main() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.log(JSON.stringify({ error: 'no_JWT_SECRET' }));
    return;
  }

  const user = await prisma.user.findFirst({
    where: { organizationId: ORG, isActive: true, deletedAt: null },
    include: { role: { select: { code: true } } },
    orderBy: { createdAt: 'asc' },
  });
  if (!user) {
    console.log(JSON.stringify({ error: 'no_user' }));
    return;
  }

  const accessToken = signJwt(
    {
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role.code,
    },
    secret,
    900,
  );

  const me = await fetch(`${API}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const meJson = (await me.json().catch(() => ({}))) as {
    email?: string;
    organizationId?: string;
    user?: { email?: string; organizationId?: string };
  };
  console.log(
    JSON.stringify({
      meStatus: me.status,
      email: meJson.email ?? meJson.user?.email ?? null,
      org: meJson.organizationId ?? meJson.user?.organizationId ?? null,
      expectedOrg: ORG,
    }),
  );

  if (me.status !== 200) {
    await prisma.$disconnect();
    return;
  }

  const details = await fetch(
    `${API}/api/v1/auto-post/facebook/pages/${PAGE_ROW}/details?refresh=true`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } },
  );
  const body = (await details.json()) as Record<string, unknown>;
  console.log(
    JSON.stringify({
      detailsStatus: details.status,
      code: body.code ?? null,
      message: typeof body.message === 'string' ? body.message.slice(0, 240) : null,
      pageName: (body.page as { name?: string } | undefined)?.name ?? null,
      pagesReadEngagement:
        (body.permissions as { pages_read_engagement?: boolean } | undefined)
          ?.pages_read_engagement ?? null,
      recentPosts: Array.isArray(body.recentPosts) ? body.recentPosts.length : null,
      warnings: body.warnings ?? null,
    }),
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(String(e).slice(0, 400));
  process.exit(1);
});
