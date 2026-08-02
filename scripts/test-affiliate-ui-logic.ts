/**
 * node --import tsx scripts/test-affiliate-ui-logic.ts
 */
import {
  calcConversionRate,
  calcTotalEarned,
  canRequestWithdraw,
} from '../apps/web/src/components/affiliate/affiliate-ui-logic';

type Case = { name: string; ok: boolean; detail?: string };
const results: Case[] = [];

function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
}

check('conversion_zero_clicks', calcConversionRate(5, 0) === 0);
check('conversion_50pct', calcConversionRate(1, 2) === 50);
check('conversion_rounding', calcConversionRate(1, 3) === 33.3, String(calcConversionRate(1, 3)));
check(
  'earned_sum',
  calcTotalEarned({
    pendingCommission: 100,
    availableCommission: 200,
    payoutPendingCommission: 50,
    paidCommission: 300,
  }) === 650,
);
check(
  'withdraw_ok',
  canRequestWithdraw({
    status: 'ACTIVE',
    available: 500000,
    minPayout: 500000,
    hasVerifiedBank: true,
    hasOpenPayout: false,
  }),
);
check(
  'withdraw_block_low_balance',
  !canRequestWithdraw({
    status: 'ACTIVE',
    available: 100000,
    minPayout: 500000,
    hasVerifiedBank: true,
    hasOpenPayout: false,
  }),
);
check(
  'withdraw_block_open_payout',
  !canRequestWithdraw({
    status: 'ACTIVE',
    available: 900000,
    minPayout: 500000,
    hasVerifiedBank: true,
    hasOpenPayout: true,
  }),
);
check(
  'withdraw_block_no_bank',
  !canRequestWithdraw({
    status: 'ACTIVE',
    available: 900000,
    minPayout: 500000,
    hasVerifiedBank: false,
    hasOpenPayout: false,
  }),
);

console.log('\n=== Affiliate UI logic ===');
let failed = 0;
for (const c of results) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `  ${c.detail}` : ''}`);
  if (!c.ok) failed += 1;
}
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exit(1);
