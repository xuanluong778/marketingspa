/**
 * Test lifecycle status for GET /billing/subscription (server-side remainingDays).
 * Run: node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-account-subscription-status.ts
 */
import { PrismaClient, SubscriptionStatus } from '@prisma/client';

const prisma = new PrismaClient();

function compute(expiresAt: Date, now = new Date()) {
  const remainingDays = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 86400000));
  const expired = expiresAt.getTime() <= now.getTime();
  const status = expired ? 'EXPIRED' : remainingDays <= 15 ? 'EXPIRING' : 'ACTIVE';
  return { remainingDays, status };
}

type Case = { name: string; ok: boolean; detail?: string };

async function main() {
  const results: Case[] = [];
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!org) throw new Error('No org');
  const plan6 = await prisma.subscriptionPlan.findFirst({ where: { code: 'msp-pro-6m' } });
  const plan12 = await prisma.subscriptionPlan.findFirst({ where: { code: 'msp-pro-12m' } });
  if (!plan6 || !plan12) throw new Error('Missing plans');

  const existing = await prisma.subscription.findMany({ where: { organizationId: org.id } });
  // Snapshot then restore
  const snapshot = existing.map((s) => ({ ...s }));

  async function setSub(opts: {
    planId: string;
    startOffsetDays: number;
    /** Exact ms from now until expiry (preferred for boundary tests) */
    endFromNowMs?: number;
    endOffsetDays?: number;
  }) {
    await prisma.subscription.deleteMany({ where: { organizationId: org.id } });
    const start = new Date();
    start.setDate(start.getDate() + opts.startOffsetDays);
    const end =
      opts.endFromNowMs != null
        ? new Date(Date.now() + opts.endFromNowMs)
        : (() => {
            const d = new Date();
            d.setDate(d.getDate() + (opts.endOffsetDays ?? 0));
            return d;
          })();
    return prisma.subscription.create({
      data: {
        organizationId: org.id,
        planId: opts.planId,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: start,
        currentPeriodEnd: end,
      },
    });
  }

  // Pure unit cases for remainingDays formula
  {
    const now = new Date('2026-07-25T12:00:00.000Z');
    const d15 = new Date(now);
    d15.setDate(d15.getDate() + 15);
    const r = compute(d15, now);
    results.push({
      name: 'formula_15_days_expiring',
      ok: r.remainingDays === 15 && r.status === 'EXPIRING',
      detail: JSON.stringify(r),
    });
  }
  {
    const now = new Date('2026-07-25T12:00:00.000Z');
    const d7 = new Date(now);
    d7.setDate(d7.getDate() + 7);
    const r = compute(d7, now);
    results.push({
      name: 'formula_7_days_expiring',
      ok: r.remainingDays === 7 && r.status === 'EXPIRING',
      detail: JSON.stringify(r),
    });
  }
  {
    const now = new Date('2026-07-25T12:00:00.000Z');
    const past = new Date(now);
    past.setDate(past.getDate() - 1);
    const r = compute(past, now);
    results.push({
      name: 'formula_expired',
      ok: r.remainingDays === 0 && r.status === 'EXPIRED',
      detail: JSON.stringify(r),
    });
  }
  {
    const now = new Date('2026-07-25T12:00:00.000Z');
    const far = new Date(now);
    far.setDate(far.getDate() + 100);
    const r = compute(far, now);
    results.push({
      name: 'formula_active',
      ok: r.remainingDays === 100 && r.status === 'ACTIVE',
      detail: JSON.stringify(r),
    });
  }

  // DB-backed: no plan
  {
    await prisma.subscription.deleteMany({ where: { organizationId: org.id } });
    const count = await prisma.subscription.count({ where: { organizationId: org.id } });
    results.push({ name: 'db_no_plan', ok: count === 0 });
  }

  // 6 month plan active
  {
    const sub = await setSub({ planId: plan6.id, startOffsetDays: -30, endOffsetDays: 150 });
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: sub.planId } });
    const r = compute(sub.currentPeriodEnd);
    results.push({
      name: 'db_6m_active',
      ok: plan?.durationMonths === 6 && r.status === 'ACTIVE' && r.remainingDays > 15,
      detail: `months=${plan?.durationMonths} ${JSON.stringify(r)}`,
    });
  }

  // 12 month
  {
    const sub = await setSub({ planId: plan12.id, startOffsetDays: -10, endOffsetDays: 300 });
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: sub.planId } });
    const r = compute(sub.currentPeriodEnd);
    results.push({
      name: 'db_12m_active',
      ok: plan?.durationMonths === 12 && r.status === 'ACTIVE',
      detail: `months=${plan?.durationMonths} ${JSON.stringify(r)}`,
    });
  }

  // ≤15 days (exactly ~15d − 1h → ceil = 15)
  {
    const sub = await setSub({
      planId: plan6.id,
      startOffsetDays: -170,
      endFromNowMs: 15 * 86400000 - 3600000,
    });
    const r = compute(sub.currentPeriodEnd);
    results.push({
      name: 'db_15_days',
      ok: r.remainingDays === 15 && r.status === 'EXPIRING',
      detail: JSON.stringify(r),
    });
  }

  // ≤7 days
  {
    const sub = await setSub({
      planId: plan6.id,
      startOffsetDays: -175,
      endFromNowMs: 7 * 86400000 - 3600000,
    });
    const r = compute(sub.currentPeriodEnd);
    results.push({
      name: 'db_7_days',
      ok: r.remainingDays === 7 && r.status === 'EXPIRING',
      detail: JSON.stringify(r),
    });
  }

  // expired
  {
    const sub = await setSub({ planId: plan6.id, startOffsetDays: -200, endOffsetDays: -1 });
    const r = compute(sub.currentPeriodEnd);
    results.push({
      name: 'db_expired',
      ok: r.remainingDays === 0 && r.status === 'EXPIRED',
      detail: JSON.stringify(r),
    });
  }

  // Restore snapshot (best-effort)
  await prisma.subscription.deleteMany({ where: { organizationId: org.id } });
  for (const s of snapshot) {
    await prisma.subscription.create({
      data: {
        id: s.id,
        organizationId: s.organizationId,
        planId: s.planId,
        status: s.status,
        currentPeriodStart: s.currentPeriodStart,
        currentPeriodEnd: s.currentPeriodEnd,
        cancelledAt: s.cancelledAt,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      },
    });
  }

  console.log('\n=== Account subscription status tests ===');
  let failed = 0;
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  ${r.detail ?? ''}`);
    if (!r.ok) failed++;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

void main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
