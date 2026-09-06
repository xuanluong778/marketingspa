/**
 * Sidebar upgrade nav regression checks.
 * Run: node scripts/test-sidebar-upgrade-nav.cjs
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const checks = [];

function record(name, pass, detail = '') {
  checks.push({ name, pass, detail });
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const nav = read('apps/web/src/config/navigation.ts');
const sidebar = read('apps/web/src/components/layout/sidebar.tsx');
const shell = read('apps/web/src/components/layout/app-shell.tsx');

// 1. Removed from Tài chính Spa submenu
const financeBlock = nav.match(/title: 'Tài chính Spa'[\s\S]*?\},/);
record(
  'REMOVED_FROM_FINANCE_SUBMENU',
  financeBlock && !financeBlock[0].includes("href: '/pricing'"),
  financeBlock?.[0].includes('/pricing') ? 'pricing still in finance group' : '',
);

// 2. Upgrade nav export
record(
  'UPGRADE_NAV_EXPORT',
  nav.includes('sidebarUpgradeNav') &&
    nav.includes("title: 'Nâng cấp gói Pro'") &&
    nav.includes("href: '/pricing'"),
);

// 3. No duplicate in sidebarNavGroups items
const pricingInGroups = (nav.match(/sidebarNavGroups[\s\S]*?^];/m)?.[0] || '').split("href: '/pricing'").length - 1;
record('NO_DUPLICATE_IN_GROUPS', pricingInGroups === 0, `count=${pricingInGroups}`);

// 4. Sidebar renders upgrade button
record(
  'SIDEBAR_UPGRADE_BUTTON',
  sidebar.includes('sidebarUpgradeNav') &&
    sidebar.includes('sidebarUpgradeNav.title') &&
    sidebar.includes('bottom-4') &&
    sidebar.includes('left-4'),
);

// 5. Fixed on desktop (lg)
record(
  'DESKTOP_FIXED_POSITION',
  sidebar.includes('lg:fixed') && sidebar.includes('lg:bottom-4') && sidebar.includes('lg:left-4'),
);

// 6. Sidebar width aware
record(
  'SIDEBAR_WIDTH_CALC',
  sidebar.includes('lg:w-[calc(16rem-2rem)]'),
);

// 7. Scroll padding so Cài đặt not hidden
record('SCROLL_PADDING', sidebar.includes('pb-24'));

// 8. Mobile sheet still uses Sidebar
record(
  'MOBILE_SHEET_SIDEBAR',
  shell.includes('SheetContent') && shell.includes('<Sidebar onNavigate'),
);

// 9. Prominent styling
record(
  'PROMINENT_STYLE',
  sidebar.includes('gradient') && sidebar.includes('Crown') === false && sidebar.includes('sidebarUpgradeNav.icon'),
);

// 10. Route unchanged
record('PRICING_ROUTE', nav.includes("sidebarUpgradeNav") && nav.includes("href: '/pricing'"));

console.log('\n=== SIDEBAR UPGRADE NAV TEST ===\n');
let allPass = true;
for (const c of checks) {
  const status = c.pass ? 'PASS' : 'FAIL';
  if (!c.pass) allPass = false;
  console.log(`${c.name} | ${status}${c.detail ? ` | ${c.detail}` : ''}`);
}
console.log(`\nVERDICT: ${allPass ? 'SIDEBAR UPGRADE NAV PASS' : 'SIDEBAR UPGRADE NAV FAIL'}\n`);
process.exit(allPass ? 0 : 1);
