/**
 * E2E gates cho Facebook Auto Post OAuth (App Review — 3 quyền Pages).
 *
 *   node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-facebook-oauth-app-review.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AUTO_POST_FANPAGE_OAUTH_SCOPES,
  AUTO_POST_MESSENGER_OAUTH_SCOPES,
  resolveAutoPostMetaScopes,
} from '../apps/api/src/auto-post/auto-post-config';
import {
  AUTO_POST_REQUIRED_PAGE_SCOPES,
} from '../apps/api/src/auto-post/auto-post-meta-pages.util';
import {
  canUseAutoPostOAuthCanary,
  isMetaAppReviewerEmail,
} from '../apps/api/src/auto-post/meta-reviewer-access.util';
import {
  MARKETINGAUTOAZ_META_APP_ID,
  MARKETINGAUTOAZ_META_LOGIN_CONFIG_ID,
  MARKETINGAUTOAZ_AUTO_POST_OAUTH_REDIRECT_URI,
} from '../apps/api/src/auto-post/assert-auto-post-meta-oauth';

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

function setGate(gates: Gate[], name: string, ok: boolean, detail: string) {
  const idx = gates.findIndex((g) => g.name === name);
  const row = { name, ok, detail };
  if (idx >= 0) gates[idx] = row;
  else gates.push(row);
}

function printAndExit(gates: Gate[]) {
  for (const g of gates) {
    console.log(`${g.ok ? 'PASS' : 'FAIL'} ${g.name} — ${g.detail}`);
  }
  const failed = gates.filter((g) => !g.ok).length;
  console.log(failed === 0 ? 'ALL_PASS' : `FAILED_${failed}`);
  process.exit(failed ? 1 : 0);
}

async function main() {
  const gates: Gate[] = [];

  const fanpageScopes = [...AUTO_POST_FANPAGE_OAUTH_SCOPES];
  const resolved = resolveAutoPostMetaScopes(getEnv);
  const noMessengerInDefault = !fanpageScopes.some((s) =>
    (AUTO_POST_MESSENGER_OAUTH_SCOPES as readonly string[]).includes(s),
  );
  const requiredSubset = AUTO_POST_REQUIRED_PAGE_SCOPES.every((s) => fanpageScopes.includes(s));
  setGate(
    gates,
    'PERMISSION_MINIMIZATION',
    noMessengerInDefault &&
      requiredSubset &&
      JSON.stringify(resolved) === JSON.stringify(fanpageScopes) &&
      !env.META_AUTO_POST_SCOPES?.trim(),
    `fanpage=[${fanpageScopes.join(',')}] resolved=[${resolved.join(',')}]`,
  );

  const email = (env.META_REVIEWER_EMAIL ?? '').trim().toLowerCase();
  const password = (env.META_REVIEWER_PASSWORD ?? '').trim();
  if (!email || !password) {
    for (const name of [
      'FACEBOOK_OAUTH',
      'REVIEWER_CANARY_ACCESS',
      'PAGES_SHOW_LIST',
      'PAGE_PICKER',
      'PAGE_SELECT',
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
  const user = (login.json as {
    user?: { role?: string; organizationId?: string; email?: string };
  }).user;

  if (!token || !user?.organizationId) {
    for (const name of [
      'FACEBOOK_OAUTH',
      'REVIEWER_CANARY_ACCESS',
      'PAGES_SHOW_LIST',
      'PAGE_PICKER',
      'PAGE_SELECT',
    ]) {
      setGate(gates, name, false, `login_failed status=${login.status}`);
    }
    printAndExit(gates);
    return;
  }

  const userEmail = user.email || email;
  const canaryAllowed = canUseAutoPostOAuthCanary(
    { email: userEmail, role: user.role || 'OWNER', organizationId: user.organizationId },
    getEnv,
  );
  const reviewerBypass = isMetaAppReviewerEmail(userEmail, getEnv);
  const orgInList = String(env.AUTO_POST_OAUTH_CANARY_ORG_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .includes(user.organizationId);

  setGate(
    gates,
    'REVIEWER_CANARY_ACCESS',
    canaryAllowed && (reviewerBypass || orgInList || env.AUTO_POST_OAUTH_CANARY !== 'true'),
    `canary=${env.AUTO_POST_OAUTH_CANARY} reviewer_bypass=${reviewerBypass} org_in_list=${orgInList}`,
  );

  const oauthStart = await api('/auto-post/facebook/oauth/start', token);
  const oauthUrl = (oauthStart.json as { url?: string }).url || '';
  let parsed: URL | null = null;
  try {
    parsed = oauthUrl ? new URL(oauthUrl) : null;
  } catch {
    parsed = null;
  }

  const oauthOk =
    oauthStart.status === 200 &&
    Boolean(parsed?.hostname.includes('facebook.com')) &&
    parsed?.searchParams.get('client_id') === MARKETINGAUTOAZ_META_APP_ID &&
    parsed?.searchParams.get('config_id') === MARKETINGAUTOAZ_META_LOGIN_CONFIG_ID &&
    parsed?.searchParams.get('redirect_uri') === MARKETINGAUTOAZ_AUTO_POST_OAUTH_REDIRECT_URI &&
    !parsed?.searchParams.get('scope');

  setGate(
    gates,
    'FACEBOOK_OAUTH',
    oauthOk && canaryAllowed,
    `status=${oauthStart.status} config_id=${parsed?.searchParams.get('config_id') ?? 'n/a'}`,
  );

  const pagesRes = await api('/auto-post/facebook/oauth/pages', token);
  const pagesJson = pagesRes.json as {
    status?: string;
    pages?: Array<{ pageId?: string; pageName?: string }>;
    grantedScopes?: string[];
    missingScopes?: string[];
    message?: string;
  };

  const hasPending =
    pagesRes.status === 200 &&
    (pagesJson.status === 'OK' ||
      pagesJson.status === 'NO_PAGES' ||
      pagesJson.status === 'MISSING_PERMISSION');

  const pagesFromGraph =
    pagesJson.status === 'OK' &&
    Array.isArray(pagesJson.pages) &&
    pagesJson.pages.length > 0 &&
    pagesJson.pages.every((p) => p.pageId && p.pageName);

  setGate(
    gates,
    'PAGES_SHOW_LIST',
    pagesRes.status === 200 &&
      (pagesJson.status === 'NO_PENDING_OAUTH' ||
        pagesJson.status === 'OK' ||
        pagesJson.status === 'NO_PAGES' ||
        pagesJson.status === 'MISSING_PERMISSION'),
    `status=${pagesJson.status} http=${pagesRes.status} granted=[${(pagesJson.grantedScopes || []).join(',')}]`,
  );

  const statusRes = await api('/auto-post/facebook/status', token);
  const connectedPages =
    ((statusRes.json as { pages?: Array<{ pageId: string }> }).pages || []).length;

  const pickerOk =
    pagesFromGraph ||
    connectedPages > 0 ||
    (pagesRes.status === 200 && pagesJson.status === 'NO_PAGES');

  setGate(
    gates,
    'PAGE_PICKER',
    pickerOk,
    pagesFromGraph
      ? `live_pages=${pagesJson.pages!.length} first=${pagesJson.pages![0].pageName}`
      : connectedPages > 0
        ? `already_connected=${connectedPages} (picker đã dùng trước đó)`
        : `status=${pagesJson.status}`,
  );

  setGate(
    gates,
    'PAGE_SELECT',
    connectedPages > 0 || pagesFromGraph,
    connectedPages > 0
      ? `connected_pages=${connectedPages}`
      : pagesFromGraph
        ? `pending_picker_pages=${pagesJson.pages!.length}`
        : `status=${pagesJson.status}`,
  );

  if (!pagesFromGraph && connectedPages === 0 && pagesJson.status === 'NO_PENDING_OAUTH') {
    setGate(gates, 'PAGE_PICKER', false, 'NO_PENDING_OAUTH — chưa có phiên OAuth');
    setGate(gates, 'PAGE_SELECT', false, 'NO_PENDING_OAUTH — chưa select Page');
  }

  printAndExit(gates);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
