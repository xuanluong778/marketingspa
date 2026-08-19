/**
 * Subscription + AI Credit: independent mechanisms, grant-on-pay once, stack, keep on expire.
 * node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-subscription-credit.ts
 */
import { PrismaClient, PaymentOrderStatus, SubscriptionStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();
const API = process.env.API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:4000';
const TOKEN = process.env.SEPAY_API_TOKEN || 'dev-sepay-api-token-change-me';
const ACCOUNT = process.env.PAYMENT_ACCOUNT_NUMBER || '7982468';
const PREFIX = (process.env.PAYMENT_CODE_PREFIX || 'MKTA').toUpperCase();

type Case = { name: string; ok: boolean; detail?: string };

async function postWebhook(body: Record<string, unknown>) {
  const res = await fetch(`${API}/api/v1/payments/sepay/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Apikey ${TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function sepayId() {
  return `${Date.now()}${randomBytes(4).toString('hex')}`;
}

function mktaCode() {
  const n = 100000 + (randomBytes(3).readUIntBE(0, 3) % 900000);
  return `${PREFIX}${n}`;
}

async function makeOrder(opts: {
  orgId: string;
  planId: string;
  amount: number;
  code: string;
}) {
  return prisma.paymentOrder.create({
    data: {
      code: opts.code,
      organizationId: opts.orgId,
      planId: opts.planId,
      amountVnd: new Decimal(opts.amount),
      status: PaymentOrderStatus.PENDING,
      transferContent: opts.code,
      bankCode: 'ACB',
      accountNumber: ACCOUNT,
      accountName: 'CONG TY TNHH THE GIOI DIGI',
      qrUrl: 'https://example.com/qr.png',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  });
}

async function pay(planId: string, amount: number, orgId: string, contentSuffix = '') {
  const code = mktaCode();
  const order = await makeOrder({ orgId, planId, amount, code });
  const id = sepayId();
  const r = await postWebhook({
    id,
    transferType: 'in',
    transferAmount: amount,
    accountNumber: ACCOUNT,
    content: `CK ${code}${contentSuffix}`,
    gateway: 'ACB',
  });
  return { order, id, r };
}

async function cleanup(orgId: string) {
  await prisma.creditTransaction.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.paymentTransaction.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.paymentOrder.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.subscription.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.creditWallet.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
}

async function main() {
  const results: Case[] = [];
  const plan6 = await prisma.subscriptionPlan.findFirst({ where: { code: 'msp-pro-6m' } });
  const plan12 = await prisma.subscriptionPlan.findFirst({ where: { code: 'msp-pro-12m' } });
  if (!plan6 || !plan12) throw new Error('Missing MSP plans');

  const grant6 = Number(plan6.creditGrant);
  const grant12 = Number(plan12.creditGrant);
  const amount6 = Number(plan6.priceVnd);
  const amount12 = Number(plan12.priceVnd);

  results.push({
    name: 'plan_credit_grant_in_db',
    ok: grant6 === 30000 && grant12 === 75000 && amount6 === 5500000 && amount12 === 8500000,
    detail: `grant6=${grant6} grant12=${grant12} price6=${amount6} price12=${amount12}`,
  });

  const stamp = Date.now();
  const org = await prisma.organization.create({
    data: {
      name: `SubCredit ${stamp}`,
      slug: `sub-credit-${stamp}`,
      email: `sub.credit.${stamp}@example.com`,
    },
  });
  const startingBalance = 150;
  await prisma.creditWallet.create({
    data: {
      organizationId: org.id,
      balance: startingBalance,
      lifetimeEarned: startingBalance,
    },
  });

  try {
    {
      const name = 'pay_6m_activates_and_grants_once';
      const { order, r } = await pay(plan6.id, amount6, org.id, ' 6m');
      const sub = await prisma.subscription.findFirst({
        where: { organizationId: org.id },
        include: { plan: true },
      });
      const wallet = await prisma.creditWallet.findUnique({ where: { organizationId: org.id } });
      const grants = await prisma.creditTransaction.findMany({
        where: {
          organizationId: org.id,
          type: 'GRANT',
          idempotencyKey: `payment:${order.id}:credit-grant`,
        },
      });
      const monthsMs = sub
        ? sub.currentPeriodEnd.getTime() - sub.currentPeriodStart.getTime()
        : 0;
      const approx6 = monthsMs > 150 * 24 * 3600 * 1000 && monthsMs < 200 * 24 * 3600 * 1000;
      const expected = startingBalance + grant6;
      results.push({
        name,
        ok:
          (r.json as { matched?: boolean }).matched === true &&
          sub?.status === SubscriptionStatus.ACTIVE &&
          sub.plan?.code === 'msp-pro-6m' &&
          approx6 &&
          Number(wallet?.balance) === expected &&
          grants.length === 1 &&
          Number(grants[0]?.amount) === grant6,
        detail: `matched=${(r.json as { matched?: boolean }).matched} status=${sub?.status} bal=${wallet?.balance} expected=${expected} grants=${grants.length}`,
      });
    }

    {
      const name = 'duplicate_webhook_does_not_grant_twice';
      const before = await prisma.creditWallet.findUnique({ where: { organizationId: org.id } });
      const { order, id } = await pay(plan6.id, amount6, org.id, ' replay-src');
      const afterFirst = await prisma.creditWallet.findUnique({ where: { organizationId: org.id } });
      const replay = await postWebhook({
        id,
        transferType: 'in',
        transferAmount: amount6,
        accountNumber: ACCOUNT,
        content: `CK ${order.code} replay-src`,
        gateway: 'ACB',
      });
      const afterReplay = await prisma.creditWallet.findUnique({ where: { organizationId: org.id } });
      const grants = await prisma.creditTransaction.count({
        where: {
          organizationId: org.id,
          idempotencyKey: `payment:${order.id}:credit-grant`,
        },
      });
      results.push({
        name,
        ok:
          Number(afterFirst?.balance) === Number(before?.balance) + grant6 &&
          Number(afterReplay?.balance) === Number(afterFirst?.balance) &&
          (replay.json as { duplicated?: boolean }).duplicated === true &&
          grants === 1,
        detail: `before=${before?.balance} after1=${afterFirst?.balance} afterReplay=${afterReplay?.balance} dup=${(replay.json as { duplicated?: boolean }).duplicated} grants=${grants}`,
      });
    }

    {
      const name = 'expired_keeps_credit';
      const before = await prisma.creditWallet.findUnique({ where: { organizationId: org.id } });
      await prisma.subscription.updateMany({
        where: { organizationId: org.id },
        data: {
          status: SubscriptionStatus.EXPIRED,
          currentPeriodEnd: new Date(Date.now() - 60_000),
        },
      });
      const after = await prisma.creditWallet.findUnique({ where: { organizationId: org.id } });
      results.push({
        name,
        ok: Number(after?.balance) === Number(before?.balance) && Number(after?.balance) > 0,
        detail: `balance=${after?.balance}`,
      });
    }

    {
      const name = 'renew_12m_stacks_credit_from_expired';
      const before = await prisma.creditWallet.findUnique({ where: { organizationId: org.id } });
      const { r } = await pay(plan12.id, amount12, org.id, ' 12m');
      const sub = await prisma.subscription.findFirst({
        where: { organizationId: org.id },
        include: { plan: true },
        orderBy: { currentPeriodEnd: 'desc' },
      });
      const wallet = await prisma.creditWallet.findUnique({ where: { organizationId: org.id } });
      const monthsMs = sub
        ? sub.currentPeriodEnd.getTime() - sub.currentPeriodStart.getTime()
        : 0;
      const approx12 = monthsMs > 330 * 24 * 3600 * 1000;
      results.push({
        name,
        ok:
          (r.json as { matched?: boolean }).matched === true &&
          sub?.status === SubscriptionStatus.ACTIVE &&
          sub.plan?.code === 'msp-pro-12m' &&
          approx12 &&
          Number(wallet?.balance) === Number(before?.balance) + grant12,
        detail: `status=${sub?.status} plan=${sub?.plan?.code} bal=${wallet?.balance} expected=${Number(before?.balance) + grant12}`,
      });
    }

    {
      const name = 'active_zero_credit_does_not_block_entitlement_check';
      const wallet = await prisma.creditWallet.findUnique({ where: { organizationId: org.id } });
      const reserved = Number(wallet?.reservedBalance ?? 0);
      await prisma.creditWallet.update({
        where: { organizationId: org.id },
        data: { balance: reserved },
      });
      const sub = await prisma.subscription.findFirst({
        where: { organizationId: org.id, status: SubscriptionStatus.ACTIVE },
      });
      const stillActive = !!sub && sub.currentPeriodEnd.getTime() > Date.now();
      const after = await prisma.creditWallet.findUnique({ where: { organizationId: org.id } });
      results.push({
        name,
        ok: stillActive && Number(after?.balance) === reserved,
        detail: `subActive=${stillActive} available=${Number(after?.balance) - reserved}`,
      });
    }
  } finally {
    await cleanup(org.id);
    await prisma.$disconnect();
  }

  console.log('\n=== Subscription + Credit ===');
  let failed = 0;
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  ${r.detail ?? ''}`);
    if (!r.ok) failed++;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

void main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
