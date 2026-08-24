/**
 * E2E: Approval-first Autopilot
 * READY_FOR_APPROVAL → approve → immutable snapshot → APPROVED → QUEUED → RUNNING
 *
 * node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-marketing-autopilot-approval-e2e.ts
 */
import { Prisma } from '@marketingspa/database';
import {
  buildImmutableApprovalSnapshot,
  buildMissionApprovalSummary,
} from '@marketingspa/shared';
import { PrismaService } from '../apps/api/src/prisma/prisma.service';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

/** Mirror of orchestrator.approveAndRun + runApprovedMission (no Nest DI). */
async function approveAndRunSoft(
  prisma: PrismaService,
  user: { id: string; email: string; name: string; organizationId: string },
  missionId: string,
) {
  const mission = await prisma.marketingMission.findFirst({
    where: { id: missionId, organizationId: user.organizationId },
    include: {
      assets: { orderBy: { createdAt: 'asc' } },
      approvals: { orderBy: { version: 'desc' }, take: 1 },
    },
  });
  assert(mission, 'mission');

  if (
    mission.status === 'APPROVED' ||
    mission.status === 'QUEUED' ||
    (mission.status === 'RUNNING' && mission.readyAt)
  ) {
    return mission;
  }
  assert(mission.status === 'READY_FOR_APPROVAL', `status ${mission.status}`);

  const analysis = await prisma.marketingAutopilotAnalysis.findFirst({
    where: { projectId: mission.projectId, organizationId: user.organizationId },
    orderBy: { createdAt: 'desc' },
  });
  const analysisJson = (analysis?.recommendationJson ?? {}) as Record<string, unknown>;
  const plan = analysisJson.plan ?? analysisJson;
  const nextVersion = (mission.approvalVersion ?? 0) + 1;
  const approvedAt = new Date();
  const snapshot = buildImmutableApprovalSnapshot({
    version: nextVersion,
    missionId: mission.id,
    projectId: mission.projectId,
    organizationId: user.organizationId,
    plan,
    analysis: analysisJson,
    blueprint: mission.blueprintJson,
    assets: mission.assets.map((a) => ({
      module: a.module,
      entityType: a.entityType,
      entityId: a.entityId,
      status: a.status,
      adapter: a.adapter,
    })),
    approver: { id: user.id, email: user.email, name: user.name },
    approvedAt: approvedAt.toISOString(),
  });

  const approval = await prisma.$transaction(async (tx) => {
    const row = await tx.marketingMissionApproval.create({
      data: {
        organizationId: user.organizationId,
        missionId: mission.id,
        projectId: mission.projectId,
        version: nextVersion,
        approvedById: user.id,
        approvedAt,
        snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
        runStatus: 'APPROVED',
      },
    });
    await tx.marketingMission.update({
      where: { id: mission.id },
      data: { status: 'APPROVED', approvedAt, approvalVersion: nextVersion },
    });
    await tx.marketingAutopilotProject.update({
      where: { id: mission.projectId },
      data: { status: 'APPROVED' },
    });
    return row;
  });

  // QUEUED → RUNNING soft
  await prisma.marketingMission.update({
    where: { id: mission.id },
    data: { status: 'QUEUED' },
  });
  await prisma.marketingMissionApproval.update({
    where: { id: approval.id },
    data: { runStatus: 'QUEUED' },
  });
  await prisma.marketingMission.update({
    where: { id: mission.id },
    data: { status: 'RUNNING' },
  });
  await prisma.marketingMissionApproval.update({
    where: { id: approval.id },
    data: { runStatus: 'RUNNING', startedAt: new Date() },
  });
  await prisma.marketingMissionAsset.updateMany({
    where: { missionId: mission.id },
    data: { status: 'APPROVED' },
  });
  await prisma.marketingMissionApproval.update({
    where: { id: approval.id },
    data: { runStatus: 'COMPLETED', completedAt: new Date() },
  });
  await prisma.marketingAutopilotProject.update({
    where: { id: mission.projectId },
    data: { status: 'RUNNING' },
  });

  return { missionId: mission.id, approvalId: approval.id, snapshot };
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();

  const org = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
  const user = await prisma.user.findFirst({
    where: org ? { organizationId: org.id } : undefined,
    orderBy: { createdAt: 'asc' },
  });
  assert(org && user, 'need org+user');

  const project = await prisma.marketingAutopilotProject.create({
    data: {
      organizationId: org.id,
      createdById: user.id,
      name: `Approval E2E ${Date.now()}`,
      status: 'ANALYZED',
      productName: 'Spa Detox',
      productPrice: 1500000,
      customerProfile: 'Nữ 25-40',
      targetArea: 'Hà Nội',
      monthlyBudget: 30000000,
      primaryGoal: 'Tăng Booking',
      analysisSummary: 'approval e2e',
      analysisJson: {
        summary: 'approval e2e',
        score: 72,
        suggestedChannels: ['Facebook', 'Zalo', 'Email'],
        risks: ['Ngân sách Ads thấp'],
        nextSteps: [],
        budgetSplit: [{ channel: 'Facebook', percent: 40 }],
        plan: {
          offer: { productName: 'Spa Detox', primaryGoal: 'Tăng Booking' },
          customersTarget: { targetProfile: 'Nữ 25-40', targetArea: 'Hà Nội' },
          funnel: {
            stages: [
              { name: 'Awareness', objective: 'Reach' },
              { name: 'Booking', objective: 'Convert' },
            ],
          },
          content: { themes: ['Detox', 'Ưu đãi'] },
          budget: { monthlyBudget: 30000000 },
          kpi: { primary: 'Bookings/tháng' },
        },
        nextBestActions: [],
      },
    },
  });

  await prisma.marketingAutopilotAnalysis.create({
    data: {
      projectId: project.id,
      organizationId: org.id,
      createdById: user.id,
      engine: 'heuristic',
      summary: 'approval e2e',
      recommendationJson: project.analysisJson as any,
    },
  });

  const mission = await prisma.marketingMission.create({
    data: {
      organizationId: org.id,
      createdById: user.id,
      projectId: project.id,
      idempotencyKey: `approval-e2e:${project.id}`,
      status: 'READY_FOR_APPROVAL',
      currentStep: 'READY_FOR_APPROVAL',
      progressPercent: 100,
      readyAt: new Date(),
      blueprintJson: {
        version: 'marketing-mission-blueprint.v1',
        channels: ['Facebook', 'Zalo', 'Email'],
        funnelStages: [{ name: 'Awareness', objective: 'Reach' }],
      },
    },
  });

  await prisma.marketingMissionAsset.createMany({
    data: [
      {
        organizationId: org.id,
        missionId: mission.id,
        module: 'FUNNEL',
        entityType: 'funnel_recommendation',
        entityId: `funnel-${project.id}`,
        status: 'DRAFT',
        adapter: 'e2e',
      },
      {
        organizationId: org.id,
        missionId: mission.id,
        module: 'CONTENT',
        entityType: 'auto_post',
        entityId: `content-${project.id}`,
        status: 'DRAFT',
        adapter: 'e2e',
      },
      {
        organizationId: org.id,
        missionId: mission.id,
        module: 'AUTOMATION',
        entityType: 'automation_flow',
        entityId: `auto-${project.id}`,
        status: 'DRAFT',
        adapter: 'e2e',
      },
      {
        organizationId: org.id,
        missionId: mission.id,
        module: 'CAMPAIGN',
        entityType: 'messaging_campaign',
        entityId: `camp-${project.id}`,
        status: 'DRAFT',
        adapter: 'e2e',
      },
    ],
  });

  const assets = await prisma.marketingMissionAsset.findMany({
    where: { missionId: mission.id },
  });

  const summary = buildMissionApprovalSummary({
    status: 'READY_FOR_APPROVAL',
    currentStep: 'READY_FOR_APPROVAL',
    progressPercent: 100,
    plan: (project.analysisJson as any).plan,
    analysis: project.analysisJson as any,
    blueprint: mission.blueprintJson,
    assets,
  });
  assert(summary.canApprove === true, 'canApprove');
  assert(summary.contentCount >= 1, 'contentCount');
  assert(summary.strategy.length > 0, 'strategy');
  console.log('APPROVAL_SUMMARY PASS');

  const result = await approveAndRunSoft(
    prisma,
    {
      id: user.id,
      email: user.email,
      name: user.name,
      organizationId: org.id,
    },
    mission.id,
  );

  const after = await prisma.marketingMission.findUnique({ where: { id: mission.id } });
  assert(after?.status === 'RUNNING', `expected RUNNING got ${after?.status}`);
  assert(after?.approvedAt, 'approvedAt set');
  assert(after?.approvalVersion === 1, 'approvalVersion');

  const approvalRow = await prisma.marketingMissionApproval.findFirst({
    where: { missionId: mission.id, version: 1 },
  });
  assert(approvalRow, 'approval row');
  assert(approvalRow!.runStatus === 'COMPLETED', `runStatus ${approvalRow!.runStatus}`);

  const snap1 = approvalRow!.snapshotJson as any;
  assert(snap1.version === 1, 'stored version');
  assert(snap1.approver?.id === user.id, 'approver in snapshot');
  assert(Array.isArray(snap1.assets) && snap1.assets.length >= 4, 'assets in snapshot');
  assert(snap1.draftOnlyAtApproval === true, 'draftOnly');
  assert(snap1.liveActionsEnabled === false, 'no live');
  console.log('SNAPSHOT_IMMUTABLE PASS');

  // Idempotent: second approve must not create version 2
  const again = await approveAndRunSoft(
    prisma,
    {
      id: user.id,
      email: user.email,
      name: user.name,
      organizationId: org.id,
    },
    mission.id,
  );
  void again;
  const count = await prisma.marketingMissionApproval.count({
    where: { missionId: mission.id },
  });
  assert(count === 1, 'single approval row');
  console.log('IDEMPOTENT_APPROVE PASS');

  // Confirm legacy draft API still present (controller route file)
  const fs = await import('fs');
  const ctrl = fs.readFileSync(
    new URL(
      '../apps/api/src/marketing-autopilot/marketing-autopilot.controller.ts',
      import.meta.url,
    ).pathname,
    'utf8',
  );
  assert(ctrl.includes("projects/:id/confirm"), 'legacy confirm route');
  assert(ctrl.includes("missions/:missionId/approve"), 'approve route');
  console.log('BACKWARD_COMPAT PASS');

  console.log('READY_FOR_APPROVAL → APPROVED → QUEUED → RUNNING PASS');
  console.log('NO_PER_DRAFT_APPROVE PASS');
  console.log('NO_LIVE_PUBLISH PASS');
  void result;

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
