/**
 * Provision tài khoản khách hàng phục vụ Meta App Review.
 *
 * Env bắt buộc:
 *   META_REVIEWER_EMAIL
 *   META_REVIEWER_PASSWORD
 *   META_REVIEWER_NAME          (tuỳ chọn, mặc định "Meta App Reviewer")
 *   META_REVIEWER_DAYS         (tuỳ chọn, mặc định 90 — tối thiểu 90)
 *   META_REVIEWER_PLAN_CODE    (tuỳ chọn, mặc định msp-pro-6m)
 *   META_REVIEWER_ENSURE_CANARY_ORG=true  (tuỳ chọn — ghi org vào AUTO_POST_OAUTH_CANARY_ORG_IDS trong .env)
 *
 * Role khách hàng = OWNER của org riêng (không SUPER_ADMIN / không platform admin).
 *
 * Chạy:
 *   pnpm meta-reviewer:provision
 *   node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/meta-reviewer-provision.ts
 */
import { createHash, randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import * as bcrypt from 'bcryptjs';
import { PrismaClient, SubscriptionStatus } from '@prisma/client';

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;
const MIN_DAYS = 90;
const FORBIDDEN_ROLE_CODES = new Set(['SUPER_ADMIN', 'ADMIN']);
const ORG_SLUG_BASE = 'meta-app-review';
const AUDIT_ACTION = 'META_REVIEWER_PROVISION';

function requireEnv(name: string): string {
  const v = (process.env[name] ?? '').trim();
  if (!v) {
    console.error(`Thiếu biến môi trường bắt buộc: ${name}`);
    process.exit(1);
  }
  return v;
}

function normalizeEmailForUniqueness(raw: string): string {
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at <= 0) return email;
  let local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = (local.split('+')[0] ?? local).replace(/\./g, '');
    return `${local}@gmail.com`;
  }
  local = local.split('+')[0] ?? local;
  return `${local}@${domain}`;
}

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

async function uniqueOrgSlug(preferred: string): Promise<string> {
  let slug = preferred || ORG_SLUG_BASE;
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? slug : `${slug}-${i + 1}`;
    const hit = await prisma.organization.findUnique({ where: { slug: candidate } });
    if (!hit) return candidate;
  }
  return `${slug}-${randomBytes(3).toString('hex')}`;
}

type RoleSeed = { code: string; name: string };

const DEFAULT_ROLE_SEEDS: RoleSeed[] = [
  { code: 'OWNER', name: 'Chủ spa' },
  { code: 'MANAGER', name: 'Quản lý' },
  { code: 'MARKETING', name: 'Marketing' },
  { code: 'SALE', name: 'Sale' },
  { code: 'TECHNICIAN', name: 'Kỹ thuật viên' },
  { code: 'HR', name: 'Nhân sự' },
];

/** Mirror apps/api ALL_PERMISSION_DEFS — đủ Content / Auto Post / kênh kết nối. */
const ALL_PERMISSION_DEFS: { code: string; name: string; module: string }[] = [
  { code: 'customer.read', name: 'Xem khách hàng', module: 'crm' },
  { code: 'customer.write', name: 'Sửa khách hàng', module: 'crm' },
  { code: 'lead.read', name: 'Xem lead', module: 'crm' },
  { code: 'lead.write', name: 'Sửa lead', module: 'crm' },
  { code: 'campaign.send', name: 'Gửi chiến dịch', module: 'marketing' },
  { code: 'order.read', name: 'Xem đơn hàng', module: 'finance' },
  { code: 'expense.write', name: 'Ghi chi phí', module: 'finance' },
  { code: 'report.view', name: 'Xem báo cáo', module: 'analytics' },
  { code: 'settings.manage', name: 'Quản lý cài đặt', module: 'admin' },
  { code: 'automation.view', name: 'Xem automation', module: 'automation' },
  { code: 'automation.template.manage', name: 'Quản lý mẫu tin', module: 'automation' },
  { code: 'automation.campaign.create', name: 'Tạo/sửa chiến dịch automation', module: 'automation' },
  { code: 'automation.campaign.approve', name: 'Duyệt chiến dịch automation', module: 'automation' },
  { code: 'automation.campaign.send', name: 'Gửi/thử automation', module: 'automation' },
  { code: 'automation.campaign.pause', name: 'Tạm dừng/tiếp tục automation', module: 'automation' },
  { code: 'automation.integration.manage', name: 'Quản lý tích hợp kênh', module: 'automation' },
  { code: 'automation.logs.view', name: 'Xem nhật ký automation', module: 'automation' },
  { code: 'ads.read', name: 'Xem quảng cáo / insights', module: 'ads' },
  { code: 'ads.connect', name: 'Kết nối tài khoản Ads (OAuth)', module: 'ads' },
  { code: 'ads.sync', name: 'Đồng bộ dữ liệu Ads', module: 'ads' },
  { code: 'ads.analyze', name: 'Phân tích / AI draft Ads', module: 'ads' },
  { code: 'ads.manage', name: 'Quản lý chiến dịch Ads', module: 'ads' },
  { code: 'hrm.employee.read', name: 'Xem nhân viên', module: 'hrm' },
  { code: 'hrm.employee.write', name: 'Sửa nhân viên', module: 'hrm' },
  { code: 'hrm.contract.read', name: 'Xem hợp đồng', module: 'hrm' },
  { code: 'hrm.contract.write', name: 'Sửa hợp đồng', module: 'hrm' },
  { code: 'hrm.document.read', name: 'Xem tài liệu HR', module: 'hrm' },
  { code: 'hrm.document.write', name: 'Sửa tài liệu HR', module: 'hrm' },
  { code: 'hrm.account.manage', name: 'Quản lý tài khoản NV', module: 'hrm' },
  { code: 'hrm.audit.read', name: 'Xem audit HR', module: 'hrm' },
  { code: 'hrm.attendance.read', name: 'Xem chấm công', module: 'hrm' },
  { code: 'hrm.attendance.write', name: 'Chấm công / phân ca', module: 'hrm' },
  { code: 'hrm.attendance.lock', name: 'Khóa bảng công', module: 'hrm' },
  { code: 'hrm.leave.read', name: 'Xem phép / OT', module: 'hrm' },
  { code: 'hrm.leave.write', name: 'Tạo phép / OT', module: 'hrm' },
  { code: 'hrm.leave.approve', name: 'Duyệt phép / OT', module: 'hrm' },
];

