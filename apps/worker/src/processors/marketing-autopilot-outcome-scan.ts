import type { Job } from 'bullmq';
import {
  OUTCOME_LEARNING_HORIZONS,
  computeOutcome,
  extractOutcomeMetrics,
  normalizeLearningKey,
} from '@marketingspa/shared';
import { prisma, Prisma } from '@marketingspa/database';

/**
 * BullMQ scan: evaluate due Marketing Autopilot outcome horizons (1/7/30d).
 * Tenant-scoped writes; correlation-only learnings for horizons ≥ 7d.
 */
export async function processMarketingAutopilotOutcomeScan(_job?: Job) {
  const now = new Date();
  const due = await prisma.marketingAutopilotOutcomeEvaluation.findMany({
    where: { status: 'PENDING', dueAt: { lte: now } },
    include: { track: true },
    orderBy: { dueAt: 'asc' },
    take: 50,
  });
  if (due.length === 0) return { processed: 0, due: 0 };

  let processed = 0;
  for (const evaluation of due) {
    try {
      await evaluateOneWorker(evaluation.id, now);
      processed += 1;
    } catch (err) {
      console.error(
        `[marketing-autopilot-outcome] eval ${evaluation.id} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return { processed, due: due.length, horizons: [...OUTCOME_LEARNING_HORIZONS], loopTicks: await tickOutcomeLoopsWorker(now) };
}

/** Periodic MONITOR refresh for active outcome loops (tenant-scoped, idempotent). */
async function tickOutcomeLoopsWorker(now: Date) {
  const {
    OUTCOME_LEARNING_HORIZONS,
    OUTCOME_MUTATION_LOCK_TTL_MS,
    extractMissionOutcomeMetrics,
    diagnoseMissionOutcomesWithReadiness,
    checkMissionStopLoss,
    normalizeGuardrailFromDb,
    buildOutcomeMutationLockKey,
    assessOutcomeDataReadiness,
  } = await import('@marketingspa/shared');

  const loops = await prisma.marketingAutopilotOutcomeLoop.findMany({
    where: {
      status: { in: ['ACTIVE', 'PAUSED_STOP_LOSS'] },
      currentStep: 'MONITOR',
      OR: [{ lastMonitorAt: null }, { lastMonitorAt: { lt: new Date(now.getTime() - 3600_000) } }],
    },
    take: 10,
  });
  if (loops.length === 0) return 0;

  let ticked = 0;
  for (const loop of loops) {
    const tickLockKey = buildOutcomeMutationLockKey(loop.missionId, 'loop-tick');
    try {
      await prisma.marketingAutopilotOutcomeMutationLock.deleteMany({
        where: { organizationId: loop.organizationId, expiresAt: { lt: now } },
      });
      const held = await prisma.marketingAutopilotOutcomeMutationLock.findUnique({
        where: {
          organizationId_lockKey: { organizationId: loop.organizationId, lockKey: tickLockKey },
        },
      });
      if (held && held.expiresAt > now) continue;

      if (held) {
        await prisma.marketingAutopilotOutcomeMutationLock.update({
          where: { id: held.id },
          data: {
            holder: 'worker:tick',
            expiresAt: new Date(now.getTime() + OUTCOME_MUTATION_LOCK_TTL_MS),
          },
        });
      } else {
        await prisma.marketingAutopilotOutcomeMutationLock.create({
          data: {
            organizationId: loop.organizationId,
            lockKey: tickLockKey,
            holder: 'worker:tick',
            expiresAt: new Date(now.getTime() + OUTCOME_MUTATION_LOCK_TTL_MS),
          },
        });
      }

      const snap = await prisma.marketingContextSnapshot.findFirst({
        where: {
          organizationId: loop.organizationId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        orderBy: { createdAt: 'desc' },
      });
      const raw =
        (snap?.snapshotJson as { metrics?: unknown } | null)?.metrics ??
        snap?.metricsJson ??
        {};
      const windows: Record<number, ReturnType<typeof extractMissionOutcomeMetrics>> = {};
      for (const days of OUTCOME_LEARNING_HORIZONS) {
        windows[days] = extractMissionOutcomeMetrics(
          raw as Parameters<typeof extractMissionOutcomeMetrics>[0],
          { horizonDays: days, capturedAt: now.toISOString() },
        );
      }

      const guardrailRow = await prisma.marketingAutopilotGuardrail.findUnique({
        where: { organizationId: loop.organizationId },
      });
      const guardrail = normalizeGuardrailFromDb(guardrailRow);
      const primary = windows[7] ?? windows[1] ?? windows[30];
      const readinessOpts = { loopStartedAt: loop.createdAt, now };
      const diagnoseResult = primary
        ? diagnoseMissionOutcomesWithReadiness(primary, null, readinessOpts)
        : {
            verdict: 'INSUFFICIENT_DATA' as const,
            diagnoses: [],
            readiness: assessOutcomeDataReadiness(extractMissionOutcomeMetrics({}), readinessOpts),
          };
      const stopLoss =
        diagnoseResult.verdict === 'READY' && primary
          ? checkMissionStopLoss(primary, guardrail, readinessOpts)
          : { triggered: false as const };

      const diagnosisPayload =
        diagnoseResult.verdict === 'READY'
          ? diagnoseResult.diagnoses
          : [{ verdict: diagnoseResult.verdict, readiness: diagnoseResult.readiness }];

      await prisma.marketingAutopilotOutcomeLoop.update({
        where: { id: loop.id },
        data: {
          monitorJson: windows as unknown as Prisma.InputJsonValue,
          diagnosisJson: diagnosisPayload as unknown as Prisma.InputJsonValue,
          lastMonitorAt: now,
          lastDiagnoseAt: now,
          stopLossActive: stopLoss.triggered,
          status: stopLoss.triggered ? 'PAUSED_STOP_LOSS' : loop.status,
        },
      });

      if (stopLoss.triggered && stopLoss.reason) {
        const existing = await prisma.marketingAutopilotStopLossEvent.findFirst({
          where: {
            organizationId: loop.organizationId,
            missionId: loop.missionId,
            reason: stopLoss.reason,
            resolvedAt: null,
          },
        });
        if (!existing) {
          try {
            await prisma.marketingAutopilotStopLossEvent.create({
              data: {
                organizationId: loop.organizationId,
                missionId: loop.missionId,
                reason: stopLoss.reason,
                triggerJson: (stopLoss.trigger ?? {}) as Prisma.InputJsonValue,
                pausedModules: (stopLoss.pauseModules ?? ['ADS']) as Prisma.InputJsonValue,
              },
            });
            const modules = stopLoss.pauseModules ?? ['ADS'];
            await prisma.marketingMissionAsset.updateMany({
              where: {
                missionId: loop.missionId,
                organizationId: loop.organizationId,
                module: { in: modules },
                status: { in: ['EXECUTED', 'APPROVED', 'DRAFT'] },
              },
              data: { status: 'PAUSED_STOP_LOSS' },
            });
          } catch (err) {
            if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
              throw err;
            }
          }
        }
      }

      ticked += 1;
    } catch (err) {
      console.error(
        `[marketing-autopilot-outcome-loop] tick ${loop.missionId} failed:`,
        err instanceof Error ? err.message : err,
      );
    } finally {
      await prisma.marketingAutopilotOutcomeMutationLock.deleteMany({
        where: { organizationId: loop.organizationId, lockKey: tickLockKey },
      });
    }
  }
  return ticked;
}

async function evaluateOneWorker(evaluationId: string, now: Date) {
  const evaluation = await prisma.marketingAutopilotOutcomeEvaluation.findUnique({
    where: { id: evaluationId },
    include: { track: true },
  });
  if (!evaluation || evaluation.status !== 'PENDING') return null;

  const orgId = evaluation.organizationId;
  const latestSnap = await prisma.marketingContextSnapshot.findFirst({
    where: {
      organizationId: orgId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: 'desc' },
  });

  const metrics =
    (latestSnap?.snapshotJson as { metrics?: unknown } | null)?.metrics ??
    latestSnap?.metricsJson ??
    {};
  const after = extractOutcomeMetrics(metrics as Parameters<typeof extractOutcomeMetrics>[0]);
  const before = evaluation.track.beforeMetricsJson as unknown as Parameters<typeof computeOutcome>[0];
  const outcome = computeOutcome(before, after);

  const updated = await prisma.marketingAutopilotOutcomeEvaluation.update({
    where: { id: evaluation.id },
    data: {
      status: 'DONE',
      evaluatedAt: now,
      afterMetricsJson: after as unknown as Prisma.InputJsonValue,
      afterSnapshotId: latestSnap?.id ?? null,
      outcomeJson: outcome as unknown as Prisma.InputJsonValue,
    },
    include: { track: true },
  });

  await prisma.marketingAutopilotOutcomeTrack.update({
    where: { id: evaluation.trackId },
    data: { status: evaluation.horizonDays >= 30 ? 'COMPLETED' : 'EVALUATING' },
  });

  if (evaluation.horizonDays >= 7) {
    await upsertLearning(updated.track, outcome, evaluation.horizonDays);
  }

  return updated;
}

async function upsertLearning(
  track: {
    id: string;
    organizationId: string;
    productName: string;
    customerProfile: string;
    targetArea: string;
    primaryGoal: string;
    draftType: string | null;
    actionType: string;
  },
  outcome: ReturnType<typeof computeOutcome>,
  horizonDays: number,
) {
  const category =
    outcome.verdict === 'IMPROVED'
      ? ('TACTIC_SUCCESS' as const)
      : outcome.verdict === 'DECLINED'
        ? ('TACTIC_FAILED' as const)
        : ('METRIC_BASELINE' as const);
  const key = normalizeLearningKey(
    `auto:${track.draftType ?? track.actionType}:${track.productName}:${outcome.verdict}`,
  );
  const title = `Outcome ${outcome.verdict} @${horizonDays}d — ${track.productName || track.actionType}`;
  const summary = `Auto learning (correlation only): ${outcome.verdict} sau ${horizonDays} ngày. Correlation ≠ causation.`;

  const existing = await prisma.marketingAutopilotBusinessLearning.findUnique({
    where: {
      organizationId_category_key: {
        organizationId: track.organizationId,
        category,
        key,
      },
    },
    select: { sourceTrackIds: true, sampleSize: true },
  });
  const prev = Array.isArray(existing?.sourceTrackIds) ? (existing!.sourceTrackIds as string[]) : [];
  const sourceTrackIds = [...new Set([...prev, track.id])].slice(-20);

  await prisma.marketingAutopilotBusinessLearning.upsert({
    where: {
      organizationId_category_key: {
        organizationId: track.organizationId,
        category,
        key,
      },
    },
    create: {
      organizationId: track.organizationId,
      category,
      key,
      title,
      summary,
      confidence: outcome.verdict === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT_DATA' : 'LOW',
      sampleSize: 1,
      correlationOnly: true,
      evidenceJson: {
        verdict: outcome.verdict,
        horizonDays,
        trackId: track.id,
        correlationOnly: true,
        productName: track.productName,
        customerProfile: track.customerProfile,
        targetArea: track.targetArea,
        primaryGoal: track.primaryGoal,
        draftType: track.draftType,
      } as Prisma.InputJsonValue,
      sourceTrackIds: sourceTrackIds as unknown as Prisma.InputJsonValue,
      lastObservedAt: new Date(),
    },
    update: {
      title,
      summary,
      confidence: outcome.verdict === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT_DATA' : 'LOW',
      sampleSize: (existing?.sampleSize ?? 0) + 1,
      evidenceJson: {
        verdict: outcome.verdict,
        horizonDays,
        trackId: track.id,
        correlationOnly: true,
        productName: track.productName,
      } as Prisma.InputJsonValue,
      sourceTrackIds: sourceTrackIds as unknown as Prisma.InputJsonValue,
      lastObservedAt: new Date(),
      isActive: true,
    },
  });
}
