import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
const email = 'xuanluongmarketing@gmail.com';

async function main() {
  const rows = await p.registrationOtp.findMany({
    where: { email },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  const tryCodes = ['849175', '061781'];
  for (const r of rows) {
    console.log({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      attempts: r.attemptCount,
      consumed: !!r.consumedAt,
      invalidated: !!r.invalidatedAt,
      expired: r.expiresAt < new Date(),
    });
    for (const c of tryCodes) {
      const h = createHash('sha256').update(c).digest('hex');
      if (h === r.codeHash) console.log('  MATCH code', c);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
