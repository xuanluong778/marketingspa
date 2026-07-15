/**
 * HRM Phase 0: align role codes + seed hrm.* permissions on current DATABASE_URL.
 * Usage: pnpm hrm:phase0
 */
const path = require('path');

// Prefer generated client from database package
let PrismaClient;
try {
  ({ PrismaClient } = require(path.resolve(__dirname, '../packages/database/node_modules/@prisma/client')));
} catch {
  ({ PrismaClient } = require('@prisma/client'));
}

const prisma = new PrismaClient();

const PERMISSION_DEFS = [
  { code: 'customer.read', name: 'Xem khách hàng', module: 'crm' },
  { code: 'customer.write', name: 'Sửa khách hàng', module: 'crm' },
  { code: 'lead.read', name: 'Xem lead', module: 'crm' },
  { code: 'lead.write', name: 'Sửa lead', module: 'crm' },
  { code: 'campaign.send', name: 'Gửi chiến dịch', module: 'marketing' },
  { code: 'order.read', name: 'Xem đơn hàng', module: 'finance' },
  { code: 'expense.write', name: 'Ghi chi phí', module: 'finance' },
  { code: 'report.view', name: 'Xem báo cáo', module: 'analytics' },
  { code: 'settings.manage', name: 'Quản lý cài đặt', module: 'admin' },
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

const ROLE_SEEDS = [
  { code: 'OWNER', name: 'Chủ spa' },
  { code: 'MANAGER', name: 'Quản lý' },
  { code: 'MARKETING', name: 'Marketing' },
  { code: 'SALE', name: 'Sale' },
  { code: 'TECHNICIAN', name: 'Kỹ thuật viên' },
  { code: 'HR', name: 'Nhân sự' },
];

const ALIASES = [
  ['MARKETER', 'MARKETING'],
  ['STAFF', 'TECHNICIAN'],
  ['ADMIN', 'MANAGER'],
];

const ROLE_PERMISSIONS = {
  OWNER: PERMISSION_DEFS.map((p) => p.code),
  MANAGER: PERMISSION_DEFS.filter((p) => p.code !== 'settings.manage').map((p) => p.code),
  MARKETING: [
    'customer.read',
    'lead.read',
    'lead.write',
    'campaign.send',
    'report.view',
    'hrm.employee.read',
  ],
  SALE: [
    'customer.read',
    'customer.write',
    'lead.read',
    'lead.write',
    'order.read',
    'report.view',
    'hrm.employee.read',
  ],
  TECHNICIAN: [
    'hrm.employee.read',
    'hrm.attendance.read',
    'hrm.leave.read',
    'hrm.leave.write',
    'lead.read',
    'customer.read',
  ],
  HR: [
    'hrm.employee.read',
    'hrm.employee.write',
    'hrm.contract.read',
    'hrm.contract.write',
    'hrm.document.read',
    'hrm.document.write',
    'hrm.account.manage',
    'hrm.audit.read',
    'hrm.attendance.read',
    'hrm.attendance.write',
    'hrm.attendance.lock',
    'hrm.leave.read',
    'hrm.leave.write',
    'hrm.leave.approve',
    'report.view',
    'customer.read',
  ],
};

async function main() {
  console.log('[hrm-phase0] Seeding permissions...');
  const permissions = [];
  for (const p of PERMISSION_DEFS) {
    permissions.push(
      await prisma.permission.upsert({
        where: { code: p.code },
        update: { name: p.name, module: p.module },
        create: p,
      }),
    );
  }
  const byCode = new Map(permissions.map((p) => [p.code, p]));

  const orgs = await prisma.organization.findMany({ select: { id: true, slug: true } });
  console.log(`[hrm-phase0] Align roles for ${orgs.length} org(s)...`);

  for (const org of orgs) {
    const rolesByCode = {};
    for (const r of ROLE_SEEDS) {
      const role = await prisma.role.upsert({
        where: { organizationId_code: { organizationId: org.id, code: r.code } },
        update: { name: r.name, isSystem: true },
        create: {
          organizationId: org.id,
          code: r.code,
          name: r.name,
          isSystem: true,
        },
      });
      rolesByCode[r.code] = role;
    }

    for (const [fromCode, toCode] of ALIASES) {
      const legacy = await prisma.role.findUnique({
        where: { organizationId_code: { organizationId: org.id, code: fromCode } },
      });
      const target = rolesByCode[toCode];
      if (legacy && target) {
        const moved = await prisma.user.updateMany({
          where: { organizationId: org.id, roleId: legacy.id },
          data: { roleId: target.id },
        });
        await prisma.rolePermission.deleteMany({ where: { roleId: legacy.id } });
        await prisma.role.delete({ where: { id: legacy.id } });
        console.log(
          `  ${org.slug}: ${fromCode} → ${toCode} (users moved: ${moved.count})`,
        );
      }
    }

    for (const [code, role] of Object.entries(rolesByCode)) {
      const codes = ROLE_PERMISSIONS[code] || [];
      const links = codes
        .map((c) => byCode.get(c))
        .filter(Boolean)
        .map((p) => ({ roleId: role.id, permissionId: p.id }));
      if (links.length) {
        await prisma.rolePermission.createMany({ data: links, skipDuplicates: true });
      }
    }
    console.log(`  ${org.slug}: roles + permissions OK`);
  }

  console.log('[hrm-phase0] Done.');
}

main()
  .catch((err) => {
    console.error('[hrm-phase0] FAILED', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
