/**
 * Admin gift on Gói đăng ký: duration and/or credit, no payment/revenue.
 * node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-admin-gift-credit.ts
 */
import { createHmac, randomUUID } from 'crypto';
import {
  PrismaClient,
  SubscriptionStatus,
  PaymentOrderStatus,
  CreditTransactionType,
} from '@prisma/client';

const prisma = new PrismaClient();
const API = process.env.API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:4000';
const JWT_SECRET = process.env.JWT_SECRET!;
const SUPER_EMAIL = process.env.PLATFORM_SUPER_ADMIN_EMAIL || 'xuanluong778@gmail.com';

type Case = { name: string; ok: boolean; detail?: string };

function b64url(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function mint(user: { id: string; email: string; organizationId: string; role: string }) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  );
  const sig = createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${payload}.${sig}`;
}

async function api(path: string, token?: string, init?: RequestInit) {
  const res = await fetch(`${API}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function cleanup(orgId: string) {
  await prisma.auditLog.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.creditTransaction.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.paymentTransaction.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.paymentOrder.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.subscription.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.creditWallet.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.authSession.deleteMany({ where: { user: { organizationId: orgId } } }).catch(() => undefined);
  await prisma.authToken.deleteMany({ where: { user: { organizationId: orgId } } }).catch(() => undefined);
  await prisma.affiliateProfile.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.rolePermission.deleteMany({ where: { role: { organizationId: orgId } } }).catch(() => undefined);
  await prisma.role.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
}

async function createOrg(params: {
  stamp: string;
  suffix: string;
  ownerRoleId: string;
  planId: string;
  status: SubscriptionStatus;
  periodEnd: Date;
  balance: number;
}) {
  const email = `gift.sub.${params.stamp}.${params.suffix}@example.com`;
  const org = await prisma.organization.create({
    data: {
      name: `Gift Sub ${params.stamp} ${params.suffix}`,
      slug: `gift-sub-${params.stamp}-${params.suffix}`,
      email,
    },
  });
  await prisma.creditWallet.create({
    data: {
      organizationId: org.id,
      balance: params.balance,
      lifetimeEarned: params.balance,
    },
  });
  const user = await prisma.user.create({
    data: {
      email,
      name: `Gift ${params.suffix}`,
      authProvider: 'LOCAL',
      organizationId: org.id,
      roleId: params.ownerRoleId,
      emailVerifiedAt: new Date(),
      isActive: true,
    },
  });
  const start = new Date(params.periodEnd.getTime() - 30 * 86400000);
  const sub = await prisma.subscription.create({
    data: {
      organizationId: org.id,
      planId: params.planId,
      status: params.status,
      currentPeriodStart: start,
      currentPeriodEnd: params.periodEnd,
    },
  });
  return { org, user, sub };
}