function ownerPermissionCodes(): string[] {
  return ALL_PERMISSION_DEFS.map((p) => p.code);
}

async function ensureOrgRolesAndOwner(organizationId: string) {
  const permissionRows = await Promise.all(
    ALL_PERMISSION_DEFS.map((p) =>
      prisma.permission.upsert({
        where: { code: p.code },
        update: { name: p.name, module: p.module },
        create: { code: p.code, name: p.name, module: p.module },
      }),
    ),
  );
  const permissionByCode = new Map(permissionRows.map((p) => [p.code, p]));

  const roles = [];
  for (const seed of DEFAULT_ROLE_SEEDS) {
    const role = await prisma.role.upsert({
      where: {
        organizationId_code: { organizationId, code: seed.code },
      },
      update: { name: seed.name, isSystem: true },
      create: {
        organizationId,
        code: seed.code,
        name: seed.name,
        isSystem: true,
      },
    });
    roles.push(role);
  }

  const owner = roles.find((r) => r.code === 'OWNER');
  if (!owner) throw new Error('OWNER role missing after upsert');

  const codes = ownerPermissionCodes();
  const links = codes
    .map((code) => permissionByCode.get(code))
    .filter((p): p is (typeof permissionRows)[number] => !!p)
    .map((p) => ({ roleId: owner.id, permissionId: p.id }));
  if (links.length) {
    await prisma.rolePermission.createMany({ data: links, skipDuplicates: true });
  }

  return owner;
}

/** Gỡ SUPER_ADMIN khỏi org sau khi không còn user nào gắn role đó. */
async function removeOrgSuperAdminRole(organizationId: string) {
  const superRole = await prisma.role.findUnique({
    where: { organizationId_code: { organizationId, code: 'SUPER_ADMIN' } },
  });
  if (!superRole) return;
  const stillAssigned = await prisma.user.count({ where: { roleId: superRole.id } });
  if (stillAssigned > 0) {
    throw new Error(
      `Không thể gỡ SUPER_ADMIN: còn ${stillAssigned} user gắn role này trong org ${organizationId}`,
    );
  }
  await prisma.role.delete({ where: { id: superRole.id } });
}

