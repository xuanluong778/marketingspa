/**
 * Gán role SUPER_ADMIN cho email trong PLATFORM_SUPER_ADMIN_EMAIL (mặc định xuanluong778@gmail.com).
 * Runtime chỉ kiểm tra role qua PlatformAdminGuard — không check email rải rác.
 *
 * node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/bootstrap-super-admin.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EMAIL = (
  process.env.PLATFORM_SUPER_ADMIN_EMAIL || 'xuanluong778@gmail.com'
)
  .trim()
  .toLowerCase();

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: EMAIL },
    include: { role: true, organization: true },
  });
  if (!user) {
    console.error(`User not found: ${EMAIL}`);
    console.error('Đăng ký/đăng nhập tài khoản này trước, rồi chạy lại script.');
    process.exit(1);
  }

  const role = await prisma.role.upsert({
    where: {
      organizationId_code: {
        organizationId: user.organizationId,
        code: 'SUPER_ADMIN',
      },
    },
    update: {
      name: 'Super Admin',
      description: 'Quản trị nền tảng MarketingAutoAZ',
      isSystem: true,
    },
    create: {
      organizationId: user.organizationId,
      code: 'SUPER_ADMIN',
      name: 'Super Admin',
      description: 'Quản trị nền tảng MarketingAutoAZ',
      isSystem: true,
    },
  });

  if (user.roleId === role.id) {
    console.log(`OK: ${EMAIL} đã là SUPER_ADMIN (org=${user.organization.slug})`);
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { roleId: role.id },
  });

  console.log(
    `OK: Gán SUPER_ADMIN cho ${EMAIL} (trước: ${user.role.code} → SUPER_ADMIN, org=${user.organization.slug})`,
  );
  console.log('User cần đăng xuất/đăng nhập lại để JWT/role refresh.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
