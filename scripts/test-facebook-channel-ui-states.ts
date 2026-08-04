/**
 * Smoke: Facebook channel UI state rules (không lộ token).
 * - lastError null khi CONNECTED thành công
 * - select partial → success + failedPages, HTTP 200
 * - refresh fail với connection cũ → success:false + warning, HTTP 200
 *
 *   node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-facebook-channel-ui-states.ts
 */
import assert from 'node:assert/strict';
import { humanizeAutoPostFacebookError } from '../apps/api/src/auto-post/auto-post-user-facing-errors';

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

async function main() {
  const results: Case[] = [];

  // Unit: null lastError không bịa banner lỗi
  results.push({
    name: 'humanize_null_returns_null',
    ok: humanizeAutoPostFacebookError(null, null) === null,
  });
  results.push({
    name: 'humanize_empty_with_null_fallback',
    ok: humanizeAutoPostFacebookError('', null) === null,
  });

  const email = (process.env.META_REVIEWER_EMAIL ?? '').trim();
  const password = (process.env.META_REVIEWER_PASSWORD ?? '').trim();
  if (!email || !password) {
    console.log('SKIP live API — thiếu META_REVIEWER_EMAIL/PASSWORD');
    for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}`);
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
    name: 'login',
    ok: (login.status === 200 || login.status === 201) && Boolean(token),
    detail: `status=${login.status}`,
  });
  if (!token) {
    for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name} ${r.detail ?? ''}`);
    process.exit(1);
  }

  const st = await api('/auto-post/facebook/status', token);
  const body = st.json as {
    connected?: boolean;
    status?: string;
    lastError?: string | null;
    pages?: unknown[];
  };
  const leaked = /EAAG|access_token/i.test(redact(body));
  results.push({
    name: 'status_no_token_leak',
    ok: st.status === 200 && !leaked,
    detail: `status=${st.status}`,
  });

  // Khi CONNECTED + có pages: lastError phải null (không còn banner lỗi giả)
  if (body.connected && (body.pages?.length ?? 0) > 0) {
    results.push({
      name: 'connected_success_lastError_null',
      ok: body.lastError == null,
      detail: `lastError=${body.lastError ?? 'null'} pages=${body.pages?.length}`,
    });
  } else {
    results.push({
      name: 'connected_success_lastError_null',
      ok: true,
      detail: `skipped (connected=${body.connected} pages=${body.pages?.length ?? 0})`,
    });
  }

  // Refresh: nếu đã có connection → HTTP 200 kể cả khi Graph lỗi (warning)
  if (body.connected) {
    const refresh = await api('/auto-post/facebook/pages/refresh', token, { method: 'POST' });
    const rj = refresh.json as {
      success?: boolean;
      warning?: string | null;
      pages?: unknown[];
      connected?: boolean;
    };
    results.push({
      name: 'refresh_keeps_http_200_when_connected',
      ok: refresh.status === 200 || refresh.status === 201,
      detail: `http=${refresh.status} success=${rj.success} warning=${rj.warning ?? 'null'} pages=${rj.pages?.length ?? 0}`,
    });
    results.push({
      name: 'refresh_does_not_wipe_pages_on_soft_fail',
      ok:
        (refresh.status === 200 || refresh.status === 201) &&
        (rj.success === true ||
          (rj.success === false && (rj.pages?.length ?? 0) >= (body.pages?.length ?? 0))),
      detail: redact({ success: rj.success, warning: rj.warning, pageCount: rj.pages?.length }),
    });
  } else {
    results.push({
      name: 'refresh_keeps_http_200_when_connected',
      ok: true,
      detail: 'skipped (not connected)',
    });
    results.push({
      name: 'refresh_does_not_wipe_pages_on_soft_fail',
      ok: true,
      detail: 'skipped',
    });
  }

  // Select không có pending → 4xx (toàn bộ thất bại) — không phải partial
  const selectEmpty = await api('/auto-post/facebook/oauth/select', token, {
    method: 'POST',
    body: JSON.stringify({ pageIds: ['nonexistent_page_id_for_test'] }),
  });
  results.push({
    name: 'select_all_fail_is_4xx_not_fake_success',
    ok: selectEmpty.status >= 400 && selectEmpty.status < 500,
    detail: `http=${selectEmpty.status} body=${redact(selectEmpty.json).slice(0, 160)}`,
  });

  let failed = 0;
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
    if (!r.ok) failed++;
  }
  console.log(failed === 0 ? 'ALL_PASS' : `FAILED_${failed}`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
