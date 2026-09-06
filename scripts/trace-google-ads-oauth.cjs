/**
 * Trace Google Ads OAuth authorize URL from production API (no secrets logged).
 * Run: node scripts/with-root-env.cjs node scripts/trace-google-ads-oauth.cjs
 */
const crypto = require('crypto');
const { prisma } = require('../packages/database/dist');

const API = (process.env.API_URL || process.env.APP_URL || 'https://marketingautoaz.com').replace(
  /\/$/,
  '',
);
const JWT_SECRET = process.env.JWT_SECRET;

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function mint(orgId, userId, email, role) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      sub: userId,
      email,
      organizationId: orgId,
      role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 1800,
    }),
  );
  const sig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${payload}.${sig}`;
}

async function ensureTraceUser() {
  let perms = await prisma.permission.findMany({
    where: { code: { in: ['ads.connect', 'ads.read', 'ads.sync', 'ads.manage'] } },
  });
  if (!perms.length) {
    perms = await prisma.permission.findMany({ where: { code: { contains: 'ads.' } }, take: 4 });
  }
  const org = await prisma.organization.findFirst({ orderBy: { updatedAt: 'desc' } });
  if (!org) throw new Error('No organization');
  let plan = await prisma.subscriptionPlan.findFirst({ where: { code: 'msp-trial-3d' } });
  if (!plan) plan = await prisma.subscriptionPlan.findFirst();
  if (plan) {
    await prisma.subscription.create({
      data: {
        organizationId: org.id,
        planId: plan.id,
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
      },
    }).catch(() => {});
  }
  const role = await prisma.role.create({
    data: {
      organizationId: org.id,
      code: `TRACE_GADS_${Date.now()}`,
      name: 'Trace Google Ads',
      isSystem: true,
      permissions: { create: perms.map((p) => ({ permissionId: p.id })) },
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `trace-gads-${Date.now()}@test.local`,
      name: 'Trace',
      passwordHash: 'x',
      organizationId: org.id,
      roleId: role.id,
      isActive: true,
    },
  });
  return { org, user, role, token: mint(org.id, user.id, user.email, role.code) };
}

async function main() {
  const envRedirect = (process.env.GOOGLE_ADS_REDIRECT_URI || '').trim();
  const envClientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const nextPublicClientId = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '').trim();

  console.log('=== Google Ads OAuth trace ===');
  console.log('ENV_GOOGLE_ADS_REDIRECT_URI=' + envRedirect);
  console.log('ENV_GOOGLE_CLIENT_ID=' + envClientId);
  console.log('ENV_NEXT_PUBLIC_GOOGLE_CLIENT_ID=' + nextPublicClientId);
  console.log('CLIENT_ID_MATCH=' + (envClientId === nextPublicClientId && envClientId ? 'PASS' : 'FAIL'));

  const { user, role, token } = await ensureTraceUser();

  for (const path of [
    '/ai-ads-manager/google/oauth/start',
    '/ad-performance/google/oauth/start',
  ]) {
    const res = await fetch(`${API}/api/v1${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const json = await res.json().catch(() => ({}));
    const url = json.url || json.data?.url || '';
    console.log(`\n--- ${path} status=${res.status} ---`);
    if (!url) {
      console.log('NO_URL', JSON.stringify(json).slice(0, 200));
      continue;
    }
    const parsed = new URL(url);
    const clientId = parsed.searchParams.get('client_id') || '';
    const redirectUri = parsed.searchParams.get('redirect_uri') || '';
    const scope = parsed.searchParams.get('scope') || '';
    const doubleEncoded =
      redirectUri.includes('%253A') || redirectUri.includes('%252F');

    console.log('authorize_host=' + parsed.host);
    console.log('client_id=' + clientId);
    console.log('redirect_uri=' + redirectUri);
    console.log('scope=' + scope);
    console.log('redirect_uri_double_encoded=' + (doubleEncoded ? 'YES' : 'NO'));
    console.log(
      'AUTHORIZE_CALLBACK_MATCH=' +
        (redirectUri === envRedirect ? 'PASS' : 'FAIL'),
    );
    console.log('CLIENT_ID_ENV_MATCH=' + (clientId === envClientId ? 'PASS' : 'FAIL'));

    const rawQuery = parsed.search.slice(1);
    const redirectSegment = rawQuery.match(/redirect_uri=([^&]*)/)?.[1] || '';
    const decodedOnce = redirectSegment ? decodeURIComponent(redirectSegment) : '';
    console.log('redirect_uri_raw_param=' + redirectSegment.slice(0, 120));
    console.log('redirect_uri_decode_once=' + decodedOnce);
    console.log(
      'decode_once_matches_env=' + (decodedOnce === envRedirect ? 'PASS' : 'FAIL'),
    );
  }

  console.log('\n=== ADD TO GOOGLE CLOUD CONSOLE (Authorized redirect URIs) ===');
  console.log(envRedirect);
  console.log('\n=== DO NOT ADD (different paths) ===');
  console.log('https://marketingautoaz.com/api/v1/ai-ads-manager/google/oauth/callback');

  await prisma.user.delete({ where: { id: user.id } });
  await prisma.role.delete({ where: { id: role.id } });
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
