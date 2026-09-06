/**
 * Zalo OA OAuth redirect_uri + authorize URL E2E (no secrets logged).
 * Full browser grant still needs admin click on Zalo; this verifies our side.
 *
 * Run: node scripts/with-root-env.cjs node scripts/test-zalo-oa-oauth-redirect-e2e.cjs
 */
const crypto = require('crypto');
const { prisma } = require('../packages/database/dist');
const { buildZaloOaOAuthUrl } = require('../packages/shared/dist');

const API = (process.env.API_URL || 'https://marketingautoaz.com').replace(/\/$/, '');
const JWT_SECRET = process.env.JWT_SECRET;
const ORG = '4421a663-e724-4144-ba80-4d6b3f52c145';
const EXPECTED =
  (process.env.ZALO_REDIRECT_URI || process.env.ZALO_OAUTH_REDIRECT_URI || '').trim() ||
  `${API}/api/v1/zalo-marketing/public/oauth/callback`;

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}
function mint(user) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
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

function normalize(uri) {
  try {
    const u = new URL(uri);
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/\/+$/, '');
    }
    u.hash = '';
    return u.toString();
  } catch {
    return String(uri || '').replace(/\/+$/, '');
  }
}

(async () => {
  const expected = normalize(EXPECTED);
  const verdict = {
    ENV_REDIRECT: 'FAIL',
    OAUTH_START: 'FAIL',
    REDIRECT_MATCH: 'FAIL',
    PKCE: 'FAIL',
    CALLBACK_ROUTE: 'FAIL',
    STATE_CSRF: 'FAIL',
  };

  if (expected === 'https://marketingautoaz.com/api/v1/zalo-marketing/public/oauth/callback') {
    verdict.ENV_REDIRECT = 'PASS';
  }

  const user = await prisma.user.findFirst({
    where: { organizationId: ORG, deletedAt: null, isActive: true },
    include: { role: true },
    orderBy: { createdAt: 'asc' },
  });
  const token = mint({
    id: user.id,
    email: user.email,
    organizationId: ORG,
    role: user.role?.name || 'OWNER',
  });

  const start = await fetch(`${API}/api/v1/zalo-marketing/oauth/start`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ returnPath: '/zalo-marketing?tab=oa' }),
  });
  const startBody = await start.json().catch(() => ({}));
  const setCookie = start.headers.get('set-cookie') || '';
  let parsed = null;
  try {
    parsed = new URL(startBody.url || '');
  } catch {
    /* ignore */
  }

  const redirectFromAuth = parsed?.searchParams.get('redirect_uri') || '';
  const appId = parsed?.searchParams.get('app_id') || '';
  const state = parsed?.searchParams.get('state') || '';
  const challenge = parsed?.searchParams.get('code_challenge') || '';
  const method = parsed?.searchParams.get('code_challenge_method') || '';

  console.log(
    JSON.stringify(
      {
        http: start.status,
        oauthHost: parsed?.host,
        app_id_tail: appId ? `…${appId.slice(-6)}` : null,
        redirect_uri: redirectFromAuth,
        expected,
        hasState: Boolean(state),
        hasCodeChallenge: Boolean(challenge),
        code_challenge_method: method || null,
        urlLen: (startBody.url || '').length,
        hasOauthCookie: /zalo_oa_oauth=/i.test(setCookie),
        responseRedirectUri: startBody.redirectUri || null,
      },
      null,
      2,
    ),
  );

  if (start.status < 300 && parsed?.host === 'oauth.zaloapp.com') {
    verdict.OAUTH_START = 'PASS';
  }
  if (normalize(redirectFromAuth) === expected) {
    verdict.REDIRECT_MATCH = 'PASS';
  }
  const pkceEnvOn =
    String(process.env.ZALO_OAUTH_PKCE || 'false').trim().toLowerCase() === 'true' ||
    String(process.env.ZALO_OAUTH_PKCE || '').trim() === '1';
  if (pkceEnvOn) {
    if (challenge && method === 'S256') verdict.PKCE = 'PASS';
  } else if (!challenge) {
    verdict.PKCE = 'PASS'; // PKCE off — authorize must not send code_challenge
  }

  if (/zalo_oa_oauth=/i.test(setCookie) && startBody.state) {
    verdict.STATE_CSRF = 'PASS';
  }

  // Live authorize probe (no login): detect -14003 early
  let authorizeProbe = 'SKIP';
  if (startBody.url) {
    const authRes = await fetch(startBody.url, {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 MarketingAutoAZ-OAuthProbe' },
    });
    const loc = authRes.headers.get('location') || '';
    const text = authRes.status === 200 ? await authRes.text().catch(() => '') : '';
    const bodyHit =
      text.includes('-14003') || /invalid\s*redirect/i.test(text);
    const locHit = loc.includes('-14003') || /invalid.?redirect/i.test(loc);
    if (bodyHit || locHit) {
      authorizeProbe = 'FAIL_14003';
      console.log(
        JSON.stringify(
          {
            authorizeHttp: authRes.status,
            authorizeLocationTail: loc.slice(0, 180),
            hint: 'Zalo returned -14003 / invalid redirect on authorize',
          },
          null,
          2,
        ),
      );
    } else if (authRes.status >= 200 && authRes.status < 400) {
      authorizeProbe = 'PASS';
    } else {
      authorizeProbe = `HTTP_${authRes.status}`;
    }
  }

  // Public oauth config
  const cfgRes = await fetch(`${API}/api/v1/zalo-marketing/public/oauth/config`);
  const cfg = await cfgRes.json().catch(() => ({}));
  console.log(
    JSON.stringify(
      {
        publicConfig: {
          http: cfgRes.status,
          redirectUri: cfg.redirectUri,
          appIdMasked: cfg.appIdMasked,
          pkce: cfg.pkce,
          flow: cfg.flow,
          authorizePath: cfg.authorizePath,
        },
        authorizeProbe,
      },
      null,
      2,
    ),
  );

  // Callback route reachable via nginx → API
  const cb = await fetch(
    `${API}/api/v1/zalo-marketing/public/oauth/callback`,
    { redirect: 'manual' },
  );
  const cbLoc = cb.headers.get('location') || '';
  if ((cb.status === 302 || cb.status === 301) && cbLoc.includes('/zalo-marketing')) {
    verdict.CALLBACK_ROUTE = 'PASS';
  }

  // Unit: authorize builder encodes redirect exactly once
  const built = buildZaloOaOAuthUrl({
    appId: appId || '1',
    redirectUri: expected,
    state: 's',
  });
  const builtRedirect = new URL(built).searchParams.get('redirect_uri');
  const encodeOk = builtRedirect === expected;
  const pathOk = parsed?.pathname === '/v4/oa/permission';
  const leanUrlOk = !state && !challenge && (startBody.url || '').length < 220;
  const configOk =
    cfgRes.status < 300 &&
    normalize(cfg.redirectUri || '') === expected &&
    cfg.flow === 'oa/permission' &&
    cfg.pkce === false;

  const ready =
    verdict.ENV_REDIRECT === 'PASS' &&
    verdict.OAUTH_START === 'PASS' &&
    verdict.REDIRECT_MATCH === 'PASS' &&
    verdict.PKCE === 'PASS' &&
    verdict.CALLBACK_ROUTE === 'PASS' &&
    verdict.STATE_CSRF === 'PASS' &&
    encodeOk &&
    pathOk &&
    leanUrlOk &&
    configOk &&
    authorizeProbe === 'PASS';

  console.log('\n======== REPORT ========');
  console.log(`ENV_REDIRECT: ${verdict.ENV_REDIRECT}`);
  console.log(`OAUTH_START: ${verdict.OAUTH_START}`);
  console.log(`REDIRECT_MATCH: ${verdict.REDIRECT_MATCH}`);
  console.log(`PKCE_OFF: ${verdict.PKCE}`);
  console.log(`OA_PATH: ${pathOk ? 'PASS' : 'FAIL'}`);
  console.log(`CALLBACK_ROUTE: ${verdict.CALLBACK_ROUTE}`);
  console.log(`STATE_CSRF: ${verdict.STATE_CSRF}`);
  console.log(`ENCODE_OK: ${encodeOk ? 'PASS' : 'FAIL'}`);
  console.log(`LEAN_AUTHORIZE_URL: ${leanUrlOk ? 'PASS' : 'FAIL'}`);
  console.log(`PUBLIC_CONFIG: ${configOk ? 'PASS' : 'FAIL'}`);
  console.log(`AUTHORIZE_PROBE: ${authorizeProbe}`);
  console.log(`OAUTH REDIRECT READY: ${ready ? 'YES' : 'NO'}`);
  console.log(`ZALO OA OAUTH: ${ready ? 'PASS' : 'FAIL'}`);
  console.log(`REDIRECT_URI: ${expected}`);
  console.log('========================\n');

  await prisma.$disconnect();
  process.exit(ready ? 0 : 2);
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
