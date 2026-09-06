/**
 * Incognito-like redirect trace (no cookies). Follows chain until -14003 or login.
 * Usage: node scripts/with-root-env.cjs node scripts/trace-zalo-browser-redirect.cjs [authorizeUrl]
 */
const crypto = require('crypto');
const { prisma } = require('../packages/database/dist');

const MAX_HOPS = 12;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

async function getAuthorizeUrl() {
  if (process.argv[2]) return process.argv[2];
  const JWT_SECRET = process.env.JWT_SECRET;
  const user = await prisma.user.findFirst({
    where: { deletedAt: null, isActive: true },
    include: { role: true },
    orderBy: { createdAt: 'asc' },
  });
  function b64url(i) {
    return Buffer.from(i)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }
  const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64url(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role?.name || 'OWNER',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 1800,
    }),
  );
  const s = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${h}.${p}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const res = await fetch('https://marketingautoaz.com/api/v1/zalo-marketing/oauth/start', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${h}.${p}.${s}`,
      'Content-Type': 'application/json',
      Origin: 'https://marketingautoaz.com',
      Referer: 'https://marketingautoaz.com/zalo-marketing?tab=oa',
      'User-Agent': UA,
    },
    body: JSON.stringify({ returnPath: '/zalo-marketing?tab=oa' }),
  });
  const body = await res.json();
  return body.url;
}

(async () => {
  const startUrl = await getAuthorizeUrl();
  let cur = startUrl;
  const hops = [];

  for (let i = 0; i < MAX_HOPS; i++) {
    const res = await fetch(cur, {
      redirect: 'manual',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    });
    const loc = res.headers.get('location') || '';
    const text = res.status === 200 ? (await res.text()).slice(0, 4000) : '';
    const hit14003 =
      loc.includes('-14003') ||
      text.includes('-14003') ||
      /invalid\s*redirect/i.test(loc) ||
      /invalid\s*redirect/i.test(text);

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
      hop: i,
      url: cur.slice(0, 220),
      status: res.status,
      host,
      path,
      location: loc.slice(0, 220),
      hit14003,
      titleSnippet: text.match(/<title[^>]*>([^<]+)/i)?.[1]?.slice(0, 80) || null,
      errorCode: text.match(/error_code[=:"'\s-]*(-?\d+)/i)?.[1] || null,
    });

    if (hit14003) break;
    if (!loc || res.status < 300 || res.status >= 400) break;
    cur = loc.startsWith('http') ? loc : new URL(loc, cur).toString();
  }

  console.log(JSON.stringify({ startUrl, hops }, null, 2));
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
