import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();
const feats = [
  'crm_full',
  'marketing_automation',
  'ads_performance',
  'chatbot_cskh',
  'content_auto_post',
  'hrm',
  'messaging_campaigns',
  'reports',
];

async function main() {
  await prisma.subscriptionPlan.upsert({
    where: { code: 'msp-pro-6m' },
    update: {
      name: 'Marketing SPA Pro — 6 tháng',
      priceMonthly: new Decimal(650000),
      priceVnd: new Decimal(3900000),
      durationMonths: 6,
      highlightLabel: null,
      savingsAmount: null,
      sortOrder: 10,
      features: feats,
      isActive: true,
    },
    create: {
      code: 'msp-pro-6m',
      name: 'Marketing SPA Pro — 6 tháng',
      priceMonthly: new Decimal(650000),
      priceVnd: new Decimal(3900000),
      durationMonths: 6,
      sortOrder: 10,
      creditsIncluded: 0,
      features: feats,
      isActive: true,
    },
  });
  await prisma.subscriptionPlan.upsert({
    where: { code: 'msp-pro-12m' },
    update: {
      name: 'Marketing SPA Pro — 12 tháng',
      priceMonthly: new Decimal(458333),
      priceVnd: new Decimal(5500000),
      durationMonths: 12,
      highlightLabel: 'Khuyên dùng',
      savingsAmount: new Decimal(2300000),
      sortOrder: 20,
      features: feats,
      isActive: true,
    },
    create: {
      code: 'msp-pro-12m',
      name: 'Marketing SPA Pro — 12 tháng',
      priceMonthly: new Decimal(458333),
      priceVnd: new Decimal(5500000),
      durationMonths: 12,
      highlightLabel: 'Khuyên dùng',
      savingsAmount: new Decimal(2300000),
      sortOrder: 20,
      creditsIncluded: 0,
      features: feats,
      isActive: true,
    },
  });
  const plans = await prisma.subscriptionPlan.findMany({
    where: { code: { in: ['msp-pro-6m', 'msp-pro-12m'] } },
  });
  console.log(
    plans.map((p) => ({
      code: p.code,
      priceVnd: String(p.priceVnd),
      months: p.durationMonths,
      label: p.highlightLabel,
    })),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
