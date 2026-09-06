#!/usr/bin/env node
/**
 * Static gates for Module Overview hub boxes restoration.
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname ?? __dirname, '..');
const WEB_SRC = path.join(ROOT, 'apps/web/src');
const WEB_ROOT = path.join(ROOT, 'apps/web');

function read(rel: string): string {
  return fs.readFileSync(path.join(WEB_SRC, rel), 'utf8');
}

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function pass(label: string) {
  console.log(`${label} = PASS`);
}

async function loadModuleHubs() {
  const mod = await import(
    pathToFileURL(path.join(WEB_ROOT, 'src/config/module-hubs.ts')).href
  );
  return mod.moduleHubs as Array<{ title: string; href: string; features: unknown[] }>;
}

async function main() {
  const moduleHubsSrc = read('config/module-hubs.ts');
  const sidebarSrc = read('components/layout/sidebar.tsx');

  if (!moduleHubsSrc.includes('sidebarNavGroups')) {
    fail('module-hubs must derive from sidebarNavGroups');
  }

  const moduleHubs = await loadModuleHubs();

const expectedParents = [
  { module: 'CRM & Khách hàng', href: '/crm', boxes: 3 },
  { module: 'Content Marketing', href: '/content-marketing', boxes: 9 },
  { module: 'Quảng cáo', href: '/advertising', boxes: 2 },
  { module: 'Tin nhắn & Chatbot', href: '/messaging', boxes: 6 },
  { module: 'Quản Lý Nhân Sự', href: '/hrm', boxes: 8 },
  { module: 'Bán hàng', href: '/sales', boxes: 7 },
  { module: 'Tài chính Spa', href: '/finance-billing', boxes: 4 },
  { module: 'Cài đặt', href: '/settings?tab=overview', boxes: 7 },
];

for (const { module, href, boxes } of expectedParents) {
  const hub = moduleHubs.find((h) => h.title === module);
  if (!hub) fail(`Missing hub definition for ${module}`);
  if (hub.href !== href) fail(`${module}: expected href ${href}, got ${hub.href}`);
  if (hub.features.length !== boxes) {
    fail(`${module}: expected ${boxes} boxes, got ${hub.features.length}`);
  }

  const hubPage =
    href === '/settings?tab=overview'
      ? 'app/(app)/settings/page.tsx'
      : `app/(app)${href.split('?')[0]}/page.tsx`;
  const pagePath = path.join(WEB_SRC, hubPage);
  if (!fs.existsSync(pagePath)) fail(`Missing hub page ${hubPage}`);
  const pageSrc = fs.readFileSync(pagePath, 'utf8');
  if (href === '/settings?tab=overview') {
    if (!pageSrc.includes('ModuleHubRoute') || !pageSrc.includes('hubId="settings"')) {
      fail('settings page missing ModuleHubRoute overview tab');
    }
  } else if (!pageSrc.includes('ModuleHubRoute')) {
    fail(`${hubPage} missing ModuleHubRoute`);
  }

  console.log(
    `${module} | sidebar parent only toggled submenu (no hub navigation) | sidebar.tsx + module-hubs.ts | parent Link → hub + ModuleHubRoute from navigation | ${hub.features.length} | PASS`,
  );
}

if (!sidebarSrc.includes('getModuleHubHref') || !sidebarSrc.includes('href={hubHref}')) {
  fail('sidebar parent row must navigate to module hub');
}
pass('PARENT_CLICK_SHOWS_BOXES');

if (!sidebarSrc.includes('group.items?.map')) {
  fail('sidebar submenu mapping missing');
}
pass('SUBMENU_NAVIGATION');

pass('ALL_PARENT_MODULES');

const hubPageSrc = read('components/module-hub/module-hub-page.tsx');
if (!hubPageSrc.includes('useFacebookReviewLocale') && !hubPageSrc.includes('useT(')) {
  fail('ModuleHubPage must respect VI/EN via useT or useFacebookReviewLocale');
}
pass('VI_EN');

const fbCopy = read('lib/facebook-review-copy.ts');
const fbLocale = read('lib/facebook-review-locale.ts');
if (!fbCopy.includes("'en'") || !fbLocale.includes('persistUiLocale')) {
  fail('Facebook locale/copy modules look broken');
}
pass('FACEBOOK_REGRESSION');

console.log('\nMODULE_OVERVIEW_BOXES_RESTORED = PASS');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
