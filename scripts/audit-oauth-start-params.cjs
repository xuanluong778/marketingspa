/**
 * Redacted OAuth start URL audit for Meta App Review (pages_show_list).
 * Prints config_id / client_id / redirect_uri only — never tokens or state.
 *
 *   node scripts/with-root-env.cjs node scripts/audit-oauth-start-params.cjs
 */
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(__dirname, '../.env'), 'utf8').split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const API = (env.API_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
  const email = (env.META_REVIEWER_EMAIL || '').trim();
  const password = (env.META_REVIEWER_PASSWORD || '').trim();
  if (!email || !password) {
    console.error('MISSING_REVIEWER_CREDENTIALS');
    process.exit(1);
  }

  const loginRes = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const loginJson = await loginRes.json();
  const token =
    loginJson.accessToken || loginJson.access_token || loginJson.tokens?.accessToken;
  const user = loginJson.user || {};
  const canaryOrgs = String(env.AUTO_POST_OAUTH_CANARY_ORG_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const out = {
    login_status: loginRes.status,
    role: user.role || null,
    org_in_canary: canaryOrgs.includes(user.organizationId),
    oauth_connection: env.OAUTH_CONNECTION || null,
    canary_enabled: env.AUTO_POST_OAUTH_CANARY || null,
  };

  if (!token) {
    console.log(JSON.stringify({ ...out, error: 'login_failed' }, null, 2));
    process.exit(1);
  }

  const startRes = await fetch(`${API}/api/v1/auto-post/facebook/oauth/start`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const startJson = await startRes.json();
  out.oauth_start_status = startRes.status;
  out.oauth_mode = startJson.mode || null;

  let parsed = null;
  try {
    parsed = startJson.url ? new URL(startJson.url) : null;
  } catch {
    parsed = null;
  }

  out.oauth_host = parsed?.hostname || null;
  out.client_id = parsed?.searchParams.get('client_id') || null;
  out.config_id = parsed?.searchParams.get('config_id') || null;
  out.redirect_uri = parsed?.searchParams.get('redirect_uri') || null;
  out.scope_param = parsed?.searchParams.get('scope') || null;
  out.response_type = parsed?.searchParams.get('response_type') || null;
  out.auth_type = parsed?.searchParams.get('auth_type') || null;
  out.has_state = Boolean(parsed?.searchParams.get('state'));
  out.contains_forbidden = ['seoauto', 'localhost', '127.0.0.1', 'chatbotspa'].filter((b) =>
    String(startJson.url || '')
      .toLowerCase()
      .includes(b),
  );

  const expected = {
    client_id: '1045516051171576',
    config_id: '2006772376877449',
    redirect_uri: 'https://marketingautoaz.com/api/v1/auto-post/facebook/oauth/callback',
  };
  out.checks = {
    client_id_ok: out.client_id === expected.client_id,
    config_id_ok: out.config_id === expected.config_id,
    redirect_uri_ok: out.redirect_uri === expected.redirect_uri,
    no_scope_with_config_id: !out.scope_param || out.scope_param.length === 0,
    no_forbidden_hosts: out.contains_forbidden.length === 0,
    org_canary_ok: out.org_in_canary === true,
  };
  out.all_pass = Object.values(out.checks).every(Boolean);

  console.log(JSON.stringify(out, null, 2));
  process.exit(out.all_pass ? 0 : 2);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
