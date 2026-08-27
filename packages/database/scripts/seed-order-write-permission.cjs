const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const perm = await prisma.permission.upsert({
      where: { code: 'order.write' },
      create: {
        code: 'order.write',
        name: 'Tao / sua don hang ban',
        module: 'sales',
      },
      update: {
        name: 'Tao / sua don hang ban',
        module: 'sales',
      },
    });

    const roles = await prisma.role.findMany({
      where: { code: { in: ['OWNER', 'MANAGER', 'SALE'] } },
      select: { id: true },
    });

    let linked = 0;
    for (const role of roles) {
      const exists = await prisma.rolePermission.findFirst({
        where: { roleId: role.id, permissionId: perm.id },
      });
      if (!exists) {
        await prisma.rolePermission.create({
          data: { roleId: role.id, permissionId: perm.id },
        });
        linked += 1;
      }
    }

    console.log(JSON.stringify({ ok: true, roles: roles.length, linked }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
