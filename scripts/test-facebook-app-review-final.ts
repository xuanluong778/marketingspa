/**
 * FINAL Facebook App Review gates — production + code audit.
 *
 *   pnpm test:facebook-app-review-final
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import {
  FACEBOOK_REVIEW_REQUIRED_EN_PHRASES,
  FACEBOOK_VI_FORBIDDEN_IN_EN,
  getFacebookReviewCopy,
} from '../apps/web/src/lib/facebook-review-copy';

const root = join(__dirname, '..');
const SITE = (process.env.APP_URL || 'https://marketingautoaz.com').replace(/\/$/, '');
const API = (process.env.API_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

function gate(label: string, ok: boolean, detail?: string) {
  console.log(`${label} = ${ok ? 'PASS' : 'FAIL'}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  try {
    for (const line of read('.env').split('\n')) {
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

async function fetchProdBundles(): Promise<string> {
  const html = await fetch(`${SITE}/content?tab=channels&lang=en`, {
    headers: { 'User-Agent': 'MarketingAutoAZ-Final-Audit/1.0' },
  }).then((r) => r.text());
  const paths = [...new Set(html.match(/\/_next\/static\/chunks\/[^"']+\.js/g) ?? [])].slice(
    0,
    50,
  );
  let merged = '';
  for (const p of paths) {
    try {
      merged += await fetch(`${SITE}${p}`).then((r) => r.text());
    } catch {
      /* skip */
    }
  }
  return merged;
}

