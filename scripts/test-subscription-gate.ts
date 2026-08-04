/**
 * Test phân quyền gói: unpaid/pending bị chặn; ACTIVE được vào; hết hạn khóa.
 * node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-subscription-gate.ts
 */
import { createHmac, randomBytes } from 'crypto';
import {
  PaymentOrderStatus,
  PrismaClient,
  SubscriptionStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();
const API = process.env.API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:4000';
const JWT_SECRET = process.env.JWT_SECRET!;
const SEPAY_TOKEN = process.env.SEPAY_API_TOKEN || '';
const ACCOUNT = process.env.PAYMENT_ACCOUNT_NUMBER || '7982468';
const PREFIX = (process.env.PAYMENT_CODE_PREFIX || 'MKTA').toUpperCase();

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
  await prisma.paymentTransaction.deleteMany({ where: { organizationId: orgId } });
  await prisma.paymentOrder.deleteMany({ where: { organizationId: orgId } });
  await prisma.subscription.deleteMany({ where: { organizationId: orgId } });
  await prisma.creditWallet.deleteMany({ where: { organizationId: orgId } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
}

async function main() {
  const results: Case[] = [];
  const stamp = Date.now();
  const ownerRole = await prisma.role.findFirst({ where: { code: 'OWNER' } });
  if (!ownerRole) throw new Error('OWNER role missing');
  const plan = await prisma.subscriptionPlan.findFirst({ where: { code: 'msp-pro-6m' } });
  if (!plan) throw new Error('plan missing');

  const org = await prisma.organization.create({
    data: { name: `Gate Test ${stamp}`, slug: `gate-test-${stamp}`, email: `gate.${stamp}@example.com` },
  });
  await prisma.creditWallet.create({ data: { organizationId: org.id, balance: 0 } });
  const user = await prisma.user.create({
    data: {
      email: `gate.${stamp}@example.com`,
      name: 'Gate Test',
      authProvider: 'LOCAL',
      organizationId: org.id,
      roleId: ownerRole.id,
      emailVerifiedAt: new Date(),
      isActive: true,
    },
    include: { role: true },
  });
  const token = mint({
    id: user.id,
    email: user.email,
    organizationId: org.id,
    role: user.role.code,
  });

  try {
    // 1) Chưa có gói → content bị chặn
    {
      const r = await api('/content-marketing/status', token);
      const code = (r.json as { code?: string }).code;
      results.push({
        name: 'unpaid_content_blocked',
        ok: r.status === 403 && code === 'SUBSCRIPTION_REQUIRED',
        detail: `status=${r.status} code=${code}`,
      });
    }

    // 2) Billing vẫn mở
    {
      const r = await api('/billing/subscription', token);
      results.push({
        name: 'unpaid_billing_allowed',
        ok: r.status === 200 && (r.json as { hasPlan?: boolean }).hasPlan === false,
        detail: String(r.status),
      });
    }

    // 3) Tạo đơn PENDING → vẫn chặn content
    {
      const order = await prisma.paymentOrder.create({
        data: {
          code: `${PREFIX}${100000 + (randomBytes(2).readUInt16BE(0) % 900000)}`,
          organizationId: org.id,
          planId: plan.id,
          createdByUserId: user.id,
          amountVnd: new Decimal(3900000),
          status: PaymentOrderStatus.PENDING,
          transferContent: 'PENDING',
          bankCode: 'ACB',
          accountNumber: ACCOUNT,
          accountName: 'TEST',
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });
      const r = await api('/auto-post/status', token);
      results.push({
        name: 'pending_order_still_blocked',
        ok: r.status === 403,
        detail: `status=${r.status} order=${order.code}`,
      });
    }

    // 4) Kích hoạt ACTIVE → được vào
    {
      await prisma.subscription.create({
        data: {
          organizationId: org.id,
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        },
      });
      const r = await api('/billing/subscription', token);
      const subOk =
        r.status === 200 &&
        ((r.json as { subscriptionStatus?: string }).subscriptionStatus === 'ACTIVE' ||
          (r.json as { status?: string }).status === 'ACTIVE');
      const content = await api('/content-marketing/status', token);
      results.push({
        name: 'active_plan_allows_content',
        ok: subOk && content.status === 200,
        detail: `sub=${r.status} content=${content.status}`,
      });
    }

    // 5) Hết hạn → khóa lại
    {
      await prisma.subscription.updateMany({
        where: { organizationId: org.id },
        data: {
          status: SubscriptionStatus.EXPIRED,
          currentPeriodEnd: new Date(Date.now() - 86400000),
        },
      });
      const r = await api('/content-marketing/status', token);
      results.push({
        name: 'expired_plan_blocks_again',
        ok: r.status === 403 && (r.json as { code?: string }).code === 'SUBSCRIPTION_REQUIRED',
        detail: `status=${r.status}`,
      });
    }

    // 6) Webhook SePay kích hoạt lại → mở quyền
    {
      await prisma.subscription.deleteMany({ where: { organizationId: org.id } });
      const code = `${PREFIX}${100000 + (randomBytes(2).readUInt16BE(0) % 900000)}`;
      await prisma.paymentOrder.create({
        data: {
          code,
          organizationId: org.id,
          planId: plan.id,
          createdByUserId: user.id,
          amountVnd: new Decimal(3900000),
          status: PaymentOrderStatus.PENDING,
          transferContent: code,
          bankCode: 'ACB',
          accountNumber: ACCOUNT,
          accountName: 'TEST',
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });
      const sepayId = `${Date.now()}${randomBytes(2).toString('hex')}`;
      const wh = await fetch(`${API}/api/v1/payments/sepay/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Apikey ${SEPAY_TOKEN}`,
        },
        body: JSON.stringify({
          id: sepayId,
          transferType: 'in',
          transferAmount: 3900000,
          accountNumber: ACCOUNT,
          content: `CK ${code}`,
          gateway: 'ACB',
        }),
      });
      const whJson = await wh.json().catch(() => ({}));
      const content = await api('/content-marketing/status', token);
      const activated = (whJson as { activated?: boolean }).activated === true;
      results.push({
        name: 'sepay_paid_unlocks',
        ok: wh.status === 200 && activated && content.status === 200,
        detail: `wh=${wh.status} activated=${activated} content=${content.status}`,
      });
    }

    // 7) Auth me luôn mở
    {
      const r = await api('/auth/me', token);
      results.push({
        name: 'auth_me_allowed',
        ok: r.status === 200,
        detail: String(r.status),
      });
    }
  } finally {
    await cleanup(org.id);
  }

  console.log('\n=== Subscription gate tests ===');
  let failed = 0;
  for (const c of results) {
    console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `  ${c.detail}` : ''}`);
    if (!c.ok) failed += 1;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
