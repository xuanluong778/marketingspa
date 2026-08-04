import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const orgs = await prisma.organization.findMany();
  for (const org of orgs) {
    const template = await prisma.messageTemplate.findFirst({
      where: { organizationId: org.id, name: '[Mock] Chào hỏi chăm sóc khách hàng' }
    });

    if (!template) {
      await prisma.messageTemplate.create({
        data: {
          organizationId: org.id,
          name: '[Mock] Chào hỏi chăm sóc khách hàng',
          channel: 'MESSENGER',
          subject: 'Chăm sóc khách hàng',
          body: 'Xin chào {{customer_name}}, cảm ơn bạn đã tương tác với Spa. Chúc bạn một ngày tốt lành!',
          variables: ['customer_name'],
          isActive: true,
        }
      });
      console.log(`Created [Mock] Chào hỏi chăm sóc khách hàng for ${org.name}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
