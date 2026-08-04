/**
 * Idempotent: ensure SUPER_ADMIN / OWNER / MANAGER / HR have hrm.attendance.*
 * (and full default set for SUPER_ADMIN/OWNER with empty RolePermission).
 * Fixes platform org roles created without RolePermission rows.
 */
import { prisma } from '@marketingspa/database';
import {
  ALL_PERMISSION_DEFS,
  defaultPermissionCodesForRole,
} from '../apps/api/src/common/constants/roles';

async function main() {
  const allCodes = ALL_PERMISSION_DEFS.map((p) => p.code);
  const perms = await prisma.permission.findMany({
    where: { code: { in: allCodes } },
    select: { id: true, code: true },
  });
  const byCode = new Map(perms.map((p) => [p.code, p.id]));
  for (const code of allCodes) {
    if (!byCode.has(code)) {
      throw new Error(`Missing permission row: ${code}`);
    }
  }

  const roles = await prisma.role.findMany({
    where: {
      code: { in: ['SUPER_ADMIN', 'OWNER', 'MANAGER', 'HR'] },
    },
    select: {
      id: true,
      code: true,
      organizationId: true,
      permissions: { select: { permission: { select: { code: true } } } },
    },
  });

  let linked = 0;
  for (const role of roles) {
    const wanted =
      role.code === 'SUPER_ADMIN'
        ? allCodes
        : defaultPermissionCodesForRole(role.code);
    const have = new Set(role.permissions.map((p) => p.permission.code));
    for (const code of wanted) {
      if (have.has(code)) continue;
      const permissionId = byCode.get(code)!;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId },
        },
        create: { roleId: role.id, permissionId },
        update: {},
      });
      linked += 1;
    }
  }

  const verify = await prisma.role.findMany({
    where: { code: { in: ['SUPER_ADMIN', 'OWNER'] } },
    select: {
      code: true,
      organizationId: true,
      _count: { select: { permissions: true } },
      permissions: {
        where: { permission: { code: { startsWith: 'hrm.attendance' } } },
        select: { permission: { select: { code: true } } },
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        rolePermissionRowsAdded: linked,
        rolesScanned: roles.length,
        verify: verify.map((r) => ({
          code: r.code,
          org: r.organizationId.slice(0, 8),
          totalPerms: r._count.permissions,
          attendance: r.permissions.map((p) => p.permission.code),
        })),
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(String(e).slice(0, 400));
  process.exit(1);
});
