/**
 * Final verify Prompt 1 — live OAuth reconnect path (reviewer).
 * Requires: META_REVIEWER_EMAIL/PASSWORD, API on 4000, interactive OAuth OR pre-existing pending.
 *
 *   node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-facebook-oauth-live-reconnect.ts
 *
 * Set SKIP_DISCONNECT=1 to keep connection and only validate list/select on existing pending/connected.
 * Set FB_OAUTH_CODE + FB_OAUTH_STATE from browser callback to complete live reconnect in CI/manual step.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AUTO_POST_FANPAGE_OAUTH_SCOPES,
  AUTO_POST_MESSENGER_OAUTH_SCOPES,
} from '../apps/api/src/auto-post/auto-post-config';
import {
  MARKETINGAUTOAZ_META_APP_ID,
  MARKETINGAUTOAZ_META_LOGIN_CONFIG_ID,
  MARKETINGAUTOAZ_AUTO_POST_OAUTH_REDIRECT_URI,
} from '../apps/api/src/auto-post/assert-auto-post-meta-oauth';

type Row = { gate: string; ok: boolean; detail: string };

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
const API = (env.API_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');

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

function redact(s: string): string {
  return s.replace(/\b(?:EAAG|EAAD|EAA|EBA)[A-Za-z0-9_-]{20,}\b/g, '[token]');
}

function print(rows: Row[]) {
  for (const r of rows) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.gate} — ${r.detail}`);
  }
  const failed = rows.filter((r) => !r.ok).length;
  console.log(failed === 0 ? 'ALL_PASS' : `FAILED_${failed}`);
  process.exit(failed ? 1 : 0);
}

async function main() {
  const rows: Row[] = [];

  // --- Code-side scope expectation (NOT Meta Dashboard) ---
  const codeScopes = [...AUTO_POST_FANPAGE_OAUTH_SCOPES];
  const noMessenger = !codeScopes.some((s) =>
    (AUTO_POST_MESSENGER_OAUTH_SCOPES as readonly string[]).includes(s),
  );
  rows.push({
    gate: 'CODE_OAUTH_SCOPES',
    ok:
      noMessenger &&
      codeScopes.includes('pages_show_list') &&
      codeScopes.includes('pages_read_engagement') &&
      codeScopes.includes('pages_manage_posts'),
    detail: `[${codeScopes.join(',')}]`,
  });

  rows.push({
    gate: 'META_DASHBOARD_SCOPE',
    ok: false,
    detail:
      'MANUAL_VERIFY — Login Configuration 2006772376877449 scopes không đọc được từ code/API công khai; kiểm tra Meta Developer Dashboard thủ công',
  });

  const email = (env.META_REVIEWER_EMAIL ?? '').trim().toLowerCase();
  const password = (env.META_REVIEWER_PASSWORD ?? '').trim();
  if (!email || !password) {
    for (const g of ['RBAC_REVIEWER', 'LIVE_OAUTH_START', 'LIVE_ME_ACCOUNTS', 'LIVE_PAGE_PICKER', 'LIVE_PAGE_SELECT']) {
      rows.push({ gate: g, ok: false, detail: 'missing META_REVIEWER credentials' });
    }
    print(rows);
    return;
  }

  const login = await api('/auth/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const token =
    (login.json as { accessToken?: string }).accessToken ||
    (login.json as { access_token?: string }).access_token;
  const user = (login.json as { user?: { id?: string; organizationId?: string; role?: string } }).user;

  rows.push({
    gate: 'RBAC_REVIEWER',
    ok: login.status === 200 || login.status === 201,
    detail: `login status=${login.status}`,
  });

  if (!token || !user?.organizationId) {
    rows.push({ gate: 'LIVE_OAUTH_START', ok: false, detail: 'login_failed' });
    rows.push({ gate: 'LIVE_ME_ACCOUNTS', ok: false, detail: 'login_failed' });
    rows.push({ gate: 'LIVE_PAGE_PICKER', ok: false, detail: 'login_failed' });
    rows.push({ gate: 'LIVE_PAGE_SELECT', ok: false, detail: 'login_failed' });
    print(rows);
    return;
  }

  const admin = await api('/admin/users', token);
  const billingOk = (await api('/billing/subscription', token)).status === 200;
  rows.push({
    gate: 'RBAC_NO_ADMIN_ESCALATION',
    ok: admin.status === 403 || admin.status === 401,
    detail: `admin_users status=${admin.status} (reviewer must NOT access)`,
  });
  rows.push({
    gate: 'RBAC_TENANT_BILLING',
    ok: billingOk,
    detail: `billing subscription status=${billingOk ? 200 : 'fail'} (normal tenant access)`,
  });

  const oauthStart = await api('/auto-post/facebook/oauth/start', token);
  const oauthUrl = (oauthStart.json as { url?: string }).url || '';
  let parsed: URL | null = null;
  try {
    parsed = oauthUrl ? new URL(oauthUrl) : null;
  } catch {
    parsed = null;
  }
  rows.push({
    gate: 'LIVE_OAUTH_START',
    ok:
      oauthStart.status === 200 &&
      Boolean(parsed?.hostname.includes('facebook.com')) &&
      parsed?.searchParams.get('config_id') === MARKETINGAUTOAZ_META_LOGIN_CONFIG_ID &&
      parsed?.searchParams.get('client_id') === MARKETINGAUTOAZ_META_APP_ID &&
      parsed?.searchParams.get('redirect_uri') === MARKETINGAUTOAZ_AUTO_POST_OAUTH_REDIRECT_URI &&
      !parsed?.searchParams.get('scope'),
    detail: `status=${oauthStart.status} config_id=${parsed?.searchParams.get('config_id') ?? 'n/a'} scope_param=${parsed?.searchParams.get('scope') ?? '(none)'}`,
  });

  if (env.SKIP_DISCONNECT !== '1') {
    const disc = await api('/auto-post/facebook/disconnect', token, { method: 'POST' });
    rows.push({
      gate: 'LIVE_DISCONNECT',
      ok: disc.status === 200 || disc.status === 201,
      detail: `status=${disc.status}`,
    });
    await api('/auto-post/facebook/oauth/start', token);
  }

  const fbCode = env.FB_OAUTH_CODE?.trim();
  const fbState = env.FB_OAUTH_STATE?.trim();
  if (fbCode && fbState) {
    const cb = await fetch(
      `${API}/api/v1/auto-post/facebook/oauth/callback?code=${encodeURIComponent(fbCode)}&state=${encodeURIComponent(fbState)}`,
      { redirect: 'manual' },
    );
    rows.push({
      gate: 'LIVE_OAUTH_CALLBACK',
      ok: cb.status === 302 || cb.status === 301,
      detail: `callback http=${cb.status} location=${redact(cb.headers.get('location') || '').slice(0, 120)}`,
    });
  }

  const pagesRes = await api('/auto-post/facebook/oauth/pages', token);
  const pj = pagesRes.json as {
    status?: string;
    pages?: Array<{ pageId?: string; pageName?: string; pagePictureUrl?: string | null }>;
    grantedScopes?: string[];
    missingScopes?: string[];
    message?: string;
  };

  const livePages =
    pj.status === 'OK' && Array.isArray(pj.pages) && pj.pages.length > 0;
  const noTokenLeak =
    livePages &&
    pj.pages!.every((p) => !JSON.stringify(p).includes('access_token') && !JSON.stringify(p).match(/EAAG/));

  rows.push({
    gate: 'LIVE_ME_ACCOUNTS',
    ok: livePages && noTokenLeak,
    detail: livePages
      ? `pages=${pj.pages!.length} first=${pj.pages![0].pageName} granted=[${(pj.grantedScopes || []).join(',')}]`
      : `status=${pj.status} http=${pagesRes.status} msg=${(pj.message || '').slice(0, 100)}`,
  });

  rows.push({
    gate: 'LIVE_PAGE_PICKER',
    ok: livePages && pj.pages!.every((p) => p.pageId && p.pageName),
    detail: livePages
      ? `picker_rows=${pj.pages!.length} has_avatar=${Boolean(pj.pages![0].pagePictureUrl)}`
      : `status=${pj.status}`,
  });

  let selected = false;
  if (livePages && pj.pages![0].pageId) {
    const sel = await api('/auto-post/facebook/oauth/select', token, {
      method: 'POST',
      body: JSON.stringify({ pageIds: [pj.pages![0].pageId] }),
    });
    selected = sel.status === 200 || sel.status === 201;
    rows.push({
      gate: 'LIVE_PAGE_SELECT',
      ok: selected,
      detail: `select status=${sel.status} pageId=${pj.pages![0].pageId}`,
    });
  } else {
    const statusRes = await api('/auto-post/facebook/status', token);
    const connected =
      ((statusRes.json as { pages?: unknown[] }).pages || []).length;
    rows.push({
      gate: 'LIVE_PAGE_SELECT',
      ok: connected > 0,
      detail:
        connected > 0
          ? `already_connected=${connected} (no fresh pending — cần OAuth browser)`
          : `no_pending status=${pj.status}`,
    });
  }

  if (livePages && pj.grantedScopes) {
    const extra = pj.grantedScopes.filter(
      (s) =>
        !(AUTO_POST_FANPAGE_OAUTH_SCOPES as readonly string[]).includes(s) &&
        s !== 'email',
    );
    if (extra.length) {
      rows.push({
        gate: 'LIVE_GRANTED_SCOPE_AUDIT',
        ok: !extra.some((s) =>
          (AUTO_POST_MESSENGER_OAUTH_SCOPES as readonly string[]).includes(s),
        ),
        detail: `extra_scopes=[${extra.join(',')}] — nếu có pages_messaging/pages_manage_metadata → Dashboard chưa tối thiểu hóa`,
      });
    }
  }

  print(rows);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
