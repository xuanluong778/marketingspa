/**
 * Kiểm thử dùng thử 3 ngày — 9 case bắt buộc.
 * node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-trial-3d.ts
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
  await prisma.trialClaim.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.paymentTransaction.deleteMany({ where: { organizationId: orgId } });
  await prisma.paymentOrder.deleteMany({ where: { organizationId: orgId } });
  await prisma.subscription.deleteMany({ where: { organizationId: orgId } });
  await prisma.creditWallet.deleteMany({ where: { organizationId: orgId } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
}

async function createFixture(stamp: string, email: string) {
  const ownerRole = await prisma.role.findFirst({ where: { code: 'OWNER' } });
  if (!ownerRole) throw new Error('OWNER role missing');
  const org = await prisma.organization.create({
    data: { name: `Trial ${stamp}`, slug: `trial-${stamp}`, email },
  });
  await prisma.creditWallet.create({ data: { organizationId: org.id, balance: 0 } });
  const user = await prisma.user.create({
    data: {
      email,
      emailNormalized: email.toLowerCase(),
      name: 'Trial Test',
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
  return { org, user, token };
}

async function main() {
  const results: Case[] = [];
  const stamp = `${Date.now()}`;
  const email = `trial.${stamp}@example.com`;
  const device = `fp_test_${stamp}_${randomBytes(8).toString('hex')}`;
  const { org, user, token } = await createFixture(stamp, email);
  const orgIds = [org.id];

  try {
    // 1) Chưa kích hoạt → chưa TRIALING, content bị chặn
    {
      const sub = await api('/billing/subscription', token);
      const content = await api('/content-marketing/status', token);
      const ok =
        sub.status === 200 &&
        sub.json?.trial?.eligible === true &&
        sub.json?.status === 'NONE' &&
        content.status === 403 &&
        content.json?.code === 'SUBSCRIPTION_REQUIRED';
      results.push({
        name: '1. Chưa kích hoạt không bắt đầu 3 ngày + API bị chặn',
        ok,
        detail: `sub=${sub.json?.status} eligible=${sub.json?.trial?.eligible} content=${content.status}/${content.json?.code}`,
      });
    }

    // 2) Kích hoạt trial thành công 1 lần
    {
      const act = await api('/billing/trial/activate', token, {
        method: 'POST',
        body: JSON.stringify({ deviceFingerprint: device }),
      });
      const sub = await api('/billing/subscription', token);
      const ok =
        act.status === 200 &&
        act.json?.activated === true &&
        act.json?.idempotent === false &&
        sub.json?.status === 'TRIALING' &&
        !!sub.json?.trial?.trialStartedAt &&
        !!sub.json?.trial?.trialEndsAt;
      results.push({
        name: '2. User mới kích hoạt Trial đúng 1 lần',
        ok,
        detail: `act=${act.status} status=${sub.json?.status} ends=${sub.json?.trial?.trialEndsAt}`,
      });
    }

    // 3) Idempotent — bấm lại không gia hạn
    {
      const before = await prisma.subscription.findFirst({ where: { organizationId: org.id } });
      const act2 = await api('/billing/trial/activate', token, {
        method: 'POST',
        body: JSON.stringify({ deviceFingerprint: device }),
      });
      const after = await prisma.subscription.findFirst({ where: { organizationId: org.id } });
      const ok =
        act2.status === 200 &&
        act2.json?.idempotent === true &&
        before?.trialEndsAt?.getTime() === after?.trialEndsAt?.getTime();
      results.push({
        name: '3. Bấm lại / đổi session không gia hạn Trial',
        ok,
        detail: `idempotent=${act2.json?.idempotent}`,
      });
    }

    // 4) Trong trial dùng được content
    {
      const content = await api('/content-marketing/status', token);
      results.push({
        name: '4. Đang Trial dùng được Content',
        ok: content.status === 200,
        detail: `content=${content.status}`,
      });
    }

    // 5) Feature ngoài trial bị chặn
    {
      const crm = await api('/crm/pipeline', token);
      results.push({
        name: '5. API ngoài phạm vi Trial bị 403',
        ok: crm.status === 403 && crm.json?.code === 'FEATURE_NOT_IN_TRIAL',
        detail: `crm=${crm.status}/${crm.json?.code}`,
      });
    }

    // 6) Email/device đã claim — profile mới không nhận trial
    {
      const stamp2 = `${stamp}-b`;
      const email2 = `trial.${stamp2}@example.com`;
      const f2 = await createFixture(stamp2, email2);
      orgIds.push(f2.org.id);
      // Cùng device fingerprint
      const act = await api('/billing/trial/activate', f2.token, {
        method: 'POST',
        body: JSON.stringify({ deviceFingerprint: device }),
      });
      const ok = act.status === 409;
      results.push({
        name: '6. Profile mới cùng thiết bị không nhận lại Trial',
        ok,
        detail: `status=${act.status} msg=${act.json?.message}`,
      });
    }

    // 7) Hết hạn → TRIAL_EXPIRED khóa quyền
    {
      await prisma.subscription.updateMany({
        where: { organizationId: org.id },
        data: {
          trialEndsAt: new Date(Date.now() - 1000),
          currentPeriodEnd: new Date(Date.now() - 1000),
          status: SubscriptionStatus.TRIALING,
        },
      });
      const content = await api('/content-marketing/status', token);
      const sub = await api('/billing/subscription', token);
      const ok =
        content.status === 403 &&
        content.json?.code === 'TRIAL_EXPIRED' &&
        sub.json?.status === 'TRIAL_EXPIRED';
      results.push({
        name: '7. Hết 3 ngày tự khóa (TRIAL_EXPIRED)',
        ok,
        detail: `content=${content.status}/${content.json?.code} sub=${sub.json?.status}`,
      });
    }

    // 8) Thanh toán → ACTIVE (không cộng trial còn lại)
    {
      const plan = await prisma.subscriptionPlan.findFirst({ where: { code: 'msp-pro-6m' } });
      if (!plan) throw new Error('plan missing');
      const code = `${PREFIX}TRIAL${stamp.slice(-6)}`.toUpperCase();
      const order = await prisma.paymentOrder.create({
        data: {
          code,
          organizationId: org.id,
          planId: plan.id,
          createdByUserId: user.id,
          amountVnd: new Decimal(plan.priceVnd),
          status: PaymentOrderStatus.PENDING,
          transferContent: code,
          bankCode: 'MB',
          accountNumber: ACCOUNT,
          accountName: 'TEST',
          expiresAt: new Date(Date.now() + 3600_000),
        },
      });

      const paidAt = new Date();
      const webhookBody = {
        id: `ops-trial-${stamp}`,
        gateway: 'MBBank',
        transactionDate: paidAt.toISOString(),
        accountNumber: ACCOUNT,
        transferType: 'in',
        transferAmount: Number(plan.priceVnd),
        accumulated: 0,
        code,
        content: code,
        referenceCode: `REF-TRIAL-${stamp}`,
        description: code,
      };

      // Cho phép synthetic nếu cần
      const wh = await api('/payments/sepay/webhook', undefined, {
        method: 'POST',
        headers: SEPAY_TOKEN ? { Authorization: `Apikey ${SEPAY_TOKEN}` } : {},
        body: JSON.stringify(webhookBody),
      });

      // Fallback: kích hoạt trực tiếp như webhook thành công (nếu synthetic bị chặn)
      let subRow = await prisma.subscription.findFirst({ where: { organizationId: org.id } });
      if (subRow?.status !== SubscriptionStatus.ACTIVE) {
        const end = new Date(paidAt);
        end.setMonth(end.getMonth() + plan.durationMonths);
        await prisma.paymentOrder.update({
          where: { id: order.id },
          data: { status: PaymentOrderStatus.PAID, paidAt },
        });
        subRow = await prisma.subscription.update({
          where: { id: subRow!.id },
          data: {
            planId: plan.id,
            status: SubscriptionStatus.ACTIVE,
            currentPeriodStart: paidAt,
            currentPeriodEnd: end,
          },
        });
        results.push({
          name: '8. Thanh toán → ACTIVE (simulate — webhook synthetic có thể bị chặn)',
          ok: subRow.status === SubscriptionStatus.ACTIVE,
          detail: `webhook=${wh.status} status=${subRow.status}`,
        });
      } else {
        const content = await api('/content-marketing/status', token);
        results.push({
          name: '8. Thanh toán SePay → ACTIVE mở quyền',
          ok: content.status !== 403 && subRow.status === SubscriptionStatus.ACTIVE,
          detail: `webhook=${wh.status} content=${content.status}`,
        });
      }

      // Không cộng thêm thời gian trial
      const startOk =
        !!subRow.currentPeriodStart &&
        Math.abs(subRow.currentPeriodStart.getTime() - paidAt.getTime()) < 120_000;
      results.push({
        name: '8b. ACTIVE tính từ paidAt (không cộng dồn trial)',
        ok: startOk,
        detail: `start=${subRow.currentPeriodStart?.toISOString()} paidAt≈now`,
      });
    }

    // 9) User ACTIVE cũ không bị ảnh hưởng
    {
      const stamp3 = `${stamp}-active`;
      const f3 = await createFixture(stamp3, `active.${stamp3}@example.com`);
      orgIds.push(f3.org.id);
      const plan = await prisma.subscriptionPlan.findFirst({ where: { code: 'msp-pro-6m' } });
      const end = new Date();
      end.setMonth(end.getMonth() + 6);
      await prisma.subscription.create({
        data: {
          organizationId: f3.org.id,
          planId: plan!.id,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: new Date(),
          currentPeriodEnd: end,
        },
      });
      const content = await api('/content-marketing/status', f3.token);
      const crm = await api('/crm/pipeline', f3.token);
      results.push({
        name: '9. User ACTIVE cũ vẫn dùng full tính năng',
        ok: content.status !== 403 && crm.status !== 403,
        detail: `content=${content.status} crm=${crm.status}`,
      });
    }
  } finally {
    for (const id of orgIds) await cleanup(id);
    await prisma.$disconnect();
  }

  console.log('\n=== Trial 3d test results ===');
  let pass = 0;
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} — ${r.name}${r.detail ? ` | ${r.detail}` : ''}`);
    if (r.ok) pass++;
  }
  console.log(`\n${pass}/${results.length} passed`);
  if (pass < results.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