async function main() {
  const results: Case[] = [];
  const stamp = String(Date.now());
  const orgIds: string[] = [];
  const adminKeys: string[] = [];

  const plan6 = await prisma.subscriptionPlan.findFirst({ where: { code: 'msp-pro-6m' } });
  const plan12 = await prisma.subscriptionPlan.findFirst({ where: { code: 'msp-pro-12m' } });
  const superUser = await prisma.user.findUnique({ where: { email: SUPER_EMAIL } });
  const ownerRole = await prisma.role.findFirst({ where: { code: 'OWNER' } });
  if (!plan6 || !plan12 || !superUser || !ownerRole) throw new Error('Missing plan/super/owner');

  const grant6 = Number(plan6.creditGrant);
  const grant12 = Number(plan12.creditGrant);
  const adminToken = mint({
    id: superUser.id,
    email: superUser.email,
    organizationId: superUser.organizationId,
    role: 'SUPER_ADMIN',
  });

  try {
    const a = await createOrg({
      stamp,
      suffix: 'a',
      ownerRoleId: ownerRole.id,
      planId: plan6.id,
      status: SubscriptionStatus.ACTIVE,
      periodEnd: new Date(Date.now() + 20 * 86400000),
      balance: 100,
    });
    const b = await createOrg({
      stamp,
      suffix: 'b',
      ownerRoleId: ownerRole.id,
      planId: plan6.id,
      status: SubscriptionStatus.ACTIVE,
      periodEnd: new Date(Date.now() + 10 * 86400000),
      balance: 999,
    });
    orgIds.push(a.org.id, b.org.id);
    const ownerToken = mint({
      id: a.user.id,
      email: a.user.email,
      organizationId: a.org.id,
      role: 'OWNER',
    });
    const endBeforeA = a.sub.currentPeriodEnd.getTime();

    {
      const key = randomUUID();
      adminKeys.push(key);
      const gift = await api(`/admin/subscriptions/${a.sub.id}/gift-time`, adminToken, {
        method: 'POST',
        body: JSON.stringify({
          creditAmount: 50,
          unit: 'days',
          reason: 'credit only',
          idempotencyKey: key,
        }),
      });
      const sub = await prisma.subscription.findUnique({ where: { id: a.sub.id } });
      const wallet = await prisma.creditWallet.findUnique({ where: { organizationId: a.org.id } });
      const walletB = await prisma.creditWallet.findUnique({ where: { organizationId: b.org.id } });
      const txn = await prisma.creditTransaction.findFirst({
        where: { organizationId: a.org.id, idempotencyKey: `gift:${key}:credit-grant` },
      });
      results.push({
        name: '1. credit_only_stacks_without_changing_period',
        ok:
          (gift.status === 200 || gift.status === 201) &&
          (gift.json as { creditsGranted?: number }).creditsGranted === 50 &&
          Number(wallet?.balance) === 150 &&
          sub?.status === SubscriptionStatus.ACTIVE &&
          Math.abs((sub?.currentPeriodEnd.getTime() ?? 0) - endBeforeA) < 2000 &&
          txn?.source === 'ADMIN_GIFT' &&
          Number(walletB?.balance) === 999,
        detail: `http=${gift.status} bal=${wallet?.balance} endDelta=${(sub?.currentPeriodEnd.getTime() ?? 0) - endBeforeA} B=${walletB?.balance} src=${txn?.source}`,
      });
    }

    {
      const key = randomUUID();
      adminKeys.push(key);
      const gift = await api(`/admin/subscriptions/${a.sub.id}/gift-time`, adminToken, {
        method: 'POST',
        body: JSON.stringify({
          amount: 10,
          unit: 'days',
          creditAmount: 0,
          reason: 'duration only',
          idempotencyKey: key,
        }),
      });
      const sub = await prisma.subscription.findUnique({ where: { id: a.sub.id } });
      const wallet = await prisma.creditWallet.findUnique({ where: { organizationId: a.org.id } });
      const grants = await prisma.creditTransaction.count({
        where: { organizationId: a.org.id, idempotencyKey: `gift:${key}:credit-grant` },
      });
      results.push({
        name: '2. duration_only_keeps_existing_credit',
        ok:
          (gift.status === 200 || gift.status === 201) &&
          (gift.json as { creditsGranted?: number }).creditsGranted === 0 &&
          Number(wallet?.balance) === 150 &&
          grants === 0 &&
          (sub?.currentPeriodEnd.getTime() ?? 0) > endBeforeA + 9 * 86400000,
        detail: `http=${gift.status} bal=${wallet?.balance} granted=${(gift.json as { creditsGranted?: number }).creditsGranted} end=${sub?.currentPeriodEnd.toISOString()}`,
      });
    }

    {
      const key = randomUUID();
      adminKeys.push(key);
      const walletBefore = await prisma.creditWallet.findUnique({ where: { organizationId: a.org.id } });
      const subBefore = await prisma.subscription.findUnique({ where: { id: a.sub.id } });
      const gift = await api(`/admin/subscriptions/${a.sub.id}/gift-time`, adminToken, {
        method: 'POST',
        body: JSON.stringify({
          amount: 5,
          unit: 'days',
          creditAmount: 25,
          reason: 'duration + credit',
          idempotencyKey: key,
        }),
      });
      const sub = await prisma.subscription.findUnique({ where: { id: a.sub.id } });
      const wallet = await prisma.creditWallet.findUnique({ where: { organizationId: a.org.id } });
      results.push({
        name: '3. duration_plus_credit_stacks',
        ok:
          (gift.status === 200 || gift.status === 201) &&
          (gift.json as { creditsGranted?: number }).creditsGranted === 25 &&
          Number(wallet?.balance) === Number(walletBefore?.balance) + 25 &&
          (sub?.currentPeriodEnd.getTime() ?? 0) >
            (subBefore?.currentPeriodEnd.getTime() ?? 0) + 4 * 86400000,
        detail: `http=${gift.status} bal ${walletBefore?.balance}→${wallet?.balance}`,
      });
    }

    {
      const expired = await createOrg({
        stamp,
        suffix: 'exp',
        ownerRoleId: ownerRole.id,
        planId: plan6.id,
        status: SubscriptionStatus.EXPIRED,
        periodEnd: new Date(Date.now() - 2 * 86400000),
        balance: 40,
      });
      orgIds.push(expired.org.id);
      const key = randomUUID();
      adminKeys.push(key);
      const gift = await api(`/admin/subscriptions/${expired.sub.id}/gift-time`, adminToken, {
        method: 'POST',
        body: JSON.stringify({
          amount: 30,
          unit: 'days',
          creditAmount: 0,
          reason: 'expired → active',
          idempotencyKey: key,
        }),
      });
      const sub = await prisma.subscription.findUnique({ where: { id: expired.sub.id } });
      const listed = await api(
        `/admin/subscriptions?q=${encodeURIComponent(expired.org.email ?? expired.org.name)}`,
        adminToken,
      );
      const row = ((listed.json as { items?: Array<{ organizationId: string; status: string; remainingDays: number; creditBalance: number }> }).items ?? []).find(
        (s) => s.organizationId === expired.org.id,
      );
      results.push({
        name: '4. expired_gift_duration_becomes_active',
        ok:
          (gift.status === 200 || gift.status === 201) &&
          sub?.status === SubscriptionStatus.ACTIVE &&
          (sub?.currentPeriodEnd.getTime() ?? 0) > Date.now() &&
          row?.status === 'ACTIVE' &&
          (row?.remainingDays ?? 0) >= 29 &&
          Number(row?.creditBalance) === 40,
        detail: `http=${gift.status} status=${sub?.status} list=${row?.status} remain=${row?.remainingDays} credit=${row?.creditBalance}`,
      });
    }

    {
      const plans = await api('/billing/plans');
      const items = (plans.json as Array<{ code: string; creditGrant: string | number; durationMonths: number }>) ?? [];
      const p6 = items.find((p) => p.code === 'msp-pro-6m');
      const p12 = items.find((p) => p.code === 'msp-pro-12m');
      results.push({
        name: '5. gift_6_months_suggests_plan_credit_grant_30000',
        ok: Number(p6?.creditGrant) === 30000 && grant6 === 30000,
        detail: `api=${p6?.creditGrant} db=${grant6}`,
      });
      results.push({
        name: '6. gift_12m_or_1y_suggests_plan_credit_grant_75000',
        ok: Number(p12?.creditGrant) === 75000 && grant12 === 75000,
        detail: `api=${p12?.creditGrant} db=${grant12}`,
      });

      const hintOrg = await createOrg({
        stamp,
        suffix: 'hint',
        ownerRoleId: ownerRole.id,
        planId: plan6.id,
        status: SubscriptionStatus.ACTIVE,
        periodEnd: new Date(Date.now() + 5 * 86400000),
        balance: 1,
      });
      orgIds.push(hintOrg.org.id);
      const key6 = randomUUID();
      adminKeys.push(key6);
      const gift6 = await api(`/admin/subscriptions/${hintOrg.sub.id}/gift-time`, adminToken, {
        method: 'POST',
        body: JSON.stringify({
          amount: 6,
          unit: 'months',
          creditAmount: Number(p6?.creditGrant ?? grant6),
          reason: 'hint 6m',
          idempotencyKey: key6,
        }),
      });
      const wallet6 = await prisma.creditWallet.findUnique({
        where: { organizationId: hintOrg.org.id },
      });
      results.push({
        name: '5b. applying_6m_hint_grants_30000',
        ok:
          (gift6.status === 200 || gift6.status === 201) &&
          Number(wallet6?.balance) === 1 + 30000,
        detail: `http=${gift6.status} bal=${wallet6?.balance}`,
      });

      const key12 = randomUUID();
      adminKeys.push(key12);
      const gift12 = await api(`/admin/subscriptions/${hintOrg.sub.id}/gift-time`, adminToken, {
        method: 'POST',
        body: JSON.stringify({
          amount: 1,
          unit: 'years',
          creditAmount: Number(p12?.creditGrant ?? grant12),
          reason: 'hint 1y',
          idempotencyKey: key12,
        }),
      });
      const wallet12 = await prisma.creditWallet.findUnique({
        where: { organizationId: hintOrg.org.id },
      });
      results.push({
        name: '6b. applying_1y_hint_grants_75000',
        ok:
          (gift12.status === 200 || gift12.status === 201) &&
          Number(wallet12?.balance) === 1 + 30000 + 75000,
        detail: `http=${gift12.status} bal=${wallet12?.balance}`,
      });
    }

    {
      const key = randomUUID();
      adminKeys.push(key);
      const body = {
        amount: 2,
        unit: 'days',
        creditAmount: 40,
        reason: 'double click',
        idempotencyKey: key,
      };
      const first = await api(`/admin/subscriptions/${a.sub.id}/gift-time`, adminToken, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const walletAfterFirst = await prisma.creditWallet.findUnique({
        where: { organizationId: a.org.id },
      });
      const replay = await api(`/admin/subscriptions/${a.sub.id}/gift-time`, adminToken, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const wallet = await prisma.creditWallet.findUnique({ where: { organizationId: a.org.id } });
      const grants = await prisma.creditTransaction.count({
        where: { organizationId: a.org.id, idempotencyKey: `gift:${key}:credit-grant` },
      });
      results.push({
        name: '7. double_click_same_idempotency_key_does_not_grant_twice',
        ok:
          (first.status === 200 || first.status === 201) &&
          (replay.json as { idempotent?: boolean }).idempotent === true &&
          Number(wallet?.balance) === Number(walletAfterFirst?.balance) &&
          grants === 1,
        detail: `idempotent=${(replay.json as { idempotent?: boolean }).idempotent} grants=${grants} bal=${wallet?.balance}`,
      });
    }

    {
      const paid = await prisma.paymentOrder.count({
        where: { organizationId: { in: orgIds }, status: PaymentOrderStatus.PAID },
      });
      const anyOrder = await prisma.paymentOrder.count({
        where: { organizationId: { in: orgIds } },
      });
      const purchaseTx = await prisma.creditTransaction.count({
        where: {
          organizationId: { in: orgIds },
          type: CreditTransactionType.PURCHASE,
        },
      });
      results.push({
        name: '8. gift_does_not_create_payment_or_revenue',
        ok: paid === 0 && anyOrder === 0 && purchaseTx === 0,
        detail: `paid=${paid} orders=${anyOrder} purchaseTx=${purchaseTx}`,
      });
    }

    {
      const denied = await api(`/admin/subscriptions/${a.sub.id}/gift-time`, ownerToken, {
        method: 'POST',
        body: JSON.stringify({
          creditAmount: 10,
          unit: 'days',
          idempotencyKey: randomUUID(),
        }),
      });
      const negative = await api(`/admin/subscriptions/${a.sub.id}/gift-time`, adminToken, {
        method: 'POST',
        body: JSON.stringify({
          creditAmount: -5,
          unit: 'days',
          idempotencyKey: randomUUID(),
        }),
      });
      results.push({
        name: 'rbac_owner_cannot_gift_and_credit_cannot_be_negative',
        ok: denied.status === 403 && (negative.status === 400 || negative.status === 422),
        detail: `owner=${denied.status} negative=${negative.status}`,
      });
    }
  } finally {
    for (const key of adminKeys) {
      await prisma.adminIdempotencyKey.deleteMany({ where: { key } }).catch(() => undefined);
    }
    for (const id of orgIds) await cleanup(id);
    await prisma.$disconnect();
  }

  console.log('\n=== Admin gift credit (subscriptions) ===');
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