async function main() {
  const env = loadEnv();
  const enCopy = JSON.stringify(getFacebookReviewCopy('en'));
  const rows: string[] = [];

  // --- Static EN copy ---
  const copyPhrases = FACEBOOK_REVIEW_REQUIRED_EN_PHRASES.filter(
    (p) => p !== 'Facebook authorization is not complete. Please reconnect Facebook.',
  );
  const fullEn =
    copyPhrases.every((p) => enCopy.includes(p)) &&
    enCopy.includes('Facebook authorization is not complete. Please reconnect Facebook.') &&
    !/server token|system user|MarketingAutoAZ System/i.test(enCopy);
  gate('FULL_ENGLISH_UI', fullEn, 'facebook-review-copy EN');
  if (!fullEn) {
    rows.push(
      'EN copy | server token / missing phrases | facebook-review-copy.ts | replace wording | EN strings | FAIL',
    );
  }

  gate(
    'NO_SYSTEM_USER',
    !/system user|MarketingAutoAZ System|server token/i.test(enCopy),
    'EN copy only',
  );

  // --- OAuth scope separation (Prompt 3A) ---
  let oauthOut = '';
  try {
    oauthOut = execSync('node scripts/with-root-env.cjs pnpm test:facebook-oauth-flows-audit 2>&1', {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 2_000_000,
    });
  } catch (e) {
    oauthOut = String((e as { stdout?: string }).stdout ?? e);
  }
  const fanpageOAuthNoAds = /FANPAGE_OAUTH_LIVE = PASS/.test(oauthOut);
  const noCrossFlow = /NO_CROSS_FLOW_OVERREQUEST = PASS/.test(oauthOut);
  gate('FANPAGE_OAUTH_NO_ADS', fanpageOAuthNoAds && noCrossFlow, 'oauth flows audit');
  gate('FANPAGE_OAUTH_NO_MESSENGER', noCrossFlow, 'isolated messenger config');

  // --- Live fanpage API ---
  let pagesShowListLive = false;
  let pagePickerLive = false;
  let pageSelectLive = false;
  const email = env.META_REVIEWER_EMAIL || env.E2E_EMAIL;
  const password = env.META_REVIEWER_PASSWORD || env.E2E_PASSWORD;

  if (email && password) {
    try {
      const login = await fetch(`${API}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const { accessToken } = (await login.json()) as { accessToken?: string };
      if (accessToken) {
        const oauthStart = await fetch(`${API}/api/v1/auto-post/facebook/oauth/start`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          redirect: 'manual',
        });
        const loc = oauthStart.headers.get('location') ?? '';
        let oauthUrl = loc;
        if (oauthStart.status === 200) {
          try {
            const body = (await oauthStart.json()) as { url?: string };
            oauthUrl = body.url ?? '';
          } catch {
            /* non-json */
          }
        }
        pagesShowListLive =
          (oauthStart.status === 302 || oauthStart.status === 200) &&
          oauthUrl.includes('config_id=2006772376877449') &&
          !/ads_read|pages_messaging|business_management/.test(oauthUrl);

        const st = await fetch(`${API}/api/v1/auto-post/facebook/status`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const stJson = (await st.json()) as {
          connected?: boolean;
          facebookUserName?: string | null;
          pages?: { id: string; pageName: string }[];
        };
        const hasPages = (stJson.pages?.length ?? 0) > 0;
        const cleanAccount =
          !stJson.facebookUserName ||
          !/system user|MarketingAutoAZ System/i.test(stJson.facebookUserName);
        pagePickerLive = hasPages && cleanAccount;
        pageSelectLive = hasPages && cleanAccount;
      }
    } catch (e) {
      console.log(`LIVE API skip: ${(e as Error).message}`);
    }
  }

  gate('PAGES_SHOW_LIST_LIVE', pagesShowListLive, email ? 'oauth start URL' : 'no creds');
  gate('PAGE_PICKER_LIVE', pagePickerLive, email ? '/facebook/status pages[]' : 'no creds');
  gate('PAGE_SELECT_LIVE', pageSelectLive, email ? 'connected pages' : 'no creds');

  // --- Static UI scan ---
  let enFlowOut = '';
  try {
    enFlowOut = execSync('node scripts/with-root-env.cjs pnpm test:facebook-en-review-flow 2>&1', {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 2_000_000,
    });
  } catch (e) {
    enFlowOut = String((e as { stdout?: string; stderr?: string }).stdout ?? e);
  }
  const enFlowPass = /FACEBOOK_EN_REVIEW_FLOW_READY = PASS/.test(enFlowOut);

  // --- Prod bundle EN ---
  let bundle = '';
  try {
    bundle = await fetchProdBundles();
  } catch (e) {
    console.log(`Bundle fetch: ${(e as Error).message}`);
  }
  const bundleEn =
    bundle.length > 0 &&
    copyPhrases.every((p) => bundle.includes(p)) &&
    !/server token/i.test(bundle);
  gate('FACEBOOK_REGRESSION', bundleEn && enFlowPass, bundle.length ? 'prod chunks + static EN' : 'no bundle');

  console.log('\nISSUE | ROOT_CAUSE | FILE/CONFIG | FIX | AFTER | STATUS');
  const issues = [
    {
      issue: 'System User / server token wording',
      root: 'Legacy env-token labels in EN copy',
      file: 'facebook-review-copy.ts, en.ts fanpage keys',
      fix: 'Connected Facebook Page / user OAuth copy',
      after: 'No server token in EN',
      status: !/server token/i.test(enCopy) ? 'PASS' : 'FAIL',
    },
    {
      issue: 'Vietnamese in EN reviewer UI',
      root: 'Hardcoded VI in schedule/manual/history',
      file: 'auto-post-* panels, content-auto-post-routes',
      fix: 'facebook-review-copy + useFacebookCopy',
      after: '100% EN when ?lang=en',
      status: enFlowPass ? 'PASS' : 'FAIL',
    },
    {
      issue: 'Fanpage OAuth cross-flow scopes',
      root: 'Mixed Login Config scopes',
      file: 'meta-oauth-config.ts, config 2006772376877449',
      fix: '4 fanpage scopes only; separate ads/messenger configs',
      after: 'No ads/messenger on fanpage OAuth URL',
      status: fanpageOAuthNoAds && noCrossFlow ? 'PASS' : 'FAIL',
    },
    {
      issue: 'pages_show_list live flow',
      root: 'OAuth start + /me/accounts page picker',
      file: 'auto-post.controller.ts, auto-post-channels-panel.tsx',
      fix: 'User OAuth → multi Page list → select → Connected',
      after: pagePickerLive ? 'Pages visible' : 'Needs live reconnect',
      status: pagesShowListLive && pagePickerLive ? 'PASS' : 'PENDING',
    },
  ];
  for (const r of issues) {
    console.log(
      `${r.issue} | ${r.root} | ${r.file} | ${r.fix} | ${r.after} | ${r.status}`,
    );
  }

  const videoReady =
    fullEn &&
    enFlowPass &&
    fanpageOAuthNoAds &&
    noCrossFlow &&
    pagesShowListLive &&
    pagePickerLive &&
    bundleEn;
  const metaReady = videoReady && pageSelectLive;

  console.log(`\nPAGES_SHOW_LIST_VIDEO_READY = ${videoReady ? 'PASS' : 'FAIL'}`);
  console.log(`META_APP_REVIEW_READY = ${metaReady ? 'PASS' : 'FAIL'}`);
  process.exit(metaReady ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
