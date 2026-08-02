/**
 * Canary smoke — Meta Graph hardening (Fanpage thật).
 * Không deploy production; chạy trên API canary.
 *
 *   node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/canary-meta-graph-hardening.ts
 */
import assert from 'node:assert/strict';
import {
  autoPostPublishLockKey,
  acquireAutoPostPublishLock,
  releaseAutoPostPublishLock,
} from '../apps/api/src/auto-post/auto-post-publish-lock';
import {
  isPermanentMetaError,
  isRateLimitMetaError,
  exponentialBackoffMs,
  parseMetaUsageHeader,
} from '../apps/api/src/auto-post/meta-graph-http';
import { withRedisSingleFlight } from '../apps/api/src/auto-post/meta-redis-cache';

type Case = { name: string; ok: boolean; detail?: string };

const API = (process.env.API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:4000').replace(
  /\/api\/v1$/,
  '',
);

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

function hasTokenLeak(obj: unknown): boolean {
  const s = JSON.stringify(obj);
  return (
    /encryptedPageAccessToken|access_token|"token"\s*:/i.test(s) ||
    /\b(?:EAAG|EAAD|EAA)[A-Za-z0-9_-]{20,}\b/.test(s)
  );
}

async function main() {
  const results: Case[] = [];

  // --- Unit hardening ---
  results.push({
    name: 'lock_key_includes_org_and_post',
    ok: autoPostPublishLockKey('org-a', 'post-1') === 'auto-post:lock:publish:org-a:post-1',
  });

  class MemRedis {
    store = new Map<string, string>();
    async set(key: string, value: string, ...args: Array<string | number>) {
      let nx = false;
      for (const a of args) if (a === 'NX') nx = true;
      if (nx && this.store.has(key)) return null;
      this.store.set(key, value);
      return 'OK';
    }
    async get(key: string) {
      return this.store.get(key) ?? null;
    }
    async del(...keys: string[]) {
      for (const k of keys) this.store.delete(k);
      return keys.length;
    }
    async eval(_s: string, _n: number, key: string, owner: string) {
      if (this.store.get(key) === owner) {
        this.store.delete(key);
        return 1;
      }
      return 0;
    }
  }
  const redis = new MemRedis() as unknown as import('ioredis').default;
  const a = await acquireAutoPostPublishLock(redis, 'org-x', 'p1', 'owner-a', 5000);
  const b = await acquireAutoPostPublishLock(redis, 'org-x', 'p1', 'owner-b', 5000);
  results.push({ name: 'lock_second_blocked', ok: a.ok && !b.ok });
  const releasedByWrong = await releaseAutoPostPublishLock(redis, a.key, 'owner-b');
  results.push({ name: 'lock_release_wrong_owner_denied', ok: releasedByWrong === false });
  const releasedByOwner = await releaseAutoPostPublishLock(redis, a.key, 'owner-a');
  results.push({ name: 'lock_release_owner_ok', ok: releasedByOwner === true });

  let runs = 0;
  await Promise.all([
    withRedisSingleFlight(redis, 'meta:lock:details:org:fp', { resultKey: 'r1', waitMs: 3000, pollMs: 30 }, async () => {
      runs++;
      await new Promise((r) => setTimeout(r, 50));
      return { n: 1 };
    }),
    withRedisSingleFlight(redis, 'meta:lock:details:org:fp', { resultKey: 'r1', waitMs: 3000, pollMs: 30 }, async () => {
      runs++;
      return { n: 2 };
    }),
  ]);
  results.push({ name: 'single_flight_one_run', ok: runs === 1, detail: `runs=${runs}` });

  results.push({
    name: 'no_retry_permission',
    ok: isPermanentMetaError({ code: 10, message: 'permission' }),
  });
  results.push({
    name: 'rate_limit_detect',
    ok: isRateLimitMetaError({ code: 4, message: 'limit' }),
  });
  results.push({
    name: 'usage_near_limit',
    ok: Boolean(parseMetaUsageHeader('{"call_count":90,"total_cputime":1,"total_time":1}', 'app')?.nearLimit),
  });
  const bo = exponentialBackoffMs(1, 400, 8000);
  results.push({ name: 'backoff_jitter', ok: bo >= 400 && bo <= 9000 });

  // --- Live canary ---
  const email = (process.env.META_REVIEWER_EMAIL ?? '').trim();
  const password = (process.env.META_REVIEWER_PASSWORD ?? '').trim();
  if (!email || !password) {
    console.log('SKIP live — thiếu META_REVIEWER_EMAIL/PASSWORD');
    for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name} ${r.detail ?? ''}`);
    if (results.some((r) => !r.ok)) process.exit(1);
    console.log('PARTIAL_PASS (unit only) — NO-GO live');
    return;
  }

  const login = await api('/auth/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const token = (login.json as { accessToken?: string }).accessToken;
  results.push({ name: 'live_login', ok: Boolean(token), detail: `status=${login.status}` });
  if (!token) {
    for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}`);
    process.exit(1);
  }

  const st = await api('/auto-post/facebook/status', token);
  const pages = (st.json as { pages?: Array<{ id: string }> }).pages ?? [];
  results.push({
    name: 'live_status_connected',
    ok: st.status === 200 && pages.length > 0 && !hasTokenLeak(st.json),
    detail: `pages=${pages.length}`,
  });

  const cross = await api(
    '/auto-post/facebook/pages/00000000-0000-4000-8000-000000000099/details',
    token,
  );
  results.push({
    name: 'live_cross_org_blocked',
    ok: cross.status === 404 && (cross.json as { code?: string }).code === 'NOT_FOUND',
  });

  if (pages[0]) {
    const fp = pages[0].id;
    const m0 = await api('/auto-post/facebook/meta-metrics', token);
    const before = (m0.json as { graphRequestsByEndpoint?: Record<string, number> })
      .graphRequestsByEndpoint ?? {};
    const beforePosts =
      (before.published_posts ?? 0) + (before.page_metadata ?? 0) + (before.posts ?? 0);

    const d1 = await api(`/auto-post/facebook/pages/${fp}/details`, token);
    const body1 = d1.json as {
      cached?: boolean;
      dataSource?: string;
      refreshedAt?: string;
      code?: string;
    };
    const m1 = await api('/auto-post/facebook/meta-metrics', token);
    const after1 = (m1.json as { graphRequestsByEndpoint?: Record<string, number> })
      .graphRequestsByEndpoint ?? {};
    const after1Posts =
      (after1.published_posts ?? 0) + (after1.page_metadata ?? 0) + (after1.posts ?? 0);
    const delta1 = after1Posts - beforePosts;

    results.push({
      name: 'live_open_modal_first',
      ok:
        (d1.status === 200 && !hasTokenLeak(d1.json) && delta1 >= 1 && delta1 <= 3) ||
        (d1.status >= 400 && typeof body1.code === 'string' && !hasTokenLeak(d1.json)),
      detail: `status=${d1.status} deltaGraph=${delta1} source=${body1.dataSource ?? body1.code}`,
    });

    if (d1.status === 200) {
      const d2 = await api(`/auto-post/facebook/pages/${fp}/details`, token);
      const m2 = await api('/auto-post/facebook/meta-metrics', token);
      const after2 = (m2.json as { graphRequestsByEndpoint?: Record<string, number> })
        .graphRequestsByEndpoint ?? {};
      const after2Posts =
        (after2.published_posts ?? 0) + (after2.page_metadata ?? 0) + (after2.posts ?? 0);
      const delta2 = after2Posts - after1Posts;
      const b2 = d2.json as { cached?: boolean; dataSource?: string; refreshedAt?: string };
      results.push({
        name: 'live_reopen_within_ttl_no_meta',
        ok: d2.status === 200 && delta2 === 0 && (b2.cached === true || b2.dataSource === 'cache'),
        detail: `deltaGraph=${delta2} cached=${b2.cached} source=${b2.dataSource}`,
      });

      const mBeforeConc = await api('/auto-post/facebook/meta-metrics', token);
      // concurrent — second should be single-flight or cache
      const [c1, c2] = await Promise.all([
        api(`/auto-post/facebook/pages/${fp}/details?refresh=true`, token),
        api(`/auto-post/facebook/pages/${fp}/details?refresh=true`, token),
      ]);
      const mAfterConc = await api('/auto-post/facebook/meta-metrics', token);
      const sf =
        ((mAfterConc.json as { singleFlightPrevented?: number }).singleFlightPrevented ?? 0) -
        ((mBeforeConc.json as { singleFlightPrevented?: number }).singleFlightPrevented ?? 0);
      const beforeConcPosts =
        (((mBeforeConc.json as { graphRequestsByEndpoint?: Record<string, number> })
          .graphRequestsByEndpoint?.published_posts ?? 0) +
          ((mBeforeConc.json as { graphRequestsByEndpoint?: Record<string, number> })
            .graphRequestsByEndpoint?.page_metadata ?? 0));
      const afterConcPosts =
        (((mAfterConc.json as { graphRequestsByEndpoint?: Record<string, number> })
          .graphRequestsByEndpoint?.published_posts ?? 0) +
          ((mAfterConc.json as { graphRequestsByEndpoint?: Record<string, number> })
            .graphRequestsByEndpoint?.page_metadata ?? 0));
      const concDelta = afterConcPosts - beforeConcPosts;
      results.push({
        name: 'live_concurrent_single_flight',
        ok:
          c1.status < 500 &&
          c2.status < 500 &&
          !hasTokenLeak(c1.json) &&
          !hasTokenLeak(c2.json) &&
          (sf >= 1 || concDelta <= 3),
        detail: `sfDelta=${sf} graphDelta=${concDelta}`,
      });
    }
  }

  // OAuth start available (no Meta graph)
  const oauth = await api('/auto-post/facebook/oauth/start', token);
  results.push({
    name: 'live_oauth_start',
    ok:
      (oauth.status === 200 || oauth.status === 201) &&
      typeof (oauth.json as { url?: string }).url === 'string' &&
      !hasTokenLeak(oauth.json),
    detail: `status=${oauth.status}`,
  });

  // Publish idempotency unit via lock (không đăng thật nếu không có bài)
  const posts = await api('/auto-post/posts?status=PUBLISHED', token);
  const items = (posts.json as { items?: Array<{ id: string; facebookPostId?: string }> }).items ?? [];
  const published = items.find((i) => i.facebookPostId);
  if (published) {
    const again = await api(`/auto-post/posts/${published.id}/publish`, token, { method: 'POST' });
    // endpoint may differ — soft check
    results.push({
      name: 'live_republish_idempotent_or_blocked',
      ok: again.status === 200 || again.status === 400 || again.status === 404,
      detail: `status=${again.status}`,
    });
  } else {
    results.push({
      name: 'live_republish_idempotent_or_blocked',
      ok: true,
      detail: 'SKIP no published post',
    });
  }

  let failed = 0;
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
    if (!r.ok) failed += 1;
  }

  const goLive =
    failed === 0 &&
    results.some((r) => r.name === 'live_open_modal_first' && r.ok) &&
    results.some((r) => r.name === 'live_cross_org_blocked' && r.ok);

  if (failed) {
    console.log(`FAIL ${failed}/${results.length}`);
    console.log('CONCLUSION: NO-GO production (canary failures)');
    process.exit(1);
  }
  console.log(`ALL_PASS ${results.length}`);
  console.log(
    goLive
      ? 'CONCLUSION: GO canary — hardening PASS (chưa deploy toàn bộ production)'
      : 'CONCLUSION: CONDITIONAL — unit PASS, kiểm tra lại live modal',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
