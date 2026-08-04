/**
 * Inspect which users/roles lack ads.read and fix role permissions.
 * Never prints secrets.
 */
import { prisma } from '@marketingspa/database';

const ADS_PERMS = [
  'ads.read',
  'ads.connect',
  'ads.sync',
  'ads.analyze',
  'ads.manage',
] as const;

async function main() {
  const perms = await prisma.permission.findMany({
    where: { code: { in: [...ADS_PERMS] } },
    select: { id: true, code: true },
  });
  console.log(JSON.stringify({ permissionRows: perms }, null, 2));

  const roles = await prisma.role.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      organizationId: true,
      permissions: { select: { permission: { select: { code: true } } } },
    },
    orderBy: [{ organizationId: 'asc' }, { code: 'asc' }],
  });

  const roleSummary = roles.map((r) => {
    const codes = new Set(r.permissions.map((p) => p.permission.code));
    return {
      org: r.organizationId,
      role: r.code,
      name: r.name,
      hasAdsRead: codes.has('ads.read'),
      adsPerms: ADS_PERMS.filter((c) => codes.has(c)),
    };
  });
  console.log(JSON.stringify({ roles: roleSummary.filter((r) => !r.hasAdsRead || r.adsPerms.length > 0).slice(0, 80) }, null, 2));

  // Users whose name/email looks like Tin Học or recent active users missing ads.read
  const users = await prisma.user.findMany({
    where: { isActive: true, deletedAt: null },
    select: {
      id: true,
      email: true,
      name: true,
      organizationId: true,
      role: {
        select: {
          code: true,
          permissions: { select: { permission: { select: { code: true } } } },
        },
      },
      organization: { select: { name: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 40,
  });

  const userRows = users.map((u) => {
    const codes = new Set(u.role.permissions.map((p) => p.permission.code));
    return {
      email: u.email,
      name: u.name,
      orgName: u.organization?.name ?? null,
      orgId: u.organizationId,
      role: u.role.code,
      hasAdsRead: codes.has('ads.read'),
      adsPerms: ADS_PERMS.filter((c) => codes.has(c)),
    };
  });
  console.log(
    JSON.stringify(
      {
        recentUsersMissingAdsRead: userRows.filter((u) => !u.hasAdsRead),
        tinHocLike: userRows.filter(
          (u) =>
            /tin\s*họ|siêu|tinhoc/i.test(`${u.name ?? ''} ${u.email} ${u.orgName ?? ''}`),
        ),
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
