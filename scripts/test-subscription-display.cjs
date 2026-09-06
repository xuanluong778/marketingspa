/**
 * Subscription display logic — FREE / TRIAL / ADMIN_GIFT / PRO_6M / PRO_12M
 * Run: node scripts/test-subscription-display.cjs
 */
const {
  buildSubscriptionDisplay,
  computeRemainingDays,
  computePaidPeriodEndFromOrders,
  resolveEffectiveExpiresAt,
  SUBSCRIPTION_PLAN_CODES,
} = require('../packages/shared/dist/subscription-display');

const MS_DAY = 86_400_000;
const now = Date.parse('2026-08-24T00:00:00.000Z');

function isoPlusDays(days) {
  return new Date(now + days * MS_DAY).toISOString();
}

function isoPlusMonths(months) {
  const d = new Date(now);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

const checks = [];

function record(name, pass, detail = '') {
  checks.push({ name, pass, detail });
}

// --- Unit: remaining days = expiresAt - now ---
record(
  'REMAINING_DAYS_FORMULA',
  computeRemainingDays(isoPlusDays(365), now) === 365,
  `got ${computeRemainingDays(isoPlusDays(365), now)}`,
);

// --- Corrupt 3266 days on paid 6m → clamp to paid chain ---
const paid6End = new Date(isoPlusMonths(6));
const corruptEnd = new Date(now + 3266 * MS_DAY);
const effective = resolveEffectiveExpiresAt({
  rawExpiresAt: corruptEnd,
  paidPeriodEnd: paid6End,
  periodSource: 'PAYMENT',
});
record(
  'CLAMP_CORRUPT_PAID_6M',
  effective.getTime() === paid6End.getTime() &&
    computeRemainingDays(effective, now) <= 190,
  `days=${computeRemainingDays(effective, now)}`,
);

// --- Paid chain from orders ---
const chainEnd = computePaidPeriodEndFromOrders([
  { paidAt: new Date(now), durationMonths: 6 },
]);
record(
  'PAID_CHAIN_6M',
  chainEnd && computeRemainingDays(chainEnd, now) >= 180 && computeRemainingDays(chainEnd, now) <= 190,
  chainEnd ? String(computeRemainingDays(chainEnd, now)) : 'null',
);

// --- Case: FREE ---
const free = buildSubscriptionDisplay({
  status: 'NONE',
  planCode: null,
  durationMonths: null,
  rawExpiresAt: null,
  now,
});
record(
  'FREE',
  free.tier === 'FREE' &&
    free.upgradeButton?.show &&
    free.upgradeButton.label === 'Nâng cấp gói Pro',
);

// --- Case: TRIAL ---
const trial = buildSubscriptionDisplay({
  status: 'TRIALING',
  planCode: SUBSCRIPTION_PLAN_CODES.TRIAL,
  durationMonths: 0,
  rawExpiresAt: isoPlusDays(3),
  now,
});
record(
  'TRIAL',
  trial.tier === 'TRIAL' &&
    trial.remainingDays === 3 &&
    trial.upgradeButton?.label === 'Nâng cấp gói Pro',
);

// --- Case: ADMIN_GIFT (pro plan, no payment) ---
const adminGift = buildSubscriptionDisplay({
  status: 'ACTIVE',
  planCode: SUBSCRIPTION_PLAN_CODES.PRO_6M,
  durationMonths: 6,
  rawExpiresAt: isoPlusDays(30),
  paidPeriodEnd: null,
  now,
});
record(
  'ADMIN_GIFT',
  adminGift.tier === 'ADMIN_GIFT' &&
    adminGift.periodSource === 'ADMIN_GIFT' &&
    adminGift.upgradeButton?.label === 'Nâng cấp gói Pro',
);

// --- Case: PRO_6M paid ---
const pro6PaidEnd = isoPlusMonths(6);
const pro6 = buildSubscriptionDisplay({
  status: 'ACTIVE',
  planCode: SUBSCRIPTION_PLAN_CODES.PRO_6M,
  durationMonths: 6,
  rawExpiresAt: pro6PaidEnd,
  paidPeriodEnd: pro6PaidEnd,
  now,
});
record(
  'PRO_6_MONTHS',
  pro6.tier === 'PRO_6M' &&
    pro6.remainingDays >= 180 &&
    pro6.remainingDays <= 190 &&
    pro6.upgradeButton?.label === 'Nâng cấp lên 12 tháng' &&
    pro6.upgradeButton.href.includes('msp-pro-12m'),
  `days=${pro6.remainingDays} label=${pro6.upgradeButton?.label}`,
);

// --- Case: PRO_12M paid ---
const pro12PaidEnd = isoPlusMonths(12);
const pro12 = buildSubscriptionDisplay({
  status: 'ACTIVE',
  planCode: SUBSCRIPTION_PLAN_CODES.PRO_12M,
  durationMonths: 12,
  rawExpiresAt: pro12PaidEnd,
  paidPeriodEnd: pro12PaidEnd,
  now,
});
record(
  'PRO_12_MONTHS',
  pro12.tier === 'PRO_12M' &&
    pro12.remainingDays >= 365 &&
    pro12.remainingDays <= 370 &&
    pro12.upgradeButton?.show === false &&
    pro12.planLabel === 'Gói hiện tại 12 tháng',
  `days=${pro12.remainingDays}`,
);

// --- API wiring ---
const billingSrc = require('fs').readFileSync(
  require('path').join(__dirname, '../apps/api/src/billing/billing.service.ts'),
  'utf8',
);
record(
  'API_DISPLAY_FIELD',
  billingSrc.includes('buildSubscriptionDisplay') && billingSrc.includes('display,'),
);
record(
  'API_PAID_PERIOD_END',
  billingSrc.includes('computePaidPeriodEndForOrg'),
);

// --- UI wiring ---
const headerSrc = require('fs').readFileSync(
  require('path').join(__dirname, '../apps/web/src/components/layout/header-subscription-chips.tsx'),
  'utf8',
);
const sidebarSrc = require('fs').readFileSync(
  require('path').join(__dirname, '../apps/web/src/components/layout/sidebar.tsx'),
  'utf8',
);
record('UI_HEADER_USES_DISPLAY', headerSrc.includes('useSubscriptionDisplay'));
record('UI_SIDEBAR_USES_DISPLAY', sidebarSrc.includes('useSubscriptionDisplay'));

console.log('\n=== SUBSCRIPTION DISPLAY TEST ===\n');
let allPass = true;
for (const c of checks) {
  const status = c.pass ? 'PASS' : 'FAIL';
  if (!c.pass) allPass = false;
  console.log(`${c.name} | ${status}${c.detail ? ` | ${c.detail}` : ''}`);
}
console.log(`\nVERDICT: ${allPass ? 'SUBSCRIPTION DISPLAY PASS' : 'SUBSCRIPTION DISPLAY FAIL'}\n`);
process.exit(allPass ? 0 : 1);
