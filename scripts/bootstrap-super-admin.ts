/**
 * Gán / tạo tài khoản SUPER_ADMIN duy nhất cho PLATFORM_SUPER_ADMIN_EMAIL
 * (mặc định xuanluong778@gmail.com).
 *
 * Tạo user mới (nếu chưa có):
 *   PLATFORM_SUPER_ADMIN_PASSWORD=<secret>  (chỉ qua env, không ghi source)
 *   hoặc để trống → sinh mật khẩu ngẫu nhiên in 1 lần ra stdout (không ghi file).
 *
 * node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/bootstrap-super-admin.ts
 */
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BCRYPT_ROUNDS = 12;
const EMAIL = (
  process.env.PLATFORM_SUPER_ADMIN_EMAIL || 'xuanluong778@gmail.com'
)
  .trim()
  .toLowerCase();
const ORG_SLUG = 'marketingautoaz-platform';
const AUDIT_ACTION_GRANT = 'PLATFORM_SUPER_ADMIN_GRANT';
const AUDIT_ACTION_REVOKE = 'PLATFORM_SUPER_ADMIN_REVOKE';
const AUDIT_ACTION_CREATE = 'PLATFORM_SUPER_ADMIN_USER_CREATE';

function genPassword(): string {
  return randomBytes(18).toString('base64url');
}

function slugOk(s: string) {
  return /^[a-z0-9-]{3,48}$/.test(s);
}

async function ensurePlatformOrg() {
  let org = await prisma.organization.findUnique({ where: { slug: ORG_SLUG } });
  if (org) return org;
  org = await prisma.organization.create({
    data: {
      name: 'MarketingAutoAZ Platform',
      slug: ORG_SLUG,
      email: EMAIL,
    },
  });
  return org;
}

async function ensureOwnerRole(organizationId: string) {
  return prisma.role.upsert({
    where: { organizationId_code: { organizationId, code: 'OWNER' } },
    update: { name: 'Chủ spa', isSystem: true },
    create: {
      organizationId,
      code: 'OWNER',
      name: 'Chủ spa',
      isSystem: true,
    },
  });
}

async function ensureSuperAdminRole(organizationId: string) {
  return prisma.role.upsert({
    where: { organizationId_code: { organizationId, code: 'SUPER_ADMIN' } },
    update: {
      name: 'Super Admin',
      description: 'Quản trị nền tảng MarketingAutoAZ',
      isSystem: true,
    },
    create: {
      organizationId,
      code: 'SUPER_ADMIN',
      name: 'Super Admin',
      description: 'Quản trị nền tảng MarketingAutoAZ',
      isSystem: true,
    },
  });
}

async function writeAudit(input: {
  userId: string;
  organizationId: string;
  action: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      userId: input.userId,
      organizationId: input.organizationId,
      action: input.action,
      entityType: 'USER',
      entityId: input.entityId,
      metadata: input.metadata ?? undefined,
    },
  });
}

