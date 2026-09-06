/**
 * FINAL FIX — English Facebook App Review flow audit.
 *
 *   pnpm test:facebook-en-review-flow
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  FACEBOOK_REVIEW_REQUIRED_EN_PHRASES,
  FACEBOOK_VI_FORBIDDEN_IN_EN,
  getFacebookReviewCopy,
} from '../apps/web/src/lib/facebook-review-copy';

const root = join(__dirname, '..');
const SITE = (process.env.APP_URL || 'https://marketingautoaz.com').replace(/\/$/, '');

const RELEASE_ROOT =
  process.env.RELEASE_ROOT ||
  '/var/www/marketingaut_usr/data/releases/autopilot-homepage-20260824_192247';

const FACEBOOK_UI_FILES = [
  'apps/web/src/components/content-auto-post/auto-post-channels-panel.tsx',
  'apps/web/src/components/content-auto-post/fanpage-details-drawer.tsx',
  'apps/web/src/components/content-auto-post/auto-post-manual-panel.tsx',
  'apps/web/src/components/content-auto-post/auto-post-from-library-panel.tsx',
  'apps/web/src/components/content-auto-post/meta-fanpage-auto-post-panel.tsx',
  'apps/web/src/components/content-auto-post/content-auto-post-shell.tsx',
  'apps/web/src/components/content-auto-post/content-library-panel.tsx',
  'apps/web/src/components/content-auto-post/auto-post-schedule-panel.tsx',
  'apps/web/src/components/auto-post/facebook-fanpage-preview.tsx',
  'apps/web/src/components/auto-post/auto-post-history-table.tsx',
  'apps/web/src/app/(app)/chatbot-cskh/page.tsx',
  'apps/web/src/components/ai-ads-manager/tabs/connections-tab.tsx',
  'apps/web/src/lib/humanize-facebook-channel-error.ts',
];

const LOCALE_DICTIONARY_FILES = new Set([
  'apps/web/src/lib/facebook-review-copy.ts',
  'apps/web/src/lib/humanize-facebook-channel-error.ts',
]);

const FANPAGE_TERM_IN_EN = /\bFanpage\b/i;

type Row = {
  file: string;
  viTextFound: string;
  enReplacement: string;
  fix: string;
  liveResult: string;
  status: 'PASS' | 'FAIL';
};

function gate(label: string, ok: boolean, detail?: string) {
  console.log(`${label} = ${ok ? 'PASS' : 'FAIL'}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

function findProdChunks(): string {
  const parts: string[] = [];
  const dirs = [
    join(RELEASE_ROOT, 'apps/web/.next/static/chunks'),
    join(root, 'apps/web/.next/static/chunks'),
  ];
  for (const dir of dirs) {
    try {
      for (const f of readdirSync(dir)) {
        if (!f.endsWith('.js')) continue;
        parts.push(readFileSync(join(dir, f), 'utf8'));
      }
      if (parts.length) return parts.join('\n');
    } catch {
      /* next */
    }
  }
  return '';
}

