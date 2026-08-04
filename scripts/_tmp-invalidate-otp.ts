import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const r = await p.registrationOtp.updateMany({
    where: { email: 'xuanluongmarketing@gmail.com', consumedAt: null },
    data: { invalidatedAt: new Date() },
  });
  console.log('invalidated', r.count);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
