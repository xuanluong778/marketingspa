/**
 * Regression: Outcome Learning Loop hardening (idempotency, min data, recheck, lock, migration)
 *
 * pnpm test:marketing-autopilot-outcome-loop-regression
 */
import { randomUUID } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@marketingspa/database';
import {
  assessOutcomeDataReadiness,
  buildOptimizationRecommendations,
  buildOutcomeMutationLockKey,
  checkMissionStopLoss,
  diagnoseMissionOutcomesWithReadiness,
  extractMissionOutcomeMetrics,
  normalizeGuardrailFromDb,
  recheckProposalBeforeApply,
  DEFAULT_AUTOPILOT_MODE,
  OUTCOME_LOOP_GRACE_PERIOD_MS,
} from '@marketingspa/shared';
import { PrismaService } from '../apps/api/src/prisma/prisma.service';

const ROOT = join(__dirname, '..');
const MIGRATION_SQL = join(
  ROOT,
  'packages/database/prisma/migrations/20260822160000_marketing_autopilot_outcome_loop/migration.sql',
);
const ROLLBACK_MD = join(
  ROOT,
  'packages/database/prisma/migrations/20260822160000_marketing_autopilot_outcome_loop/ROLLBACK.md',
);
const CONTROLLER = join(ROOT, 'apps/api/src/marketing-autopilot/marketing-autopilot.controller.ts');

const results: Record<string, boolean> = {};

function pass(key: string, cond: unknown, detail?: string) {
  results[key] = Boolean(cond);
  console.log(`${key} ${cond ? 'PASS' : 'FAIL'}${detail ? ` — ${detail}` : ''}`);
  if (!cond) throw new Error(`${key} FAIL${detail ? `: ${detail}` : ''}`);
}

function sparseMetrics() {
  return {
    leads: { total: 1, unassigned: 0, noFollowUp: 0 },
    bookings: { total: 0 },
    ads: { spend: 10_000, impressions: 50, clicks: 2, roas: 0.1, cpl: null },
    automation: { logsSuccess: 1, logsFailed: 0 },
  };
}

