#!/usr/bin/env node
/**
 * Verify full sidebar tabs/submenus restored (pre–Facebook App Review baseline).
 *
 *   pnpm test:all-sidebar-tabs-restore
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname ?? __dirname, '..');
const WEB_SRC = path.join(ROOT, 'apps/web/src');

function read(rel: string): string {
  return fs.readFileSync(path.join(WEB_SRC, rel), 'utf8');
}

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function gate(label: string, ok: boolean, detail?: string) {
  console.log(`${label} = ${ok ? 'PASS' : 'FAIL'}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

const rows: string[] = [];

/** Expected sidebar leaf hrefs from dca44ed + post-baseline additions */
const EXPECTED_LEAF_HREFS = [
  '/overview',
  '/marketing-autopilot',
  '/customers',
  '/leads',
  '/funnel',
  '/appointments',
  '/content?tab=create&section=ad',
  '/content?tab=create&section=personal',
  '/content?tab=create&section=facebook-check',
  '/content?tab=create&section=video-transcript',
  '/content?tab=library',
  '/content?tab=auto-post',
  '/content?tab=schedule',
  '/content?tab=channels',
  '/teleprompter',
  '/ads',
  '/attribution',
  '/automation?tab=campaigns',
  '/automation?tab=audience',
  '/automation?tab=flows',
  '/chatbot-cskh',
  '/email-marketing',
  '/zalo-marketing',
  '/hrm/employees',
  '/hrm/shifts',
  '/hrm/attendance',
  '/hrm/leave',
  '/work-management',
  '/work-management/my',
  '/work-management/dashboard',
  '/work-management/calendar',
  '/sales/orders',
  '/sales/products',
  '/sales/inventory',
  '/sales/stock-movements',
  '/sales/stocktake',
  '/sales/purchases',
  '/sales/reports',
  '/finance',
  '/business-goals',
  '/affiliate',
  '/credits',
  '/reports',
  '/settings?tab=account',
  '/settings?tab=language',
  '/settings?tab=knowledge',
  '/settings?tab=connections',
  '/settings?tab=api',
  '/settings?tab=system',
  '/settings?tab=assignment',
];

const HUB_ROUTES = [
  '/crm',
  '/content-marketing',
  '/advertising',
  '/messaging',
  '/hrm',
  '/sales',
  '/finance-billing',
];

async function main() {
  const navSrc = read('config/navigation.ts');

  const allTabsOk =
    navSrc.includes("title: 'Marketing Autopilot'") &&
    navSrc.includes("title: 'Bán hàng'") &&
    navSrc.includes("href: '/sales'") &&
    navSrc.includes('Email Marketing') &&
    navSrc.includes('Zalo Marketing') &&
    navSrc.includes('Việc của tôi');
  gate('ALL_SIDEBAR_TABS_RESTORED', allTabsOk);
  rows.push(
    `Sales (Bán hàng) | dropped during non-Facebook sync | navigation.ts | dca44ed backup | restore group + 7 sub-items | ${allTabsOk ? 'PASS' : 'FAIL'}`,
  );

  const contentTabs = [
    'tab=create&section=ad',
    'tab=create&section=personal',
    'tab=create&section=facebook-check',
    'tab=create&section=video-transcript',
    'tab=library',
    'tab=auto-post',
    'tab=schedule',
    'tab=channels',
  ];
  const missingContent = contentTabs.filter((t) => !navSrc.includes(t));
  const missingHrefs = EXPECTED_LEAF_HREFS.filter(
    (h) => !h.startsWith('/content?') && !navSrc.includes(`href: '${h}'`),
  );
  const submenusOk = missingHrefs.length === 0 && missingContent.length === 0;
  gate(
    'ALL_SUBMENUS_RESTORED',
    submenusOk,
    [...missingHrefs, ...missingContent.map((t) => `/content?${t}`)].length
      ? `missing: ${[...missingHrefs, ...missingContent.map((t) => `/content?${t}`)].join(', ')}`
      : undefined,
  );
  rows.push(
    `Submenu hrefs | partial nav sync | navigation.ts | dca44ed + i18n baseline | restore all leaf hrefs | ${submenusOk ? 'PASS' : 'FAIL'}`,
  );

  const routesOk = HUB_ROUTES.every((r) =>
    fs.existsSync(path.join(WEB_SRC, `app/(app)${r}/page.tsx`)),
  ) &&
    fs.existsSync(path.join(WEB_SRC, 'app/(app)/marketing-autopilot/page.tsx')) &&
    fs.existsSync(path.join(WEB_SRC, 'app/(app)/sales/orders/page.tsx'));
  gate('ALL_ROUTES_WORKING', routesOk);
  rows.push(
    `Hub + feature routes | sales pages missing | app/(app)/*/page.tsx | release snapshot | copy sales module routes | ${routesOk ? 'PASS' : 'FAIL'}`,
  );

  let moduleOverviewOk = false;
  try {
    execSync('node scripts/with-root-env.cjs pnpm test:module-overview-boxes 2>&1', {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    moduleOverviewOk = true;
  } catch {
    moduleOverviewOk = false;
  }
  gate('MODULE_OVERVIEW_RESTORED', moduleOverviewOk);
  rows.push(
    `Module Overview | sales hub not registered | module-hubs.ts | dca44ed | add Bán hàng hub (7 boxes) | ${moduleOverviewOk ? 'PASS' : 'FAIL'}`,
  );

  const autopilotOk =
    navSrc.includes('/marketing-autopilot') &&
    fs.existsSync(path.join(WEB_SRC, 'app/(app)/marketing-autopilot/page.tsx'));
  gate('MARKETING_AUTOPILOT_PRESERVED', autopilotOk);
  rows.push(
    `Marketing Autopilot | prior restore | navigation.ts | dec2947 | keep tab + route | ${autopilotOk ? 'PASS' : 'FAIL'}`,
  );

  let fbOk = false;
  let fbOut = '';
  try {
    fbOut = execSync('node scripts/with-root-env.cjs pnpm test:facebook-app-review-final 2>&1', {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 4_000_000,
    });
  } catch (e) {
    fbOut = String((e as { stdout?: string }).stdout ?? e);
  }
  const fbStaticGates = [
    'FULL_ENGLISH_UI = PASS',
    'NO_SYSTEM_USER = PASS',
    'FANPAGE_OAUTH_NO_ADS = PASS',
    'FACEBOOK_REGRESSION = PASS',
  ];
  fbOk = fbStaticGates.every((g) => fbOut.includes(g));
  gate('FACEBOOK_FIXES_PRESERVED', fbOk);
  rows.push(
    `Facebook OAuth/App Review | must not regress | facebook-review-copy.ts | prior PASS | static EN + scope gates | ${fbOk ? 'PASS' : 'FAIL'}`,
  );

  console.log('\nMISSING_TAB | ROOT_CAUSE | FILE | RESTORED_FROM | FIX | STATUS');
  for (const row of rows) {
    console.log(row);
  }

  const allPass =
    allTabsOk && submenusOk && routesOk && moduleOverviewOk && autopilotOk && fbOk;
  if (!allPass) fail('One or more sidebar restore gates failed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
