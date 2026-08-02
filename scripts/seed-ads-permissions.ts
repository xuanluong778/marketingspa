import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ads = [
  { code: 'ads.read', name: 'Xem quảng cáo / insights', module: 'ads' },
  { code: 'ads.connect', name: 'Kết nối tài khoản Ads (OAuth)', module: 'ads' },
  { code: 'ads.sync', name: 'Đồng bộ dữ liệu Ads', module: 'ads' },
  { code: 'ads.analyze', name: 'Phân tích / AI draft Ads', module: 'ads' },
  { code: 'ads.manage', name: 'Quản lý chiến dịch Ads (pause/enable/rules)', module: 'ads' },
];

const roleMap: Record<string, string[]> = {
  OWNER: ads.map((a) => a.code),
  MANAGER: ads.map((a) => a.code),
  MARKETING: ads.map((a) => a.code),
  SALE: ['ads.read'],
};

async function main() {
  for (const p of ads) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { name: p.name, module: p.module },
      create: p,
    });
  }
  const perms = await prisma.permission.findMany({
    where: { code: { in: ads.map((a) => a.code) } },
  });
  const byCode = new Map(perms.map((p) => [p.code, p]));
  const roles = await prisma.role.findMany({
    where: { code: { in: Object.keys(roleMap) } },
  });
  let links = 0;
  for (const role of roles) {
    const codes = roleMap[role.code] ?? [];
    for (const code of codes) {
      const perm = byCode.get(code);
      if (!perm) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
      links += 1;
    }
  }
  console.log('seeded ads perms', perms.length, 'role links', links);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