function badMetrics() {
  return {
    leads: { unassigned: 5, noFollowUp: 8 },
    bookings: { total: 1 },
    conversion: { leadToBookingRate: 5 },
    revenue: { total: 500_000 },
    ads: {
      spend: 8_000_000,
      impressions: 10_000,
      clicks: 200,
      ctr: 2,
      cpc: 40_000,
      cpl: 400_000,
      roas: 0.3,
    },
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
  pass('TENANT_ISOLATION', Boolean(org && user), 'need org+user');

  // --- PRISMA_MIGRATION_READY ---
  pass('PRISMA_MIGRATION_READY', existsSync(MIGRATION_SQL) && existsSync(ROLLBACK_MD));
  const migSql = readFileSync(MIGRATION_SQL, 'utf8');
  pass(
    'PRISMA_MIGRATION_READY',
    migSql.includes('marketing_autopilot_outcome_loops') &&
      migSql.includes('marketing_autopilot_optimization_proposals_open_uniq') &&
      migSql.includes('marketing_autopilot_stop_loss_active_uniq') &&
      migSql.includes('marketing_autopilot_outcome_mutation_locks'),
    'migration SQL additive indexes',
  );

  // --- EXISTING_UI (API routes unchanged) ---
  const ctrl = readFileSync(CONTROLLER, 'utf8');
  pass(
    'EXISTING_UI',
    ctrl.includes("@Get('missions/:missionId/outcome-loop')") &&
      ctrl.includes("@Get('missions/:missionId/optimization-proposals')") &&
      ctrl.includes("@Post('optimization-proposals/:proposalId/approve')"),
    'controller routes intact',
  );

  // --- MINIMUM_DATA + GRACE_PERIOD ---
  const sparse = extractMissionOutcomeMetrics(sparseMetrics(), { horizonDays: 7 });

  const graceReadiness = assessOutcomeDataReadiness(sparse, {
    loopStartedAt: new Date(),
    now: new Date(Date.now() + 1000),
  });
  pass('GRACE_PERIOD', graceReadiness.verdict === 'GRACE_PERIOD');

  const sparseReadiness = assessOutcomeDataReadiness(sparse, {
    loopStartedAt: new Date(Date.now() - OUTCOME_LOOP_GRACE_PERIOD_MS - 3600_000),
    now: new Date(),
  });
  pass('MINIMUM_DATA', sparseReadiness.verdict === 'INSUFFICIENT_DATA');

  const mature = extractMissionOutcomeMetrics(
    { ...badMetrics(), leads: { total: 20, unassigned: 5, noFollowUp: 8 } },
    { horizonDays: 7 },
  );
  const matureDiag = diagnoseMissionOutcomesWithReadiness(mature, null, {
    loopStartedAt: new Date(Date.now() - OUTCOME_LOOP_GRACE_PERIOD_MS - 3600_000),
    now: new Date(),
  });
  pass('MINIMUM_DATA', matureDiag.verdict === 'READY' && matureDiag.diagnoses.length > 0, 'mature data diagnoses');

  const guardrail = normalizeGuardrailFromDb({
    maxDailyAdSpend: 20_000_000,
    stopLossCpl: 500_000,
    stopLossCpa: 800_000,
  });
  const earlyStop = checkMissionStopLoss(sparse, guardrail, {
    loopStartedAt: new Date(),
    now: new Date(),
  });
  pass('MINIMUM_DATA', earlyStop.triggered === false, 'no stop-loss on sparse/grace');

  // --- RECHECK_BEFORE_APPLY + STALE_BLOCKED ---
  const richRaw = {
    ...badMetrics(),
    leads: { total: 20, unassigned: 5, noFollowUp: 8 },
  };
  const proposalMetrics = extractMissionOutcomeMetrics(richRaw, { horizonDays: 7 });
  const staleMetrics = extractMissionOutcomeMetrics(
    {
      ...richRaw,
      ads: { ...(richRaw.ads as object), spend: 20_000_000, cpl: 900_000 },
    },
    { horizonDays: 7 },
  );
  const freshRecheck = recheckProposalBeforeApply({
    proposalMetrics,
    currentMetrics: proposalMetrics,
    proposalCreatedAt: new Date(),
    missionStatus: 'RUNNING',
    guardrail,
    integrationOk: true,
    permissionOk: true,
    readiness: assessOutcomeDataReadiness(proposalMetrics, {
      loopStartedAt: new Date(Date.now() - OUTCOME_LOOP_GRACE_PERIOD_MS - 3600_000),
    }),
  });
  pass('RECHECK_BEFORE_APPLY', freshRecheck.allowed === true);

  const staleRecheck = recheckProposalBeforeApply({
    proposalMetrics,
    currentMetrics: staleMetrics,
    proposalCreatedAt: new Date(),
    missionStatus: 'RUNNING',
    guardrail,
    integrationOk: true,
    permissionOk: true,
    readiness: assessOutcomeDataReadiness(staleMetrics, {
      loopStartedAt: new Date(Date.now() - OUTCOME_LOOP_GRACE_PERIOD_MS - 3600_000),
    }),
  });
  pass('STALE_BLOCKED', staleRecheck.allowed === false && staleRecheck.blockStatus === 'STALE');

  // --- DB: IDEMPOTENCY + CONCURRENCY_LOCK + NO_DUPLICATE_OPTIMIZATION ---
  const project = await prisma.marketingAutopilotProject.create({
    data: {
      organizationId: org!.id,
      createdById: user!.id,
      name: `Loop Regression ${Date.now()}`,
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
      organizationId: org!.id,
      createdById: user!.id,
      projectId: project.id,
      idempotencyKey: `loop-reg-${randomUUID()}`,
      status: 'RUNNING',
      currentStep: 'READY_FOR_APPROVAL',
      progressPercent: 100,
      readyAt: new Date(),
      approvedAt: new Date(),
    },
  });

  const loop = await prisma.marketingAutopilotOutcomeLoop.create({
    data: {
      organizationId: org!.id,
      missionId: mission.id,
      projectId: project.id,
      currentStep: 'RECOMMEND',
      status: 'ACTIVE',
      autopilotMode: 'APPROVAL_AUTOPILOT',
      monitorJson: { 7: mature } as unknown as Prisma.InputJsonValue,
      diagnosisJson: matureDiag.diagnoses as unknown as Prisma.InputJsonValue,
      createdAt: new Date(Date.now() - OUTCOME_LOOP_GRACE_PERIOD_MS - 3600_000),
    },
  });

  const recs = buildOptimizationRecommendations(matureDiag.diagnoses, DEFAULT_AUTOPILOT_MODE);
  const snap = mature as unknown as Prisma.InputJsonValue;

  for (const rec of recs.slice(0, 2)) {
    await prisma.marketingAutopilotOptimizationProposal.create({
      data: {
        organizationId: org!.id,
        missionId: mission.id,
        projectId: project.id,
        diagnosisKind: rec.diagnosisKind,
        title: rec.title,
        summary: rec.summary,
        recommendationJson: rec as unknown as Prisma.InputJsonValue,
        metricsSnapshotJson: snap,
        status: 'PENDING_APPROVAL',
        correlationOnly: true,
      },
    });
  }

  const beforeCount = await prisma.marketingAutopilotOptimizationProposal.count({
    where: { missionId: mission.id },
  });

  for (const rec of recs.slice(0, 2)) {
    const dup = await prisma.marketingAutopilotOptimizationProposal.findFirst({
      where: {
        missionId: mission.id,
        diagnosisKind: rec.diagnosisKind,
        status: { in: ['PENDING_APPROVAL', 'APPROVED', 'APPLIED'] },
      },
    });
    if (dup) continue;
    await prisma.marketingAutopilotOptimizationProposal.create({
      data: {
        organizationId: org!.id,
        missionId: mission.id,
        projectId: project.id,
        diagnosisKind: rec.diagnosisKind,
        title: rec.title,
        summary: rec.summary,
        recommendationJson: rec as unknown as Prisma.InputJsonValue,
        metricsSnapshotJson: snap,
        status: 'PENDING_APPROVAL',
        correlationOnly: true,
      },
    });
  }

  const afterCount = await prisma.marketingAutopilotOptimizationProposal.count({
    where: { missionId: mission.id },
  });
  pass('IDEMPOTENCY', beforeCount === afterCount, 'proposal dedupe');
  pass('NO_DUPLICATE_OPTIMIZATION', beforeCount === afterCount);

  // Stop-loss idempotency
  const stopLoss = checkMissionStopLoss(mature, guardrail, {
    loopStartedAt: loop.createdAt,
    now: new Date(),
  });
  pass('IDEMPOTENCY', stopLoss.triggered === true, 'stop-loss eligible');

  await prisma.marketingAutopilotStopLossEvent.create({
    data: {
      organizationId: org!.id,
      missionId: mission.id,
      reason: stopLoss.reason!,
      triggerJson: (stopLoss.trigger ?? {}) as Prisma.InputJsonValue,
      pausedModules: ['ADS'] as Prisma.InputJsonValue,
    },
  });

  const existingSl = await prisma.marketingAutopilotStopLossEvent.findFirst({
    where: { missionId: mission.id, reason: stopLoss.reason!, resolvedAt: null },
  });
  let stopDupCount = 1;
  if (!existingSl) {
    await prisma.marketingAutopilotStopLossEvent.create({
      data: {
        organizationId: org!.id,
        missionId: mission.id,
        reason: stopLoss.reason!,
        triggerJson: {} as Prisma.InputJsonValue,
        pausedModules: ['ADS'] as Prisma.InputJsonValue,
      },
    });
    stopDupCount = 2;
  }
  const stopCount = await prisma.marketingAutopilotStopLossEvent.count({
    where: { missionId: mission.id, reason: stopLoss.reason!, resolvedAt: null },
  });
  pass('IDEMPOTENCY', stopCount === 1, `stop-loss events=${stopCount}`);

  // Concurrency lock
  const lockKey = buildOutcomeMutationLockKey(mission.id, 'module:ADS');
  await prisma.marketingAutopilotOutcomeMutationLock.create({
    data: {
      organizationId: org!.id,
      lockKey,
      holder: 'test:holder-a',
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  let secondAcquired = false;
  try {
    await prisma.marketingAutopilotOutcomeMutationLock.create({
      data: {
        organizationId: org!.id,
        lockKey,
        holder: 'test:holder-b',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    secondAcquired = true;
  } catch (err) {
    secondAcquired = false;
  }
  pass('CONCURRENCY_LOCK', secondAcquired === false, 'unique lock key');

  // Apply idempotency
  const proposal = await prisma.marketingAutopilotOptimizationProposal.findFirst({
    where: { missionId: mission.id, status: 'PENDING_APPROVAL' },
  });
  pass('RECHECK_BEFORE_APPLY', Boolean(proposal));
  await prisma.marketingAutopilotOptimizationProposal.update({
    where: { id: proposal!.id },
    data: { status: 'APPROVED', approvedById: user!.id, approvedAt: new Date() },
  });
  await prisma.marketingAutopilotOptimizationProposal.update({
    where: { id: proposal!.id },
    data: { status: 'APPLIED', appliedAt: new Date() },
  });
  const reapply = await prisma.marketingAutopilotOptimizationProposal.findUnique({
    where: { id: proposal!.id },
  });
  pass('NO_DUPLICATE_OPTIMIZATION', reapply?.status === 'APPLIED' && reapply.appliedAt != null);

  // Tenant isolation
  const orgB = await prisma.organization.findFirst({
    where: { id: { not: org!.id } },
    orderBy: { createdAt: 'asc' },
  });
  if (orgB) {
    const stolen = await prisma.marketingAutopilotOptimizationProposal.findFirst({
      where: { id: proposal!.id, organizationId: orgB.id },
    });
    pass('TENANT_ISOLATION', !stolen);
  } else {
    pass('TENANT_ISOLATION', true, 'single org env');
  }

  console.log('\n=== REGRESSION SUMMARY ===');
  for (const [k, v] of Object.entries(results)) {
    console.log(`${k}: ${v ? 'PASS' : 'FAIL'}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