async function ensureSubscription(organizationId: string, planCode: string, minDays: number) {
  const plan =
    (await prisma.subscriptionPlan.findFirst({
      where: { code: planCode, isActive: true },
    })) ||
    (await prisma.subscriptionPlan.findFirst({
      where: { code: 'msp-pro-6m', isActive: true },
    })) ||
    (await prisma.subscriptionPlan.findFirst({
      where: { isActive: true, durationMonths: { gt: 0 } },
      orderBy: { sortOrder: 'asc' },
    }));
  if (!plan) {
    throw new Error('Không tìm thấy SubscriptionPlan active (cần seed msp-pro-6m)');
  }

  const now = new Date();
  const minEnd = new Date(now.getTime() + minDays * 86400000);
  const existing = await prisma.subscription.findFirst({
    where: { organizationId },
    orderBy: { currentPeriodEnd: 'desc' },
    include: { plan: true },
  });

  if (!existing) {
    const created = await prisma.subscription.create({
      data: {
        organizationId,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: minEnd,
        cancelledAt: null,
      },
      include: { plan: true },
    });
    return { subscription: created, created: true, extended: false };
  }

  const needsExtend = existing.currentPeriodEnd.getTime() < minEnd.getTime();
  const needsActivate =
    existing.status !== SubscriptionStatus.ACTIVE ||
    existing.currentPeriodEnd.getTime() <= now.getTime();
  const trialPlan = existing.plan.code === 'msp-trial-3d';

  if (!needsExtend && !needsActivate && !trialPlan) {
    return { subscription: existing, created: false, extended: false };
  }

  const updated = await prisma.subscription.update({
    where: { id: existing.id },
    data: {
      planId: trialPlan || needsActivate ? plan.id : existing.planId,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart:
        existing.currentPeriodEnd.getTime() > now.getTime()
          ? existing.currentPeriodStart
          : now,
      currentPeriodEnd: needsExtend ? minEnd : existing.currentPeriodEnd,
      cancelledAt: null,
    },
    include: { plan: true },
  });
  return { subscription: updated, created: false, extended: needsExtend || needsActivate };
}

function ensureCanaryOrgInEnvFile(organizationId: string): { updated: boolean; path: string } {
  const envPath = resolve(__dirname, '../.env');
  if (!existsSync(envPath)) {
    return { updated: false, path: envPath };
  }
  const raw = readFileSync(envPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  let found = false;
  let changed = false;
  const next = lines.map((line) => {
    if (!line.startsWith('AUTO_POST_OAUTH_CANARY_ORG_IDS=')) return line;
    found = true;
    const value = line.slice('AUTO_POST_OAUTH_CANARY_ORG_IDS='.length).trim();
    const ids = value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.includes(organizationId)) return line;
    ids.push(organizationId);
    changed = true;
    return `AUTO_POST_OAUTH_CANARY_ORG_IDS=${ids.join(',')}`;
  });
  if (!found) {
    next.push(`AUTO_POST_OAUTH_CANARY_ORG_IDS=${organizationId}`);
    changed = true;
  }
  if (changed) {
    writeFileSync(envPath, next.join('\n'), 'utf8');
  }
  return { updated: changed, path: envPath };
}

