/**
 * Marketing Autopilot project list filters — large dataset
 * pnpm test:marketing-autopilot-project-list-filters
 */
import { randomUUID } from 'crypto';
import { Prisma } from '@marketingspa/database';
import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../apps/api/src/prisma/prisma.service';
import { AuditService } from '../apps/api/src/audit/audit.service';
import { MarketingAutopilotService } from '../apps/api/src/marketing-autopilot/marketing-autopilot.service';
import {
  buildProjectListWhere,
  resolveProjectDateRange,
} from '../apps/api/src/marketing-autopilot/marketing-autopilot-project-list.util';

function asConfig(v: 'true' | 'false'): ConfigService {
  return { get: () => v } as unknown as ConfigService;
}

async function buildService(prisma: PrismaService) {
  const audit = new AuditService(prisma);
  const noop = {} as any;
  const missionOrchestrator = {
    kickMissionPipeline: () => undefined,
    toPublicMissionDetailed: async (m: unknown) => m,
  };
  return new MarketingAutopilotService(
    prisma,
    asConfig('true'),
    audit,
    noop,
    noop,
    noop,
    noop,
    noop,
    missionOrchestrator as any,
  );
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const service = await buildService(prisma);

  const org = await prisma.organization.findFirst({
    include: { users: { take: 1, where: { deletedAt: null } } },
  });
  if (!org?.users[0]) throw new Error('No org/user');

  const tag = randomUUID().slice(0, 8);
  const seedIds: string[] = [];
  const statuses = ['ANALYZED', 'RUNNING', 'READY_FOR_APPROVAL', 'DRAFTS_CREATED'];
  const products = ['Trị nám da', 'Liệu trình nám', 'Trị mụn', 'Spa detox'];
  const goals = ['Tăng Lead', 'Tăng Booking', 'Tăng doanh thu'];

  console.log(`Seeding 120 projects [${tag}]...`);
  const now = Date.now();
  for (let i = 0; i < 120; i++) {
    const id = randomUUID();
    seedIds.push(id);
    const createdAt = new Date(now - i * 3600_000);
    await prisma.marketingAutopilotProject.create({
      data: {
        id,
        organizationId: org.id,
        createdById: org.users[0].id,
        name: `Seed ${tag} #${i} — ${products[i % products.length]}`,
        status: statuses[i % statuses.length]!,
        productName: products[i % products.length]!,
        productPrice: new Prisma.Decimal(1_000_000 + i * 10_000),
        customerProfile: 'Test ICP',
        targetArea: 'TP.HCM',
        monthlyBudget: new Prisma.Decimal(5_000_000 + (i % 10) * 5_000_000),
        primaryGoal: goals[i % goals.length]!,
        inputSnapshot: {},
        analysisSummary: 'seed',
        analysisJson: {},
        createdAt,
      },
    });
  }

  let searchPass = false;
  let combinePass = false;
  let paginationPass = false;
  let tenantPass = false;
  let urlPresetPass = false;

  try {
    const searchRes = await service.findAll(org.id, { page: 1, pageSize: 20, q: 'Trị nám' });
    searchPass =
      searchRes.items.length > 0 &&
      searchRes.items.every(
        (p) =>
          p.name.toLowerCase().includes('trị nám') ||
          p.productName.toLowerCase().includes('trị nám'),
      );

    const combined = await service.findAll(org.id, {
      page: 1,
      pageSize: 10,
      q: tag,
      status: 'RUNNING',
      product: 'Liệu trình nám',
      budgetMin: 10_000_000,
      sort: 'budget',
    });
    combinePass =
      combined.items.length >= 1 &&
      combined.items.every(
        (p) =>
          p.name.includes(tag) &&
          p.status === 'RUNNING' &&
          p.productName.toLowerCase() === 'liệu trình nám' &&
          Number(p.monthlyBudget) >= 10_000_000,
      );

    const page1 = await service.findAll(org.id, { page: 1, pageSize: 15, q: tag, sort: 'newest' });
    const page2 = await service.findAll(org.id, { page: 2, pageSize: 15, q: tag, sort: 'newest' });
    paginationPass =
      page1.items.length === 15 &&
      page2.items.length === 15 &&
      page1.total >= 120 &&
      page1.items[0]!.id !== page2.items[0]!.id;

    const otherOrg = await prisma.organization.findFirst({ where: { id: { not: org.id } } });
    if (otherOrg) {
      const foreign = await service.findAll(otherOrg.id, { q: tag, page: 1, pageSize: 50 });
      tenantPass = foreign.items.every((p) => !p.name.includes(tag));
    } else {
      const where = buildProjectListWhere(randomUUID(), { q: tag });
      tenantPass = JSON.stringify(where).includes('organizationId');
    }

    const range = resolveProjectDateRange('7d');
    urlPresetPass = Boolean(range?.gte && range.lte);
  } finally {
    await prisma.marketingAutopilotProject.deleteMany({ where: { id: { in: seedIds } } });
    await prisma.$disconnect();
  }

  console.log(`SEARCH=${searchPass ? 'PASS' : 'FAIL'}`);
  console.log(`COMBINED_FILTERS=${combinePass ? 'PASS' : 'FAIL'}`);
  console.log(`PAGINATION=${paginationPass ? 'PASS' : 'FAIL'}`);
  console.log(`TENANT_ISOLATION=${tenantPass ? 'PASS' : 'FAIL'}`);
  console.log(`DATE_PRESET=${urlPresetPass ? 'PASS' : 'FAIL'}`);

  const all = searchPass && combinePass && paginationPass && tenantPass && urlPresetPass;
  console.log(`OVERALL=${all ? 'PASS' : 'FAIL'}`);
  if (!all) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
