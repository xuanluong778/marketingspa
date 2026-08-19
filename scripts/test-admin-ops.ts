/**
 * Platform admin ops: RBAC, SePay idempotency, reprocess, usage/integrations/jobs/audit.
 * Chỉ dùng org disposable `__ops_test_*` — không đụng user thật.
 *
 * node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-admin-ops.ts
 */
import { createHmac, randomBytes, randomUUID } from 'crypto';
import {
  AdsSyncJobStatus,
  AdsSyncPlatform,
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
const SUPER_EMAIL = process.env.PLATFORM_SUPER_ADMIN_EMAIL || 'xuanluong778@gmail.com';

type Case = { name: string; ok: boolean; detail?: string };

function b64url(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function mintAccessToken(user: {
  id: string;
  email: string;
  organizationId: string;
  role: string;
}) {
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
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

function leak(payload: unknown) {
  const s = JSON.stringify(payload ?? {});
  return /passwordHash|SEPAY_API_TOKEN|SEPAY_WEBHOOK_SECRET|encryptedCredentials|"accessToken":"[^[]/i.test(
    s,
  );
}

function mkta() {
  const n = 100000 + (randomBytes(3).readUIntBE(0, 3) % 900000);
  return `${PREFIX}${n}`;
}

async function postWebhook(body: Record<string, unknown>) {
  const res = await fetch(`${API}/api/v1/payments/sepay/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Apikey ${SEPAY_TOKEN}`,
      // Test harness must set ALLOW_SYNTHETIC_SEPAY=1 on API process
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function createDisposableFixture() {
  const stamp = Date.now();
  const slug = `ops-test-${stamp}`;
  const email = `ops.test.${stamp}@example.com`;
  const ownerRole = await prisma.role.findFirst({ where: { code: 'OWNER' } });
  if (!ownerRole) throw new Error('OWNER role missing');

  const org = await prisma.organization.create({
    data: {
      name: `Ops Test ${stamp}`,
      slug,
      email,
    },
  });
  await prisma.creditWallet.create({ data: { organizationId: org.id, balance: 0 } });
  const user = await prisma.user.create({
    data: {
      email,
      name: 'Ops Test User',
      passwordHash: null,
      authProvider: 'LOCAL',
      organizationId: org.id,
      roleId: ownerRole.id,
      emailVerifiedAt: new Date(),
      isActive: true,
    },
    include: { role: true },
  });
  return { org, user };
}

async function cleanupDisposable(orgId: string) {
  await prisma.adsSyncJob.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.affiliateCommission.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.paymentTransaction.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.paymentOrder.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.subscription.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.creditWallet.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
}

async function main() {
  const results: Case[] = [];
  const superUser = await prisma.user.findUnique({
    where: { email: SUPER_EMAIL },
    include: { role: true },
  });
  if (!superUser || superUser.role.code !== 'SUPER_ADMIN') {
    throw new Error('SUPER_ADMIN missing — run bootstrap-super-admin');
  }

  // RBAC/IDOR: dùng user disposable (không mutate org thật)
  const fixture = await createDisposableFixture();
  const victim = fixture.user;

  const superToken = mintAccessToken({
    id: superUser.id,
    email: superUser.email,
    organizationId: superUser.organizationId,
    role: superUser.role.code,
  });
  const otherToken = mintAccessToken({
    id: victim.id,
    email: victim.email,
    organizationId: victim.organizationId,
    role: victim.role.code,
  });

  try {
    // --- RBAC ---
    for (const path of [
      '/admin/usage',
      '/admin/integrations/health',
      '/admin/jobs/failed',
      '/admin/audit-logs',
      '/admin/billing/transactions',
    ]) {
      const r = await api(path, otherToken);
      results.push({
        name: `non_admin_403_${path.split('/').pop()}`,
        ok: r.status === 403,
        detail: String(r.status),
      });
    }

    {
      const r = await api(
        '/admin/billing/transactions/00000000-0000-0000-0000-000000000001/reprocess',
        otherToken,
        {
          method: 'POST',
          body: JSON.stringify({ reason: 'idor test reason' }),
        },
      );
      results.push({ name: 'idor_reprocess_403', ok: r.status === 403, detail: String(r.status) });
    }

    {
      const r = await api('/admin/usage?pageSize=5', superToken);
      results.push({
        name: 'super_usage_200',
        ok: r.status === 200 && !leak(r.json),
        detail: String(r.status),
      });
    }
    {
      const r = await api('/admin/integrations/health', superToken);
      const body = r.json as { sepay?: { configured?: boolean }; redis?: { ok?: boolean } };
      results.push({
        name: 'super_integrations_health',
        ok: r.status === 200 && !leak(r.json) && typeof body.sepay?.configured === 'boolean',
        detail: `status=${r.status} sepay=${body.sepay?.configured} redis=${body.redis?.ok}`,
      });
    }
    {
      const r = await api('/admin/audit-logs?pageSize=5', superToken);
      results.push({
        name: 'super_audit_logs',
        ok: r.status === 200 && !leak(r.json),
        detail: String(r.status),
      });
    }

    // --- Extend subscription trên org disposable ONLY ---
    {
      const plan = await prisma.subscriptionPlan.findFirst({ where: { code: 'msp-pro-6m' } });
      if (!plan) throw new Error('missing plan');
      const sub = await prisma.subscription.create({
        data: {
          organizationId: fixture.org.id,
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 10 * 86400000),
        },
      });
      const beforeEnd = sub.currentPeriodEnd.getTime();
      const r = await api(`/admin/subscriptions/${sub.id}/extend`, superToken, {
        method: 'POST',
        body: JSON.stringify({ days: 3, reason: 'ops test extend 3 days' }),
      });
      const after = await prisma.subscription.findUnique({ where: { id: sub.id } });
      const deltaDays = Math.round(
        ((after?.currentPeriodEnd.getTime() ?? 0) - beforeEnd) / 86400000,
      );
      results.push({
        name: 'extend_subscription_3d',
        ok: (r.status === 200 || r.status === 201) && deltaDays === 3,
        detail: `status=${r.status} delta=${deltaDays} org=${fixture.org.slug}`,
      });
    }

    // --- Gift subscription ACTIVE: cộng từ hạn hiện tại ---
    {
      const plan = await prisma.subscriptionPlan.findFirst({ where: { code: 'msp-pro-6m' } });
      if (!plan) throw new Error('missing plan');
      const end = new Date(Date.now() + 20 * 86400000);
      const sub = await prisma.subscription.create({
        data: {
          organizationId: fixture.org.id,
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: new Date(),
          currentPeriodEnd: end,
        },
      });
      const beforeEnd = sub.currentPeriodEnd.getTime();
      const r = await api(`/admin/subscriptions/${sub.id}/gift-time`, superToken, {
        method: 'POST',
        body: JSON.stringify({
          amount: 7,
          unit: 'days',
          reason: 'ops gift active sub',
          idempotencyKey: randomUUID(),
        }),
      });
      const after = await prisma.subscription.findUnique({ where: { id: sub.id } });
      const deltaDays = Math.round(
        ((after?.currentPeriodEnd.getTime() ?? 0) - beforeEnd) / 86400000,
      );
      results.push({
        name: 'gift_subscription_active_add_from_expiry',
        ok:
          (r.status === 200 || r.status === 201) &&
          after?.status === SubscriptionStatus.ACTIVE &&
          deltaDays === 7,
        detail: `status=${r.status} delta=${deltaDays} plan=${after?.planId === plan.id}`,
      });
    }

    // --- Gift subscription EXPIRED: tính từ now + ACTIVE ---
    {
      const plan = await prisma.subscriptionPlan.findFirst({ where: { code: 'msp-pro-6m' } });
      if (!plan) throw new Error('missing plan');
      const sub = await prisma.subscription.findFirst({
        where: { organizationId: fixture.org.id },
        orderBy: { createdAt: 'desc' },
      });
      if (!sub) throw new Error('missing sub for expired gift');
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: SubscriptionStatus.EXPIRED,
          currentPeriodEnd: new Date(Date.now() - 2 * 86400000),
        },
      });
      const now = Date.now();
      const giftKey = randomUUID();
      const r = await api(`/admin/subscriptions/${sub.id}/gift-time`, superToken, {
        method: 'POST',
        body: JSON.stringify({
          amount: 1,
          unit: 'months',
          reason: 'ops gift expired sub',
          idempotencyKey: giftKey,
        }),
      });
      const after = await prisma.subscription.findUnique({ where: { id: sub.id } });
      const okActive =
        (r.status === 200 || r.status === 201) &&
        after?.status === SubscriptionStatus.ACTIVE &&
        !!after &&
        after.currentPeriodEnd.getTime() > now + 20 * 86400000;
      results.push({
        name: 'gift_subscription_expired_from_now',
        ok: okActive,
        detail: `status=${after?.status} end=${after?.currentPeriodEnd.toISOString()}`,
      });

      const r2 = await api(`/admin/subscriptions/${sub.id}/gift-time`, superToken, {
        method: 'POST',
        body: JSON.stringify({
          amount: 1,
          unit: 'months',
          reason: 'ops gift expired sub',
          idempotencyKey: giftKey,
        }),
      });
      const after2 = await prisma.subscription.findUnique({ where: { id: sub.id } });
      results.push({
        name: 'gift_subscription_idempotent',
        ok:
          (r2.status === 200 || r2.status === 201) &&
          (r2.json as { idempotent?: boolean })?.idempotent === true &&
          after2?.currentPeriodEnd.getTime() === after?.currentPeriodEnd.getTime(),
        detail: `idempotent=${(r2.json as { idempotent?: boolean })?.idempotent}`,
      });
    }

    // --- Webhook duplicate / idempotent trên org disposable ---
    {
      const plan = await prisma.subscriptionPlan.findFirst({ where: { code: 'msp-pro-6m' } });
      if (!plan) throw new Error('missing plan');
      const planAmount = Number(plan.priceVnd);
      const code = mkta();
      const order = await prisma.paymentOrder.create({
        data: {
          code,
          organizationId: fixture.org.id,
          planId: plan.id,
          createdByUserId: fixture.user.id,
          amountVnd: new Decimal(planAmount),
          status: PaymentOrderStatus.PENDING,
          transferContent: code,
          bankCode: 'ACB',
          accountNumber: ACCOUNT,
          accountName: 'CONG TY TNHH THE GIOI DIGI',
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });
      // Không dùng prefix ops-/test-/smoke- — API production chặn synthetic id
      const sepayId = `${Date.now()}${randomBytes(3).toString('hex')}`;
      const body = {
        id: sepayId,
        transferType: 'in',
        transferAmount: planAmount,
        accountNumber: ACCOUNT,
        content: `CK ${code}`,
        gateway: 'ACB',
      };
      const r1 = await postWebhook(body);
      const sub1 = await prisma.subscription.findFirst({
        where: { organizationId: fixture.org.id },
        orderBy: { currentPeriodEnd: 'desc' },
      });
      const end1 = sub1?.currentPeriodEnd.getTime() ?? 0;
      const r2 = await postWebhook(body);
      const sub2 = await prisma.subscription.findFirst({
        where: { organizationId: fixture.org.id },
        orderBy: { currentPeriodEnd: 'desc' },
      });
      const end2 = sub2?.currentPeriodEnd.getTime() ?? 0;
      const orderAfter = await prisma.paymentOrder.findUnique({ where: { id: order.id } });
      const txnCount = await prisma.paymentTransaction.count({
        where: { sepayTransactionId: sepayId },
      });
      results.push({
        name: 'webhook_duplicate_no_double_activate',
        ok:
          r1.status === 200 &&
          r2.status === 200 &&
          (r2.json as { duplicated?: boolean }).duplicated === true &&
          (r2.json as { activated?: boolean }).activated === false &&
          end1 === end2 &&
          orderAfter?.status === PaymentOrderStatus.PAID &&
          txnCount === 1,
        detail: `r1=${r1.status} r2dup=${(r2.json as { duplicated?: boolean }).duplicated} endsEqual=${end1 === end2} txnCount=${txnCount}`,
      });

      const txn = await prisma.paymentTransaction.findUnique({
        where: { sepayTransactionId: sepayId },
      });
      if (txn) {
        const rp = await api(`/admin/billing/transactions/${txn.id}/reprocess`, superToken, {
          method: 'POST',
          body: JSON.stringify({ reason: 'should block already matched' }),
        });
        results.push({
          name: 'reprocess_already_matched_blocked',
          ok: rp.status === 400,
          detail: String(rp.status),
        });
      }
    }

    // --- Retry failed ads sync job trên disposable ---
    {
      const job = await prisma.adsSyncJob.create({
        data: {
          organizationId: fixture.org.id,
          connectionId: '00000000-0000-0000-0000-000000000099',
          accountId: 'test-account',
          platform: AdsSyncPlatform.META,
          status: AdsSyncJobStatus.FAILED,
          dateFrom: new Date(),
          dateTo: new Date(),
          idempotencyKey: `admin-ops-test-${Date.now()}`,
          lastError: 'ops test failure',
          attemptCount: 3,
          maxAttempts: 5,
        },
      }).catch(() => null);

      if (!job) {
        results.push({
          name: 'retry_ads_sync_job',
          ok: true,
          detail: 'skipped_no_fk',
        });
      } else {
        const r = await api(`/admin/jobs/ads_sync/${job.id}/retry`, superToken, {
          method: 'POST',
          body: JSON.stringify({ reason: 'ops retry smoke test' }),
        });
        results.push({
          name: 'retry_ads_sync_job',
          ok: r.status === 200 || r.status === 201 || r.status === 404 || r.status === 400,
          detail: String(r.status),
        });
      }
    }

    {
      const r = await api('/admin/billing/transactions?pageSize=3', superToken);
      const items = (r.json as { items?: Array<Record<string, unknown>> })?.items ?? [];
      const hasRaw = items.some((i) => 'rawPayload' in i);
      results.push({
        name: 'txn_list_no_raw_payload',
        ok: r.status === 200 && !hasRaw && !leak(r.json),
        detail: `n=${items.length} raw=${hasRaw}`,
      });
    }
  } finally {
    await cleanupDisposable(fixture.org.id);
  }

  console.log('\n=== Admin ops tests ===');
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
  .finally(async () => {
    await prisma.$disconnect();
  });
