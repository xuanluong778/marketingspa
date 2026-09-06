/**
 * Live gates cho Facebook App Review Prompt 2:
 *   pages_read_engagement + pages_manage_posts
 *
 *   node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-facebook-prompt2-app-review.ts
 *
 * Env: META_REVIEWER_EMAIL, META_REVIEWER_PASSWORD, META_APP_ID, META_APP_SECRET, ENCRYPTION_KEY
 * Optional: API_URL, SKIP_PUBLISH=1 (skip live publish — final verdict FAIL)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '@marketingspa/database';
import { decryptSecret } from '../apps/api/src/common/utils/encryption.util';
import {
  pageTokenAllowsManagePostsAtPublish,
} from '../apps/api/src/auto-post/auto-post-meta-pages.util';
import type { FanpageDetailsResponse } from '../apps/api/src/auto-post/auto-post-facebook-page-details.types';

type Gate = { name: string; ok: boolean; detail: string };

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  try {
    for (const line of readFileSync(join(__dirname, '../.env'), 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#') || !t.includes('=')) continue;
      const i = t.indexOf('=');
      env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    /* optional */
  }
  return env;
}

const env = loadEnv();
const getEnv = (k: string) => env[k];
const API = (env.API_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
const GRAPH = env.META_API_VERSION || 'v21.0';
const APP_ID = env.META_APP_ID || env.FACEBOOK_APP_ID || '';
const APP_SECRET = env.META_APP_SECRET || env.FACEBOOK_APP_SECRET || '';
const ENCRYPTION_KEY = env.ENCRYPTION_KEY || '';

function redact(s: string): string {
  return s.replace(/\b(?:EAAG|EAAD|EAA|EBA)[A-Za-z0-9_-]{10,}\b/g, '[meta_token]');
}

function hasTokenLeak(obj: unknown): boolean {
  const s = JSON.stringify(obj);
  return (
    /encryptedPageAccessToken|access_token|"token"\s*:/i.test(s) ||
    /\b(?:EAAG|EAAD|EAA)[A-Za-z0-9_-]{20,}\b/.test(s)
  );
}

async function api(path: string, token?: string, init?: RequestInit) {
  const res = await fetch(`${API}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function debugToken(inputToken: string) {
  const params = new URLSearchParams({
    input_token: inputToken,
    access_token: `${APP_ID}|${APP_SECRET}`,
  });
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH}/debug_token?${params.toString()}`,
  );
  const body = (await res.json()) as {
    data?: { is_valid?: boolean; scopes?: string[]; expires_at?: number };
    error?: { message?: string };
  };
  return {
    ok: res.ok && Boolean(body.data?.is_valid),
    scopes: body.data?.scopes ?? [],
    error: body.error?.message ?? null,
  };
}

function setGate(gates: Gate[], name: string, ok: boolean, detail: string) {
  const idx = gates.findIndex((g) => g.name === name);
  const row = { name, ok, detail: redact(detail).slice(0, 400) };
  if (idx >= 0) gates[idx] = row;
  else gates.push(row);
}

function printAndExit(gates: Gate[]) {
  for (const g of gates) {
    console.log(`${g.ok ? 'PASS' : 'FAIL'} ${g.name} — ${g.detail}`);
  }
  const failed = gates.filter((g) => !g.ok).length;
  console.log(failed === 0 ? 'ALL_PASS' : `FAILED_${failed}`);
  console.log(`PROMPT_2_FINAL = ${failed === 0 ? 'PASS' : 'FAIL'}`);
  process.exit(failed ? 1 : 0);
}

async function main() {
  const gates: Gate[] = [];
  const email = (env.META_REVIEWER_EMAIL ?? '').trim().toLowerCase();
  const password = (env.META_REVIEWER_PASSWORD ?? '').trim();

  if (!email || !password) {
    for (const name of [
      'PAGES_READ_ENGAGEMENT',
      'PAGE_DETAILS',
      'PAGE_SYNC',
      'PAGES_MANAGE_POSTS',
      'PAGE_TOKEN_PERMISSION',
      'PUBLISH_POST',
      'POST_VISIBLE_ON_FACEBOOK',
    ]) {
      setGate(gates, name, false, 'SKIP — thiếu META_REVIEWER_EMAIL/PASSWORD');
    }
    printAndExit(gates);
    return;
  }

  const login = await api('/auth/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const token =
    (login.json as { accessToken?: string }).accessToken ||
    (login.json as { access_token?: string }).access_token;
  const user = (login.json as { user?: { organizationId?: string; id?: string } }).user;

  if (!token || !user?.organizationId || !user.id) {
    for (const name of [
      'PAGES_READ_ENGAGEMENT',
      'PAGE_DETAILS',
      'PAGE_SYNC',
      'PAGES_MANAGE_POSTS',
      'PAGE_TOKEN_PERMISSION',
      'PUBLISH_POST',
      'POST_VISIBLE_ON_FACEBOOK',
    ]) {
      setGate(gates, name, false, `login_failed status=${login.status}`);
    }
    printAndExit(gates);
    return;
  }

  const fbStatus = await api('/auto-post/facebook/status', token);
  const statusJson = fbStatus.json as {
    connected?: boolean;
    pages?: Array<{ id: string; pageId: string; pageName: string }>;
    scopes?: string[];
  };

  if (!statusJson.connected || !statusJson.pages?.length) {
    for (const name of [
      'PAGES_READ_ENGAGEMENT',
      'PAGE_DETAILS',
      'PAGE_SYNC',
      'PAGES_MANAGE_POSTS',
      'PAGE_TOKEN_PERMISSION',
      'PUBLISH_POST',
      'POST_VISIBLE_ON_FACEBOOK',
    ]) {
      setGate(
        gates,
        name,
        false,
        'Chưa có Fanpage connected — reconnect OAuth (Prompt 1) trước',
      );
    }
    printAndExit(gates);
    return;
  }

  const fanpage = statusJson.pages[0]!;
  const conn = await prisma.autoPostFacebookConnection.findUnique({
    where: {
      userId_organizationId: { userId: user.id, organizationId: user.organizationId },
    },
    include: { pages: { where: { id: fanpage.id } } },
  });

  const dbScopes = conn?.scopes ?? statusJson.scopes ?? [];
  const hasReadEngagement = dbScopes.includes('pages_read_engagement');
  const hasManagePosts = dbScopes.includes('pages_manage_posts');

  setGate(
    gates,
    'PAGES_READ_ENGAGEMENT',
    hasReadEngagement,
    `db_scopes=[${dbScopes.join(',')}] has_read_engagement=${hasReadEngagement}`,
  );

  setGate(
    gates,
    'PAGES_MANAGE_POSTS',
    hasManagePosts,
    `db_scopes=[${dbScopes.join(',')}] has_manage_posts=${hasManagePosts}`,
  );

  const details = await api(
    `/auto-post/facebook/pages/${fanpage.id}/details?refresh=true`,
    token,
  );
  const body = details.json as FanpageDetailsResponse & {
    code?: string;
    legacyCode?: string;
    message?: string;
  };

  const detailsOk =
    details.status === 200 &&
    body.dataSource === 'live' &&
    Boolean(body.page?.name) &&
    Boolean(body.page?.pageId) &&
    Array.isArray(body.recentPosts) &&
    !hasTokenLeak(body) &&
    !(body.warnings?.some((w) => /Could not read posts from Facebook|Không đọc được bài viết/i.test(w)));

  setGate(
    gates,
    'PAGE_DETAILS',
    detailsOk,
    detailsOk
      ? `status=${details.status} page=${body.page.name} posts=${body.recentPosts.length}`
      : `status=${details.status} code=${body.code ?? body.legacyCode ?? '-'} msg=${String(body.message ?? '').slice(0, 120)} warnings=${body.warnings?.length ?? 0}`,
  );

  const sync = await api(`/auto-post/facebook/pages/${fanpage.id}/sync`, token, {
    method: 'POST',
  });
  const syncBody = sync.json as FanpageDetailsResponse & { code?: string; message?: string };

  const syncOk =
    sync.status === 200 &&
    syncBody.dataSource === 'live' &&
    syncBody.syncStatus === 'Synced from Facebook' &&
    Boolean(syncBody.lastSyncedAt) &&
    Boolean(syncBody.graphEndpoints?.posts?.includes('published_posts')) &&
    !hasTokenLeak(syncBody) &&
    !(syncBody.warnings?.some((w) => /Không đọc được bài viết/i.test(w)));

  setGate(
    gates,
    'PAGE_SYNC',
    syncOk,
    syncOk
      ? `status=${sync.status} posts=${syncBody.recentPosts?.length ?? 0} synced=${syncBody.lastSyncedAt}`
      : `status=${sync.status} code=${syncBody.code ?? '-'} msg=${String(syncBody.message ?? '').slice(0, 120)}`,
  );

  // PAGE_TOKEN_PERMISSION — debug_token on stored page access token
  let pageTokenPermOk = false;
  let pageTokenDetail = 'missing ENCRYPTION_KEY or page row';
  if (ENCRYPTION_KEY && APP_ID && APP_SECRET && conn?.pages[0]) {
    try {
      const pageToken = decryptSecret(conn.pages[0].encryptedPageAccessToken, ENCRYPTION_KEY);
      const debug = await debugToken(pageToken);
      let pageTasks: string[] = [];
      if (
        debug.ok &&
        !pageTokenAllowsManagePostsAtPublish({
          pageDebugScopes: debug.scopes,
          pageTasks: [],
          isValid: true,
        })
      ) {
        const userToken = decryptSecret(conn.encryptedAccessToken, ENCRYPTION_KEY);
        const managedRes = await fetch(
          `https://graph.facebook.com/${GRAPH}/me/accounts?fields=id,tasks&limit=100`,
          { headers: { Authorization: `Bearer ${userToken}` } },
        );
        const managedBody = (await managedRes.json()) as {
          data?: Array<{ id?: string; tasks?: string[] }>;
        };
        const match = (managedBody.data ?? []).find((p) => p.id === fanpage.pageId);
        pageTasks = match?.tasks?.map(String) ?? [];
      }
      pageTokenPermOk =
        debug.ok &&
        pageTokenAllowsManagePostsAtPublish({
          pageDebugScopes: debug.scopes,
          pageTasks,
          isValid: true,
        });
      pageTokenDetail = `debug_valid=${debug.ok} scopes=[${debug.scopes.join(',')}] tasks=[${pageTasks.join(',')}]`;
    } catch (e) {
      pageTokenDetail = e instanceof Error ? e.message : String(e);
    }
  } else {
    pageTokenDetail = `missing env: key=${Boolean(ENCRYPTION_KEY)} app=${Boolean(APP_ID)} page=${Boolean(conn?.pages[0])}`;
  }

  setGate(gates, 'PAGE_TOKEN_PERMISSION', pageTokenPermOk, pageTokenDetail);

  if (env.SKIP_PUBLISH === '1') {
    setGate(gates, 'PUBLISH_POST', false, 'SKIP_PUBLISH=1 — bắt buộc publish thật để PASS');
    setGate(gates, 'POST_VISIBLE_ON_FACEBOOK', false, 'SKIP_PUBLISH=1');
    printAndExit(gates);
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const draft = await api('/auto-post/drafts', token, {
    method: 'POST',
    body: JSON.stringify({
      postType: 'PROMOTION',
      topic: `App Review Prompt2 ${stamp}`,
      caption: `[Meta App Review test — Prompt 2] Automated publish verification ${stamp}. Safe to delete.`,
      fanpageId: fanpage.id,
    }),
  });
  const postId = (draft.json as { id?: string }).id;

  if (!postId || draft.status >= 400) {
    setGate(
      gates,
      'PUBLISH_POST',
      false,
      `draft_failed status=${draft.status} ${JSON.stringify(draft.json).slice(0, 120)}`,
    );
    setGate(gates, 'POST_VISIBLE_ON_FACEBOOK', false, 'blocked — no draft');
    printAndExit(gates);
    return;
  }

  const publish = await api('/auto-post/publish', token, {
    method: 'POST',
    body: JSON.stringify({ postId, fanpageIds: [fanpage.id] }),
  });
  const pubJson = publish.json as {
    status?: string;
    facebookPostId?: string;
    facebookPermalink?: string;
    message?: string;
    errorMessage?: string;
  };

  const publishOk =
    publish.status === 200 || publish.status === 201
      ? pubJson.status === 'PUBLISHED' && Boolean(pubJson.facebookPostId)
      : false;

  setGate(
    gates,
    'PUBLISH_POST',
    publishOk,
    publishOk
      ? `status=${publish.status} fbPostId=${pubJson.facebookPostId} permalink=${pubJson.facebookPermalink ?? '-'}`
      : `status=${publish.status} msg=${String(pubJson.message ?? pubJson.errorMessage ?? JSON.stringify(pubJson)).slice(0, 160)}`,
  );

  let visibleOk = false;
  let visibleDetail = 'no facebookPostId';
  if (publishOk && pubJson.facebookPostId && ENCRYPTION_KEY && conn?.pages[0]) {
    try {
      const pageToken = decryptSecret(conn.pages[0].encryptedPageAccessToken, ENCRYPTION_KEY);
      const postRes = await fetch(
        `https://graph.facebook.com/${GRAPH}/${encodeURIComponent(pubJson.facebookPostId)}?fields=id,is_published,permalink_url,message&access_token=${encodeURIComponent(pageToken)}`,
      );
      const postBody = (await postRes.json()) as {
        id?: string;
        is_published?: boolean;
        permalink_url?: string;
        message?: string;
        error?: { message?: string; code?: number };
      };
      visibleOk =
        postRes.ok &&
        Boolean(postBody.id) &&
        postBody.is_published !== false &&
        Boolean(postBody.permalink_url || pubJson.facebookPermalink);
      visibleDetail = postBody.error
        ? `graph_error=${postBody.error.code}:${postBody.error.message?.slice(0, 80)}`
        : `is_published=${postBody.is_published} permalink=${Boolean(postBody.permalink_url || pubJson.facebookPermalink)}`;
    } catch (e) {
      visibleDetail = e instanceof Error ? e.message : String(e);
    }
  }

  setGate(gates, 'POST_VISIBLE_ON_FACEBOOK', visibleOk, visibleDetail);

  // Messenger / connection intact
  const afterStatus = await api('/auto-post/facebook/status', token);
  const stillConnected =
    afterStatus.status === 200 &&
    Boolean((afterStatus.json as { connected?: boolean }).connected) &&
    ((afterStatus.json as { pages?: unknown[] }).pages?.length ?? 0) > 0;

  if (!stillConnected) {
    setGate(gates, 'PAGE_DETAILS', false, 'REGRESSION: connection lost after tests');
  }

  await prisma.$disconnect();
  printAndExit(gates);
}

main().catch((e) => {
  console.error(redact(e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