async function main() {
  const email = requireEnv('META_REVIEWER_EMAIL').toLowerCase();
  const password = requireEnv('META_REVIEWER_PASSWORD');
  const name = (process.env.META_REVIEWER_NAME ?? '').trim() || 'Meta App Reviewer';
  const planCode = (process.env.META_REVIEWER_PLAN_CODE ?? 'msp-pro-6m').trim();
  const daysRaw = Number(process.env.META_REVIEWER_DAYS ?? MIN_DAYS);
  const minDays = Number.isFinite(daysRaw) ? Math.max(MIN_DAYS, Math.floor(daysRaw)) : MIN_DAYS;
  const ensureCanary =
    (process.env.META_REVIEWER_ENSURE_CANARY_ORG ?? '').trim().toLowerCase() === 'true';

  if (password.length < 12) {
    console.error('META_REVIEWER_PASSWORD phải ≥ 12 ký tự');
    process.exit(1);
  }

  const emailNormalized = normalizeEmailForUniqueness(email);
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  // fingerprint chỉ để audit (không đảo ngược được mật khẩu)
  // Chỉ fingerprint email (không hash mật khẩu) — phục vụ đối chiếu audit, không đảo ngược được secret
  const credentialFingerprint = createHash('sha256')
    .update(`meta-reviewer:${emailNormalized}`)
    .digest('hex')
    .slice(0, 12);

  let createdUser = false;
  let createdOrg = false;

  let user = await prisma.user.findFirst({
    where: {
      OR: [{ email }, { emailNormalized }],
    },
    include: { role: true, organization: true },
  });

  if (!user) {
    const slug = await uniqueOrgSlug(
      slugify(`meta-review-${emailNormalized.split('@')[0] || ORG_SLUG_BASE}`),
    );
    const org = await prisma.organization.create({
      data: {
        name: `${name} Org`,
        slug,
        email,
        isActive: true,
      },
    });
    createdOrg = true;
    await prisma.creditWallet.create({
      data: { organizationId: org.id, balance: 0 },
    });
    const ownerRole = await ensureOrgRolesAndOwner(org.id);
    user = await prisma.user.create({
      data: {
        email,
        emailNormalized,
        passwordHash,
        name,
        authProvider: 'LOCAL',
        organizationId: org.id,
        roleId: ownerRole.id,
        isActive: true,
        deletedAt: null,
        emailVerifiedAt: new Date(),
      },
      include: { role: true, organization: true },
    });
    createdUser = true;
  } else {
    // Existing: giữ org/data; đảm bảo ACTIVE + verified + OWNER (không privilege escalation)
    const ownerRole = await ensureOrgRolesAndOwner(user.organizationId);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        name: user.name?.trim() ? user.name : name,
        passwordHash,
        roleId: ownerRole.id,
        isActive: true,
        deletedAt: null,
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        emailNormalized: user.emailNormalized || emailNormalized,
        authProvider:
          user.authProvider === 'GOOGLE' || user.authProvider === 'BOTH' ? 'BOTH' : 'LOCAL',
      },
    });
    await removeOrgSuperAdminRole(user.organizationId);

    await prisma.organization.update({
      where: { id: user.organizationId },
      data: { isActive: true },
    });

    const wallet = await prisma.creditWallet.findUnique({
      where: { organizationId: user.organizationId },
    });
    if (!wallet) {
      await prisma.creditWallet.create({
        data: { organizationId: user.organizationId, balance: 0 },
      });
    }

    user = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { role: true, organization: true },
    });
  }

  if (FORBIDDEN_ROLE_CODES.has(user.role.code) || user.role.code === 'SUPER_ADMIN') {
    throw new Error(`Role không hợp lệ sau provision: ${user.role.code}`);
  }
  if (user.role.code !== 'OWNER') {
    throw new Error(`Expected OWNER (customer USER), got ${user.role.code}`);
  }

  const subResult = await ensureSubscription(user.organizationId, planCode, minDays);

  let canaryNote = '';
  if ((process.env.AUTO_POST_OAUTH_CANARY ?? '').trim().toLowerCase() === 'true') {
    if (ensureCanary) {
      const r = ensureCanaryOrgInEnvFile(user.organizationId);
      canaryNote = r.updated
        ? `Đã thêm org vào AUTO_POST_OAUTH_CANARY_ORG_IDS (.env). Restart API để áp dụng.`
        : `Org đã có trong AUTO_POST_OAUTH_CANARY_ORG_IDS.`;
    } else {
      canaryNote =
        `AUTO_POST_OAUTH_CANARY=true — thêm orgId vào AUTO_POST_OAUTH_CANARY_ORG_IDS rồi restart API:\n` +
        `  ${user.organizationId}\n` +
        `Hoặc chạy lại với META_REVIEWER_ENSURE_CANARY_ORG=true`;
    }
  }

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      action: AUDIT_ACTION,
      entityType: 'USER',
      entityId: user.id,
      metadata: {
        purpose: 'meta_app_review',
        createdUser,
        createdOrg,
        roleCode: user.role.code,
        organizationId: user.organizationId,
        organizationSlug: user.organization.slug,
        emailVerified: Boolean(user.emailVerifiedAt),
        isActive: user.isActive,
        planCode: subResult.subscription.plan.code,
        subscriptionStatus: subResult.subscription.status,
        currentPeriodEnd: subResult.subscription.currentPeriodEnd.toISOString(),
        subscriptionCreated: subResult.created,
        subscriptionExtended: subResult.extended,
        minDays,
        credentialFingerprint,
        // tuyệt đối không ghi password / passwordHash
      },
    },
  });

  const daysLeft = Math.ceil(
    (subResult.subscription.currentPeriodEnd.getTime() - Date.now()) / 86400000,
  );

  console.log('=== Meta App Reviewer provision OK ===');
  console.log(`email:            ${user.email}`);
  console.log(`userId:           ${user.id}`);
  console.log(`role:             ${user.role.code} (customer USER — not SUPER_ADMIN)`);
  console.log(`active:           ${user.isActive}`);
  console.log(`emailVerifiedAt:  ${user.emailVerifiedAt?.toISOString() ?? 'null'}`);
  console.log(`organization:     ${user.organization.slug} (${user.organizationId})`);
  console.log(`plan:             ${subResult.subscription.plan.code}`);
  console.log(`subscription:     ${subResult.subscription.status}`);
  console.log(`periodEnd:        ${subResult.subscription.currentPeriodEnd.toISOString()}`);
  console.log(`daysRemaining:    ${daysLeft}`);
  console.log(`createdUser:      ${createdUser}`);
  console.log(`createdOrg:       ${createdOrg}`);
  if (canaryNote) console.log(`oauthCanary:\n${canaryNote}`);
  console.log('password:         (from META_REVIEWER_PASSWORD — not printed)');
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
