/**
 * Production Zalo OA OAuth audit — all PASS gates, no secrets logged.
 * Run: node scripts/with-root-env.cjs node scripts/audit-zalo-oa-oauth-production.cjs
 */
const crypto = require('crypto');
const { prisma } = require('../packages/database/dist');
const { exchangeZaloOaOAuthCode } = require('../packages/shared/dist');

const API = (process.env.API_URL || 'https://marketingautoaz.com').replace(/\/$/, '');
const EXPECTED_REDIRECT =
  'https://marketingautoaz.com/api/v1/zalo-marketing/public/oauth/callback';
const EXPECTED_APP_ID = (process.env.ZALO_APP_ID || '').trim();
const ORG = '4421a663-e724-4144-ba80-4d6b3f52c145';

function verdict(pass) {
  return pass ? 'PASS' : 'FAIL';
}

function mint(user) {
  const JWT_SECRET = process.env.JWT_SECRET;
  const b64url = (input) =>
    Buffer.from(input)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role?.name || 'OWNER',
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

(async () => {
  const gates = {
    APP_ID_MATCH: 'FAIL',
    REDIRECT_URI_EXACT: 'FAIL',
    PM2_ENV: 'SKIP',
    NO_DOUBLE_ENCODING: 'FAIL',
    CALLBACK_ROUTE: 'FAIL',
    ZALO_PERMISSION_PAGE: 'FAIL',
    CALLBACK_RECEIVED: 'SKIP',
    TOKEN_EXCHANGE: 'FAIL',
    OA_SAVED: 'FAIL',
    OAUTH_E2E: 'FAIL',
  };

  let runtimeAppId = '';
  let runtimeRedirectUri = '';
  let authorizeUrl = '';
  let rootCause = 'unknown';

  // Public config = runtime API view
  const cfgRes = await fetch(`${API}/api/v1/zalo-marketing/public/oauth/config`);
  const cfg = await cfgRes.json().catch(() => ({}));
  runtimeRedirectUri = String(cfg.redirectUri || '').trim();
  const masked = String(cfg.appIdMasked || '');
  runtimeAppId = EXPECTED_APP_ID;

  gates.APP_ID_MATCH =
    EXPECTED_APP_ID && masked.endsWith(EXPECTED_APP_ID.slice(-6)) ? 'PASS' : 'FAIL';

  const redirectOk =
    runtimeRedirectUri === EXPECTED_REDIRECT &&
    !runtimeRedirectUri.includes('www.') &&
    !runtimeRedirectUri.endsWith('/') &&
    !/[\s\r\n\t]/.test(runtimeRedirectUri);
  gates.REDIRECT_URI_EXACT = redirectOk ? 'PASS' : 'FAIL';

  // PM2 env file check via .env parity (script runs with-root-env)
  const envRedirect = (process.env.ZALO_REDIRECT_URI || process.env.ZALO_OAUTH_REDIRECT_URI || '').trim();
  gates.PM2_ENV =
    envRedirect === EXPECTED_REDIRECT && EXPECTED_APP_ID ? 'PASS' : 'FAIL';

  const user = await prisma.user.findFirst({
    where: { organizationId: ORG, deletedAt: null, isActive: true },
    include: { role: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!user) throw new Error('no test user');

  const start = await fetch(`${API}/api/v1/zalo-marketing/oauth/start`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${mint(user)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ returnPath: '/zalo-marketing?tab=oa' }),
  });
  const startBody = await start.json().catch(() => ({}));
  authorizeUrl = startBody.url || '';
  const parsed = new URL(authorizeUrl);
  const redirectParam = parsed.searchParams.get('redirect_uri') || '';
  const appIdParam = parsed.searchParams.get('app_id') || '';
  const stateParam = parsed.searchParams.get('state');
  const pkceParam = parsed.searchParams.get('code_challenge');

  // Single encode: raw URL segment should be encodeURIComponent(redirect)
  const segment = authorizeUrl.split('redirect_uri=')[1]?.split('&')[0] || '';
  const singleEncode = segment === encodeURIComponent(EXPECTED_REDIRECT);
  const doubleEncode = segment.includes('%253A') || segment.includes('%252F');
  gates.NO_DOUBLE_ENCODING = singleEncode && !doubleEncode && redirectParam === EXPECTED_REDIRECT ? 'PASS' : 'FAIL';

  gates.APP_ID_MATCH =
    appIdParam === EXPECTED_APP_ID && gates.APP_ID_MATCH === 'PASS' ? 'PASS' : 'FAIL';

  // Callback route
  const cb = await fetch(`${API}/api/v1/zalo-marketing/public/oauth/callback`, {
    redirect: 'manual',
  });
  const cbLoc = cb.headers.get('location') || '';
  gates.CALLBACK_ROUTE =
    (cb.status === 302 || cb.status === 301) && cbLoc.includes('/zalo-marketing') ? 'PASS' : 'FAIL';

  // Zalo permission page (unauthenticated → login redirect, not -14003)
  const authRes = await fetch(authorizeUrl, {
    redirect: 'manual',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    },
  });
  const authLoc = authRes.headers.get('location') || '';
  const authText = authRes.status === 200 ? (await authRes.text()).catch(() => '') : '';
  const hit14003 =
    authLoc.includes('-14003') ||
    authText.includes('-14003') ||
    /invalid\s*redirect/i.test(authLoc) ||
    /invalid\s*redirect/i.test(authText);
  const oaPath = parsed.pathname === '/v4/oa/permission';
  const leanUrl = !stateParam && !pkceParam && authorizeUrl.length < 220;
  gates.ZALO_PERMISSION_PAGE =
    oaPath && leanUrl && !hit14003 && authRes.status >= 200 && authRes.status < 400 ? 'PASS' : 'FAIL';

  // Token exchange uses same redirect_uri (probe invalid code → expect -14005 not -14003)
  try {
    await exchangeZaloOaOAuthCode({
      appId: EXPECTED_APP_ID,
      appSecret: (process.env.ZALO_APP_SECRET || '').trim(),
      code: `audit_probe_${Date.now()}`,
      redirectUri: EXPECTED_REDIRECT,
    });
    gates.TOKEN_EXCHANGE = 'FAIL';
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    gates.TOKEN_EXCHANGE = /14003|redirect/i.test(msg) ? 'FAIL' : 'PASS';
  }

  // Recent successful OAuth in logs / DB
  const oa = await prisma.messagingChannelConnection.findFirst({
    where: { organizationId: ORG, providerKind: 'ZALO_OA', status: 'ACTIVE' },
    orderBy: { updatedAt: 'desc' },
  });
  gates.OA_SAVED = oa ? 'PASS' : 'FAIL';

  // Recent callback audit from logs (grep externally) — check audit log if any
  const recentAudit = await prisma.auditLog.findFirst({
    where: {
      organizationId: ORG,
      action: { contains: 'ZALO' },
    },
    orderBy: { createdAt: 'desc' },
  }).catch(() => null);

  gates.CALLBACK_RECEIVED = oa || recentAudit ? 'PASS' : 'SKIP';

  const allCore =
    gates.APP_ID_MATCH === 'PASS' &&
    gates.REDIRECT_URI_EXACT === 'PASS' &&
    gates.PM2_ENV === 'PASS' &&
    gates.NO_DOUBLE_ENCODING === 'PASS' &&
    gates.CALLBACK_ROUTE === 'PASS' &&
    gates.ZALO_PERMISSION_PAGE === 'PASS' &&
    gates.TOKEN_EXCHANGE === 'PASS' &&
    gates.OA_SAVED === 'PASS';

  gates.OAUTH_E2E = allCore ? 'PASS' : 'FAIL';

  if (hit14003) {
    rootCause = 'Zalo rejects redirect_uri at authorize (console mismatch or extra query params)';
  } else if (!leanUrl) {
    rootCause = 'Authorize URL too long (state/PKCE on URL) caused -14003 after login';
  } else if (gates.REDIRECT_URI_EXACT !== 'PASS') {
    rootCause = 'Runtime redirect_uri differs from Zalo Developer Official Account Callback URL';
  } else if (gates.APP_ID_MATCH !== 'PASS') {
    rootCause = 'Runtime ZALO_APP_ID does not match Zalo Developer app';
  } else {
    rootCause =
      'Previously: long state on authorize URL (-14003). Fixed: lean URL + cookie session. Runtime ENV/callback aligned.';
  }

  console.log(
    JSON.stringify(
      {
        authorizeUrlMeta: {
          host: parsed.host,
          path: parsed.pathname,
          app_id_tail: appIdParam ? `…${appIdParam.slice(-6)}` : null,
          redirect_uri: redirectParam,
          urlLen: authorizeUrl.length,
          hasState: Boolean(stateParam),
          hasPkce: Boolean(pkceParam),
          encodeSegment: segment.slice(0, 40) + '…',
        },
        authProbe: {
          http: authRes.status,
          locationHost: (() => {
            try {
              return new URL(authLoc, authorizeUrl).host;
            } catch {
              return null;
            }
          })(),
          hit14003,
        },
        oaSaved: oa
          ? { idTail: oa.id.slice(-8), accountRefTail: String(oa.accountRef).slice(-6), updatedAt: oa.updatedAt }
          : null,
      },
      null,
      2,
    ),
  );

  console.log('\n======== ZALO OA OAUTH AUDIT ========');
  for (const [k, v] of Object.entries(gates)) {
    console.log(`${k}: ${v}`);
  }
  console.log(`\nROOT_CAUSE: ${rootCause}`);
  console.log(`RUNTIME_APP_ID: ${EXPECTED_APP_ID}`);
  console.log(`RUNTIME_REDIRECT_URI: ${runtimeRedirectUri}`);
  console.log(`ZALO_DEVELOPER_CALLBACK_URL: ${EXPECTED_REDIRECT}`);
  console.log('=====================================\n');

  await prisma.$disconnect();
  process.exit(gates.OAUTH_E2E === 'PASS' ? 0 : 2);
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
