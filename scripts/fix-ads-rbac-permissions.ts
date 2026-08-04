/**
 * Grant ads.* permissions to SUPER_ADMIN / OWNER / MANAGER / MARKETING / SALE
 * according to defaultPermissionCodesForRole — fixes orgs created before ads perms existed.
 */
import { prisma } from '@marketingspa/database';
import { defaultPermissionCodesForRole } from '../apps/api/src/common/constants/roles';

const ADS = ['ads.read', 'ads.connect', 'ads.sync', 'ads.analyze', 'ads.manage'] as const;

async function main() {
  const perms = await prisma.permission.findMany({
    where: { code: { in: [...ADS] } },
    select: { id: true, code: true },
  });
  const byCode = new Map(perms.map((p) => [p.code, p.id]));
  for (const code of ADS) {
    if (!byCode.has(code)) {
      throw new Error(`Missing permission row: ${code}`);
    }
  }

  const roles = await prisma.role.findMany({
    where: {
      code: { in: ['SUPER_ADMIN', 'OWNER', 'MANAGER', 'MARKETING', 'SALE'] },
    },
    select: {
      id: true,
      code: true,
      organizationId: true,
      permissions: { select: { permissionId: true, permission: { select: { code: true } } } },
    },
  });

  let linked = 0;
  for (const role of roles) {
    const wanted =
      role.code === 'SUPER_ADMIN'
        ? [...ADS]
        : defaultPermissionCodesForRole(role.code).filter((c) =>
            (ADS as readonly string[]).includes(c),
          );
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

  // Verify Tin Học Siêu Việt
  const user = await prisma.user.findFirst({
    where: { email: 'xuanluong778@gmail.com' },
    select: {
      email: true,
      name: true,
      role: {
        select: {
          code: true,
          permissions: { select: { permission: { select: { code: true } } } },
        },
      },
    },
  });
  const adsNow = (user?.role.permissions ?? [])
    .map((p) => p.permission.code)
    .filter((c) => c.startsWith('ads.'));

  console.log(
    JSON.stringify(
      {
        ok: true,
        rolePermissionRowsAdded: linked,
        rolesScanned: roles.length,
        verifyUser: {
          email: user?.email,
          name: user?.name,
          role: user?.role.code,
          adsPerms: adsNow,
        },
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
