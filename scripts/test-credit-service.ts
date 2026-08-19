/**
 * E2E tests for CreditService (multi-tenant organizationId).
 * node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-credit-service.ts
 */
import { PrismaClient, CreditTransactionType } from '@prisma/client';
import { CREDIT_FEATURE_CODES } from '@marketingspa/shared';
import { CreditService, InsufficientCreditsError } from '../apps/api/src/credit/credit.service';
import { PrismaService } from '../apps/api/src/prisma/prisma.service';

type Case = { name: string; ok: boolean; detail?: string };

async function main() {
  const results: Case[] = [];
  const prisma = new PrismaClient();
  const credit = new CreditService(prisma as unknown as PrismaService);
  const stamp = Date.now();

  const org = await prisma.organization.create({
    data: {
      name: `Credit Test ${stamp}`,
      slug: `credit-test-${stamp}`,
      email: `credit.${stamp}@example.com`,
    },
  });
  await prisma.creditWallet.create({ data: { organizationId: org.id, balance: 0 } });

  async function cleanup() {
    await prisma.creditTransaction.deleteMany({ where: { organizationId: org.id } });
    await prisma.creditWallet.deleteMany({ where: { organizationId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }

  try {
    // grant + balance
    {
      const r = await credit.grant({
        organizationId: org.id,
        amount: 100,
        idempotencyKey: `grant-${stamp}`,
        reason: 'Test grant',
      });
      const bal = await credit.getBalance(org.id);
      results.push({
        name: 'grant_increases_balance',
        ok: !r.idempotent && bal.balance === 100 && bal.lifetimeEarned === 100,
        detail: JSON.stringify(bal),
      });
    }

    // idempotent grant
    {
      const r1 = await credit.grant({
        organizationId: org.id,
        amount: 100,
        idempotencyKey: `grant-${stamp}`,
      });
      const bal = await credit.getBalance(org.id);
      results.push({
        name: 'grant_idempotent',
        ok: r1.idempotent && bal.balance === 100,
        detail: `balance=${bal.balance}`,
      });
    }

    // checkAvailable
    {
      const ok = await credit.checkAvailable(org.id, 50);
      const no = await credit.checkAvailable(org.id, 500);
      results.push({
        name: 'check_available',
        ok: ok === true && no === false,
        detail: `50=${ok} 500=${no}`,
      });
    }

    // direct usage
    {
      await credit.usage({
        organizationId: org.id,
        amount: 30,
        idempotencyKey: `usage-${stamp}`,
        reason: 'Direct usage',
      });
      const bal = await credit.getBalance(org.id);
      results.push({
        name: 'usage_debits_balance',
        ok: bal.balance === 70 && bal.lifetimeUsed === 30,
        detail: JSON.stringify(bal),
      });
    }

    // insufficient
    {
      let blocked = false;
      try {
        await credit.usage({
          organizationId: org.id,
          amount: 9999,
          idempotencyKey: `usage-fail-${stamp}`,
        });
      } catch (e) {
        blocked = e instanceof InsufficientCreditsError;
      }
      results.push({ name: 'usage_insufficient_blocked', ok: blocked });
    }

    // reserve → commit
    {
      const ref = `job-${stamp}`;
      await credit.reserve({
        organizationId: org.id,
        amount: 20,
        referenceId: ref,
        idempotencyKey: `reserve-${stamp}`,
        featureCode: CREDIT_FEATURE_CODES.ASSISTANT_CHAT,
      });
      let mid = await credit.getBalance(org.id);
      const reservedOk = mid.balance === 50 && mid.reservedBalance === 20;

      await credit.commit({
        organizationId: org.id,
        referenceId: ref,
        idempotencyKey: `commit-${stamp}`,
      });
      const after = await credit.getBalance(org.id);
      results.push({
        name: 'reserve_commit',
        ok: reservedOk && after.balance === 50 && after.reservedBalance === 0 && after.lifetimeUsed === 50,
        detail: JSON.stringify({ mid, after }),
      });
    }

    // reserve → release
    {
      await credit.grant({
        organizationId: org.id,
        amount: 10,
        idempotencyKey: `grant2-${stamp}`,
      });
      const ref = `release-${stamp}`;
      await credit.reserve({
        organizationId: org.id,
        amount: 10,
        referenceId: ref,
        idempotencyKey: `reserve2-${stamp}`,
      });
      await credit.release({
        organizationId: org.id,
        referenceId: ref,
        idempotencyKey: `release-${stamp}`,
      });
      const bal = await credit.getBalance(org.id);
      results.push({
        name: 'reserve_release',
        ok: bal.balance === 60 && bal.reservedBalance === 0,
        detail: JSON.stringify(bal),
      });
    }

    // feature pricing usage
    {
      const cost = await credit.getFeatureCost(CREDIT_FEATURE_CODES.CHATBOT_REPLY);
      await credit.usage({
        organizationId: org.id,
        featureCode: CREDIT_FEATURE_CODES.CHATBOT_REPLY,
        idempotencyKey: `feature-usage-${stamp}`,
      });
      const bal = await credit.getBalance(org.id);
      results.push({
        name: 'feature_pricing_usage',
        ok: cost === 1 && bal.balance === 59,
        detail: `cost=${cost} balance=${bal.balance}`,
      });
    }

    // admin adjust + refund + purchase
    {
      await credit.adjust({
        organizationId: org.id,
        delta: 5,
        idempotencyKey: `adjust+-${stamp}`,
        reason: 'Admin bonus',
      });
      await credit.purchase({
        organizationId: org.id,
        amount: 3,
        idempotencyKey: `purchase-${stamp}`,
      });
      await credit.refund({
        organizationId: org.id,
        amount: 2,
        idempotencyKey: `refund-${stamp}`,
      });
      const bal = await credit.getBalance(org.id);
      results.push({
        name: 'adjust_purchase_refund',
        ok: bal.balance === 69,
        detail: JSON.stringify(bal),
      });
    }

    // ledger types persisted
    {
      const types = await prisma.creditTransaction.findMany({
        where: { organizationId: org.id },
        select: { type: true },
      });
      const set = new Set(types.map((t) => t.type));
      results.push({
        name: 'transaction_types_logged',
        ok:
          set.has(CreditTransactionType.GRANT) &&
          set.has(CreditTransactionType.USAGE) &&
          set.has(CreditTransactionType.RESERVE) &&
          set.has(CreditTransactionType.RELEASE),
        detail: [...set].join(','),
      });
    }

    // balance never negative (DB constraint)
    {
      let constrained = false;
      try {
        await prisma.creditWallet.update({
          where: { organizationId: org.id },
          data: { balance: -1 },
        });
      } catch {
        constrained = true;
      }
      results.push({ name: 'db_balance_nonneg_constraint', ok: constrained });
    }

    {
      const before = await credit.getBalance(org.id);
      const out = await credit.runPaidFeature({
        organizationId: org.id,
        featureCode: CREDIT_FEATURE_CODES.CHATBOT_REPLY,
        referenceId: `paid-ok-${stamp}`,
        fn: async (ctx) => {
          ctx.markProviderStarted();
          return 42;
        },
      });
      const after = await credit.getBalance(org.id);
      results.push({
        name: 'run_paid_success_commits',
        ok: out === 42 && after.balance === before.balance - 1 && after.reservedBalance === 0,
        detail: JSON.stringify({ before: before.balance, after: after.balance }),
      });
    }

    {
      const before = await credit.getBalance(org.id);
      let threw = false;
      try {
        await credit.runPaidFeature({
          organizationId: org.id,
          featureCode: CREDIT_FEATURE_CODES.CHATBOT_REPLY,
          referenceId: `paid-fail-${stamp}`,
          fn: async () => {
            throw new Error('before provider');
          },
        });
      } catch {
        threw = true;
      }
      const after = await credit.getBalance(org.id);
      results.push({
        name: 'run_paid_fail_releases',
        ok: threw && after.balance === before.balance && after.reservedBalance === 0,
        detail: JSON.stringify({ before: before.balance, after: after.balance }),
      });
    }

    {
      let blocked = false;
      let ran = false;
      try {
        await credit.runPaidFeature({
          organizationId: org.id,
          featureCode: CREDIT_FEATURE_CODES.CHATBOT_REPLY,
          amount: 99999,
          referenceId: `paid-insuf-${stamp}`,
          fn: async () => {
            ran = true;
            return 1;
          },
        });
      } catch (e) {
        blocked = e instanceof InsufficientCreditsError;
      }
      results.push({
        name: 'run_paid_insufficient_skips_provider',
        ok: blocked && !ran,
      });
    }

    {
      const ref = `paid-dup-${stamp}`;
      const before = await credit.getBalance(org.id);
      await credit.runPaidFeature({
        organizationId: org.id,
        featureCode: CREDIT_FEATURE_CODES.CHATBOT_REPLY,
        referenceId: ref,
        fn: async (ctx) => {
          ctx.markProviderStarted();
          return 'a';
        },
      });
      const mid = await credit.getBalance(org.id);
      let already = false;
      try {
        await credit.runPaidFeature({
          organizationId: org.id,
          featureCode: CREDIT_FEATURE_CODES.CHATBOT_REPLY,
          referenceId: ref,
          fn: async () => 'b',
        });
      } catch {
        already = true;
      }
      const after = await credit.getBalance(org.id);
      results.push({
        name: 'run_paid_retry_no_double_charge',
        ok: already && mid.balance === after.balance && mid.balance === before.balance - 1,
        detail: JSON.stringify({ before: before.balance, mid: mid.balance, after: after.balance }),
      });
    }
  } finally {
    await cleanup();
  }

  console.log('\n=== CreditService E2E ===');
  let failed = 0;
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  ${r.detail ?? ''}`);
    if (!r.ok) failed++;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
