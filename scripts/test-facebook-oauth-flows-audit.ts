/**
 * Prompt 3A — Live OAuth audit (Fanpage / Messenger / Ads).
 *
 *   node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-facebook-oauth-flows-audit.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AUTO_POST_FANPAGE_OAUTH_SCOPES,
  AUTO_POST_MESSENGER_OAUTH_SCOPES,
} from '../apps/api/src/auto-post/auto-post-config';
import { MARKETINGAUTOAZ_META_FANPAGE_LOGIN_CONFIG_ID } from '../apps/api/src/auto-post/assert-auto-post-meta-oauth';
import {
  META_ADS_DEFERRED_SCOPES,
  META_ADS_OAUTH_SCOPES,
  META_FANPAGE_OAUTH_SCOPES,
  META_MESSENGER_OAUTH_SCOPES,
  findCrossFlowScopes,
  resolveMetaAdsLoginConfigId,
  resolveMetaFanpageLoginConfigId,
  resolveMetaMessengerLoginConfigId,
} from '../apps/api/src/meta/meta-oauth-config';

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

type Verdict = 'PASS' | 'FAIL' | 'BLOCKED';

async function api(path: string, token?: string) {
  const res = await fetch(`${API}/api/v1${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function parseOAuthUrl(url: string) {
  try {
    const u = new URL(url);
    return {
      configId: u.searchParams.get('config_id'),
      scope: u.searchParams.get('scope'),
    };
  } catch {
    return { configId: null, scope: null };
  }
}

function scopeList(scopeParam: string | null): string[] {
  if (!scopeParam) return [];
  return scopeParam.split(',').map((s) => s.trim()).filter(Boolean);
}

function printFinal(label: string, verdict: Verdict, detail: string) {
  console.log(`${label} = ${verdict}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const fanpageCode = [...AUTO_POST_FANPAGE_OAUTH_SCOPES];
  const messengerCode = [...AUTO_POST_MESSENGER_OAUTH_SCOPES];
  const adsCode = [...META_ADS_OAUTH_SCOPES];
  const expectedAdsScope = META_ADS_OAUTH_SCOPES.join(',');
  const adsConfig = resolveMetaAdsLoginConfigId(getEnv);
  const messengerConfig = resolveMetaMessengerLoginConfigId(getEnv);
  const fanpageConfig = resolveMetaFanpageLoginConfigId(getEnv);

  const metaAdsSrc = readFileSync(
    join(__dirname, '../apps/api/src/ad-performance/facebook-ads/meta-graph-api.service.ts'),
    'utf8',
  );
  const oauthConfigSrc = readFileSync(
    join(__dirname, '../apps/api/src/meta/meta-oauth-config.ts'),
    'utf8',
  );

  // --- NO_CROSS_FLOW_OVERREQUEST ---
  const crossOk =
    findCrossFlowScopes('fanpage', fanpageCode).length === 0 &&
    findCrossFlowScopes('messenger', messengerCode).length === 0 &&
    findCrossFlowScopes('ads', adsCode).length === 0 &&
    !adsCode.includes('pages_read_engagement') &&
    !adsCode.includes('pages_messaging') &&
    !adsCode.includes('business_management') &&
    !fanpageCode.some((s) => ['pages_messaging', 'pages_manage_metadata'].includes(s)) &&
    !fanpageCode.some((s) => (META_ADS_OAUTH_SCOPES as readonly string[]).includes(s));

  // --- BUSINESS_MANAGEMENT ---
  const bmInOAuth = adsCode.includes('business_management');
  const bmDeferredOnly =
    oauthConfigSrc.includes('META_ADS_DEFERRED_SCOPES') &&
    oauthConfigSrc.includes("'business_management'") &&
    !bmInOAuth &&
    !metaAdsSrc.includes('business_management');

  let fanpageLive: Verdict = 'FAIL';
  let fanpageDetail = 'no reviewer login';
  let messengerLive: Verdict = 'BLOCKED';
  let messengerDetail = 'META_MESSENGER_LOGIN_CONFIG_ID chưa có — cần Meta Dashboard + browser OAuth';
  let adsLive: Verdict = 'FAIL';
  let adsDetail = 'no reviewer login';

  const email = (env.META_REVIEWER_EMAIL ?? '').trim().toLowerCase();
  const password = (env.META_REVIEWER_PASSWORD ?? '').trim();

  if (email && password) {
    const loginRes = await fetch(`${API}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const loginJson = (await loginRes.json().catch(() => ({}))) as {
      accessToken?: string;
      access_token?: string;
    };
    const token = loginJson.accessToken || loginJson.access_token;

    if (token) {
      // Fanpage live
      const fpStart = await api('/auto-post/facebook/oauth/start', token);
      const fp = parseOAuthUrl((fpStart.json as { url?: string }).url || '');
      const fpScopes = scopeList(fp.scope);
      const fpOk =
        fpStart.status === 200 &&
        Boolean(fp.configId) &&
        fp.configId === (fanpageConfig || MARKETINGAUTOAZ_META_FANPAGE_LOGIN_CONFIG_ID) &&
        !fpScopes.some((s) =>
          ['pages_messaging', 'pages_manage_metadata', 'ads_read', 'ads_management'].includes(s),
        );
      fanpageLive = fpOk ? 'PASS' : 'FAIL';
      fanpageDetail = `http=${fpStart.status} config_id=${fp.configId ?? 'n/a'} scope=${fp.scope ?? '(none)'}`;

      // Messenger — BLOCKED until real config + browser test
      if (!messengerConfig) {
        messengerLive = 'BLOCKED';
        messengerDetail =
          'META_MESSENGER_LOGIN_CONFIG_ID chưa có — BLOCKED cho đến browser OAuth PASS';
      } else {
        const msStart = await api('/messaging/facebook/oauth/start', token);
        if (msStart.status === 404) {
          messengerLive = 'BLOCKED';
          messengerDetail = 'endpoint 404 — code chưa deploy';
        } else {
          const msJson = msStart.json as { url?: string; code?: string; message?: string };
          if (msJson.code === 'MANUAL_META_ACTION_REQUIRED' || !msJson.url) {
            messengerLive = 'BLOCKED';
            messengerDetail = 'config có nhưng chưa browser OAuth PASS';
          } else {
            messengerLive = 'BLOCKED';
            messengerDetail =
              'browser OAuth test chưa PASS — cần manual verify trên Meta (BLOCKED cho App Review)';
          }
        }
      }

      // Ads live — strict: không PASS scope cũ
      const adStart = await api('/ad-performance/facebook/oauth/start', token);
      const ad = parseOAuthUrl((adStart.json as { url?: string }).url || '');
      const adScopes = scopeList(ad.scope);
      const expectedScope = META_ADS_OAUTH_SCOPES.join(',');
      const adsScopeOk =
        adScopes.length === 0 && adsConfig
          ? true
          : adScopes.join(',') === expectedScope;
      const adsOk =
        adStart.status === 200 &&
        adsScopeOk &&
        !adScopes.includes('pages_read_engagement') &&
        !adScopes.includes('pages_messaging') &&
        !adScopes.includes('business_management');
      adsLive = adsOk ? 'PASS' : 'FAIL';
      adsDetail = `http=${adStart.status} scope=${ad.scope ?? '(config_id)'} expected=${expectedScope}`;
      if (adScopes.includes('pages_read_engagement')) {
        adsDetail += ' — PRODUCTION STALE (pages_read_engagement)';
      }
    }
  }

  const bmVerdict: Verdict = bmDeferredOnly ? 'PASS' : 'FAIL';
  const crossVerdict: Verdict = crossOk ? 'PASS' : 'FAIL';

  const prompt3aPass =
    fanpageLive === 'PASS' &&
    messengerLive === 'BLOCKED' &&
    adsLive === 'PASS' &&
    bmVerdict === 'PASS' &&
    crossVerdict === 'PASS';

  console.log('\n--- PROMPT 3A LIVE AUDIT ---');
  printFinal('FANPAGE_OAUTH_LIVE', fanpageLive, fanpageDetail);
  printFinal('MESSENGER_OAUTH_LIVE', messengerLive, messengerDetail);
  printFinal('ADS_OAUTH_LIVE', adsLive, adsDetail);
  printFinal(
    'BUSINESS_MANAGEMENT_REAL_USE_CASE',
    bmVerdict,
    bmDeferredOnly
      ? 'deferred — không request trong OAuth; chưa có GET /me/businesses production'
      : 'business_management vẫn trong OAuth scopes',
  );
  printFinal('NO_CROSS_FLOW_OVERREQUEST', crossVerdict, `fanpage/messenger/ads isolated`);
  printFinal('PROMPT_3A_FINAL', prompt3aPass ? 'PASS' : 'FAIL', prompt3aPass ? '' : 'xem gates trên');

  if (!adsConfig) {
    console.log(
      '\nRECOMMENDATION: tạo META_ADS_LOGIN_CONFIG_ID riêng trên Meta Dashboard (không dùng chung Fanpage config 2006772376877449).',
    );
  }

  process.exit(prompt3aPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
