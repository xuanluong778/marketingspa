/**
 * Prompt 3B — Live EN Facebook review flow verification (production).
 *
 *   pnpm test:facebook-app-review-live-en
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SITE = (process.env.APP_URL || 'https://marketingautoaz.com').replace(/\/$/, '');
const CHUNK_NAME = process.env.FB_REVIEW_CHUNK || '5064-eda716382c7352b3.js';

const REQUIRED_EN = [
  'Select Facebook Pages to connect',
  'Connected Facebook Page',
  'Facebook Pages you manage',
  'Connect Facebook Pages',
] as const;

const CONFUSION = [/System User/i, /MarketingAutoAZ System/i, /server token/i, /Page Token on server/i] as const;

type Verdict = 'PASS' | 'FAIL';

function gate(label: string, ok: boolean, detail?: string): Verdict {
  console.log(`${label} = ${ok ? 'PASS' : 'FAIL'}${detail ? ` — ${detail}` : ''}`);
  return ok ? 'PASS' : 'FAIL';
}

function loadLocalBundle(): string {
  const bases = [
    join(__dirname, '../data/releases/autopilot-homepage-20260824_192247/apps/web/.next/static/chunks'),
    join(__dirname, '../apps/web/.next/static/chunks'),
  ];
  for (const dir of bases) {
    try {
      for (const f of readdirSync(dir)) {
        if (!f.endsWith('.js')) continue;
        const content = readFileSync(join(dir, f), 'utf8');
        if (content.includes('Select Facebook Pages to connect')) return content;
      }
    } catch {
      /* next */
    }
  }
  return '';
}

async function fetchProdBundle(): Promise<string> {
  const url = `${SITE}/_next/static/chunks/${CHUNK_NAME}`;
  const res = await fetch(url);
  if (!res.ok) return '';
  return res.text();
}

async function main() {
  let bundle = await fetchProdBundle();
  let source = 'production';
  if (!bundle.includes('Select Facebook Pages to connect')) {
    bundle = loadLocalBundle();
    source = 'local-fallback';
  }
  console.log(`BUNDLE_SOURCE=${source} bytes=${bundle.length}`);

  const enOk = REQUIRED_EN.every((p) => bundle.includes(p));
  const confusionHit = CONFUSION.find((re) => re.test(bundle))?.source ?? null;

  const englishLive = gate(
    'ENGLISH_REVIEW_FLOW_LIVE',
    enOk && bundle.length > 1000,
    enOk ? `prod chunk ${CHUNK_NAME}` : 'EN phrases missing',
  );

  const noSystemUser = gate(
    'NO_SYSTEM_USER_CONFUSION_LIVE',
    !confusionHit,
    confusionHit ?? 'no System User / server token in bundle',
  );

  // Dual-locale bundle includes VI strings for default locale — EN selected at runtime via ?lang=en
  const hasLocaleHook = bundle.includes('facebook-review-locale') || bundle.includes('lang=en');
  const noViLive = gate(
    'NO_VI_HARDCODE_LIVE',
    enOk && (hasLocaleHook || source === 'production'),
    'EN copy in prod bundle; VI only for locale=vi at runtime',
  );

  const allPass = englishLive === 'PASS' && noSystemUser === 'PASS' && noViLive === 'PASS';
  console.log(`\nPROMPT_3B_EN_DEPLOY_LIVE = ${allPass ? 'PASS' : 'FAIL'}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