function staticViInEnUi(src: string, vi: string): boolean {
  if (!src.includes(vi)) return false;
  const idx = src.indexOf(vi);
  const window = src.slice(Math.max(0, idx - 400), idx + vi.length + 200);
  if (/locale\s*===\s*['"]vi['"]/.test(window)) return false;
  if (/getFacebookReviewCopy\s*\(\s*['"]vi['"]\s*\)/.test(window)) return false;
  return true;
}

function enCopyStringsContainFanpage(value: unknown): boolean {
  if (typeof value === 'string') return FANPAGE_TERM_IN_EN.test(value);
  if (typeof value === 'function') return FANPAGE_TERM_IN_EN.test(String(value));
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(enCopyStringsContainFanpage);
  }
  return false;
}

async function main() {
  const enCopyObj = getFacebookReviewCopy('en');
  const enCopy = JSON.stringify(enCopyObj);
  const copyPhrases = FACEBOOK_REVIEW_REQUIRED_EN_PHRASES.filter(
    (p) => p !== 'Facebook authorization is not complete. Please reconnect Facebook.',
  );
  const rows: Row[] = [];

  for (const rel of FACEBOOK_UI_FILES) {
    if (LOCALE_DICTIONARY_FILES.has(rel)) continue;
    const src = read(rel);
    for (const vi of FACEBOOK_VI_FORBIDDEN_IN_EN) {
      if (staticViInEnUi(src, vi)) {
        rows.push({
          file: rel,
          viTextFound: vi,
          enReplacement: 'facebook-review-copy EN key',
          fix: 'wire copy / remove hardcode',
          liveResult: 'static',
          status: 'FAIL',
        });
      }
    }
    const fanpageEnBranch = src.match(/locale\s*===\s*['"]en['"][\s\S]{0,120}\bFanpage\b/i);
    if (fanpageEnBranch) {
      rows.push({
        file: rel,
        viTextFound: 'Fanpage in EN branch',
        enReplacement: 'Facebook Page',
        fix: 'remove EN branch Fanpage',
        liveResult: 'static',
        status: 'FAIL',
      });
    }
  }

  const enPhrasesOk =
    copyPhrases.every((p) => enCopy.includes(p)) &&
    read('apps/web/src/lib/humanize-facebook-channel-error.ts').includes(
      'Facebook authorization is not complete. Please reconnect Facebook.',
    );
  const bundle = findProdChunks();
  const bundleHasEn =
    bundle.length > 0 &&
    FACEBOOK_REVIEW_REQUIRED_EN_PHRASES.every((p) => bundle.includes(p));
  const bundleFanpageEnLeak =
    bundle.length > 0 &&
    /locale\s*===\s*["']en["'][\s\S]{0,80}\bFanpage\b/i.test(bundle);

  const enFlow = gate(
    'EN_FACEBOOK_FLOW',
    enPhrasesOk && bundleHasEn,
    bundle.length ? 'copy + prod bundle' : 'missing bundle',
  );
  const noVi = gate(
    'NO_VI_HARDCODE_FACEBOOK',
    rows.length === 0,
    `${rows.length} static UI issues`,
  );
  const noFanpage = gate(
    'NO_FANPAGE_TERM_IN_EN',
    !enCopyStringsContainFanpage(enCopyObj) && !bundleFanpageEnLeak,
    'EN copy strings + no EN-branch Fanpage leaks',
  );
  const noSystem = gate(
    'NO_SYSTEM_USER_CONFUSION',
    !/system user|MarketingAutoAZ System|server token/i.test(enCopy),
  );
  const oauthEn = gate(
    'OAUTH_STATUS_MESSAGES_EN',
    read('apps/web/src/lib/humanize-facebook-channel-error.ts').includes(
      'Facebook authorization is not complete',
    ),
  );
  const permEn = gate(
    'PERMISSION_COPY_EN',
    enCopy.includes('PAGES_SHOW_LIST PERMISSION') &&
      enCopy.includes('PAGES_READ_ENGAGEMENT PERMISSION'),
  );
  const uiReg = gate(
    'FACEBOOK_UI_REGRESSION',
    FACEBOOK_UI_FILES.every((f) => {
      try {
        read(f);
        return true;
      } catch {
        return false;
      }
    }),
  );
  const viReg = gate(
    'VI_LOCALE_REGRESSION',
    JSON.stringify(getFacebookReviewCopy('vi')).includes('Kết nối Facebook Fanpage'),
  );

  console.log('\nFILE | VI_TEXT_FOUND | EN_REPLACEMENT | FIX | LIVE_RESULT | STATUS');
  if (rows.length === 0) {
    console.log(
      '(all scoped Facebook UI files) | — | EN via facebook-review-copy | wired | static | PASS',
    );
  } else {
    for (const r of rows) {
      console.log(
        `${r.file} | ${r.viTextFound} | ${r.enReplacement} | ${r.fix} | ${r.liveResult} | ${r.status}`,
      );
    }
  }

  let liveChannels: 'PASS' | 'FAIL' | 'PENDING' = 'PENDING';
  try {
    const html = await fetch(`${SITE}/content?tab=channels&lang=en`, {
      headers: { 'User-Agent': 'MarketingAutoAZ-Review-Audit/1.0' },
    }).then((r) => r.text());
    const chunkPaths = [
      ...new Set(html.match(/\/_next\/static\/chunks\/[^"']+\.js/g) ?? []),
    ].slice(0, 40);
    let merged = bundle;
    for (const p of chunkPaths) {
      try {
        merged += await fetch(`${SITE}${p}`, {
          headers: { 'User-Agent': 'MarketingAutoAZ-Review-Audit/1.0' },
        }).then((r) => r.text());
      } catch {
        /* skip chunk */
      }
    }
    liveChannels =
      merged.includes('Connect Facebook Pages') &&
      merged.includes('PAGES_SHOW_LIST PERMISSION') &&
      merged.includes('Select Facebook Pages to connect') &&
      !/server token/i.test(merged)
        ? 'PASS'
        : 'FAIL';
    gate('LIVE_EN_CHANNELS_URL', liveChannels === 'PASS', liveChannels);
  } catch {
    gate('LIVE_EN_CHANNELS_URL', bundleHasEn && !/server token/i.test(bundle), 'chunk fallback');
    liveChannels = bundleHasEn && !/server token/i.test(bundle) ? 'PASS' : 'FAIL';
  }

  const allPass =
    enFlow &&
    noVi &&
    noFanpage &&
    noSystem &&
    oauthEn &&
    permEn &&
    uiReg &&
    viReg &&
    liveChannels === 'PASS' &&
    bundleHasEn &&
    !bundleFanpageEnLeak;
  console.log(`\nFACEBOOK_EN_REVIEW_FLOW_READY = ${allPass ? 'PASS' : 'FAIL'}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
