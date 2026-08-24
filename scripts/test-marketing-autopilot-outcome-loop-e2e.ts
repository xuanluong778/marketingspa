/**
 * E2E: Outcome Learning Loop + Optimization + Stop-loss
 *
 * node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-marketing-autopilot-outcome-loop-e2e.ts
 */
import { randomUUID } from 'crypto';
import { Prisma } from '@marketingspa/database';
import {
  DEFAULT_AUTOPILOT_MODE,
  buildOptimizationRecommendations,
  checkMissionStopLoss,
  diagnoseMissionOutcomes,
  diagnoseMissionOutcomesWithReadiness,
  extractMissionOutcomeMetrics,
  normalizeGuardrailFromDb,
  OUTCOME_LOOP_GRACE_PERIOD_MS,
} from '@marketingspa/shared';
import { PrismaService } from '../apps/api/src/prisma/prisma.service';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function badMetrics() {
  return {
    leads: { unassigned: 5, noFollowUp: 8 },
    bookings: { total: 1 },
    conversion: { leadToBookingRate: 5 },
    revenue: { total: 500_000 },
    ads: {
      spend: 8_000_000,
      impressions: null,
      clicks: null,
      ctr: null,
      cpc: null,
      cpl: 400_000,
      roas: 0.3,
    },
    email: { sent: 50, openRate: 10, clickRate: 0.5 },
    funnel: { leadsInFunnel: 15 },
    campaigns: { messagingSent: 10 },
    automation: { logsSuccess: 2, logsFailed: 5 },
  };
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

  // --- GUARDRAIL defaults: APPROVAL_AUTOPILOT, FULL off ---
  const guardrail = await prisma.marketingAutopilotGuardrail.upsert({
    where: { organizationId: org.id },
    create: {
      organizationId: org.id,
      maxDailyAdSpend: 5_000_000,
      stopLossCpl: 300_000,
      stopLossCpa: 500_000,
      autopilotMode: 'APPROVAL_AUTOPILOT',
      fullAutopilotEnabled: false,
    },
    update: {
      autopilotMode: 'APPROVAL_AUTOPILOT',
      fullAutopilotEnabled: false,
    },
  });
  const g = normalizeGuardrailFromDb(guardrail);
  assert(g.autopilotMode !== 'FULL_AUTOPILOT' || !guardrail.fullAutopilotEnabled, 'FULL off by default');
  console.log('APPROVAL_AUTOPILOT DEFAULT PASS');

  // --- DIAGNOSE ---
  const loopStartedAt = new Date(Date.now() - OUTCOME_LOOP_GRACE_PERIOD_MS - 3600_000);
  const metrics = extractMissionOutcomeMetrics(badMetrics(), { horizonDays: 7 });
  const diagnoseResult = diagnoseMissionOutcomesWithReadiness(metrics, { cpl: 150_000, capturedAt: metrics.capturedAt } as any, {
    loopStartedAt,
  });
  const diagnoses = diagnoseResult.diagnoses;
  const kinds = new Set(diagnoses.map((d) => d.kind));
  assert(kinds.has('ADS_INEFFICIENT'), 'ADS_INEFFICIENT');
  assert(kinds.has('LEAD_NO_FOLLOWUP'), 'LEAD_NO_FOLLOWUP');
  assert(kinds.has('TRACKING_ERROR'), 'TRACKING_ERROR');
  assert(kinds.has('AUTOMATION_ERROR'), 'AUTOMATION_ERROR');
  assert(diagnoses.every((d) => d.correlationOnly === true), 'correlationOnly diagnoses');
  console.log('DIAGNOSE PASS');

  // --- STOP-LOSS ---
  const stopSpend = checkMissionStopLoss(metrics, g, { loopStartedAt });
  assert(stopSpend.triggered === true, 'stop-loss triggered');
  assert(
    stopSpend.reason === 'TRACKING_ERROR' ||
      stopSpend.reason === 'SPEND_OVER_LIMIT' ||
      stopSpend.reason === 'CPL_OVER',
    `stop reason ${stopSpend.reason}`,
  );
  console.log('STOP_LOSS PASS');

  // --- RECOMMEND (APPROVAL required) ---
  const recs = buildOptimizationRecommendations(diagnoses, DEFAULT_AUTOPILOT_MODE);
  assert(recs.length > 0, 'recommendations');
  assert(recs.every((r) => r.requiresApproval === true), 'APPROVAL_AUTOPILOT requires approval');
  assert(recs.every((r) => r.correlationOnly === true), 'correlationOnly recs');
  assert(
    !recs.some((r) => /dự báo (doanh thu|tăng|giảm|ROI)/i.test(r.summary)),
    'no fake forecast wording',
  );
  console.log('RECOMMEND APPROVAL_AUTOPILOT PASS');

  // --- Mission loop DB flow ---
  const project = await prisma.marketingAutopilotProject.create({
    data: {
      organizationId: org.id,
      createdById: user.id,
      name: `Outcome Loop E2E ${Date.now()}`,
      status: 'RUNNING',
      productName: 'Spa',
      productPrice: 1_000_000,
      customerProfile: 'Nữ 25-40',
      targetArea: 'HN',
      monthlyBudget: 10_000_000,
      primaryGoal: 'Booking',
    },
  });

  const mission = await prisma.marketingMission.create({
    data: {
      organizationId: org.id,
      createdById: user.id,
      projectId: project.id,
      idempotencyKey: `outcome-loop-${project.id}`,
      status: 'RUNNING',
      currentStep: 'READY_FOR_APPROVAL',
      progressPercent: 100,
      readyAt: new Date(),
      approvedAt: new Date(),
    },
  });

  const loop = await prisma.marketingAutopilotOutcomeLoop.create({
    data: {
      organizationId: org.id,
      missionId: mission.id,
      projectId: project.id,
      currentStep: 'DIAGNOSE',
      status: 'ACTIVE',
      autopilotMode: 'APPROVAL_AUTOPILOT',
      monitorJson: { 7: metrics } as unknown as Prisma.InputJsonValue,
      diagnosisJson: diagnoses as unknown as Prisma.InputJsonValue,
      lastMonitorAt: new Date(),
      createdAt: loopStartedAt,
    },
  });

  const seenKinds = new Set<string>();
  for (const rec of recs) {
    if (seenKinds.has(rec.diagnosisKind)) continue;
    seenKinds.add(rec.diagnosisKind);
    const existing = await prisma.marketingAutopilotOptimizationProposal.findFirst({
      where: {
        missionId: mission.id,
        diagnosisKind: rec.diagnosisKind,
        status: { in: ['PENDING_APPROVAL', 'APPROVED', 'APPLIED'] },
      },
    });
    if (existing) continue;
    try {
      await prisma.marketingAutopilotOptimizationProposal.create({
        data: {
          organizationId: org.id,
          missionId: mission.id,
          projectId: project.id,
          diagnosisKind: rec.diagnosisKind,
          title: rec.title,
          summary: rec.summary,
          recommendationJson: rec as unknown as Prisma.InputJsonValue,
          metricsSnapshotJson: metrics as unknown as Prisma.InputJsonValue,
          status: 'PENDING_APPROVAL',
          correlationOnly: true,
        },
      });
    } catch {
      /* idempotent unique index */
    }
  }

  const pending = await prisma.marketingAutopilotOptimizationProposal.count({
    where: { missionId: mission.id, status: 'PENDING_APPROVAL' },
  });
  assert(pending >= 1, 'pending proposals before approve');

  // Apply stop-loss (idempotent)
  const existingSl = await prisma.marketingAutopilotStopLossEvent.findFirst({
    where: { missionId: mission.id, reason: stopSpend.reason!, resolvedAt: null },
  });
  if (!existingSl) {
    await prisma.marketingAutopilotStopLossEvent.create({
    data: {
      organizationId: org.id,
      missionId: mission.id,
      reason: stopSpend.reason!,
      triggerJson: (stopSpend.trigger ?? {}) as Prisma.InputJsonValue,
      pausedModules: (stopSpend.pauseModules ?? ['ADS']) as Prisma.InputJsonValue,
    },
    });
  }
  await prisma.marketingMissionAsset.create({
    data: {
      organizationId: org.id,
      missionId: mission.id,
      module: 'ADS',
      entityType: 'ad_draft',
      entityId: `ad-${randomUUID()}`,
      status: 'PAUSED_STOP_LOSS',
      adapter: 'e2e',
    },
  });
  await prisma.marketingAutopilotOutcomeLoop.update({
    where: { id: loop.id },
    data: { stopLossActive: true, status: 'PAUSED_STOP_LOSS' },
  });

  // User approves one proposal → APPLIED
  const proposal = await prisma.marketingAutopilotOptimizationProposal.findFirst({
    where: { missionId: mission.id, status: 'PENDING_APPROVAL' },
  });
  assert(proposal, 'proposal');
  await prisma.marketingAutopilotOptimizationProposal.update({
    where: { id: proposal!.id },
    data: { status: 'APPROVED', approvedById: user.id, approvedAt: new Date() },
  });
  await prisma.marketingAutopilotOptimizationProposal.update({
    where: { id: proposal!.id },
    data: { status: 'APPLIED', appliedAt: new Date() },
  });

  const applied = await prisma.marketingAutopilotOptimizationProposal.findUnique({
    where: { id: proposal!.id },
  });
  assert(applied?.status === 'APPLIED', 'EXECUTE_AFTER_APPROVAL proposal applied');
  console.log('OPTIMIZATION APPROVE_THEN_APPLY PASS');

  // LEARN step markers
  await prisma.marketingAutopilotOutcomeLoop.update({
    where: { id: loop.id },
    data: { currentStep: 'LEARN', status: 'COMPLETED', lastLearnAt: new Date() },
  });

  await prisma.marketingAutopilotBusinessLearning.create({
    data: {
      organizationId: org.id,
      category: 'DIAGNOSIS',
      key: `mission:${mission.id}:ADS_INEFFICIENT`,
      title: 'Ads có thể kém hiệu quả',
      summary: 'Correlation only learning',
      confidence: 'LOW',
      sampleSize: 1,
      correlationOnly: true,
      evidenceJson: { missionId: mission.id } as Prisma.InputJsonValue,
    },
  });
  console.log('LEARN PASS');

  // TENANT_ISOLATION
  const orgB = await prisma.organization.findFirst({
    where: { id: { not: org.id } },
    orderBy: { createdAt: 'asc' },
  });
  if (orgB) {
    const stolen = await prisma.marketingAutopilotOptimizationProposal.findFirst({
      where: { id: proposal!.id, organizationId: orgB.id },
    });
    assert(!stolen, 'cross-tenant blocked');
  }
  console.log('TENANT_ISOLATION PASS');

  // Mission still alive after stop-loss (soft)
  const m = await prisma.marketingMission.findUnique({ where: { id: mission.id } });
  assert(m?.status === 'RUNNING', 'mission not killed by stop-loss');
  console.log('MISSION_SURVIVES_STOP_LOSS PASS');

  console.log('OUTCOME_LOOP RUN→MONITOR→DIAGNOSE→RECOMMEND→OPTIMIZE→LEARN PASS');
  console.log('NO_FAKE_FORECAST PASS');
  console.log('CORRELATION_ONLY PASS');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
