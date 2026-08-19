import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const recent = await prisma.chatbotMessage.findMany({
    where: {
      OR: [
        { message: { contains: 'tư vấn dịch vụ marketing' } },
        { message: { contains: 'chưa có đủ thông tin chính xác' } },
        { message: { contains: 'marketing' } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      role: true,
      message: true,
      createdAt: true,
      conversationId: true,
      conversation: {
        select: {
          organizationId: true,
          channel: true,
          botId: true,
        },
      },
    },
  });
  for (const m of recent) {
    console.log(
      JSON.stringify({
        at: m.createdAt.toISOString(),
        role: m.role,
        org: m.conversation.organizationId.slice(0, 8),
        channel: m.conversation.channel,
        msg: m.message.slice(0, 120).replace(/\s+/g, ' '),
      }),
    );
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
