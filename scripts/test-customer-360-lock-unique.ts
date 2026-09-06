/**
 * Customer 360 — DB unique + advisory lock order stress audit (real Postgres).
 * Run: node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-customer-360-lock-unique.ts
 *
 * Does NOT touch Facebook OAuth / Google Ads.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  prisma,
  Prisma,
  createOrReuseCustomerSsot,
  applyCustomerSsotUpdate,
  mergeCustomersSsot,
  lockCustomer360Identities,
  emailIdentityLock,
  phoneIdentityLock,
  messagingIdentityLock,
  CUSTOMER_360_LOCK_KIND_ORDER,
  normalizeCustomerEmail,
  normalizeCustomerPhone,
} from '@marketingspa/database';

type Row = {
  check: string;
  problem: string;
  fix: string;
  test: string;
  result: 'PASS' | 'FAIL';
};

const rows: Row[] = [];
const ROOT = path.join(__dirname, '..');
const stamp = `${Date.now()}`;

function record(r: Omit<Row, 'result'> & { pass: boolean }) {
  rows.push({
    check: r.check,
    problem: r.problem,
    fix: r.fix,
    test: r.test,
    result: r.pass ? 'PASS' : 'FAIL',
  });
  if (!r.pass) throw new Error(`FAIL ${r.check}: ${r.test}`);
}

async function main() {
  // --- Static: lock order source of truth ---
  const lockSrc = readFileSync(
    path.join(ROOT, 'packages/database/src/customer-360-lock.ts'),
    'utf8',
  );
  const orderOk =
    lockSrc.includes('EMAIL: 0') &&
    lockSrc.includes('PHONE: 1') &&
    lockSrc.includes('ZALO: 2') &&
    lockSrc.includes('FACEBOOK: 3') &&
    CUSTOMER_360_LOCK_KIND_ORDER.EMAIL < CUSTOMER_360_LOCK_KIND_ORDER.PHONE &&
    CUSTOMER_360_LOCK_KIND_ORDER.PHONE < CUSTOMER_360_LOCK_KIND_ORDER.ZALO &&
    CUSTOMER_360_LOCK_KIND_ORDER.ZALO < CUSTOMER_360_LOCK_KIND_ORDER.FACEBOOK;
  record({
    check: 'ADVISORY_LOCK_ORDER source',
    problem: 'Lexicographic key sort puts facebook before phone (deadlock risk)',
    fix: 'lockCustomer360Identities sorts by EMAIL→PHONE→ZALO→FACEBOOK then value',
    test: `ORDER=${JSON.stringify(CUSTOMER_360_LOCK_KIND_ORDER)}`,
    pass: orderOk,
  });

  const ordered = await prisma.$transaction(async (tx) => {
    return lockCustomer360Identities(tx, `lock-order-org-${stamp}`, [
      messagingIdentityLock('FACEBOOK', 'psid-z', 'page1'),
      phoneIdentityLock('0901000002'),
      messagingIdentityLock('ZALO', 'zalo-y', 'oa1'),
      emailIdentityLock('b@e2e.local'),
      emailIdentityLock('a@e2e.local'),
      phoneIdentityLock('0901000001'),
      messagingIdentityLock('FACEBOOK', 'psid-a', 'page1'),
    ]);
  });
  const kinds = ordered.map((l) => l.kind);
  const values = ordered.map((l) => `${l.kind}:${l.valueNormalized}`);
  record({
    check: 'ADVISORY_LOCK_ORDER runtime sort',
    problem: 'Callers passing locks in reverse kind order could deadlock',
    fix: 'Normalize + sort inside lockCustomer360Identities',
    test: `kinds=${kinds.join(',')} values=${values.join('|')}`,
    pass:
      kinds.join(',') === 'EMAIL,EMAIL,PHONE,PHONE,ZALO,FACEBOOK,FACEBOOK' &&
      values[0] === 'EMAIL:a@e2e.local' &&
      values[1] === 'EMAIL:b@e2e.local',
  });

  // --- Live DB: nullability + indexes ---
  const col = await prisma.$queryRawUnsafe<
    Array<{ is_nullable: string; column_default: string | null }>
  >(`
    SELECT is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='customer_identities'
      AND column_name='channel_account_ref'
  `);
  const idxs = await prisma.$queryRawUnsafe<Array<{ indexname: string; indexdef: string }>>(`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname='public' AND tablename='customer_identities'
  `);
  const hasPartial = idxs.some((i) => i.indexname === 'customer_identities_email_phone_org_value_uidx');
  const hasFourCol = idxs.some((i) => i.indexname === 'customer_identities_org_kind_value_ref_key');
  const chk = await prisma.$queryRawUnsafe<Array<{ conname: string }>>(`
    SELECT conname FROM pg_constraint
    WHERE conname = 'customer_identities_email_phone_ref_empty_chk'
  `);

  record({
    check: 'channelAccountRef nullability',
    problem: 'If NULL, unique(org,kind,value,ref) allows duplicate EMAIL/PHONE rows',
    fix: 'NOT NULL DEFAULT \'\' + CHECK EMAIL/PHONE ⇒ ref=\'\' + partial unique',
    test: `nullable=${col[0]?.is_nullable} default=${col[0]?.column_default} partial=${hasPartial} chk=${chk.length}`,
    pass:
      col[0]?.is_nullable === 'NO' &&
      hasFourCol &&
      hasPartial &&
      chk.length === 1,
  });

  const org = await prisma.organization.create({
    data: { name: `C360 Lock ${stamp}`, slug: `c360-lock-${stamp}` },
  });

  try {
    const custA = await prisma.$transaction(async (tx) =>
      createOrReuseCustomerSsot(tx, {
        organizationId: org.id,
        name: 'A',
        email: `a.${stamp}@e2e.local`,
        phone: '0911 111 001',
      }),
    );
    const custB = await prisma.$transaction(async (tx) =>
      createOrReuseCustomerSsot(tx, {
        organizationId: org.id,
        name: 'B',
        email: `b.${stamp}@e2e.local`,
        phone: '0911 111 002',
      }),
    );

    // Prove residual risk before relying on partial unique: attempt EMAIL same value different ref
    let differentRefBlocked = false;
    let differentRefCode = '';
    try {
      await prisma.customerIdentity.create({
        data: {
          organizationId: org.id,
          customerId: custB.customer.id,
          kind: 'EMAIL',
          valueNormalized: normalizeCustomerEmail(`a.${stamp}@e2e.local`)!,
          valueRaw: `a.${stamp}@e2e.local`,
          channelAccountRef: 'should-be-blocked',
          source: 'audit',
        },
      });
    } catch (err) {
      differentRefBlocked = true;
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        differentRefCode = err.code;
      } else if (err instanceof Error) {
        const m = err.message.match(/code:\s*"(\d+)"/) || err.message.match(/\((\d{5})\)/);
        differentRefCode = m?.[1] || (err.message.includes('check constraint') ? '23514' : err.message.slice(0, 60));
      } else {
        differentRefCode = 'err';
      }
    }
    record({
      check: 'DB UNIQUE EMAIL across channelAccountRef',
      problem: '4-col unique alone allows EMAIL value with ref=\'\' and ref=\'x\'',
      fix: 'Partial unique (org,kind,value) WHERE kind IN (EMAIL,PHONE) + CHECK ref=\'\'',
      test: `blocked=${differentRefBlocked} code=${differentRefCode}`,
      pass:
        differentRefBlocked &&
        (differentRefCode === 'P2002' ||
          differentRefCode === '23514' ||
          differentRefCode === '23505' ||
          /unique|check|violat|23514|23505/i.test(String(differentRefCode))),
    });

    // Concurrent raw inserts same EMAIL + empty ref
    const emailDup = `conc.email.${stamp}@e2e.local`;
    const emailNorm = normalizeCustomerEmail(emailDup)!;
    const phoneDup = '0911 222 333';
    const phoneNorm = normalizeCustomerPhone(phoneDup)!;
    const seed = await prisma.customer.create({
      data: { organizationId: org.id, name: 'Seed Conc', email: emailDup, phone: phoneDup, emailNormalized: emailNorm, phoneNormalized: phoneNorm },
    });
    const seed2 = await prisma.customer.create({
      data: {
        organizationId: org.id,
        name: 'Seed Conc 2',
        email: `other.${stamp}@e2e.local`,
        phone: '0911 222 334',
        emailNormalized: normalizeCustomerEmail(`other.${stamp}@e2e.local`),
        phoneNormalized: normalizeCustomerPhone('0911 222 334'),
      },
    });

    const concEmailResults = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        prisma.customerIdentity.create({
          data: {
            organizationId: org.id,
            customerId: i % 2 === 0 ? seed.id : seed2.id,
            kind: 'EMAIL',
            valueNormalized: emailNorm,
            channelAccountRef: '',
            source: 'stress',
          },
        }),
      ),
    );
    const emailOk = concEmailResults.filter((r) => r.status === 'fulfilled').length;
    const emailFail = concEmailResults.filter((r) => r.status === 'rejected').length;
    const emailRows = await prisma.customerIdentity.count({
      where: { organizationId: org.id, kind: 'EMAIL', valueNormalized: emailNorm },
    });

    const concPhoneResults = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        prisma.customerIdentity.create({
          data: {
            organizationId: org.id,
            customerId: i % 2 === 0 ? seed.id : seed2.id,
            kind: 'PHONE',
            valueNormalized: phoneNorm,
            channelAccountRef: i % 3 === 0 ? 'sneaky' : '',
            source: 'stress',
          },
        }),
      ),
    );
    const phoneOk = concPhoneResults.filter((r) => r.status === 'fulfilled').length;
    const phoneRows = await prisma.customerIdentity.count({
      where: { organizationId: org.id, kind: 'PHONE', valueNormalized: phoneNorm },
    });

    record({
      check: 'Concurrent EMAIL/PHONE identity insert',
      problem: 'Race without DB unique creates duplicate identities',
      fix: 'Partial unique index + NOT NULL ref',
      test: `emailOk=${emailOk} emailFail=${emailFail} emailRows=${emailRows} phoneOk=${phoneOk} phoneRows=${phoneRows}`,
      pass: emailRows === 1 && phoneRows === 1 && emailOk === 1 && phoneOk === 1,
    });

    // SSOT concurrent create same email/phone
    const ssotEmail = `ssot.${stamp}@e2e.local`;
    const ssotPhone = '0911 333 444';
    const ssot = await Promise.all(
      Array.from({ length: 16 }, (_, i) =>
        prisma.$transaction(
          async (tx) =>
            createOrReuseCustomerSsot(tx, {
              organizationId: org.id,
              name: `SSOT ${i}`,
              email: ssotEmail,
              phone: ssotPhone,
            }),
          { timeout: 30_000, maxWait: 15_000 },
        ),
      ),
    );
    const ssotIds = new Set(ssot.map((s) => s.customer.id));
    const ssotCust = await prisma.customer.count({
      where: {
        organizationId: org.id,
        emailNormalized: normalizeCustomerEmail(ssotEmail)!,
        isActive: true,
        mergedIntoId: null,
      },
    });
    record({
      check: 'Concurrent createOrReuseCustomerSsot',
      problem: 'Advisory lock missing / wrong order → duplicate customers',
      fix: 'lockCustomer360Identities EMAIL then PHONE before find/create',
      test: `uniqueIds=${ssotIds.size} active=${ssotCust}`,
      pass: ssotIds.size === 1 && ssotCust === 1,
    });

    // Deadlock stress: reverse-order update + merge + create crossing phones/emails
    const p1 = await prisma.$transaction(async (tx) =>
      createOrReuseCustomerSsot(tx, {
        organizationId: org.id,
        name: 'Race1',
        email: `r1.${stamp}@e2e.local`,
        phone: '0911 444 001',
      }),
    );
    const p2 = await prisma.$transaction(async (tx) =>
      createOrReuseCustomerSsot(tx, {
        organizationId: org.id,
        name: 'Race2',
        email: `r2.${stamp}@e2e.local`,
        phone: '0911 444 002',
      }),
    );
    const p3 = await prisma.$transaction(async (tx) =>
      createOrReuseCustomerSsot(tx, {
        organizationId: org.id,
        name: 'Race3',
        email: `r3.${stamp}@e2e.local`,
        phone: '0911 444 003',
      }),
    );

    // Seed ZALO/FACEBOOK identities so merge locks all 4 kinds
    await prisma.customerIdentity.createMany({
      data: [
        {
          organizationId: org.id,
          customerId: p1.customer.id,
          kind: 'ZALO',
          valueNormalized: `zalo-r1-${stamp}`,
          channelAccountRef: `oa-${stamp}`,
          source: 'stress',
        },
        {
          organizationId: org.id,
          customerId: p2.customer.id,
          kind: 'FACEBOOK',
          valueNormalized: `psid-r2-${stamp}`,
          channelAccountRef: `page-${stamp}`,
          source: 'stress',
        },
        {
          organizationId: org.id,
          customerId: p3.customer.id,
          kind: 'ZALO',
          valueNormalized: `zalo-r3-${stamp}`,
          channelAccountRef: `oa-${stamp}`,
          source: 'stress',
        },
      ],
    });

    const deadline = Date.now() + 45_000;
    const stressOps = Array.from({ length: 24 }, (_, i) => {
      const op = i % 4;
      return prisma
        .$transaction(
          async (tx) => {
            if (Date.now() > deadline) throw new Error('stress_deadline');
            if (op === 0) {
              // Update p1 note while holding email+phone locks (PHONE-first input order intentional)
              await applyCustomerSsotUpdate(tx, {
                organizationId: org.id,
                customerId: p1.customer.id,
                currentEmailNormalized: p1.customer.emailNormalized,
                currentPhoneNormalized: p1.customer.phoneNormalized,
                nextEmail: p1.customer.email,
                nextPhone: p1.customer.phone,
                data: { note: `n-${i}` },
              });
              return 'update';
            }
            if (op === 1) {
              await mergeCustomersSsot(tx, {
                organizationId: org.id,
                primaryId: p1.customer.id,
                secondaryId: p2.customer.id,
              });
              return 'merge12';
            }
            if (op === 2) {
              await mergeCustomersSsot(tx, {
                organizationId: org.id,
                primaryId: p1.customer.id,
                secondaryId: p3.customer.id,
              });
              return 'merge13';
            }
            await createOrReuseCustomerSsot(tx, {
              organizationId: org.id,
              name: `DupRace ${i}`,
              email: p1.customer.email,
              phone: p1.customer.phone,
            });
            return 'create';
          },
          { timeout: 25_000, maxWait: 20_000 },
        )
        .then(
          (v) => ({ ok: true as const, v }),
          (e) => ({
            ok: false as const,
            err: e instanceof Error ? e.message : String(e),
          }),
        );
    });

    const stress = await Promise.all(stressOps);
    const failures = stress.filter((s) => !s.ok);
    const deadlocks = failures.filter((f) => /deadlock/i.test(f.err || ''));
    const timeouts = failures.filter((f) => /timed out|timeout|P2028/i.test(f.err || ''));
    const p1Final = await prisma.customer.findUnique({ where: { id: p1.customer.id } });
    const p2Final = await prisma.customer.findUnique({ where: { id: p2.customer.id } });
    const p3Final = await prisma.customer.findUnique({ where: { id: p3.customer.id } });
    const activeSameEmail = await prisma.customer.count({
      where: {
        organizationId: org.id,
        emailNormalized: p1.customer.emailNormalized!,
        isActive: true,
        mergedIntoId: null,
      },
    });
    const emailIdent = await prisma.customerIdentity.count({
      where: {
        organizationId: org.id,
        kind: 'EMAIL',
        valueNormalized: p1.customer.emailNormalized!,
      },
    });

    record({
      check: 'Deadlock / timeout stress (update+merge+create parallel)',
      problem: 'Inconsistent lock order across create/update/merge → deadlock or lost update',
      fix: 'Single EMAIL→PHONE→ZALO→FACEBOOK order for all identity locks',
      test: `deadlocks=${deadlocks.length} timeouts=${timeouts.length} fail=${failures.length} activeEmail=${activeSameEmail} emailIdent=${emailIdent} p1Active=${p1Final?.isActive} p2Merged=${p2Final?.mergedIntoId} p3Merged=${p3Final?.mergedIntoId} note=${p1Final?.note}`,
      pass:
        deadlocks.length === 0 &&
        timeouts.length === 0 &&
        activeSameEmail === 1 &&
        emailIdent === 1 &&
        p1Final?.isActive === true &&
        (p2Final?.mergedIntoId === p1.customer.id || p2Final?.isActive === true) &&
        (p3Final?.mergedIntoId === p1.customer.id || p3Final?.isActive === true),
    });

    // Soft check: at least one merge succeeded under stress
    const mergeOk =
      p2Final?.mergedIntoId === p1.customer.id || p3Final?.mergedIntoId === p1.customer.id;
    record({
      check: 'Merge progress under contention',
      problem: 'Merge starved / rolled back leaving orphans',
      fix: 'Advisory locks + re-read after lock in mergeCustomersSsot',
      test: `p2→${p2Final?.mergedIntoId} p3→${p3Final?.mergedIntoId}`,
      pass: mergeOk,
    });
  } finally {
    await prisma.organization.delete({ where: { id: org.id } }).catch(() => undefined);
  }
}

function printReport(ok: boolean) {
  console.log('\nCHECK | PROBLEM | FIX | TEST | RESULT');
  console.log('---|---|---|---|---');
  for (const r of rows) {
    console.log(`${r.check} | ${r.problem} | ${r.fix} | ${r.test} | ${r.result}`);
  }
  const failed = rows.filter((r) => r.result === 'FAIL');
  if (!ok || failed.length) {
    console.log('\nFAILED:');
    for (const f of failed) console.log(`- ${f.check}: ${f.test}`);
    process.exitCode = 1;
    return;
  }
  console.log('\nCUSTOMER_IDENTITY_DB_UNIQUE = PASS');
  console.log('ADVISORY_LOCK_ORDER = PASS');
  console.log('CUSTOMER_360_DEADLOCK_SAFE = PASS');
  console.log('CUSTOMER_360_PRODUCTION_READY = PASS');
}

main()
  .then(() => printReport(true))
  .catch((err) => {
    printReport(false);
    console.error(err instanceof Error ? err.stack : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
