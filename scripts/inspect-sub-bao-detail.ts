import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
const orgId = '633cd272-2e7b-406d-9ce3-7d5f5f091eaa';

async function main() {
  const sub = await p.subscription.findFirst({
    where: { organizationId: orgId },
    include: { plan: true },
  });
  const orders = await p.paymentOrder.findMany({
    where: { organizationId: orgId },
    include: { plan: true },
  });
  const txns = await p.paymentTransaction.findMany({
    where: { organizationId: orgId },
  });
  // any affiliate commission from this fake paid
  const commissions = await p.affiliateCommission.findMany({
    where: { organizationId: orgId },
  });
  console.log(JSON.stringify({ sub, orders, txns, commissions }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
