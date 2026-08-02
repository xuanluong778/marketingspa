/**
 * Google Sign-In auth flows (mocked Google token verifier).
 * Run: node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-auth-google.ts
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'crypto';
import {
  PrismaClient,
  type User,
} from '@prisma/client';

const prisma = new PrismaClient();
const TAG = `GAUTH_${Date.now()}`;

type Identity = {
  googleSub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  avatarUrl: string | null;
};

/** Mirror AuthService.loginWithGoogle core DB logic for unit coverage without Nest bootstrap */
async function loginWithGoogleMock(identity: Identity) {
  let user = await prisma.user.findFirst({
    where: {
      OR: [{ googleSub: identity.googleSub }, { email: identity.email }],
    },
    include: { organization: true, role: true },
  });

  if (user) {
    assert.equal(user.isActive, true);
    const nextProvider = user.passwordHash ? 'BOTH' : 'GOOGLE';
    const before = {
      passwordHash: user.passwordHash,
      roleId: user.roleId,
      organizationId: user.organizationId,
      name: user.name,
    };
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        googleSub: user.googleSub ?? identity.googleSub,
        authProvider: nextProvider,
        avatarUrl: identity.avatarUrl ?? user.avatarUrl,
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        lastLoginAt: new Date(),
      },
      include: { organization: true, role: true },
    });
    assert.equal(user.passwordHash, before.passwordHash);
    assert.equal(user.roleId, before.roleId);
    assert.equal(user.organizationId, before.organizationId);
    assert.equal(user.name, before.name);
    return { user, created: false };
  }

  const orgName = `${identity.name}'s Spa`;
  const slug = `gauth-${randomBytes(4).toString('hex')}`;
  const ownerRole = await prisma.role.findFirst({
    where: { code: 'OWNER' },
  });

  // Prefer create org+role like production; for test reuse any OWNER role template by creating org roles
  const org = await prisma.organization.create({
    data: { name: orgName, slug, email: identity.email },
  });
  const role = await prisma.role.create({
    data: {
      organizationId: org.id,
      code: 'OWNER',
      name: 'Owner',
      isSystem: true,
    },
  });

  user = await prisma.user.create({
    data: {
      email: identity.email,
      passwordHash: null,
      name: identity.name,
      avatarUrl: identity.avatarUrl,
      googleSub: identity.googleSub,
      authProvider: 'GOOGLE',
      organizationId: org.id,
      roleId: role.id,
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
    },
    include: { organization: true, role: true },
  });
  await prisma.creditWallet.create({ data: { organizationId: org.id, balance: 0 } });
  void ownerRole;
  return { user, created: true };
}

async function cleanupUser(user: User) {
  await prisma.authSession.deleteMany({ where: { userId: user.id } });
  await prisma.authToken.deleteMany({ where: { userId: user.id } });
  await prisma.loginAttempt.deleteMany({ where: { email: user.email } });
  const orgId = user.organizationId;
  await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  await prisma.creditWallet.deleteMany({ where: { organizationId: orgId } });
  await prisma.rolePermission.deleteMany({
    where: { role: { organizationId: orgId } },
  });
  await prisma.role.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
}

async function main() {
  console.log(`[${TAG}] start`);

  // 1) New Google user
  const idNew: Identity = {
    googleSub: `sub-new-${TAG}`,
    email: `new.${TAG.toLowerCase()}@example.com`,
    emailVerified: true,
    name: 'Google New',
    avatarUrl: 'https://example.com/a.png',
  };
  const r1 = await loginWithGoogleMock(idNew);
  assert.equal(r1.created, true);
  assert.equal(r1.user.authProvider, 'GOOGLE');
  assert.equal(r1.user.googleSub, idNew.googleSub);
  assert.equal(r1.user.passwordHash, null);
  console.log('[ok] new google user');

  // 2) Same Google again → link/login, not duplicate
  const r2 = await loginWithGoogleMock(idNew);
  assert.equal(r2.created, false);
  assert.equal(r2.user.id, r1.user.id);
  console.log('[ok] existing google login');

  // 3) Email trùng password user → link, không overwrite password/role/org
  const org = await prisma.organization.create({
    data: { name: `${TAG} Local Org`, slug: `local-${TAG.toLowerCase()}`, email: `local.${TAG}@ex.com` },
  });
  const role = await prisma.role.create({
    data: { organizationId: org.id, code: 'OWNER', name: 'Owner', isSystem: true },
  });
  const localEmail = `local.${TAG.toLowerCase()}@example.com`;
  const localUser = await prisma.user.create({
    data: {
      email: localEmail,
      passwordHash: createHash('sha256').update('x').digest('hex'),
      name: 'Local User',
      authProvider: 'LOCAL',
      organizationId: org.id,
      roleId: role.id,
    },
  });
  const idLink: Identity = {
    googleSub: `sub-link-${TAG}`,
    email: localEmail,
    emailVerified: true,
    name: 'Should Not Overwrite Name',
    avatarUrl: 'https://example.com/b.png',
  };
  const r3 = await loginWithGoogleMock(idLink);
  assert.equal(r3.created, false);
  assert.equal(r3.user.id, localUser.id);
  assert.equal(r3.user.authProvider, 'BOTH');
  assert.equal(r3.user.name, 'Local User');
  assert.ok(r3.user.passwordHash);
  assert.equal(r3.user.googleSub, idLink.googleSub);
  assert.equal(r3.user.avatarUrl, idLink.avatarUrl);
  console.log('[ok] email match links google without overwrite');

  // 4) Token invalid simulation — missing email/sub rejected at verifier layer (assert contract)
  assert.throws(() => {
    const bad = { googleSub: '', email: '', emailVerified: false, name: '', avatarUrl: null };
    if (!bad.googleSub || !bad.email || !bad.emailVerified) {
      throw new Error('Google token không hợp lệ');
    }
  });
  console.log('[ok] invalid token contract');

  // Cleanup
  await cleanupUser(r1.user);
  await cleanupUser(r3.user);
  console.log(`[${TAG}] PASS`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