async function main() {
  if (!EMAIL || !EMAIL.includes('@')) {
    console.error('PLATFORM_SUPER_ADMIN_EMAIL không hợp lệ');
    process.exit(1);
  }

  let user = await prisma.user.findUnique({
    where: { email: EMAIL },
    include: { role: true, organization: true },
  });

  let generatedPassword: string | null = null;

  if (!user) {
    const org = await ensurePlatformOrg();
    await ensureOwnerRole(org.id);
    const password =
      (process.env.PLATFORM_SUPER_ADMIN_PASSWORD || '').trim() || genPassword();
    if (!(process.env.PLATFORM_SUPER_ADMIN_PASSWORD || '').trim()) {
      generatedPassword = password;
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const ownerRole = await ensureOwnerRole(org.id);
    user = await prisma.user.create({
      data: {
        email: EMAIL,
        name: 'Platform Super Admin',
        passwordHash,
        organizationId: org.id,
        roleId: ownerRole.id,
        isActive: true,
        emailVerifiedAt: new Date(),
        authProvider: 'LOCAL',
      },
      include: { role: true, organization: true },
    });
    await writeAudit({
      userId: user.id,
      organizationId: user.organizationId,
      action: AUDIT_ACTION_CREATE,
      entityId: user.id,
      metadata: {
        email: EMAIL,
        passwordSource: generatedPassword ? 'generated' : 'env',
        note: 'password never stored in audit',
      },
    });
    console.log(`CREATED user ${EMAIL} (org=${org.slug})`);
  }

  // Optional password reset (never logs plaintext except one-time stdout when generated)
  const resetPw = (process.env.PLATFORM_SUPER_ADMIN_RESET_PASSWORD || '')
    .trim()
    .toLowerCase() === 'true';
  if (resetPw) {
    const password =
      (process.env.PLATFORM_SUPER_ADMIN_PASSWORD || '').trim() || genPassword();
    if (!(process.env.PLATFORM_SUPER_ADMIN_PASSWORD || '').trim()) {
      generatedPassword = password;
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, authProvider: 'LOCAL' },
    });
    await writeAudit({
      userId: user.id,
      organizationId: user.organizationId,
      action: 'PLATFORM_SUPER_ADMIN_PASSWORD_RESET',
      entityId: user.id,
      metadata: {
        email: EMAIL,
        passwordSource: generatedPassword ? 'generated' : 'env',
      },
    });
    console.log('OK: password reset for SUPER_ADMIN');
  }

  const saRole = await ensureSuperAdminRole(user.organizationId);
  const prevRole = user.role.code;

  // Thu hồi SUPER_ADMIN của mọi user khác (chỉ giữ email chính thức)
  const others = await prisma.user.findMany({
    where: {
      role: { code: 'SUPER_ADMIN' },
      email: { not: EMAIL },
    },
    include: { role: true, organization: true },
  });
  for (const o of others) {
    const owner = await ensureOwnerRole(o.organizationId);
    await prisma.user.update({
      where: { id: o.id },
      data: { roleId: owner.id },
    });
    await writeAudit({
      userId: o.id,
      organizationId: o.organizationId,
      action: AUDIT_ACTION_REVOKE,
      entityId: o.id,
      metadata: {
        email: o.email,
        from: 'SUPER_ADMIN',
        to: 'OWNER',
        reason: 'sole_platform_super_admin',
        by: EMAIL,
      },
    });
    console.log(`REVOKED SUPER_ADMIN from ${o.email} → OWNER`);
  }

  if (user.roleId !== saRole.id) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        roleId: saRole.id,
        isActive: true,
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      },
    });
    await writeAudit({
      userId: user.id,
      organizationId: user.organizationId,
      action: AUDIT_ACTION_GRANT,
      entityId: user.id,
      metadata: { email: EMAIL, from: prevRole, to: 'SUPER_ADMIN' },
    });
    console.log(`OK: ${EMAIL} ${prevRole} → SUPER_ADMIN (org=${user.organization.slug})`);
  } else {
    console.log(`OK: ${EMAIL} đã là SUPER_ADMIN (org=${user.organization.slug})`);
  }

  const remaining = await prisma.user.findMany({
    where: { role: { code: 'SUPER_ADMIN' } },
    select: { email: true },
  });
  console.log(
    `SUPER_ADMIN count=${remaining.length}: ${remaining.map((r) => r.email).join(', ')}`,
  );
  console.log('User cần đăng xuất/đăng nhập lại để JWT refresh.');

  if (generatedPassword) {
    // In 1 lần — không ghi file / không đưa vào audit metadata
    console.log('---');
    console.log('ONE-TIME PASSWORD (save now — not written to disk):');
    console.log(generatedPassword);
    console.log('fingerprint=' + createHash('sha256').update(generatedPassword).digest('hex').slice(0, 12));
    console.log('---');
  }

  if (!slugOk(ORG_SLUG)) {
    /* noop — keep linter calm */
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
