/**
 * Probe Zalo OA authorize redirect hops for -14003 (no secrets logged).
 */
const crypto = require('crypto');
const { prisma } = require('../packages/database/dist');

const API = (process.env.API_URL || 'https://marketingautoaz.com').replace(/\/$/, '');
const ORG = '4421a663-e724-4144-ba80-4d6b3f52c145';
const JWT_SECRET = process.env.JWT_SECRET;

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

(async () => {
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
  const body = await start.json();
  let cur = body.url;
  const hops = [];

  for (let i = 0; i < 8; i++) {
    const res = await fetch(cur, {
      redirect: 'manual',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      },
    });
    const loc = res.headers.get('location') || '';
    let errCode = null;
    let errMsg = null;
    try {
      const abs = loc.startsWith('http') ? loc : new URL(loc, cur).toString();
      const u = new URL(abs);
      errCode =
        u.searchParams.get('error') ||
        u.searchParams.get('error_code') ||
        u.searchParams.get('code');
      errMsg =
        u.searchParams.get('error_description') || u.searchParams.get('message');
    } catch {
      /* ignore */
    }
    const text = res.status === 200 ? (await res.text()).slice(0, 3000) : '';
    const hit14003 =
      text.includes('-14003') ||
      loc.includes('-14003') ||
      String(errCode) === '-14003' ||
      String(errCode) === '14003' ||
      /invalid\s*redirect/i.test(text) ||
      /invalid\s*redirect/i.test(loc);

    let host = '?';
    let path = '?';
    try {
      const u = new URL(cur);
      host = u.host;
      path = u.pathname;
    } catch {
      /* ignore */
    }

    hops.push({
      i,
      status: res.status,
      host,
      path,
      hasLoc: Boolean(loc),
      errCode,
      errMsg: errMsg ? String(errMsg).slice(0, 100) : null,
      hit14003,
      uiHint: hit14003
        ? 'ERROR_14003'
        : /login|permission|oauth/i.test(text)
          ? 'login_or_permission_ui'
          : text
            ? 'html'
            : 'empty',
    });

    if (!loc || res.status < 300 || res.status >= 400) break;
    cur = loc.startsWith('http') ? loc : new URL(loc, cur).toString();
  }

  const oa = await prisma.messagingChannelConnection.findFirst({
    where: {
      organizationId: ORG,
      providerKind: 'ZALO_OA',
    },
    orderBy: { updatedAt: 'desc' },
  });

  console.log(
    JSON.stringify(
      {
        startHttp: start.status,
        redirectUri: body.redirectUri,
        authorizePath: (() => {
          try {
            return new URL(body.url).pathname;
          } catch {
            return null;
          }
        })(),
        hasCodeChallenge: Boolean(
          body.url && new URL(body.url).searchParams.get('code_challenge'),
        ),
        hops,
        existingOa: oa
          ? {
              idTail: oa.id.slice(-6),
              accountRefTail: String(oa.accountRef || '').slice(-6),
              status: oa.status,
              updatedAt: oa.updatedAt,
            }
          : null,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
