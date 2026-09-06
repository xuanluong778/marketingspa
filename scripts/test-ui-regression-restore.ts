#!/usr/bin/env node
/**
 * Post–Facebook App Review UI regression gates.
 *
 *   pnpm test:ui-regression-restore
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname ?? __dirname, '..');
const WEB_SRC = path.join(ROOT, 'apps/web/src');
const API_SRC = path.join(ROOT, 'apps/api/src');

function read(rel: string, base = WEB_SRC): string {
  return fs.readFileSync(path.join(base, rel), 'utf8');
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

async function main() {
  const navSrc = read('config/navigation.ts');
  const sidebarSrc = read('components/layout/sidebar.tsx');
  const moduleHubsSrc = read('config/module-hubs.ts');

  // --- Marketing Autopilot ---
  const autopilotNav =
    navSrc.includes("title: 'Marketing Autopilot'") &&
    navSrc.includes("href: '/marketing-autopilot'") &&
    fs.existsSync(path.join(WEB_SRC, 'app/(app)/marketing-autopilot/page.tsx')) &&
    fs.existsSync(path.join(API_SRC, 'marketing-autopilot/marketing-autopilot.module.ts'));
  gate('AUTOPILOT_RESTORED', autopilotNav);
  rows.push(
    `Marketing Autopilot tab | removed from navigation.ts during non-Facebook sync | navigation.ts + marketing-autopilot/* | dec2947 / release snapshot | re-add sidebar entry + restore module files | ${autopilotNav ? 'PASS' : 'FAIL'}`,
  );

  // --- Sidebar ---
  const sidebarOk =
    sidebarSrc.includes('sidebarNavGroups') &&
    sidebarSrc.includes('getModuleHubHref') &&
    navSrc.includes('CRM & Khách hàng') &&
    navSrc.includes('Content Marketing') &&
    navSrc.includes('Tin nhắn & Chatbot') &&
    navSrc.includes('Quản Lý Nhân Sự') &&
    navSrc.includes('Tài chính Spa') &&
    navSrc.includes('Email Marketing') &&
    navSrc.includes('Zalo Marketing');
  gate('SIDEBAR_RESTORED', sidebarOk);
  rows.push(
    `Sidebar / submenu | partial nav sync dropped groups/items | navigation.ts + sidebar.tsx | pre-Facebook navigation | restore full sidebarNavGroups | ${sidebarOk ? 'PASS' : 'FAIL'}`,
  );

  // --- Module Overview boxes ---
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
    `Module Overview boxes | hub routes + ModuleHubRoute intact | module-hubs.ts + hub pages | release baseline | derive hubs from sidebarNavGroups | ${moduleOverviewOk ? 'PASS' : 'FAIL'}`,
  );

  // --- Routes ---
  const hubRoutes = [
    '/crm',
    '/content-marketing',
    '/advertising',
    '/messaging',
    '/hrm',
    '/finance-billing',
  ];
  const routesOk = hubRoutes.every((r) =>
    fs.existsSync(path.join(WEB_SRC, `app/(app)${r}/page.tsx`)),
  );
  gate('ROUTES_REGRESSION', routesOk);
  rows.push(
    `Module hub routes | missing hub pages | app/(app)/*/page.tsx | release | verify all hub routes exist | ${routesOk ? 'PASS' : 'FAIL'}`,
  );

  // --- VI/EN ---
  const enDict = read('i18n/dictionaries/en.ts');
  const viDict = read('i18n/dictionaries/vi.ts');
  const hubPage = read('components/module-hub/module-hub-page.tsx');
  const viEnOk =
    enDict.includes('nav:') &&
    viDict.includes('nav:') &&
    enDict.includes('marketingAutopilot') &&
    (hubPage.includes('useT(') || hubPage.includes('useFacebookReviewLocale'));
  gate('VI_EN_REGRESSION', viEnOk);
  rows.push(
    `VI/EN i18n | mixed hardcoded VI in hub/nav | nav-i18n.ts + dictionaries | global i18n wiring | useT() + navLabel keys | ${viEnOk ? 'PASS' : 'FAIL'}`,
  );

  // --- Facebook fixes preserved (static/code gates; live Meta state may vary) ---
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
  gate('FACEBOOK_REVIEW_FIXES_PRESERVED', fbOk);
  rows.push(
    `Facebook App Review fixes | N/A (must not regress) | facebook-review-copy.ts + oauth flows | prior PASS audit | keep OAuth scopes + EN copy | ${fbOk ? 'PASS' : 'FAIL'}`,
  );

  console.log('\nREGRESSION | ROOT_CAUSE | FILE | RESTORED_FROM | FIX | STATUS');
  for (const row of rows) {
    console.log(row);
  }

  const allPass =
    autopilotNav && sidebarOk && moduleOverviewOk && routesOk && viEnOk && fbOk;
  if (!allPass) {
    fail('One or more regression gates failed');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
