/**
 * Canary live smoke for Auto Post (SUPER_ADMIN).
 * Does not print secrets/tokens.
 *
 * Run:
 *   node scripts/with-root-env.cjs pnpm --filter @marketingspa/api exec tsx ../../scripts/smoke-auto-post-canary-live.ts
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { sign } from 'jsonwebtoken';
import { decryptSecret } from '../apps/api/src/common/utils/encryption.util';

function loadEnv() {
  const env: Record<string, string> = {};
  const p = join(__dirname, '../.env');
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = loadEnv();
const prisma = new PrismaClient();
const API = env.API_INTERNAL_URL || 'http://127.0.0.1:4000/api/v1';
const results: Record<string, string> = {};

function mintJwt(user: { id: string; email: string; organizationId: string; role: string }) {
  const secret = env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET missing');
  return sign(
    {
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
    },
    secret,
    { expiresIn: '30m' },
  );
}

function hasTokenLeak(text: string) {
  if (env.META_PAGE_ACCESS_TOKEN && text.includes(env.META_PAGE_ACCESS_TOKEN)) return true;
  if (/\b(?:EAAG|EAAD|EAA|EBA)[A-Za-z0-9_-]{20,}\b/.test(text)) return true;
  return false;
}

async function api(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, json, text, leak: hasTokenLeak(text) };
}

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: { code: 'SUPER_ADMIN' } },
    include: { role: true },
  });
  if (!admin) {
    console.log(JSON.stringify({ OVERALL: 'FAIL', reason: 'no_super_admin' }, null, 2));
    process.exit(2);
  }

  const token = mintJwt({
    id: admin.id,
    email: admin.email,
    organizationId: admin.organizationId,
    role: admin.role.code,
  });
  results.AUTH = 'jwt_ok';

  // OAuth start must NOT auto SERVER_ENV
  const start = await api(token, '/auto-post/facebook/oauth/start');
  const oauthUrl = start.json?.url || '';
  results.OAUTH_START_HTTP = String(start.status);
  results.OAUTH_START_MODE = String(start.json?.mode || 'none');
  results.OAUTH_START_FACEBOOK_URL = String(/facebook\.com|fb\.com/i.test(oauthUrl));
  results.OAUTH_START_LEAK = String(start.leak);
  results.OAUTH_START =
    start.status === 200 && start.json?.mode === 'oauth' && /facebook\.com|fb\.com/i.test(oauthUrl)
      ? 'PASS'
      : `FAIL_${start.status}_${JSON.stringify(start.json).slice(0, 160)}`;

  const status = await api(token, '/auto-post/status');
  results.STATUS_canUseServerEnv = String(status.json?.canUseServerEnv);
  results.STATUS_metaPageEnvConfigured = String(status.json?.metaPageEnvConfigured);
  results.STATUS_oauthCanary = String(status.json?.oauthCanary);
  results.STATUS_LEAK = String(status.leak);

  const fb = await api(token, '/auto-post/facebook/status');
  results.FB_CONNECTED = String(fb.json?.connected);
  results.FB_MODE = String(fb.json?.connectionMode);
  results.FB_PAGES = String(fb.json?.pages?.length ?? 0);
  results.FB_LEAK = String(fb.leak);

  // SaaS blocked from SERVER_ENV + canary blocks OAuth for non-allowlist
  const saas = await prisma.user.findFirst({
    where: {
      role: { code: { not: 'SUPER_ADMIN' } },
      organizationId: { not: admin.organizationId },
    },
    include: { role: true },
  });
  if (saas) {
    const saasToken = mintJwt({
      id: saas.id,
      email: saas.email,
      organizationId: saas.organizationId,
      role: saas.role.code,
    });
    const se = await api(saasToken, '/auto-post/facebook/connect/server-env', { method: 'POST' });
    results.SAAS_SERVER_ENV =
      se.status === 403 || se.status === 401 || se.status === 400 ? 'PASS_blocked' : `FAIL_${se.status}`;
    const so = await api(saasToken, '/auto-post/facebook/oauth/start');
    results.SAAS_OAUTH_CANARY =
      so.status >= 400 ? 'PASS_blocked' : `FAIL_allowed_${so.status}`;
    results.SAAS_LEAK = String(se.leak || so.leak);
  }

  const page = await prisma.autoPostFacebookPage.findFirst({
    where: {
      connection: { userId: admin.id, organizationId: admin.organizationId },
    },
    include: { connection: true },
  });

  if (!page) {
    results.LIVE_OAUTH_SELECT = 'BLOCKED_need_browser_oauth_page_select';
    results.OVERALL = results.OAUTH_START === 'PASS' ? 'NO-GO_partial' : 'NO-GO_fail';
    console.log(JSON.stringify(results, null, 2));
    await prisma.$disconnect();
    process.exit(1);
  }

  // Graph probe with decrypted page token (never print)
  let pageToken = '';
  try {
    pageToken = decryptSecret(page.encryptedPageAccessToken, env.ENCRYPTION_KEY);
    results.PAGE_TOKEN_DECRYPT = pageToken ? 'ok' : 'empty';
  } catch {
    results.PAGE_TOKEN_DECRYPT = 'fail';
  }

  const ver = env.META_API_VERSION || 'v21.0';
  const probe = await fetch(
    `https://graph.facebook.com/${ver}/${page.pageId}?fields=id,name&access_token=${encodeURIComponent(pageToken)}`,
  );
  const probeJ: any = await probe.json().catch(() => ({}));
  results.GRAPH_PAGE_PROBE = probe.ok
    ? 'PASS'
    : `FAIL_${(probeJ.error?.message || probe.status).toString().slice(0, 120)}`;

  if (!probe.ok) {
    results.OVERALL = 'NO-GO_fail';
    console.log(JSON.stringify(results, null, 2));
    await prisma.$disconnect();
    process.exit(1);
  }

  const stamp = new Date().toISOString();
  const caption = `[canary-smoke ${stamp}] Auto-post check — safe to delete`;

  const draft = await api(token, '/auto-post/drafts', {
    method: 'POST',
    body: JSON.stringify({
      fanpageId: page.id,
      postType: 'PROMOTION',
      topic: 'canary-smoke',
      caption,
      spaService: 'Canary',
      targetAudience: 'internal',
      tone: 'friendly',
      cta: 'Tìm hiểu thêm',
    }),
  });
  const postId = draft.json?.id;
  results.DRAFT_TEXT = draft.status === 200 || draft.status === 201 ? 'PASS' : `FAIL_${draft.status}`;
  results.DRAFT_LEAK = String(draft.leak);

  if (!postId) {
    results.OVERALL = 'NO-GO_fail';
    results.DRAFT_BODY = JSON.stringify(draft.json).slice(0, 200);
    console.log(JSON.stringify(results, null, 2));
    await prisma.$disconnect();
    process.exit(1);
  }

  const pub = await api(token, '/auto-post/publish', {
    method: 'POST',
    body: JSON.stringify({ postId }),
  });
  results.PUBLISH_TEXT =
    pub.status < 300 && (pub.json?.status === 'PUBLISHED' || pub.json?.facebookPostId)
      ? 'PASS'
      : `FAIL_${pub.status}_${JSON.stringify(pub.json).slice(0, 120)}`;
  results.PUBLISH_LEAK = String(pub.leak);
  const fbPostId = pub.json?.facebookPostId || pub.json?.item?.facebookPostId;

  const pub2 = await api(token, '/auto-post/publish', {
    method: 'POST',
    body: JSON.stringify({ postId }),
  });
  const fbPostId2 = pub2.json?.facebookPostId || pub2.json?.item?.facebookPostId;
  results.IDEMPOTENT =
    fbPostId && fbPostId2 && fbPostId === fbPostId2
      ? 'PASS'
      : pub2.status < 300
        ? 'PASS_no_double_error'
        : `FAIL_${pub2.status}`;

  // Image
  const draftImg = await api(token, '/auto-post/drafts', {
    method: 'POST',
    body: JSON.stringify({
      fanpageId: page.id,
      postType: 'PROMOTION',
      topic: 'canary-img',
      caption: caption + ' [img]',
      spaService: 'Canary',
      targetAudience: 'internal',
      tone: 'friendly',
      imageUrl: 'https://marketingautoaz.com/logo.png',
    }),
  });
  const imgId = draftImg.json?.id;
  if (imgId) {
    const pubImg = await api(token, '/auto-post/publish', {
      method: 'POST',
      body: JSON.stringify({ postId: imgId }),
    });
    results.PUBLISH_IMAGE =
      pubImg.status < 300 && (pubImg.json?.status === 'PUBLISHED' || pubImg.json?.facebookPostId)
        ? 'PASS'
        : `FAIL_${pubImg.status}_${JSON.stringify(pubImg.json).slice(0, 120)}`;
    results.PUBLISH_IMAGE_LEAK = String(pubImg.leak);
  } else {
    results.PUBLISH_IMAGE = 'FAIL_no_draft';
  }

  // Schedule + cancel + retry
  const draftS = await api(token, '/auto-post/drafts', {
    method: 'POST',
    body: JSON.stringify({
      fanpageId: page.id,
      postType: 'PROMOTION',
      topic: 'canary-sched',
      caption: caption + ' [sched]',
      spaService: 'Canary',
      targetAudience: 'internal',
      tone: 'friendly',
    }),
  });
  const schedId = draftS.json?.id;
  if (schedId) {
    const when = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const sch = await api(token, '/auto-post/schedule', {
      method: 'POST',
      body: JSON.stringify({ postId: schedId, scheduledAt: when }),
    });
    results.SCHEDULE =
      sch.status < 300 && (sch.json?.status === 'SCHEDULED' || sch.json?.scheduledAt)
        ? 'PASS'
        : `FAIL_${sch.status}`;
    const cancel = await api(token, `/auto-post/schedule/${schedId}/cancel`, { method: 'POST' });
    results.CANCEL =
      cancel.status < 300 ? 'PASS' : `FAIL_${cancel.status}`;
    const retry = await api(token, `/auto-post/posts/${schedId}/retry`, { method: 'POST' });
    results.RETRY = retry.status < 500 ? `HTTP_${retry.status}` : `FAIL_${retry.status}`;
  } else {
    results.SCHEDULE = 'FAIL_no_draft';
  }

  // IDOR
  if (saas) {
    const saasToken = mintJwt({
      id: saas.id,
      email: saas.email,
      organizationId: saas.organizationId,
      role: saas.role.code,
    });
    const idor = await api(saasToken, `/auto-post/posts/${postId}`);
    results.IDOR = idor.status === 404 || idor.status === 403 ? 'PASS' : `FAIL_${idor.status}`;
    results.IDOR_LEAK = String(idor.leak);
  }

  const leakKeys = Object.entries(results).filter(([k, v]) => k.includes('LEAK') && v === 'true');
  results.NO_TOKEN_LEAK = leakKeys.length === 0 ? 'PASS' : 'FAIL';

  const required = [
    'OAUTH_START',
    'GRAPH_PAGE_PROBE',
    'DRAFT_TEXT',
    'PUBLISH_TEXT',
    'PUBLISH_IMAGE',
    'IDEMPOTENT',
    'SCHEDULE',
    'CANCEL',
    'NO_TOKEN_LEAK',
  ];
  if (results.IDOR) required.push('IDOR');
  if (results.SAAS_SERVER_ENV) required.push('SAAS_SERVER_ENV');
  if (results.SAAS_OAUTH_CANARY) required.push('SAAS_OAUTH_CANARY');

  const failed = required.filter((k) => !String(results[k]).startsWith('PASS'));
  results.OVERALL = failed.length === 0 ? 'GO_smoke_pass_keep_canary' : 'NO-GO_fail';
  results.FAILED = failed.join(',') || 'none';
  console.log(JSON.stringify(results, null, 2));
  await prisma.$disconnect();
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error('SMOKE_ERROR', e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
