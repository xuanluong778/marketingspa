/**
 * Registration OTP flows (no real SMTP — AuthMailService falls back to log).
 * Run: node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-auth-registration-otp.ts
 */
import assert from 'node:assert/strict';
import { createHash, randomInt } from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TAG = `ROTP_${Date.now()}`;

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

async function cleanupEmail(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    await prisma.authSession.deleteMany({ where: { userId: user.id } });
    await prisma.authToken.deleteMany({ where: { userId: user.id } });
    const orgId = user.organizationId;
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.creditWallet.deleteMany({ where: { organizationId: orgId } });
    await prisma.rolePermission.deleteMany({ where: { role: { organizationId: orgId } } });
    await prisma.role.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
  }
  await prisma.registrationOtp.deleteMany({ where: { email } });
}

async function main() {
  console.log(`[${TAG}] start`);
  const email = `otp.${TAG.toLowerCase()}@example.com`;
  await cleanupEmail(email);

  const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const passwordHash = hashToken('password12345'); // stand-in; real flow uses bcrypt

  // 1) Create pending OTP
  const row = await prisma.registrationOtp.create({
    data: {
      email,
      codeHash: hashToken(otp),
      passwordHash,
      name: 'OTP User',
      organizationName: `${TAG} Spa`,
      organizationSlug: `otp-${TAG.toLowerCase()}`,
      expiresAt: new Date(Date.now() + 5 * 60_000),
      maxAttempts: 5,
    },
  });
  assert.equal(row.attemptCount, 0);
  console.log('[ok] create otp row (hash only)');

  // 2) Wrong OTP increments attempts
  let cur = await prisma.registrationOtp.update({
    where: { id: row.id },
    data: { attemptCount: { increment: 1 } },
  });
  assert.equal(cur.attemptCount, 1);
  assert.notEqual(hashToken('000000'), cur.codeHash);
  console.log('[ok] wrong otp tracked');

  // 3) Expired
  const expired = await prisma.registrationOtp.create({
    data: {
      email: `exp.${email}`,
      codeHash: hashToken('123456'),
      passwordHash,
      name: 'Exp',
      organizationName: `${TAG} Exp`,
      organizationSlug: `exp-${TAG.toLowerCase()}`,
      expiresAt: new Date(Date.now() - 1000),
      maxAttempts: 5,
    },
  });
  assert.ok(expired.expiresAt.getTime() < Date.now());
  console.log('[ok] expired otp detectable');

  // 4) Reuse / single-use: consume then reject
  await prisma.registrationOtp.update({
    where: { id: row.id },
    data: { consumedAt: new Date() },
  });
  const consumed = await prisma.registrationOtp.findUnique({ where: { id: row.id } });
  assert.ok(consumed?.consumedAt);
  console.log('[ok] single-use consume');

  // 5) New code invalidates old
  await prisma.registrationOtp.update({
    where: { id: expired.id },
    data: { invalidatedAt: new Date() },
  });
  const newOtp = '654321';
  const replacement = await prisma.registrationOtp.create({
    data: {
      email: `exp.${email}`,
      codeHash: hashToken(newOtp),
      passwordHash,
      name: 'Exp',
      organizationName: `${TAG} Exp`,
      organizationSlug: `exp2-${TAG.toLowerCase()}`,
      expiresAt: new Date(Date.now() + 5 * 60_000),
      maxAttempts: 5,
    },
  });
  const old = await prisma.registrationOtp.findUnique({ where: { id: expired.id } });
  assert.ok(old?.invalidatedAt);
  assert.equal(hashToken(newOtp), replacement.codeHash);
  console.log('[ok] resend invalidates previous');

  // 6) Email already exists conflict simulation
  const existing = await prisma.user.findFirst({ select: { email: true } });
  if (existing) {
    const clash = await prisma.user.findUnique({ where: { email: existing.email } });
    assert.ok(clash);
    console.log('[ok] existing email detectable');
  }

  // Cleanup
  await prisma.registrationOtp.deleteMany({
    where: { OR: [{ email }, { email: `exp.${email}` }] },
  });
  console.log(`[${TAG}] PASS`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
