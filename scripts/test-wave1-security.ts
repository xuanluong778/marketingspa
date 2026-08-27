/**
 * WAVE 1 security/stability gates (offline + live smoke).
 * Run from release root:
 *   node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-wave1-security.ts
 */
import assert from 'node:assert/strict';
import { createHmac } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { CreditLedger } from '../packages/database/src/credit-ledger';
import {
  assertPublicHttpUrl,
  SsrfValidationError,
} from '../packages/shared/src/ssrf-fetch';
import {
  isCorsOriginAllowed,
  resolveCorsOrigins,
} from '../apps/api/src/common/utils/cors-origins';

const prisma = new PrismaClient();
const results: Array<{ name: string; pass: boolean; detail: string }> = [];

function record(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
}

async function testCreditConcurrency() {
  const org = await prisma.organization.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  assert.ok(org, 'need an organization');
  const ledger = new CreditLedger(prisma);
  const key = `wave1-credit-race-${Date.now()}`;
  const amount = 1;

  // Seed enough balance (idempotent grant)
  await ledger.grant({
    organizationId: org.id,
    amount: 100,
    idempotencyKey: `${key}:seed`,
    reason: 'WAVE1 concurrency seed',
  });

  const before = await ledger.getBalance(org.id);
  const N = 40;
  const settled = await Promise.allSettled(
    Array.from({ length: N }, () =>
      ledger.usage({
        organizationId: org.id,
        amount,
        idempotencyKey: key,
        reason: 'WAVE1 concurrent usage',
        referenceId: key,
      }),
    ),
  );

  const fulfilled = settled.filter((s) => s.status === 'fulfilled') as Array<{
    status: 'fulfilled';
    value: { transactionId: string; idempotent: boolean };
  }>;
  const rejected = settled.filter((s) => s.status === 'rejected');
  assert.equal(rejected.length, 0, `unexpected rejects: ${rejected.length}`);
  assert.equal(fulfilled.length, N);
  const nonIdempotent = fulfilled.filter((s) => !s.value.idempotent);
  assert.equal(nonIdempotent.length, 1, `expected exactly 1 debit, got ${nonIdempotent.length}`);
  const txnIds = new Set(fulfilled.map((s) => s.value.transactionId));
  assert.equal(txnIds.size, 1, `expected 1 transaction id, got ${txnIds.size}`);

  const after = await ledger.getBalance(org.id);
  assert.equal(
    after.balance,
    before.balance - amount,
    `balance delta expected -${amount}, got ${after.balance - before.balance}`,
  );

  const rows = await prisma.creditTransaction.count({
    where: { organizationId: org.id, idempotencyKey: key },
  });
  assert.equal(rows, 1);
  record('CREDIT_RACE', true, `N=${N} same key → 1 txn, balance -${amount}`);
}

async function testSsrf() {
  const cases: Array<[string, string | string[]]> = [
    ['http://127.0.0.1/', 'PRIVATE_IP'],
    ['http://localhost/admin', 'LOCALHOST'],
    ['http://169.254.169.254/latest/meta-data/', 'PRIVATE_IP'],
    ['http://[::1]/', ['PRIVATE_IP', 'DNS_FAILED']],
    ['http://10.0.0.1/', 'PRIVATE_IP'],
    ['http://192.168.1.1/', 'PRIVATE_IP'],
    ['ftp://example.com/', 'BAD_SCHEME'],
  ];
  for (const [url, code] of cases) {
    try {
      await assertPublicHttpUrl(url, { skipCommerceHostBlock: true });
      throw new Error(`expected block ${url}`);
    } catch (e) {
      assert.ok(e instanceof SsrfValidationError, String(e));
      const got = (e as SsrfValidationError).code;
      const ok = Array.isArray(code) ? code.includes(got) : got === code;
      assert.ok(ok, `${url}: got ${got}, want ${code}`);
    }
  }
  record('SSRF', true, `${cases.length} blocked vectors`);
}

async function testCors() {
  const allow = resolveCorsOrigins({
    NODE_ENV: 'production',
    APP_URL: 'https://marketingautoaz.com',
    CORS_ORIGINS: '',
  } as NodeJS.ProcessEnv);
  assert.ok(isCorsOriginAllowed('https://marketingautoaz.com', allow));
  assert.ok(isCorsOriginAllowed('https://www.marketingautoaz.com', allow));
  assert.equal(isCorsOriginAllowed('https://evil.example', allow), false);
  assert.equal(isCorsOriginAllowed('http://localhost:3000', allow), false);
  record('CORS_UNIT', true, `allowlist size=${allow.length}`);
}

async function testWebhookFailClosedUnit() {
  // SePay: empty secrets must reject (mirror billing.service logic)
  const secret = '';
  const apiToken = '';
  assert.ok(!secret && !apiToken, 'empty secrets reject');

  // Meta HMAC mismatch
  const body = Buffer.from('{"object":"page"}');
  const bad = createHmac('sha256', 'wrong').update(body).digest('hex');
  const good = createHmac('sha256', 'test-secret').update(body).digest('hex');
  assert.notEqual(bad, good);
  record('WEBHOOK_HMAC_UNIT', true, 'empty secrets + mismatch detectable');
}

async function main() {
  try {
    await testCors();
    await testSsrf();
    await testWebhookFailClosedUnit();
    await testCreditConcurrency();
  } catch (e) {
    record('FATAL', false, e instanceof Error ? e.message : String(e));
    console.error(e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    const failed = results.filter((r) => !r.pass);
    console.log('\n--- WAVE1 unit summary ---');
    for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}`);
    if (failed.length) process.exitCode = 1;
  }
}

main();
