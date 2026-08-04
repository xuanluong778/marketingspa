/**
 * Integration tests for SePay billing (MKTA + ACB 7982468).
 * node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-sepay-billing.ts
 */
import { PrismaClient, PaymentOrderStatus, SubscriptionStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();
const API = process.env.API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:4000';
const TOKEN = process.env.SEPAY_API_TOKEN || 'dev-sepay-api-token-change-me';
const ACCOUNT = process.env.PAYMENT_ACCOUNT_NUMBER || '7982468';
const PREFIX = (process.env.PAYMENT_CODE_PREFIX || 'MKTA').toUpperCase();

type CaseResult = { name: string; ok: boolean; detail?: string };

async function postWebhook(body: Record<string, unknown>, auth = true) {
  const res = await fetch(`${API}/api/v1/payments/sepay/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: `Apikey ${TOKEN}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function sepayId() {
  // Không dùng prefix test-/ops-/smoke- — production chặn synthetic trừ ALLOW_SYNTHETIC_SEPAY=1
  return `${Date.now()}${randomBytes(4).toString('hex')}`;
}

function mktaCode() {
  const n = 100000 + (randomBytes(3).readUIntBE(0, 3) % 900000);
  return `${PREFIX}${n}`;
}

async function ensureFixtures() {
  const plan = await prisma.subscriptionPlan.findFirst({ where: { code: 'msp-pro-6m' } });
  if (!plan) throw new Error('Missing plan msp-pro-6m — run seed');
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!org) throw new Error('No organization');
  const user = await prisma.user.findFirst({ where: { organizationId: org.id } });
  return { plan, org, user };
}

async function makeOrder(opts: {
  orgId: string;
  planId: string;
  userId?: string | null;
  amount: number;
  code: string;
  expiresAt?: Date;
  status?: PaymentOrderStatus;
}) {
  return prisma.paymentOrder.create({
    data: {
      code: opts.code,
      organizationId: opts.orgId,
      planId: opts.planId,
      createdByUserId: opts.userId ?? null,
      amountVnd: new Decimal(opts.amount),
      status: opts.status ?? PaymentOrderStatus.PENDING,
      transferContent: opts.code,
      bankCode: 'ACB',
      accountNumber: ACCOUNT,
      accountName: 'CONG TY TNHH THE GIOI DIGI',
      qrUrl: 'https://example.com/qr.png',
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 30 * 60 * 1000),
    },
  });
}

async function run() {
  const results: CaseResult[] = [];
  const { plan, org, user } = await ensureFixtures();

  {
    const name = 'exact_amount_activates';
    const code = mktaCode();
    const order = await makeOrder({
      orgId: org.id,
      planId: plan.id,
      userId: user?.id,
      amount: 3900000,
      code,
    });
    const id = sepayId();
    const r = await postWebhook({
      id,
      transferType: 'in',
      transferAmount: 3900000,
      accountNumber: ACCOUNT,
      content: `CK ${code} spa`,
      gateway: 'ACB',
    });
    const updated = await prisma.paymentOrder.findUnique({ where: { id: order.id } });
    const sub = await prisma.subscription.findFirst({
      where: { organizationId: org.id },
      orderBy: { currentPeriodEnd: 'desc' },
    });
    const ok =
      (r.status === 201 || r.status === 200) &&
      updated?.status === 'PAID' &&
      Boolean(sub) &&
      (r.json as { matched?: boolean }).matched === true;
    results.push({
      name,
      ok: Boolean(ok),
      detail: `http=${r.status} order=${updated?.status} matched=${(r.json as { matched?: boolean }).matched} code=${code}`,
    });
  }

  {
    const name = 'underpay_review_required';
    const code = mktaCode();
    const order = await makeOrder({
      orgId: org.id,
      planId: plan.id,
      amount: 3900000,
      code,
    });
    const r = await postWebhook({
      id: sepayId(),
      transferType: 'in',
      transferAmount: 1000,
      accountNumber: ACCOUNT,
      content: code,
    });
    const updated = await prisma.paymentOrder.findUnique({ where: { id: order.id } });
    results.push({
      name,
      ok:
        updated?.status === 'REVIEW_REQUIRED' &&
        (r.json as { matched?: boolean }).matched === false,
      detail: `status=${updated?.status} reason=${(r.json as { reason?: string }).reason}`,
    });
  }

  {
    const name = 'overpay_review_required';
    const code = mktaCode();
    const order = await makeOrder({
      orgId: org.id,
      planId: plan.id,
      amount: 3900000,
      code,
    });
    const r = await postWebhook({
      id: sepayId(),
      transferType: 'in',
      transferAmount: 5000000,
      accountNumber: ACCOUNT,
      content: code,
    });
    const updated = await prisma.paymentOrder.findUnique({ where: { id: order.id } });
    results.push({
      name,
      ok: updated?.status === 'REVIEW_REQUIRED',
      detail: `status=${updated?.status} reason=${(r.json as { reason?: string }).reason}`,
    });
  }

  {
    const name = 'wrong_order_code';
    const r = await postWebhook({
      id: sepayId(),
      transferType: 'in',
      transferAmount: 3900000,
      accountNumber: ACCOUNT,
      content: `${PREFIX}999999`,
    });
    results.push({
      name,
      ok: (r.json as { matched?: boolean }).matched === false,
      detail: `reason=${(r.json as { reason?: string }).reason}`,
    });
  }

  {
    const name = 'webhook_replay_idempotent';
    const code = mktaCode();
    await makeOrder({ orgId: org.id, planId: plan.id, amount: 3900000, code });
    const id = sepayId();
    const body = {
      id,
      transferType: 'in',
      transferAmount: 3900000,
      accountNumber: ACCOUNT,
      content: code,
    };
    const r1 = await postWebhook(body);
    const r2 = await postWebhook(body);
    const count = await prisma.paymentTransaction.count({
      where: { sepayTransactionId: String(id) },
    });
    results.push({
      name,
      ok: count === 1 && (r2.json as { duplicated?: boolean }).duplicated === true,
      detail: `count=${count} r1=${(r1.json as { matched?: boolean }).matched} r2dup=${(r2.json as { duplicated?: boolean }).duplicated}`,
    });
  }

  {
    const name = 'concurrent_same_txid';
    const code = mktaCode();
    await makeOrder({ orgId: org.id, planId: plan.id, amount: 3900000, code });
    const id = sepayId();
    const body = {
      id,
      transferType: 'in',
      transferAmount: 3900000,
      accountNumber: ACCOUNT,
      content: code,
    };
    const [a, b] = await Promise.all([postWebhook(body), postWebhook(body)]);
    const count = await prisma.paymentTransaction.count({
      where: { sepayTransactionId: String(id) },
    });
    results.push({
      name,
      ok: count === 1,
      detail: `count=${count} a=${a.status} b=${b.status}`,
    });
  }

  {
    const name = 'expired_order';
    const code = mktaCode();
    const order = await makeOrder({
      orgId: org.id,
      planId: plan.id,
      amount: 3900000,
      code,
      expiresAt: new Date(Date.now() - 60_000),
    });
    const r = await postWebhook({
      id: sepayId(),
      transferType: 'in',
      transferAmount: 3900000,
      accountNumber: ACCOUNT,
      content: code,
    });
    const updated = await prisma.paymentOrder.findUnique({ where: { id: order.id } });
    results.push({
      name,
      ok:
        updated?.status === 'EXPIRED' &&
        (r.json as { matched?: boolean }).matched === false,
      detail: `status=${updated?.status} reason=${(r.json as { reason?: string }).reason}`,
    });
  }

  {
    const name = 'extend_while_active';
    const existing = await prisma.subscription.findFirst({
      where: { organizationId: org.id, status: SubscriptionStatus.ACTIVE },
      orderBy: { currentPeriodEnd: 'desc' },
    });
    if (!existing) {
      results.push({ name, ok: false, detail: 'no active sub' });
    } else {
      const before = existing.currentPeriodEnd.getTime();
      const code = mktaCode();
      await makeOrder({ orgId: org.id, planId: plan.id, amount: 3900000, code });
      await postWebhook({
        id: sepayId(),
        transferType: 'in',
        transferAmount: 3900000,
        accountNumber: ACCOUNT,
        content: code,
      });
      const after = await prisma.subscription.findUnique({ where: { id: existing.id } });
      const monthsAdded =
        after && after.currentPeriodEnd.getTime() > before + 150 * 24 * 3600 * 1000;
      results.push({
        name,
        ok: Boolean(monthsAdded),
        detail: `before=${new Date(before).toISOString()} after=${after?.currentPeriodEnd.toISOString()}`,
      });
    }
  }

  {
    const name = 'fake_webhook_rejected';
    const r = await postWebhook(
      {
        id: sepayId(),
        transferType: 'in',
        transferAmount: 3900000,
        accountNumber: ACCOUNT,
        content: `${PREFIX}000001`,
      },
      false,
    );
    results.push({
      name,
      ok: r.status === 401,
      detail: `status=${r.status}`,
    });
  }

  {
    const name = 'wrong_account';
    const code = mktaCode();
    const order = await makeOrder({ orgId: org.id, planId: plan.id, amount: 3900000, code });
    const r = await postWebhook({
      id: sepayId(),
      transferType: 'in',
      transferAmount: 3900000,
      accountNumber: '000000000',
      content: code,
    });
    const updated = await prisma.paymentOrder.findUnique({ where: { id: order.id } });
    results.push({
      name,
      ok:
        (r.json as { matched?: boolean }).matched === false &&
        updated?.status === 'REVIEW_REQUIRED',
      detail: `reason=${(r.json as { reason?: string }).reason} status=${updated?.status}`,
    });
  }

  console.log('\n=== SePay billing test results (MKTA / 7982468) ===');
  let failed = 0;
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  ${r.detail ?? ''}`);
    if (!r.ok) failed++;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

void run().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
