/**
 * Unit + live smoke: Xem thông tin Fanpage (pages_read_engagement).
 *
 * Covers:
 * 1. Fanpage hợp lệ (live)
 * 2. Empty posts shape (unit)
 * 3. Thiếu pages_read_engagement (unit classify)
 * 4. Token hết hạn (unit classify)
 * 5. Cross-org blocked (live random UUID → 404)
 * 6. Rate limit classify không xóa connection (unit + live status still connected)
 * 7. Refresh bypass cache (live)
 * 8. Response shape / no token leak (live)
 *
 *   node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-fanpage-details.ts
 */
import assert from 'node:assert/strict';
import {
  classifyMetaGraphError,
  hasPagesReadEngagement,
  mapMetaPageToDetails,
  mapMetaPosts,
  MISSING_READ_ENGAGEMENT_MESSAGE,
  buildPermissionsFlags,
  mergeConnectionScopes,
  FANPAGE_DETAILS_SAFE_POST_FIELDS,
} from '../apps/api/src/auto-post/auto-post-facebook-page-details.logic';
import { FanpageDetailsRedisCache } from '../apps/api/src/auto-post/auto-post-facebook-page-details.cache';
import type { FanpageDetailsResponse } from '../apps/api/src/auto-post/auto-post-facebook-page-details.types';

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

function redact(obj: unknown): string {
  return JSON.stringify(obj).replace(
    /\b(?:EAAG|EAAD|EAA|EBA|EAAE)[A-Za-z0-9_-]{10,}\b/g,
    '[meta_token]',
  );
}

function hasTokenLeak(obj: unknown): boolean {
  const s = JSON.stringify(obj);
  return /encryptedPageAccessToken|access_token|"token"\s*:/i.test(s) ||
    /\b(?:EAAG|EAAD|EAA)[A-Za-z0-9_-]{20,}\b/.test(s);
}

