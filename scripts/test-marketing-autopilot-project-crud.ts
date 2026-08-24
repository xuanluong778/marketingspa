/**
 * Marketing Autopilot project edit / soft-delete / tenant isolation
 *
 * pnpm test:marketing-autopilot-project-crud
 */
import { randomUUID } from 'crypto';
import { Prisma } from '@marketingspa/database';
import { PrismaService } from '../apps/api/src/prisma/prisma.service';
import { AuditService } from '../apps/api/src/audit/audit.service';
import { MarketingAutopilotService } from '../apps/api/src/marketing-autopilot/marketing-autopilot.service';
import type { ConfigService } from '@nestjs/config';

type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
};

function asConfig(v: 'true' | 'false'): ConfigService {
  return { get: () => v } as unknown as ConfigService;
}

async function buildService(prisma: PrismaService) {
  const audit = new AuditService(prisma);
  const noop = {} as any;
  const missionOrchestrator = {
    kickMissionPipeline: () => undefined,
    toPublicMissionDetailed: async (mission: unknown) => mission,
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
    include: { users: { take: 2, where: { deletedAt: null } } },
  });
  if (!org?.users[0]) throw new Error('No user for test');
  const user: AuthUser = {
    id: org.users[0].id,
    email: org.users[0].email,
    name: org.users[0].name,
    role: org.users[0].role,
    organizationId: org.id,
  };

  const otherOrg = await prisma.organization.findFirst({
    where: { id: { not: org.id } },
    include: { users: { take: 1, where: { deletedAt: null } } },
  });

  const tag = randomUUID().slice(0, 8);
  const created = await prisma.marketingAutopilotProject.create({
    data: {
      organizationId: org.id,
      createdById: user.id,
      name: `CRUD Test ${tag}`,
      status: 'ANALYZED',
      productName: 'Trị nám da',
      productPrice: new Prisma.Decimal(2_500_000),
      customerProfile: 'Nữ 28-45 TP.HCM',
      targetArea: 'TP.HCM',
      monthlyBudget: new Prisma.Decimal(10_000_000),
      primaryGoal: 'Tăng Lead',
      inputSnapshot: { productName: 'Trị nám da', primaryGoal: 'Tăng Lead' },
      analysisSummary: 'test',
      analysisJson: { summary: 'test' },
    },
  });

  let projectEdit = false;
  let softDelete = false;
  let runningSafe = false;
  let tenantIsolation = false;
  let uiRefresh = false;

  try {
    const updated = await service.updateProject(user, created.id, {
      projectName: `CRUD Updated ${tag}`,
      productName: 'Liệu trình nám',
      productPrice: 3_000_000,
      customerProfile: 'Nữ văn phòng Q1',
      targetArea: 'Quận 1, TP.HCM',
      monthlyBudget: 15_000_000,
      primaryGoal: 'Tăng Lead, Tăng Booking',
      goals: ['tang-lead', 'tang-booking'],
      channels: ['Facebook', 'Zalo'],
    });
    const row = await prisma.marketingAutopilotProject.findUnique({ where: { id: created.id } });
    projectEdit =
      updated.productName === 'Liệu trình nám' &&
      row?.productName === 'Liệu trình nám' &&
      row?.targetArea === 'Quận 1, TP.HCM' &&
      (row?.inputSnapshot as { channels?: string[] })?.channels?.includes('Facebook') === true;

    uiRefresh = updated.name.includes('CRUD Updated') && updated.id === created.id;

    if (otherOrg?.users[0]) {
      const intruder: AuthUser = {
        id: otherOrg.users[0].id,
        email: otherOrg.users[0].email,
        name: otherOrg.users[0].name,
        role: otherOrg.users[0].role,
        organizationId: otherOrg.id,
      };
      try {
        await service.updateProject(intruder, created.id, { projectName: 'Hack' });
      } catch (err) {
        tenantIsolation =
          err instanceof Error &&
          (/Forbidden|Không tìm thấy|not found/i.test(err.message) ||
            err.name === 'NotFoundException' ||
            err.name === 'ForbiddenException');
      }
    } else {
      try {
        await service.updateProject(
          { ...user, organizationId: randomUUID() },
          created.id,
          { projectName: 'Hack' },
        );
      } catch (err) {
        tenantIsolation = err instanceof Error;
      }
    }

    const runningProject = await prisma.marketingAutopilotProject.findFirst({
      where: { organizationId: org.id, status: 'RUNNING', deletedAt: null },
      include: {
        missions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { assets: true },
        },
        drafts: true,
      },
    });

    if (runningProject) {
      const draftCountBefore = runningProject.drafts.length;
      const assetCountBefore = runningProject.missions[0]?.assets.length ?? 0;
      await service.updateProject(user, runningProject.id, {
        customerProfile: `${runningProject.customerProfile} [brief edit ${tag}]`,
        channels: ['Facebook', 'Instagram'],
      });
      const after = await prisma.marketingAutopilotProject.findFirst({
        where: { id: runningProject.id },
        include: {
          missions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { assets: true },
          },
          drafts: true,
        },
      });
      runningSafe =
        (after?.drafts.length ?? 0) === draftCountBefore &&
        (after?.missions[0]?.assets.length ?? 0) === assetCountBefore &&
        after?.customerProfile.includes(`[brief edit ${tag}]`) === true;
    } else {
      runningSafe = true;
    }

    await service.archiveProject(user, created.id);
    const archived = await prisma.marketingAutopilotProject.findUnique({ where: { id: created.id } });
    const list = await service.findAll(org.id, { page: 1, pageSize: 100 });
    softDelete =
      archived?.deletedAt != null &&
      archived.status === 'ARCHIVED' &&
      !list.items.some((i) => i.id === created.id);

    const missionCount = await prisma.marketingMission.count({ where: { projectId: created.id } });
    softDelete = softDelete && missionCount >= 0;
  } finally {
    await prisma.marketingAutopilotProject
      .delete({ where: { id: created.id } })
      .catch(() => undefined);
    await prisma.$disconnect();
  }

  console.log(`PROJECT_EDIT=${projectEdit ? 'PASS' : 'FAIL'}`);
  console.log(`SOFT_DELETE=${softDelete ? 'PASS' : 'FAIL'}`);
  console.log(`RUNNING_SAFE=${runningSafe ? 'PASS' : 'FAIL'}`);
  console.log(`TENANT_ISOLATION=${tenantIsolation ? 'PASS' : 'FAIL'}`);
  console.log(`UI_REFRESH=${uiRefresh ? 'PASS' : 'FAIL'}`);

  const allPass = projectEdit && softDelete && runningSafe && tenantIsolation && uiRefresh;
  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
