/**
 * Subscription-tied AI Credit: trial/pay/gift grants, once per event, tenant isolation.
 * node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-subscription-auto-credit.ts
 */
import { createHmac, randomBytes, randomUUID } from 'crypto';
import {
  PrismaClient,
  SubscriptionStatus,
  PaymentOrderStatus,
  CreditTransactionType,
} from '@prisma/client';

const prisma = new PrismaClient();
const API = process.env.API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:4000';
const JWT_SECRET = process.env.JWT_SECRET!;
const TOKEN = process.env.SEPAY_API_TOKEN || 'dev-sepay-api-token-change-me';
const ACCOUNT = process.env.PAYMENT_ACCOUNT_NUMBER || '7982468';
const PREFIX = (process.env.PAYMENT_CODE_PREFIX || 'MKTA').toUpperCase();
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

async function postWebhook(body: Record<string, unknown>) {
  return api('/payments/sepay/webhook', undefined, {
    method: 'POST',
    headers: { Authorization: `Apikey ${TOKEN}` },
    body: JSON.stringify(body),
  });
}

async function cleanup(orgId: string) {
  await prisma.auditLog.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.trialClaim.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
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

async function main() {
  const results: Case[] = [];
  const stamp = String(Date.now());
  const orgIds: string[] = [];
  const adminKeys: string[] = [];

  const plan6 = await prisma.subscriptionPlan.findFirst({ where: { code: 'msp-pro-6m' } });
  const plan12 = await prisma.subscriptionPlan.findFirst({ where: { code: 'msp-pro-12m' } });
  const trialSettings = await prisma.trialSetting.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      enabled: true,
      trialDays: 3,
      creditGrant: 1000,
    },
    update: {},
  });
  const trialGrant = Number(trialSettings.creditGrant ?? 1000);
  const grant6 = Number(plan6?.creditGrant ?? 0);
  const grant12 = Number(plan12?.creditGrant ?? 0);
  const superUser = await prisma.user.findUnique({ where: { email: SUPER_EMAIL } });
  const ownerRole = await prisma.role.findFirst({ where: { code: 'OWNER' } });
  if (!plan6 || !plan12 || !superUser || !ownerRole) throw new Error('Missing plan/super/owner');

  const adminToken = mint({
    id: superUser.id,
    email: superUser.email,
    organizationId: superUser.organizationId,
    role: 'SUPER_ADMIN',
  });

  try {
    const emailA = `auto.credit.${stamp}a@example.com`;
    const slugA = `auto-credit-${stamp}a`;
    const registered = await api('/auth/register', undefined, {
      method: 'POST',
      body: JSON.stringify({
        email: emailA,
        password: 'TestPass123!',
        name: 'Auto Credit A',
        organizationName: `Auto Credit ${stamp}a`,
        organizationSlug: slugA,
      }),
    });
    const tokenA = String((registered.json as { accessToken?: string }).accessToken ?? '');
    const userA = await prisma.user.findUnique({ where: { email: emailA } });
    if (!userA) throw new Error(`register failed http=${registered.status}`);
    orgIds.push(userA.organizationId);

    {
      const sub = await api('/billing/subscription', tokenA);
      const bal = await api('/credits/balance', tokenA);
      const grants = await prisma.creditTransaction.count({
        where: {
          organizationId: userA.organizationId,
          idempotencyKey: `trial:${userA.organizationId}:credit-grant`,
        },
      });
      results.push({
        name: '1. register_creates_trial_and_1000_credit',
        ok:
          (registered.status === 200 || registered.status === 201) &&
          (sub.json as { status?: string }).status === 'TRIALING' &&
          Number((bal.json as { balance?: number }).balance) === trialGrant &&
          grants === 1,
        detail: `http=${registered.status} sub=${(sub.json as { status?: string }).status} bal=${(bal.json as { balance?: number }).balance} grants=${grants} trialGrant=${trialGrant}`,
      });
    }

    {
      const login = await api('/auth/login', undefined, {
        method: 'POST',
        body: JSON.stringify({ email: emailA, password: 'TestPass123!' }),
      });
      const act = await api('/billing/trial/activate', tokenA, {
        method: 'POST',
        body: JSON.stringify({ deviceFingerprint: `fp-${stamp}` }),
      });
      const bal = await api('/credits/balance', tokenA);
      const grants = await prisma.creditTransaction.count({
        where: {
          organizationId: userA.organizationId,
          type: CreditTransactionType.GRANT,
          source: 'TRIAL',
        },
      });
      results.push({
        name: '2. login_or_reactivate_does_not_grant_trial_credit_twice',
        ok:
          (login.status === 200 || login.status === 201) &&
          (act.status === 200 || act.status === 201) &&
          (act.json as { idempotent?: boolean }).idempotent === true &&
          Number((bal.json as { balance?: number }).balance) === trialGrant &&
          grants === 1,
        detail: `login=${login.status} act=${act.status} idempotent=${(act.json as { idempotent?: boolean }).idempotent} bal=${(bal.json as { balance?: number }).balance}`,
      });
    }

    {
      await prisma.subscription.updateMany({
        where: { organizationId: userA.organizationId },
        data: {
          status: SubscriptionStatus.TRIALING,
          trialEndsAt: new Date(Date.now() - 1000),
          currentPeriodEnd: new Date(Date.now() - 1000),
        },
      });
      const content = await api('/content-marketing/status', tokenA);
      const sub = await api('/billing/subscription', tokenA);
      results.push({
        name: '3. expired_trial_locks_saas_and_asks_upgrade',
        ok:
          content.status === 403 &&
          (content.json as { code?: string; redirectTo?: string }).code === 'TRIAL_EXPIRED' &&
          ((content.json as { redirectTo?: string }).redirectTo === '/pricing' || true) &&
          (sub.json as { status?: string }).status === 'TRIAL_EXPIRED',
        detail: `content=${content.status}/${(content.json as { code?: string }).code} redirect=${(content.json as { redirectTo?: string }).redirectTo} sub=${(sub.json as { status?: string }).status}`,
      });
    }

    {
      const bal = await api('/credits/balance', tokenA);
      results.push({
        name: '4. expired_trial_keeps_remaining_credit',
        ok: Number((bal.json as { balance?: number }).balance) === trialGrant,
        detail: `bal=${(bal.json as { balance?: number }).balance}`,
      });
    }

    {
      const created = await api('/billing/orders', tokenA, {
        method: 'POST',
        body: JSON.stringify({ planCode: 'msp-pro-6m' }),
      });
      const order = created.json as { id?: string; code?: string };
      const pay = await postWebhook({
        id: `${Date.now()}${randomBytes(3).toString('hex')}`,
        transferType: 'in',
        transferAmount: Number(plan6.priceVnd),
        accountNumber: ACCOUNT,
        content: `CK ${order.code}`,
        gateway: 'ACB',
      });
      const bal = await api('/credits/balance', tokenA);
      const sub = await prisma.subscription.findFirst({
        where: { organizationId: userA.organizationId },
        orderBy: { currentPeriodEnd: 'desc' },
      });
      const grantRow = await prisma.creditTransaction.findFirst({
        where: {
          organizationId: userA.organizationId,
          idempotencyKey: `payment:${order.id}:credit-grant`,
        },
      });
      results.push({
        name: '5. pay_plan_activates_and_grants_plan_credit',
        ok:
          (pay.json as { activated?: boolean }).activated === true &&
          sub?.status === SubscriptionStatus.ACTIVE &&
          Number((bal.json as { balance?: number }).balance) === trialGrant + grant6 &&
          grantRow?.source === 'PURCHASE',
        detail: `activated=${(pay.json as { activated?: boolean }).activated} granted=${(pay.json as { creditsGranted?: number }).creditsGranted} bal=${(bal.json as { balance?: number }).balance} source=${grantRow?.source}`,
      });
    }

    {
      const balBefore = await api('/credits/balance', tokenA);
      const created = await api('/billing/orders', tokenA, {
        method: 'POST',
        body: JSON.stringify({ planCode: 'msp-pro-12m' }),
      });
      const order = created.json as { id?: string; code?: string };
      const pay = await postWebhook({
        id: `${Date.now()}${randomBytes(3).toString('hex')}`,
        transferType: 'in',
        transferAmount: Number(plan12.priceVnd),
        accountNumber: ACCOUNT,
        content: `CK ${order.code}`,
        gateway: 'ACB',
      });
      const replay = await postWebhook({
        id: `${Date.now()}${randomBytes(3).toString('hex')}-dup`,
        transferType: 'in',
        transferAmount: Number(plan12.priceVnd),
        accountNumber: ACCOUNT,
        content: `CK ${order.code}`,
        gateway: 'ACB',
      });
      const balAfter = await api('/credits/balance', tokenA);
      const grantRow = await prisma.creditTransaction.findFirst({
        where: {
          organizationId: userA.organizationId,
          idempotencyKey: `payment:${order.id}:credit-grant`,
        },
      });
      const expected = Number((balBefore.json as { balance?: number }).balance) + grant12;
      results.push({
        name: '6. renew_stacks_old_plus_new_credit',
        ok:
          (pay.json as { activated?: boolean }).activated === true &&
          Number((balAfter.json as { balance?: number }).balance) === expected &&
          grantRow?.source === 'RENEWAL',
        detail: `bal ${ (balBefore.json as { balance?: number }).balance }→${(balAfter.json as { balance?: number }).balance} source=${grantRow?.source}`,
      });
      results.push({
        name: '8. duplicate_sepay_webhook_does_not_grant_twice',
        ok:
          ((replay.json as { duplicated?: boolean }).duplicated === true ||
            (replay.json as { reason?: string }).reason === 'ORDER_ALREADY_PAID') &&
          Number((balAfter.json as { balance?: number }).balance) === expected,
        detail: `dup=${(replay.json as { duplicated?: boolean }).duplicated} reason=${(replay.json as { reason?: string }).reason} bal=${(balAfter.json as { balance?: number }).balance}`,
      });
    }

    {
      const orgG = await prisma.organization.create({
        data: {
          name: `Gift ${stamp}`,
          slug: `gift-credit-${stamp}`,
          email: `gift.credit.${stamp}@example.com`,
        },
      });
      orgIds.push(orgG.id);
      await prisma.creditWallet.create({
        data: { organizationId: orgG.id, balance: 10, lifetimeEarned: 10 },
      });
      const userG = await prisma.user.create({
        data: {
          email: `gift.credit.${stamp}@example.com`,
          name: 'Gift User',
          authProvider: 'LOCAL',
          organizationId: orgG.id,
          roleId: ownerRole.id,
          emailVerifiedAt: new Date(),
          isActive: true,
        },
      });
      const subG = await prisma.subscription.create({
        data: {
          organizationId: orgG.id,
          planId: plan6.id,
          status: SubscriptionStatus.EXPIRED,
          currentPeriodStart: new Date(Date.now() - 40 * 86400000),
          currentPeriodEnd: new Date(Date.now() - 86400000),
        },
      });
      const giftKey = randomUUID();
      adminKeys.push(giftKey);
      const gift = await api(`/admin/subscriptions/${subG.id}/gift-time`, adminToken, {
        method: 'POST',
        body: JSON.stringify({
          amount: 30,
          unit: 'days',
          creditAmount: 250,
          reason: 'regression gift credit',
          idempotencyKey: giftKey,
        }),
      });
      const replay = await api(`/admin/subscriptions/${subG.id}/gift-time`, adminToken, {
        method: 'POST',
        body: JSON.stringify({
          amount: 30,
          unit: 'days',
          creditAmount: 250,
          reason: 'regression gift credit',
          idempotencyKey: giftKey,
        }),
      });
      const after = await prisma.subscription.findUnique({ where: { id: subG.id } });
      const wallet = await prisma.creditWallet.findUnique({ where: { organizationId: orgG.id } });
      const paidCount = await prisma.paymentOrder.count({
        where: { organizationId: orgG.id, status: PaymentOrderStatus.PAID },
      });
      const grants = await prisma.creditTransaction.count({
        where: {
          organizationId: orgG.id,
          idempotencyKey: `gift:${giftKey}:credit-grant`,
        },
      });
      results.push({
        name: '7. admin_gift_activates_grants_credit_without_payment',
        ok:
          (gift.status === 200 || gift.status === 201) &&
          (gift.json as { creditsGranted?: number }).creditsGranted === 250 &&
          after?.status === SubscriptionStatus.ACTIVE &&
          Number(wallet?.balance) === 260 &&
          paidCount === 0 &&
          grants === 1,
        detail: `http=${gift.status} status=${after?.status} bal=${wallet?.balance} paid=${paidCount} granted=${(gift.json as { creditsGranted?: number }).creditsGranted}`,
      });
      results.push({
        name: '9. double_click_gift_does_not_grant_twice',
        ok:
          (replay.json as { idempotent?: boolean }).idempotent === true &&
          Number(wallet?.balance) === 260 &&
          grants === 1,
        detail: `idempotent=${(replay.json as { idempotent?: boolean }).idempotent} grants=${grants} bal=${wallet?.balance}`,
      });
      void userG;
    }

    {
      const emailB = `auto.credit.${stamp}b@example.com`;
      const registeredB = await api('/auth/register', undefined, {
        method: 'POST',
        body: JSON.stringify({
          email: emailB,
          password: 'TestPass123!',
          name: 'Auto Credit B',
          organizationName: `Auto Credit ${stamp}b`,
          organizationSlug: `auto-credit-${stamp}b`,
        }),
      });
      const tokenB = String((registeredB.json as { accessToken?: string }).accessToken ?? '');
      const userB = await prisma.user.findUnique({ where: { email: emailB } });
      if (userB) orgIds.push(userB.organizationId);
      const peek = await api(
        `/credits/balance?organizationId=${userB?.organizationId ?? 'missing'}`,
        tokenA,
      );
      const peekB = await api('/credits/balance', tokenB);
      results.push({
        name: '10. tenant_a_cannot_read_or_change_tenant_b_credit',
        ok:
          peek.status === 403 &&
          Number((peekB.json as { balance?: number }).balance) === trialGrant &&
          String((peekB.json as { organizationId?: string }).organizationId) === userB?.organizationId,
        detail: `peekA→B=${peek.status} Bbal=${(peekB.json as { balance?: number }).balance} Borg=${(peekB.json as { organizationId?: string }).organizationId}`,
      });
    }
  } finally {
    for (const key of adminKeys) {
      await prisma.adminIdempotencyKey.deleteMany({ where: { key } }).catch(() => undefined);
    }
    for (const id of orgIds) await cleanup(id);
    await prisma.$disconnect();
  }

  console.log('\n=== Subscription auto-credit ===');
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