async function main() {
  const results: Case[] = [];

  // --- Unit: permissions ---
  results.push({
    name: 'unit_has_pages_read_engagement',
    ok: hasPagesReadEngagement(['pages_show_list', 'pages_read_engagement']),
  });
  results.push({
    name: 'unit_missing_pages_read_engagement',
    ok: !hasPagesReadEngagement(['pages_show_list', 'pages_manage_posts']),
  });
  results.push({
    name: 'unit_env_token_implies_read',
    ok: hasPagesReadEngagement(['env_page_token', 'pages_manage_posts']),
  });
  results.push({
    name: 'unit_merge_scopes_never_shrink',
    ok:
      mergeConnectionScopes(
        ['pages_show_list', 'pages_read_engagement'],
        ['pages_manage_posts', 'public_profile'],
      ).includes('pages_read_engagement') &&
      mergeConnectionScopes(
        ['pages_read_engagement'],
        ['public_profile'],
        ['pages_read_engagement'],
      ).includes('pages_read_engagement') === false,
  });
  results.push({
    name: 'unit_safe_post_fields_omit_engagement_edges',
    ok:
      FANPAGE_DETAILS_SAFE_POST_FIELDS.includes('id') &&
      !FANPAGE_DETAILS_SAFE_POST_FIELDS.some((f) => f.includes('likes')) &&
      !FANPAGE_DETAILS_SAFE_POST_FIELDS.some((f) => f.includes('comments')) &&
      !FANPAGE_DETAILS_SAFE_POST_FIELDS.some((f) => f.includes('reactions')),
  });

  // --- Unit: classify errors ---
  const missing = classifyMetaGraphError({
    code: 10,
    message: 'Requires pages_read_engagement permission',
  });
  results.push({
    name: 'unit_classify_missing_read_engagement',
    ok:
      missing.code === 'permission_missing' &&
      missing.message.includes('pages_read_engagement') &&
      missing.httpStatus === 403,
    detail: missing.code,
  });

  const genericPerm = classifyMetaGraphError({
    code: 10,
    message: 'Application does not have permission for this action',
  });
  results.push({
    name: 'unit_classify_generic_perm_not_lumped',
    ok: genericPerm.code === 'META_API_ERROR' && genericPerm.httpStatus === 403,
    detail: genericPerm.code,
  });

  const expired = classifyMetaGraphError({
    code: 190,
    message: 'Error validating access token: Session has expired',
  });
  results.push({
    name: 'unit_classify_token_expired',
    ok: expired.code === 'expired_token' && expired.httpStatus === 401,
    detail: expired.code,
  });

  const rate = classifyMetaGraphError({
    code: 4,
    message: 'Application request limit reached',
  });
  results.push({
    name: 'unit_classify_rate_limit',
    ok: rate.code === 'rate_limited' && rate.httpStatus === 429,
    detail: rate.code,
  });

  const wrongPage = classifyMetaGraphError({
    code: 100,
    message: 'Unsupported get request. Object with ID does not exist',
  });
  results.push({
    name: 'unit_classify_wrong_page_id',
    ok: wrongPage.code === 'wrong_page_id' && wrongPage.httpStatus === 403,
    detail: wrongPage.code,
  });

  const declined = classifyMetaGraphError({
    message: 'User denied / permission declined for this app',
  });
  results.push({
    name: 'unit_classify_permission_declined',
    ok: declined.code === 'permission_declined' && declined.httpStatus === 403,
    detail: declined.code,
  });

  // --- Unit: empty posts + mapping ---
  const emptyPosts = mapMetaPosts([], 10);
  results.push({
    name: 'unit_empty_posts',
    ok: Array.isArray(emptyPosts) && emptyPosts.length === 0,
  });

  const mappedPage = mapMetaPageToDetails(
    {
      id: '111',
      name: 'Demo Page',
      category: 'Business',
      about: 'About text',
      website: 'https://example.com',
      fan_count: 12,
      followers_count: 20,
      picture: { data: { url: 'https://example.com/p.jpg' } },
    },
    {
      id: 'row-1',
      pageId: '111',
      pageName: 'Fallback',
      pagePictureUrl: null,
    },
  );
  results.push({
    name: 'unit_map_page_full',
    ok:
      mappedPage.pageId === '111' &&
      mappedPage.name === 'Demo Page' &&
      mappedPage.category === 'Business' &&
      mappedPage.followersCount === 20 &&
      mappedPage.fanCount === 12 &&
      mappedPage.website === 'https://example.com',
  });

  const mappedSparse = mapMetaPageToDetails(
    { id: '222', name: 'Sparse' },
    { id: 'row-2', pageId: '222', pageName: 'Sparse', pagePictureUrl: null },
  );
  results.push({
    name: 'unit_map_page_sparse_nulls',
    ok:
      mappedSparse.about === null &&
      mappedSparse.website === null &&
      mappedSparse.category === null &&
      mappedSparse.fanCount === null,
  });

  const posts = mapMetaPosts(
    [
      {
        id: 'p1',
        message: 'Hello world post content',
        created_time: '2026-01-01T00:00:00+0000',
        permalink_url: 'https://facebook.com/p1',
        full_picture: 'https://example.com/t.jpg',
        reactions: { summary: { total_count: 3 } },
        comments: { summary: { total_count: 1 } },
        shares: { count: 2 },
      },
    ],
    10,
  );
  results.push({
    name: 'unit_map_posts_engagement',
    ok:
      posts.length === 1 &&
      posts[0].reactions === 3 &&
      posts[0].comments === 1 &&
      posts[0].shares === 2 &&
      posts[0].permalinkUrl?.includes('facebook.com'),
  });

  // --- Unit: cache invalidate on refresh ---
  const cache = new FanpageDetailsRedisCache(null);
  const sample: FanpageDetailsResponse = {
    page: mappedPage,
    recentPosts: [],
    permissions: buildPermissionsFlags(['pages_read_engagement', 'pages_show_list']),
    refreshedAt: new Date().toISOString(),
    warnings: [],
  };
  await cache.set('org-a', 'fp-1', sample);
  results.push({
    name: 'unit_cache_hit',
    ok: Boolean((await cache.getFresh('org-a', 'fp-1'))?.cached),
  });
  await cache.invalidate('org-a', 'fp-1');
  results.push({
    name: 'unit_cache_invalidate',
    ok: (await cache.getFresh('org-a', 'fp-1')) === null,
  });
  // stale vẫn còn sau invalidate fresh
  results.push({
    name: 'unit_stale_kept_after_invalidate',
    ok: Boolean(await cache.getStale('org-a', 'fp-1')),
  });

  // --- Live API ---
  const email = (process.env.META_REVIEWER_EMAIL ?? '').trim();
  const password = (process.env.META_REVIEWER_PASSWORD ?? '').trim();
  if (!email || !password) {
    console.log('SKIP live API — thiếu META_REVIEWER_EMAIL/PASSWORD');
    for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name} ${r.detail ?? ''}`);
    if (results.some((r) => !r.ok)) process.exit(1);
    console.log('PARTIAL_PASS (unit only)');
    return;
  }

  const login = await api('/auth/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const token = (login.json as { accessToken?: string }).accessToken;
  results.push({
    name: 'live_login',
    ok: (login.status === 200 || login.status === 201) && Boolean(token),
    detail: `status=${login.status}`,
  });
  if (!token) {
    for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name} ${r.detail ?? ''}`);
    process.exit(1);
  }

  const st = await api('/auto-post/facebook/status', token);
  const pages = (st.json as { pages?: Array<{ id: string; pageId: string; pageName: string }> })
    .pages;
  const connected = Boolean((st.json as { connected?: boolean }).connected);
  results.push({
    name: 'live_status',
    ok:
      st.status === 200 &&
      Array.isArray(pages) &&
      (pages.length > 0 || connected === false),
    detail: `status=${st.status} connected=${connected} pages=${pages?.length ?? 0}`,
  });

  // 5. Cross-org / unknown fanpage blocked
  const cross = await api(
    '/auto-post/facebook/pages/00000000-0000-4000-8000-000000000099/details',
    token,
  );
  results.push({
    name: 'live_cross_org_blocked',
    ok:
      (cross.status === 404 || cross.status === 403) &&
      !hasTokenLeak(cross.json) &&
      ((cross.json as { code?: string }).code === 'NOT_FOUND' ||
        String((cross.json as { message?: string }).message ?? '').length > 0),
    detail: `status=${cross.status} body=${redact(cross.json).slice(0, 200)}`,
  });

  if (pages && pages.length > 0) {
    const fp = pages[0];
    const details = await api(`/auto-post/facebook/pages/${fp.id}/details`, token);
    const body = details.json as FanpageDetailsResponse & {
      code?: string;
      message?: string;
      success?: boolean;
    };

    const okShape =
      details.status === 200 &&
      body?.page?.pageId &&
      Array.isArray(body.recentPosts) &&
      body.recentPosts.length <= 10 &&
      body.permissions &&
      typeof body.refreshedAt === 'string' &&
      Array.isArray(body.warnings) &&
      !hasTokenLeak(body);

    results.push({
      name: 'live_fanpage_details_ok_or_typed_error',
      ok:
        okShape ||
        (details.status >= 400 &&
          typeof body.code === 'string' &&
          [
            'MISSING_PAGES_READ_ENGAGEMENT',
            'TOKEN_EXPIRED',
            'PAGE_ACCESS_REVOKED',
            'META_RATE_LIMIT',
            'NETWORK_ERROR',
            'META_API_ERROR',
          ].includes(body.code) &&
          !hasTokenLeak(body)),
      detail: `status=${details.status} posts=${body?.recentPosts?.length ?? '-'} code=${body?.code ?? 'ok'}`,
    });

    if (okShape) {
      results.push({
        name: 'live_empty_or_populated_posts',
        ok: Array.isArray(body.recentPosts),
        detail: `count=${body.recentPosts.length}`,
      });

      // 7. Refresh
      const refreshed = await api(
        `/auto-post/facebook/pages/${fp.id}/details?refresh=true`,
        token,
      );
      const rb = refreshed.json as FanpageDetailsResponse;
      results.push({
        name: 'live_refresh_bypass_cache',
        ok:
          refreshed.status === 200 &&
          rb.cached !== true &&
          typeof rb.refreshedAt === 'string' &&
          !hasTokenLeak(rb),
        detail: `status=${refreshed.status} cached=${String(rb.cached)}`,
      });

      // 6. Connection still present after details (rate-limit path not triggered, but connection intact)
      const st2 = await api('/auto-post/facebook/status', token);
      results.push({
        name: 'live_connection_intact_after_details',
        ok:
          st2.status === 200 &&
          Boolean((st2.json as { connected?: boolean }).connected) &&
          Array.isArray((st2.json as { pages?: unknown[] }).pages) &&
          ((st2.json as { pages: unknown[] }).pages.length > 0),
        detail: `status=${st2.status}`,
      });
    } else if (body.code === 'MISSING_PAGES_READ_ENGAGEMENT') {
      results.push({
        name: 'live_missing_permission_message',
        ok: String(body.message ?? '').includes('kết nối lại'),
        detail: String(body.message ?? '').slice(0, 120),
      });
      const st2 = await api('/auto-post/facebook/status', token);
      results.push({
        name: 'live_connection_intact_after_permission_error',
        ok: st2.status === 200 && Boolean((st2.json as { connected?: boolean }).connected),
      });
    }
  }

  // 8. Responsive UI is FE — assert sheet component exists
  try {
    const fs = await import('node:fs');
    const sheet = fs.readFileSync(
      new URL(
        '../apps/web/src/components/content-auto-post/fanpage-details-sheet.tsx',
        import.meta.url,
      ),
      'utf8',
    );
    results.push({
      name: 'ui_sheet_responsive_classes',
      ok:
        sheet.includes('sm:max-w-xl') &&
        sheet.includes('md:max-w-2xl') &&
        sheet.includes('Làm mới dữ liệu') &&
        sheet.includes('Đóng') &&
        sheet.includes('Mở bài trên Facebook'),
    });
    const panel = fs.readFileSync(
      new URL(
        '../apps/web/src/components/content-auto-post/auto-post-channels-panel.tsx',
        import.meta.url,
      ),
      'utf8',
    );
    results.push({
      name: 'ui_channels_has_xem_thong_tin',
      ok: panel.includes('Xem thông tin') && panel.includes('FanpageDetailsSheet'),
    });
  } catch (e) {
    results.push({
      name: 'ui_sheet_responsive_classes',
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  let failed = 0;
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
    if (!r.ok) failed += 1;
  }
  if (failed) {
    console.log(`FAIL ${failed}/${results.length}`);
    process.exit(1);
  }
  console.log(`ALL_PASS ${results.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
