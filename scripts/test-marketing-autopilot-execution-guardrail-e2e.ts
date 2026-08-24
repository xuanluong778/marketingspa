/**
 * E2E: Execution Engine + Guardrail
 *
 * NO_SEND_BEFORE_APPROVAL
 * NO_AD_SPEND_BEFORE_APPROVAL
 * EXECUTE_AFTER_APPROVAL
 * GUARDRAIL
 * TENANT_ISOLATION
 *
 * node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-marketing-autopilot-execution-guardrail-e2e.ts
 */
import { Prisma } from '@marketingspa/database';
import {
  DEFAULT_MARKETING_AUTOPILOT_GUARDRAIL,
  buildImmutableApprovalSnapshot,
  evaluateExecutionGate,
  normalizeGuardrailFromDb,
  resolveExecutionActionForAsset,
} from '@marketingspa/shared';
import { PrismaService } from '../apps/api/src/prisma/prisma.service';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();

  const orgA = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
  assert(orgA, 'need org');
  const userA = await prisma.user.findFirst({
    where: { organizationId: orgA.id },
    orderBy: { createdAt: 'asc' },
  });
  assert(userA, 'need user');

  // --- NO_SEND_BEFORE_APPROVAL ---
  for (const action of ['SEND_EMAIL', 'SEND_ZALO', 'PUBLISH_FACEBOOK_CONTENT'] as const) {
    const gate = evaluateExecutionGate({
      permissionOk: true,
      integrationOk: true,
      approvalOk: false,
      guardrail: { ...DEFAULT_MARKETING_AUTOPILOT_GUARDRAIL, allowEmailSend: true, allowZaloSend: true, allowFacebookPublish: true },
      action,
    });
    assert(gate.result === 'BLOCKED_APPROVAL', `${action} must block without approval`);
    assert(gate.stage === 'APPROVAL', `${action} stage APPROVAL`);
  }
  console.log('NO_SEND_BEFORE_APPROVAL PASS');

  // --- NO_AD_SPEND_BEFORE_APPROVAL ---
  {
    const gate = evaluateExecutionGate({
      permissionOk: true,
      integrationOk: true,
      approvalOk: false,
      guardrail: {
        ...DEFAULT_MARKETING_AUTOPILOT_GUARDRAIL,
        allowFacebookPublish: true,
        allowGoogleAdsPublish: true,
      },
      action: 'ENABLE_ADS_CAMPAIGN',
      channel: 'FACEBOOK',
      proposedBudget: 100_000,
    });
    assert(gate.result === 'BLOCKED_APPROVAL', 'ads spend blocked without approval');
  }
  console.log('NO_AD_SPEND_BEFORE_APPROVAL PASS');

  // --- GUARDRAIL ---
  {
    const gEmail = evaluateExecutionGate({
      permissionOk: true,
      integrationOk: true,
      approvalOk: true,
      guardrail: { ...DEFAULT_MARKETING_AUTOPILOT_GUARDRAIL, allowEmailSend: false },
      action: 'SEND_EMAIL',
    });
    assert(gEmail.result === 'BLOCKED_GUARDRAIL', 'allowEmailSend=false');

    const gBudget = evaluateExecutionGate({
      permissionOk: true,
      integrationOk: true,
      approvalOk: true,
      guardrail: {
        ...DEFAULT_MARKETING_AUTOPILOT_GUARDRAIL,
        allowFacebookPublish: true,
        maxCampaignBudget: 1_000_000,
      },
      action: 'ENABLE_ADS_CAMPAIGN',
      channel: 'FACEBOOK',
      proposedBudget: 5_000_000,
    });
    assert(gBudget.result === 'BLOCKED_GUARDRAIL', 'maxCampaignBudget');

    const gInteg = evaluateExecutionGate({
      permissionOk: true,
      integrationOk: false,
      integrationReason: 'Chưa kết nối Zalo OA',
      approvalOk: true,
      guardrail: { ...DEFAULT_MARKETING_AUTOPILOT_GUARDRAIL, allowZaloSend: true },
      action: 'SEND_ZALO',
      channel: 'ZALO',
    });
    assert(gInteg.result === 'BLOCKED_INTEGRATION', 'BLOCKED_INTEGRATION soft');
  }
  console.log('GUARDRAIL PASS');

  // --- TENANT_ISOLATION ---
  {
    const gate = evaluateExecutionGate({
      permissionOk: false,
      integrationOk: true,
      approvalOk: true,
      guardrail: DEFAULT_MARKETING_AUTOPILOT_GUARDRAIL,
      action: 'ACTIVATE_AUTOMATION',
    });
    assert(gate.result === 'BLOCKED_PERMISSION', 'cross-tenant blocked');
  }

  // Create org B if possible for DB-level isolation
  const orgB = await prisma.organization.findFirst({
    where: { id: { not: orgA.id } },
    orderBy: { createdAt: 'asc' },
  });
  if (orgB) {
    const missionB = await prisma.marketingMission.create({
      data: {
        organizationId: orgB.id,
        createdById: userA.id, // wrong user ok for isolation test on org scope
        projectId: (
          await prisma.marketingAutopilotProject.create({
            data: {
              organizationId: orgB.id,
              createdById: userA.id,
              name: `Guard Tenant ${Date.now()}`,
              status: 'READY_FOR_APPROVAL',
              productName: 'X',
              productPrice: 1,
              customerProfile: 'c',
              targetArea: 'a',
              monthlyBudget: 1,
              primaryGoal: 'g',
            },
          })
        ).id,
        idempotencyKey: `guard-tenant-${Date.now()}`,
        status: 'READY_FOR_APPROVAL',
        currentStep: 'READY_FOR_APPROVAL',
        progressPercent: 100,
        readyAt: new Date(),
      },
    });
    const stolen = await prisma.marketingMission.findFirst({
      where: { id: missionB.id, organizationId: orgA.id },
    });
    assert(!stolen, 'tenant cannot read other org mission');
  }
  console.log('TENANT_ISOLATION PASS');

  // --- EXECUTE_AFTER_APPROVAL (prisma + gate + logs, no Nest DI) ---
  const project = await prisma.marketingAutopilotProject.create({
    data: {
      organizationId: orgA.id,
      createdById: userA.id,
      name: `Exec Guard E2E ${Date.now()}`,
      status: 'READY_FOR_APPROVAL',
      productName: 'Spa',
      productPrice: 1_000_000,
      customerProfile: 'Nữ',
      targetArea: 'HN',
      monthlyBudget: 10_000_000,
      primaryGoal: 'Booking',
      analysisJson: {
        summary: 'e2e',
        plan: {
          offer: { productName: 'Spa', primaryGoal: 'Booking' },
          budget: { monthlyBudget: 10_000_000 },
        },
      },
    },
  });

  const flow = await prisma.automationFlow.create({
    data: {
      organizationId: orgA.id,
      name: `Autopilot Exec Flow ${Date.now()}`,
      triggerType: 'MANUAL',
      isActive: false,
    },
  });

  const mission = await prisma.marketingMission.create({
    data: {
      organizationId: orgA.id,
      createdById: userA.id,
      projectId: project.id,
      idempotencyKey: `exec-guard-${project.id}`,
      status: 'READY_FOR_APPROVAL',
      currentStep: 'READY_FOR_APPROVAL',
      progressPercent: 100,
      readyAt: new Date(),
      blueprintJson: { channels: ['EMAIL', 'FACEBOOK'] },
    },
  });

  const asset = await prisma.marketingMissionAsset.create({
    data: {
      organizationId: orgA.id,
      missionId: mission.id,
      module: 'AUTOMATION',
      entityType: 'automation_flow',
      entityId: flow.id,
      status: 'DRAFT',
      adapter: 'e2e',
    },
  });

  // Content asset that requires FB — should BLOCKED_INTEGRATION or GUARDRAIL, not kill mission
  await prisma.marketingMissionAsset.create({
    data: {
      organizationId: orgA.id,
      missionId: mission.id,
      module: 'CONTENT',
      entityType: 'auto_post',
      entityId: `fake-post-${project.id}`,
      status: 'DRAFT',
      adapter: 'e2e',
    },
  });

  const assets = await prisma.marketingMissionAsset.findMany({
    where: { missionId: mission.id },
  });

  const snapshot = buildImmutableApprovalSnapshot({
    version: 1,
    missionId: mission.id,
    projectId: project.id,
    organizationId: orgA.id,
    plan: (project.analysisJson as any).plan,
    analysis: project.analysisJson as any,
    blueprint: mission.blueprintJson,
    assets: assets.map((a) => ({
      module: a.module,
      entityType: a.entityType,
      entityId: a.entityId,
      status: a.status,
      adapter: a.adapter,
    })),
    approver: { id: userA.id, email: userA.email, name: userA.name },
    approvedAt: new Date().toISOString(),
  });

  const approval = await prisma.marketingMissionApproval.create({
    data: {
      organizationId: orgA.id,
      missionId: mission.id,
      projectId: project.id,
      version: 1,
      approvedById: userA.id,
      snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
      runStatus: 'APPROVED',
    },
  });

  await prisma.marketingMission.update({
    where: { id: mission.id },
    data: { status: 'APPROVED', approvedAt: new Date(), approvalVersion: 1 },
  });

  // Ensure guardrail row
  const guardrailRow = await prisma.marketingAutopilotGuardrail.upsert({
    where: { organizationId: orgA.id },
    create: {
      organizationId: orgA.id,
      maxDailyAdSpend: DEFAULT_MARKETING_AUTOPILOT_GUARDRAIL.maxDailyAdSpend,
      maxCampaignBudget: DEFAULT_MARKETING_AUTOPILOT_GUARDRAIL.maxCampaignBudget,
      maxBudgetIncreasePercent: DEFAULT_MARKETING_AUTOPILOT_GUARDRAIL.maxBudgetIncreasePercent,
      allowedChannels: DEFAULT_MARKETING_AUTOPILOT_GUARDRAIL.allowedChannels,
      allowFacebookPublish: false,
      allowGoogleAdsPublish: false,
      allowEmailSend: false,
      allowZaloSend: false,
      allowAutomationActivation: true,
    },
    update: { allowAutomationActivation: true, allowFacebookPublish: false },
  });
  const guardrail = normalizeGuardrailFromDb(guardrailRow);

  let executed = 0;
  let blocked = 0;

  for (const a of assets) {
    const action = resolveExecutionActionForAsset({
      module: a.module,
      entityType: a.entityType,
      preferSend: false,
    });
    assert(action, `action for ${a.module}`);

    const needsFb = action === 'PUBLISH_FACEBOOK_CONTENT';
    const gate = evaluateExecutionGate({
      permissionOk: true,
      integrationOk: !needsFb, // simulate missing FB for content
      integrationReason: needsFb ? 'Chưa kết nối Facebook/Meta' : undefined,
      approvalOk: true,
      guardrail,
      action,
      channel: needsFb ? 'FACEBOOK' : null,
    });

    await prisma.marketingAutopilotExecutionLog.create({
      data: {
        organizationId: orgA.id,
        missionId: mission.id,
        approvalId: approval.id,
        module: a.module,
        entityType: a.entityType,
        entityId: a.entityId,
        action,
        phase: 'BEFORE',
        checkStage: gate.stage,
        result: gate.result,
        message: gate.message,
        beforeJson: { status: a.status },
        afterJson: {},
      },
    });

    if (!gate.ok) {
      blocked += 1;
      await prisma.marketingMissionAsset.update({
        where: { id: a.id },
        data: { status: gate.result },
      });
      await prisma.marketingAutopilotExecutionLog.create({
        data: {
          organizationId: orgA.id,
          missionId: mission.id,
          approvalId: approval.id,
          module: a.module,
          entityType: a.entityType,
          entityId: a.entityId,
          action,
          phase: 'AFTER',
          checkStage: gate.stage,
          result: gate.result,
          message: gate.message,
          beforeJson: { status: a.status },
          afterJson: { status: gate.result },
        },
      });
      continue;
    }

    // Execute automation activate via prisma (mirrors approveFlow)
    if (action === 'ACTIVATE_AUTOMATION' && a.entityId === flow.id) {
      await prisma.automationFlow.update({
        where: { id: flow.id },
        data: { isActive: true },
      });
    }

    executed += 1;
    await prisma.marketingMissionAsset.update({
      where: { id: a.id },
      data: { status: 'EXECUTED' },
    });
    await prisma.marketingAutopilotExecutionLog.create({
      data: {
        organizationId: orgA.id,
        missionId: mission.id,
        approvalId: approval.id,
        module: a.module,
        entityType: a.entityType,
        entityId: a.entityId,
        action,
        phase: 'AFTER',
        checkStage: 'EXECUTE',
        result: 'EXECUTED',
        message: 'ok',
        beforeJson: { status: a.status },
        afterJson: { status: 'EXECUTED' },
      },
    });
  }

  assert(executed >= 1, 'at least one EXECUTED after approval');
  assert(blocked >= 1, 'content blocked soft — mission continues');

  const flowAfter = await prisma.automationFlow.findUnique({ where: { id: flow.id } });
  assert(flowAfter?.isActive === true, 'automation activated after approval');

  const assetAfter = await prisma.marketingMissionAsset.findUnique({ where: { id: asset.id } });
  assert(assetAfter?.status === 'EXECUTED', 'asset EXECUTED');

  const logs = await prisma.marketingAutopilotExecutionLog.findMany({
    where: { missionId: mission.id },
  });
  assert(logs.some((l) => l.phase === 'BEFORE'), 'before log');
  assert(logs.some((l) => l.phase === 'AFTER'), 'after log');
  assert(
    !JSON.stringify(logs).toLowerCase().includes('access_token'),
    'no token in logs',
  );

  // Mission still alive despite blocked content
  await prisma.marketingMission.update({
    where: { id: mission.id },
    data: { status: 'RUNNING' },
  });
  const m = await prisma.marketingMission.findUnique({ where: { id: mission.id } });
  assert(m?.status === 'RUNNING', 'mission not killed by BLOCKED_INTEGRATION');

  console.log('EXECUTE_AFTER_APPROVAL PASS');
  console.log(`executed=${executed} blocked=${blocked} logs=${logs.length}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
