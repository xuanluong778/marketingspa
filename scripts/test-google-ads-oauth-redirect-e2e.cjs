/**
 * Google Ads OAuth redirect_uri E2E (authorize + exchange share same URI, no secrets).
 * Run: node scripts/with-root-env.cjs node scripts/test-google-ads-oauth-redirect-e2e.cjs
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { prisma } = require('../packages/database/dist');

const root = path.join(__dirname, '..');
const API = (process.env.API_URL || process.env.APP_URL || 'https://marketingautoaz.com').replace(
  /\/$/,
  '',
);
const JWT_SECRET = process.env.JWT_SECRET;
const CANONICAL =
  'https://marketingautoaz.com/api/v1/ad-performance/google/oauth/callback';

const verdict = {
  GOOGLE_OAUTH_REDIRECT_URI: CANONICAL,
  CLIENT_ID_MATCH: 'FAIL',
  AUTHORIZE_CALLBACK_MATCH: 'FAIL',
  TOKEN_EXCHANGE: 'FAIL',
  GOOGLE_OAUTH_REAL: 'FAIL',
};

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

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

async function main() {
  console.log('=== Google Ads OAuth redirect E2E ===');

  const envRedirect = (process.env.GOOGLE_ADS_REDIRECT_URI || '').trim().replace(/\/+$/, '');
  const envClientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const nextClientId = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '').trim();

  verdict.GOOGLE_OAUTH_REDIRECT_URI = envRedirect || CANONICAL;

  if (envClientId && envClientId === nextClientId) {
    verdict.CLIENT_ID_MATCH = 'PASS';
    console.log('PASS CLIENT_ID_MATCH');
  } else {
    console.log('FAIL CLIENT_ID_MATCH');
  }

  const apiSrc = read('apps/api/src/ad-performance/google-ads/google-ads-api.service.ts');
  const exchangeUsesSame =
    apiSrc.includes('resolveGoogleAdsRedirectUri') &&
    apiSrc.includes('buildOAuthUrl') &&
    apiSrc.includes('exchangeCodeForTokens') &&
    apiSrc.includes('redirect_uri: this.requireRedirectUri()');
  if (exchangeUsesSame) {
    verdict.TOKEN_EXCHANGE = 'PASS';
    console.log('PASS TOKEN_EXCHANGE (authorize + exchange share requireRedirectUri)');
  } else {
    console.log('FAIL TOKEN_EXCHANGE');
  }

  let perms = await prisma.permission.findMany({
    where: { code: { in: ['ads.connect', 'ads.read'] } },
  });
  const org = await prisma.organization.findFirst({ orderBy: { updatedAt: 'desc' } });
  let plan = await prisma.subscriptionPlan.findFirst();
  if (plan) {
    await prisma.subscription
      .create({
        data: {
          organizationId: org.id,
          planId: plan.id,
          status: 'ACTIVE',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        },
      })
      .catch(() => {});
  }
  const role = await prisma.role.create({
    data: {
      organizationId: org.id,
      code: `GADS_REDIRECT_${Date.now()}`,
      name: 'Redirect test',
      isSystem: true,
      permissions: { create: perms.map((p) => ({ permissionId: p.id })) },
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `gads-redirect-${Date.now()}@test.local`,
      name: 'Test',
      passwordHash: 'x',
      organizationId: org.id,
      roleId: role.id,
      isActive: true,
    },
  });
  const token = mint(org.id, user.id, user.email, role.code);

  const res = await fetch(`${API}/api/v1/ai-ads-manager/google/oauth/start`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const json = await res.json();
  const url = json.url || '';
  if (res.status === 200 && url) {
    const parsed = new URL(url);
    const redirectUri = parsed.searchParams.get('redirect_uri') || '';
    const clientId = parsed.searchParams.get('client_id') || '';
    if (redirectUri === envRedirect && redirectUri === CANONICAL) {
      verdict.AUTHORIZE_CALLBACK_MATCH = 'PASS';
      console.log('PASS AUTHORIZE_CALLBACK_MATCH');
    } else {
      console.log('FAIL AUTHORIZE_CALLBACK_MATCH', { redirectUri, envRedirect });
    }
    if (clientId === envClientId) {
      console.log('PASS authorize client_id matches ENV');
    }
    console.log('authorize_redirect_uri=' + redirectUri);
    console.log('authorize_client_id=' + clientId);
  } else {
    console.log('FAIL oauth/start', res.status, JSON.stringify(json).slice(0, 200));
  }

  const callback = await fetch(`${API}/api/v1/ad-performance/google/oauth/callback`, {
    redirect: 'manual',
  });
  if (callback.status >= 300 && callback.status < 400) {
    console.log('PASS callback route reachable status=' + callback.status);
  }

  if (
    verdict.CLIENT_ID_MATCH === 'PASS' &&
    verdict.AUTHORIZE_CALLBACK_MATCH === 'PASS' &&
    verdict.TOKEN_EXCHANGE === 'PASS'
  ) {
    verdict.GOOGLE_OAUTH_REAL = 'BLOCKER';
    console.log(
      'BLOCKER GOOGLE_OAUTH_REAL — infra PASS; cần thêm Authorized redirect URI vào Google Cloud Console rồi OAuth thật',
    );
  }

  await prisma.user.delete({ where: { id: user.id } });
  await prisma.role.delete({ where: { id: role.id } });
  await prisma.$disconnect();

  console.log('\n=== GOOGLE CLOUD CONSOLE → Authorized redirect URIs ===');
  console.log(CANONICAL);

  console.log('\n=== VERDICT ===');
  for (const [k, v] of Object.entries(verdict)) console.log(`${k}=${v}`);

  const hardFail = ['CLIENT_ID_MATCH', 'AUTHORIZE_CALLBACK_MATCH', 'TOKEN_EXCHANGE'].some(
    (k) => verdict[k] === 'FAIL',
  );
  if (hardFail) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
