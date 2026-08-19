/**
 * Credit regression: purchase packages, ledger, tenancy, subscription independence.
 * node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-credit-regression.ts
 */
import { createHmac, randomBytes, randomUUID } from 'crypto';
import {
  PrismaClient,
  SubscriptionStatus,
  CreditTransactionType,
} from '@prisma/client';
import { CREDIT_FEATURE_CODES } from '@marketingspa/shared';
import { CreditService, InsufficientCreditsError } from '../apps/api/src/credit/credit.service';
import { PrismaService } from '../apps/api/src/prisma/prisma.service';

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

async function api(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${API}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

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

async function cleanup(orgId: string) {
  await prisma.auditLog.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.creditTransaction.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.paymentTransaction.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.paymentOrder.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.subscription.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.creditWallet.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
}

async function makeOrg(stamp: string, planId: string, ownerRoleId: string, balance = 20) {
  const org = await prisma.organization.create({
    data: {
      name: `CredReg ${stamp}`,
      slug: `cred-reg-${stamp}`,
      email: `cred.reg.${stamp}@example.com`,
    },
  });
  await prisma.creditWallet.create({
    data: { organizationId: org.id, balance, lifetimeEarned: balance },
  });
  const user = await prisma.user.create({
    data: {
      email: `cred.reg.${stamp}@example.com`,
      name: 'Credit Regression',
      authProvider: 'LOCAL',
      organizationId: org.id,
      roleId: ownerRoleId,
      emailVerifiedAt: new Date(),
      isActive: true,
    },
  });
  const periodEnd = new Date(Date.now() + 40 * 86400000);
  const sub = await prisma.subscription.create({
    data: {
      organizationId: org.id,
      planId,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date(),
      currentPeriodEnd: periodEnd,
    },
  });
  const token = mint({
    id: user.id,
    email: user.email,
    organizationId: org.id,
    role: 'OWNER',
  });
  return { org, user, sub, token, periodEnd };
}

async function main() {
  const results: Case[] = [];
  const stamp = String(Date.now());
  const credit = new CreditService(prisma as unknown as PrismaService);
  const ownerRole = await prisma.role.findFirst({ where: { code: 'OWNER' } });
  if (!ownerRole) throw new Error('OWNER role missing');
  const plan6 = await prisma.subscriptionPlan.findFirst({ where: { code: 'msp-pro-6m' } });
  const pkg = await prisma.creditPackage.findFirst({ where: { code: 'credit-500', status: 'ACTIVE' } });
  const superUser = await prisma.user.findUnique({ where: { email: SUPER_EMAIL } });
  if (!plan6 || !pkg || !superUser) throw new Error('Missing plan/package/super admin');

  const a = await makeOrg(`${stamp}a`, plan6.id, ownerRole.id, 20);
  const b = await makeOrg(`${stamp}b`, plan6.id, ownerRole.id, 80);
  const adminToken = mint({
    id: superUser.id,
    email: superUser.email,
    organizationId: superUser.organizationId,
    role: 'SUPER_ADMIN',
  });

  try {
    {
      await credit.adjust({
        organizationId: a.org.id,
        delta: 15,
        idempotencyKey: `reg-grant-${stamp}`,
        reason: 'regression grant',
      });
      await credit.adjust({
        organizationId: a.org.id,
        delta: -5,
        idempotencyKey: `reg-debit-${stamp}`,
        reason: 'regression debit',
      });
      const bal = await credit.getBalance(a.org.id);
      results.push({
        name: 'adjust_grant_and_debit',
        ok: bal.balance === 30,
        detail: `bal=${bal.balance}`,
      });
    }

    {
      const r = await api(`/admin/credits/${a.org.id}/adjust`, adminToken, {
        method: 'POST',
        body: JSON.stringify({
          delta: 8,
          reason: 'Admin tặng regression',
          idempotencyKey: randomUUID(),
        }),
      });
      const bal = await credit.getBalance(a.org.id);
      results.push({
        name: 'admin_gift_credit',
        ok: (r.status === 200 || r.status === 201) && bal.balance === 38,
        detail: `http=${r.status} bal=${bal.balance}`,
      });
    }

    {
      let blocked = false;
      try {
        await credit.adjust({
          organizationId: a.org.id,
          delta: -99999,
          idempotencyKey: `reg-neg-${stamp}`,
          reason: 'should fail',
        });
      } catch (e) {
        blocked = e instanceof InsufficientCreditsError;
      }
      const bal = await credit.getBalance(a.org.id);
      let dbBlocked = false;
      try {
        await prisma.creditWallet.update({
          where: { organizationId: a.org.id },
          data: { balance: -1 },
        });
      } catch {
        dbBlocked = true;
      }
      results.push({
        name: 'balance_never_negative',
        ok: blocked && dbBlocked && bal.balance === 38,
        detail: `blocked=${blocked} db=${dbBlocked} bal=${bal.balance}`,
      });
    }

    {
      const before = await credit.getBalance(a.org.id);
      const out = await credit.runPaidFeature({
        organizationId: a.org.id,
        featureCode: CREDIT_FEATURE_CODES.CHATBOT_REPLY,
        referenceId: `reg-ai-ok-${stamp}`,
        fn: async (ctx) => {
          ctx.markProviderStarted();
          return 'ok';
        },
      });
      const after = await credit.getBalance(a.org.id);
      const cost = await credit.getFeatureCost(CREDIT_FEATURE_CODES.CHATBOT_REPLY);
      results.push({
        name: 'ai_task_debits_exact_cost',
        ok: out === 'ok' && after.balance === before.balance - cost,
        detail: `cost=${cost} ${before.balance}→${after.balance}`,
      });
    }

    {
      let ran = false;
      let blocked = false;
      try {
        await credit.runPaidFeature({
          organizationId: a.org.id,
          featureCode: CREDIT_FEATURE_CODES.CHATBOT_REPLY,
          amount: 99999,
          referenceId: `reg-ai-skip-${stamp}`,
          fn: async () => {
            ran = true;
            return 1;
          },
        });
      } catch (e) {
        blocked = e instanceof InsufficientCreditsError;
      }
      results.push({
        name: 'insufficient_does_not_call_provider',
        ok: blocked && !ran,
        detail: `blocked=${blocked} ran=${ran}`,
      });
    }

    {
      const before = await credit.getBalance(a.org.id);
      let threw = false;
      try {
        await credit.runPaidFeature({
          organizationId: a.org.id,
          featureCode: CREDIT_FEATURE_CODES.CHATBOT_REPLY,
          referenceId: `reg-ai-fail-${stamp}`,
          fn: async () => {
            throw new Error('provider not started');
          },
        });
      } catch {
        threw = true;
      }
      const after = await credit.getBalance(a.org.id);
      results.push({
        name: 'failed_task_releases_credit',
        ok: threw && after.balance === before.balance && after.reservedBalance === 0,
        detail: `${before.balance}→${after.balance}`,
      });
    }

    {
      const ref = `reg-ai-retry-${stamp}`;
      const before = await credit.getBalance(a.org.id);
      await credit.runPaidFeature({
        organizationId: a.org.id,
        featureCode: CREDIT_FEATURE_CODES.CHATBOT_REPLY,
        referenceId: ref,
        fn: async (ctx) => {
          ctx.markProviderStarted();
          return 'a';
        },
      });
      const mid = await credit.getBalance(a.org.id);
      let already = false;
      try {
        await credit.runPaidFeature({
          organizationId: a.org.id,
          featureCode: CREDIT_FEATURE_CODES.CHATBOT_REPLY,
          referenceId: ref,
          fn: async () => 'b',
        });
      } catch {
        already = true;
      }
      const after = await credit.getBalance(a.org.id);
      results.push({
        name: 'retry_does_not_debit_twice',
        ok: already && mid.balance === after.balance && mid.balance === before.balance - 1,
        detail: `${before.balance}→${mid.balance}→${after.balance}`,
      });
    }

    {
      const subBefore = await prisma.subscription.findUnique({ where: { id: a.sub.id } });
      const balBefore = await credit.getBalance(a.org.id);
      const packages = await api('/credits/packages', a.token);
      const listed = Array.isArray(packages.json)
        ? (packages.json as Array<{ code: string; credits: number; priceVnd: number }>)
        : [];
      const listedPkg = listed.find((p) => p.code === pkg.code);
      const poisoned = await api('/billing/credit-orders', a.token, {
        method: 'POST',
        body: JSON.stringify({
          packageCode: pkg.code,
          credits: 999999,
          priceVnd: 1,
          organizationId: b.org.id,
        }),
      });
      const created = await api('/billing/credit-orders', a.token, {
        method: 'POST',
        body: JSON.stringify({ packageCode: pkg.code }),
      });
      const order = created.json as {
        id?: string;
        code?: string;
        amountVnd?: number;
        kind?: string;
        organizationId?: string;
        creditPackage?: { credits: number };
      };
      const amountOk = Number(order.amountVnd) === Number(pkg.priceVnd);
      const creditsOk = Number(order.creditPackage?.credits) === Number(pkg.credits);
      results.push({
        name: 'buy_credit_ignores_frontend_amounts',
        ok:
          (packages.status === 200 || packages.status === 201) &&
          listedPkg != null &&
          listedPkg.credits === Number(pkg.credits) &&
          listedPkg.priceVnd === Number(pkg.priceVnd) &&
          (poisoned.status === 400 || poisoned.status === 403) &&
          (created.status === 201 || created.status === 200) &&
          amountOk &&
          creditsOk &&
          order.kind === 'credit' &&
          order.organizationId === a.org.id,
        detail: `packages=${packages.status} poison=${poisoned.status} create=${created.status} amount=${order.amountVnd} credits=${order.creditPackage?.credits} kind=${order.kind}`,
      });
      const id = sepayId();
      const pay = await postWebhook({
        id,
        transferType: 'in',
        transferAmount: Number(pkg.priceVnd),
        accountNumber: ACCOUNT,
        content: `CK ${order.code}`,
        gateway: 'ACB',
      });
      const replay = await postWebhook({
        id,
        transferType: 'in',
        transferAmount: Number(pkg.priceVnd),
        accountNumber: ACCOUNT,
        content: `CK ${order.code}`,
        gateway: 'ACB',
      });
      const balAfter = await credit.getBalance(a.org.id);
      const subAfter = await prisma.subscription.findUnique({ where: { id: a.sub.id } });
      const purchases = await prisma.creditTransaction.count({
        where: {
          organizationId: a.org.id,
          type: CreditTransactionType.PURCHASE,
          idempotencyKey: `payment:${order.id}:credit-purchase`,
        },
      });
      results.push({
        name: 'sepay_purchase_grants_once_no_sub_extend',
        ok:
          amountOk &&
          creditsOk &&
          (pay.json as { kind?: string }).kind === 'credit' &&
          (pay.json as { activated?: boolean }).activated === false &&
          (replay.json as { duplicated?: boolean }).duplicated === true &&
          purchases === 1 &&
          balAfter.balance === balBefore.balance + Number(pkg.credits) &&
          subAfter?.currentPeriodEnd.getTime() === subBefore?.currentPeriodEnd.getTime(),
        detail: `kind=${(pay.json as { kind?: string }).kind} dup=${(replay.json as { duplicated?: boolean }).duplicated} bal ${balBefore.balance}→${balAfter.balance} purchases=${purchases}`,
      });
    }

    {
      const r = await api(`/credits/balance?organizationId=${b.org.id}`, a.token);
      const bal = r.json as { organizationId?: string; balance?: number };
      results.push({
        name: 'tenant_a_cannot_query_tenant_b_wallet',
        ok: r.status === 403 || bal.organizationId === a.org.id,
        detail: `http=${r.status} org=${bal.organizationId}`,
      });
    }

    {
      const r = await api('/credits/balance', a.token);
      const peekB = await api('/credits/balance', b.token);
      results.push({
        name: 'each_tenant_sees_own_wallet',
        ok:
          Number((r.json as { balance?: number }).balance) !==
          Number((peekB.json as { balance?: number }).balance),
        detail: `A=${(r.json as { balance?: number }).balance} B=${(peekB.json as { balance?: number }).balance}`,
      });
    }

    {
      await prisma.creditWallet.update({
        where: { organizationId: a.org.id },
        data: { balance: 0, reservedBalance: 0 },
      });
      const crm = await api('/customers', a.token);
      const funnel = await api('/funnel-builder/quota', a.token);
      const hrm = await api('/hrm/employees', a.token);
      results.push({
        name: 'zero_credit_still_uses_crm_funnel_hrm',
        ok: crm.status === 200 && funnel.status === 200 && hrm.status === 200,
        detail: `crm=${crm.status} funnel=${funnel.status} hrm=${hrm.status}`,
      });
    }

    {
      const before = await credit.getBalance(a.org.id);
      await prisma.subscription.update({
        where: { id: a.sub.id },
        data: {
          status: SubscriptionStatus.EXPIRED,
          currentPeriodEnd: new Date(Date.now() - 60_000),
        },
      });
      const after = await credit.getBalance(a.org.id);
      results.push({
        name: 'expired_subscription_keeps_credit',
        ok: after.balance === before.balance,
        detail: `bal=${after.balance}`,
      });
    }

    {
      await prisma.subscription.update({
        where: { id: a.sub.id },
        data: {
          status: SubscriptionStatus.EXPIRED,
          currentPeriodEnd: new Date(Date.now() - 60_000),
        },
      });
      const grant = Number(plan6.creditGrant);
      const amount = Number(plan6.priceVnd);
      const created = await api('/billing/orders', a.token, {
        method: 'POST',
        body: JSON.stringify({ planCode: 'msp-pro-6m' }),
      });
      const order = created.json as { id?: string; code?: string; amountVnd?: number };
      const balBefore = await credit.getBalance(a.org.id);
      const pay = await postWebhook({
        id: sepayId(),
        transferType: 'in',
        transferAmount: amount,
        accountNumber: ACCOUNT,
        content: `CK ${order.code}`,
        gateway: 'ACB',
      });
      const balAfter = await credit.getBalance(a.org.id);
      const sub = await prisma.subscription.findFirst({
        where: { organizationId: a.org.id },
        orderBy: { currentPeriodEnd: 'desc' },
      });
      results.push({
        name: 'renew_plan_grants_plan_credit_once',
        ok:
          (pay.json as { activated?: boolean }).activated === true &&
          (pay.json as { kind?: string }).kind === 'subscription' &&
          Number((pay.json as { creditsGranted?: number }).creditsGranted) === grant &&
          balAfter.balance === balBefore.balance + grant &&
          sub?.status === SubscriptionStatus.ACTIVE,
        detail: `activated=${(pay.json as { activated?: boolean }).activated} granted=${(pay.json as { creditsGranted?: number }).creditsGranted} bal ${balBefore.balance}→${balAfter.balance}`,
      });
    }

    {
      const r = await api(`/admin/credits/${a.org.id}/adjust`, a.token, {
        method: 'POST',
        body: JSON.stringify({
          delta: 1,
          reason: 'user không được chỉnh',
          idempotencyKey: randomUUID(),
        }),
      });
      results.push({
        name: 'regular_user_cannot_adjust',
        ok: r.status === 403,
        detail: `http=${r.status}`,
      });
    }
  } finally {
    await cleanup(a.org.id);
    await cleanup(b.org.id);
    await prisma.$disconnect();
  }

  console.log('\n=== Credit regression ===');
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
