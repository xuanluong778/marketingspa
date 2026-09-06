import type { Job } from 'bullmq';
import type Redis from 'ioredis';
import {
  AdCampaignStatus,
  AdConnectionProvider,
  GoogleAdsAutopilotActionStatus,
  GoogleAdsAutopilotOutcomeHorizon,
  GoogleAdsAutopilotOutcomeVerdict,
  GoogleAdsAutopilotProposalStatus,
  prisma,
  Prisma,
} from '@marketingspa/database';
import {
  AUTOPILOT_OUTCOME_HORIZONS_MS,
  AUTO_APPLY_AUDIT_ACTIONS,
  buildAutopilotActionIdempotencyKey,
  buildAutopilotIdempotencyKey,
  buildRuleBasedProposals,
  buildRollbackSnapshot,
  canAutopilotProviderWrite,
  createDryRunAutopilotMutatePort,
  evaluateAutopilotPolicy,
  googleAdsAutopilotGuardrailSchema,
  googleAdsAutopilotQueuePayloadSchema,
  isAutopilotGlobalKillSwitch,
  aggregateDailyStatsToSnapshot,
  runGoogleAdsOptimizationEngine,
  mapOptimizationProposalToAutopilot,
  optimizationMinimumDataGuardSchema,
  optimizationThresholdsSchema,
  runAutoApplyPreWriteChecks,
  shouldSkipWriteDryRun,
  evaluateOutcomeVerdict,
  type GoogleAdsAutopilotActionType,
  type GoogleAdsAutopilotMetrics,
  type GoogleAdsAutopilotProposalInput,
} from '@marketingspa/shared';
import { decryptSecret } from '../lib/encryption';
import {
  createLiveGoogleAdsAutopilotMutatePort,
  refreshGoogleAccessToken,
} from '../lib/google-ads-api';

function decimal(n: { toNumber?: () => number } | null | undefined): number {
  if (n == null) return 0;
  if (typeof n === 'number') return n;
  return n.toNumber?.() ?? Number(n);
}

function toMetrics(row: {
  spend: Prisma.Decimal | null;
  clicks: number | null;
  impressions: number | null;
  conversions: Prisma.Decimal | null;
  leads: Prisma.Decimal | null;
  cpa: Prisma.Decimal | null;
  roas: Prisma.Decimal | null;
}): GoogleAdsAutopilotMetrics {
  const spend = decimal(row.spend);
  const conversions = decimal(row.conversions);
  const leads = decimal(row.leads);
  const results = conversions + leads;
  return {
    spend,
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    conversions,
    leads,
    cpa: decimal(row.cpa) || (results > 0 ? spend / results : 0),
    cpl: results > 0 ? spend / results : 0,
    roas: row.roas != null ? decimal(row.roas) : null,
    dailySpend: spend,
  };
}

function guardrailsFromConfig(config: {
  maxDailyBudget: Prisma.Decimal | null;
  maxMonthlyBudget: Prisma.Decimal | null;
  maxBudgetIncreasePct: number;
  maxBudgetDecreasePct: number;
  targetCpa: Prisma.Decimal | null;
  targetCpl: Prisma.Decimal | null;
  targetRoas: Prisma.Decimal | null;
  stopLossDailySpend: Prisma.Decimal | null;
  minSpendForAction: Prisma.Decimal | null;
  minClicksForAction: number | null;
  minConversionsForAction: number | null;
  gracePeriodHours: number;
  maxActionsPerDay: number;
}) {
  return googleAdsAutopilotGuardrailSchema.parse({
    maxDailyBudget: config.maxDailyBudget ? decimal(config.maxDailyBudget) : null,
    maxMonthlyBudget: config.maxMonthlyBudget ? decimal(config.maxMonthlyBudget) : null,
    maxBudgetIncreasePct: config.maxBudgetIncreasePct,
    maxBudgetDecreasePct: config.maxBudgetDecreasePct,
    targetCpa: config.targetCpa ? decimal(config.targetCpa) : null,
    targetCpl: config.targetCpl ? decimal(config.targetCpl) : null,
    targetRoas: config.targetRoas ? decimal(config.targetRoas) : null,
    stopLossDailySpend: config.stopLossDailySpend ? decimal(config.stopLossDailySpend) : null,
    minSpendForAction: config.minSpendForAction ? decimal(config.minSpendForAction) : null,
    minClicksForAction: config.minClicksForAction,
    minConversionsForAction: config.minConversionsForAction,
    gracePeriodHours: config.gracePeriodHours,
    maxActionsPerDay: config.maxActionsPerDay,
  });
}

async function resetActionsTodayIfNeeded(configId: string, resetDate: Date | null, actionsToday: number) {
  const today = new Date().toISOString().slice(0, 10);
  const stored = resetDate?.toISOString().slice(0, 10);
  if (stored === today) return actionsToday;
  await prisma.googleAdsAutopilotConfig.update({
    where: { id: configId },
    data: { actionsToday: 0, actionsResetDate: new Date(today) },
  });
  return 0;
}

async function getPausedByAutopilotCampaignIds(configId: string): Promise<string[]> {
  const pauseActions = await prisma.googleAdsAutopilotAction.findMany({
    where: {
      configId,
      actionType: 'PAUSE_CAMPAIGN',
      status: GoogleAdsAutopilotActionStatus.SUCCEEDED,
    },
    include: { proposal: true },
    orderBy: { completedAt: 'desc' },
    take: 200,
  });
  const paused = new Set<string>();
  for (const row of pauseActions) {
    if (row.proposal.campaignId) paused.add(row.proposal.campaignId);
  }
  const enableActions = await prisma.googleAdsAutopilotAction.findMany({
    where: {
      configId,
      actionType: 'ENABLE_CAMPAIGN',
      status: GoogleAdsAutopilotActionStatus.SUCCEEDED,
    },
    include: { proposal: true },
  });
  for (const row of enableActions) {
    if (row.proposal.campaignId) paused.delete(row.proposal.campaignId);
  }
  return [...paused];
}

async function fetchFreshMetrics(
  organizationId: string,
  campaignId: string | null,
): Promise<{ metrics: GoogleAdsAutopilotMetrics; campaignStatus: string }> {
  const empty: GoogleAdsAutopilotMetrics = {
    spend: 0,
    clicks: 0,
    impressions: 0,
    conversions: 0,
    leads: 0,
    cpa: 0,
    cpl: 0,
  };
  if (!campaignId) return { metrics: empty, campaignStatus: 'ACTIVE' };
  const campaign = await prisma.adManagerCampaign.findUnique({ where: { id: campaignId } });
  const insight = await prisma.adInsight.findFirst({
    where: { organizationId, campaignId },
    orderBy: { dateTo: 'desc' },
  });
  if (insight) {
    return { metrics: toMetrics(insight), campaignStatus: campaign?.status ?? 'ACTIVE' };
  }
  return { metrics: empty, campaignStatus: campaign?.status ?? 'ACTIVE' };
}

async function releaseLock(redis: Redis | undefined, lockKey: string, lockOwner: string) {
  if (!redis) return;
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end`;
  await redis.eval(script, 1, lockKey, lockOwner);
}

async function assertTenantOwnsCustomer(organizationId: string, customerId: string) {
  const account = await prisma.adGoogleAdsAccount.findFirst({
    where: { organizationId, customerId, isSelected: true },
  });
  if (!account) throw new Error(`Tenant ${organizationId} không sở hữu customer ${customerId}`);
  return account;
}

async function hasGoogleConnection(organizationId: string): Promise<boolean> {
  const conn = await prisma.adConnection.findUnique({
    where: {
      organizationId_provider: { organizationId, provider: AdConnectionProvider.GOOGLE },
    },
  });
  return Boolean(conn?.encryptedCredentials);
}

export async function processAdsAutopilot(job: Job, redis?: Redis) {
  const payload = googleAdsAutopilotQueuePayloadSchema.parse(job.data);
  if (payload.kind === 'scan') return processAutopilotScan(payload, job);
  if (payload.kind === 'execute') return processAutopilotExecute(payload, job, redis);
  return processAutopilotOutcomes(payload);
}

async function processAutopilotScan(
  payload: { organizationId?: string; configId?: string },
  job: Job,
) {
  const where: Prisma.GoogleAdsAutopilotConfigWhereInput = { enabled: true, emergencyStop: false };
  if (payload.organizationId) where.organizationId = payload.organizationId;
  if (payload.configId) where.id = payload.configId;

  const configs = await prisma.googleAdsAutopilotConfig.findMany({ where, take: 50 });
  const results: unknown[] = [];

  for (const config of configs) {
    try {
      await assertTenantOwnsCustomer(config.organizationId, config.customerId);
      const actionsToday = await resetActionsTodayIfNeeded(
        config.id,
        config.actionsResetDate,
        config.actionsToday,
      );
      const guardrails = guardrailsFromConfig(config);
      const pausedByAutopilotCampaignIds = await getPausedByAutopilotCampaignIds(config.id);

      const dateTo = new Date();
      const dateFrom = new Date(dateTo.getTime() - 7 * 86400000);
      const insights = await prisma.adInsight.findMany({
        where: {
          organizationId: config.organizationId,
          platform: 'GOOGLE',
          dateFrom: { lte: dateTo },
          dateTo: { gte: dateFrom },
        },
        include: { campaign: true },
        take: 100,
      });

      const proposalsCreated: string[] = [];

      const campaignSnapshots = insights
        .filter((row) => row.campaign)
        .map((row) =>
          aggregateDailyStatsToSnapshot({
            entityType: 'CAMPAIGN',
            entityId: row.campaign!.id,
            entityName: row.campaignName,
            externalId: row.externalCampaignId ?? row.campaign!.externalId ?? undefined,
            status: row.campaign!.status,
            budget: row.campaign!.budget ? decimal(row.campaign!.budget) : null,
            startedAt: row.campaign!.startDate,
            rows: [
              {
                date: row.dateTo,
                spend: decimal(row.spend),
                impressions: row.impressions,
                clicks: row.clicks,
                conversions: decimal(row.conversions),
                leads: decimal(row.leads),
                conversionValue: decimal(row.conversionValue),
                ctr: row.ctr != null ? decimal(row.ctr) : null,
                cpc: row.cpc != null ? decimal(row.cpc) : null,
                cpa: row.cpa != null ? decimal(row.cpa) : null,
                roas: row.roas != null ? decimal(row.roas) : null,
              },
            ],
          }),
        );

      const optimizationResult = runGoogleAdsOptimizationEngine({
        customerId: config.customerId,
        guard: optimizationMinimumDataGuardSchema.parse({
          minSpend: guardrails.minSpendForAction ?? 50_000,
          minClicks: config.minClicksForAction ?? 30,
          minConversionsForAction: config.minConversionsForAction ?? 3,
          gracePeriodHours: guardrails.gracePeriodHours,
        }),
        thresholds: optimizationThresholdsSchema.parse({
          targetCpa: guardrails.targetCpa ?? null,
          targetCpl: guardrails.targetCpl ?? null,
          targetRoas: guardrails.targetRoas ?? null,
        }),
        campaigns: campaignSnapshots,
      });

      for (const optProp of optimizationResult.proposals) {
        const mapped = mapOptimizationProposalToAutopilot(optProp);
        if (!mapped) continue;

        const proposal = {
          ...mapped,
          campaignId: mapped.campaignId ?? optProp.entity.id,
          externalCampaignId: mapped.externalCampaignId ?? optProp.entity.externalId,
          source: 'RULE' as const,
        };

        const targetId = proposal.campaignId ?? proposal.keywordText ?? proposal.externalCampaignId ?? optProp.entity.id;
        const idempotencyKey = buildAutopilotIdempotencyKey({
          organizationId: config.organizationId,
          customerId: config.customerId,
          actionType: proposal.actionType,
          targetId: `opt:${targetId}:${optProp.action}`,
        });

        const exists = await prisma.googleAdsAutopilotProposal.findUnique({ where: { idempotencyKey } });
        if (exists) continue;

        const snap = campaignSnapshots.find((s) => s.entityId === proposal.campaignId);
        const metrics: GoogleAdsAutopilotMetrics = snap
          ? {
              spend: snap.spend,
              clicks: snap.clicks,
              impressions: snap.impressions,
              conversions: snap.conversions,
              leads: snap.leads,
              cpa: snap.cpa,
              cpl: snap.cpl,
              roas: snap.roas ?? null,
              dailySpend: snap.spend,
            }
          : toMetrics(insights.find((i) => i.campaign?.id === proposal.campaignId) ?? insights[0]!);

        const policy = evaluateAutopilotPolicy(proposal, {
          mode: config.mode,
          guardrails,
          metrics,
          campaignStatus: String(proposal.beforeState.status ?? 'ACTIVE'),
          actionsToday,
          emergencyStop: config.emergencyStop,
          configCreatedAt: config.createdAt,
          allowAutoPause: config.allowAutoPause,
          pausedByAutopilotCampaignIds,
        });
        if (!policy.allowed) continue;

        let afterState = { ...proposal.afterState };
        if (policy.clampedBudget != null) afterState = { ...afterState, budget: policy.clampedBudget };

        const created = await prisma.googleAdsAutopilotProposal.create({
          data: {
            configId: config.id,
            organizationId: config.organizationId,
            customerId: config.customerId,
            actionType: proposal.actionType,
            status: policy.autoExecute
              ? GoogleAdsAutopilotProposalStatus.AUTO_EXECUTED
              : GoogleAdsAutopilotProposalStatus.PENDING,
            riskLevel: optProp.riskLevel === 'MEDIUM' ? 'HIGH' : optProp.riskLevel,
            autoEligible: policy.autoExecute,
            campaignId: proposal.campaignId,
            externalCampaignId: proposal.externalCampaignId,
            keywordText: proposal.keywordText,
            beforeState: proposal.beforeState as Prisma.InputJsonValue,
            afterState: afterState as Prisma.InputJsonValue,
            payload: { ...proposal.payload, optimizationConfidence: optProp.confidence } as Prisma.InputJsonValue,
            evidence: { ...proposal.evidence, optimizationEngine: true } as Prisma.InputJsonValue,
            policyDecision: policy as unknown as Prisma.InputJsonValue,
            llmAnalysis: { expectedImpact: optProp.expectedImpact, action: optProp.action } as Prisma.InputJsonValue,
            reason: proposal.reason,
            idempotencyKey,
          },
        });
        proposalsCreated.push(created.id);
        if (policy.autoExecute) {
          const action = await createActionFromProposal(config, created, metrics);
          await enqueueExecute(config.organizationId, action.id, job.queueName);
        }
      }

      for (const row of insights) {
        if (!row.campaign) continue;
        const extId = row.externalCampaignId ?? row.campaign.externalId;
        if (!extId) continue;

        const metrics = toMetrics(row);
        const ruleProposals = buildRuleBasedProposals({
          campaignId: row.campaign.id,
          externalCampaignId: extId,
          campaignStatus: row.campaign.status,
          metrics,
          guardrails,
          currentBudget: row.campaign.budget ? decimal(row.campaign.budget) : null,
        });

        for (const proposal of ruleProposals) {
          const targetId = proposal.campaignId ?? proposal.keywordText ?? extId;
          const idempotencyKey = buildAutopilotIdempotencyKey({
            organizationId: config.organizationId,
            customerId: config.customerId,
            actionType: proposal.actionType,
            targetId,
          });

          const exists = await prisma.googleAdsAutopilotProposal.findUnique({
            where: { idempotencyKey },
          });
          if (exists) continue;

          const policy = evaluateAutopilotPolicy(proposal, {
            mode: config.mode,
            guardrails,
            metrics,
            campaignStatus: row.campaign.status,
            actionsToday,
            emergencyStop: config.emergencyStop,
            configCreatedAt: config.createdAt,
            allowAutoPause: config.allowAutoPause,
            pausedByAutopilotCampaignIds,
          });

          if (!policy.allowed) continue;

          let afterState = { ...proposal.afterState };
          if (policy.clampedBudget != null) {
            afterState = { ...afterState, budget: policy.clampedBudget };
          }

          const created = await prisma.googleAdsAutopilotProposal.create({
            data: {
              configId: config.id,
              organizationId: config.organizationId,
              customerId: config.customerId,
              actionType: proposal.actionType,
              status: policy.autoExecute
                ? GoogleAdsAutopilotProposalStatus.AUTO_EXECUTED
                : GoogleAdsAutopilotProposalStatus.PENDING,
              riskLevel: policy.riskLevel,
              autoEligible: policy.autoExecute,
              campaignId: proposal.campaignId,
              externalCampaignId: proposal.externalCampaignId,
              keywordResource: proposal.keywordResource,
              keywordText: proposal.keywordText,
              beforeState: proposal.beforeState as Prisma.InputJsonValue,
              afterState: afterState as Prisma.InputJsonValue,
              payload: proposal.payload as Prisma.InputJsonValue,
              evidence: proposal.evidence as Prisma.InputJsonValue,
              policyDecision: policy as unknown as Prisma.InputJsonValue,
              reason: proposal.reason,
              idempotencyKey,
            },
          });
          proposalsCreated.push(created.id);

          if (policy.autoExecute) {
            const action = await createActionFromProposal(config, created, metrics);
            await enqueueExecute(config.organizationId, action.id, job.queueName);
          }
        }
      }

      await prisma.googleAdsAutopilotConfig.update({
        where: { id: config.id },
        data: { lastScanAt: new Date() },
      });

      await prisma.auditLog.create({
        data: {
          organizationId: config.organizationId,
          action: 'GOOGLE_ADS_AUTOPILOT_SCAN',
          entityType: 'GoogleAdsAutopilotConfig',
          entityId: config.id,
          metadata: { proposalsCreated, insightCount: insights.length },
        },
      });

      results.push({ configId: config.id, proposalsCreated: proposalsCreated.length });
    } catch (err) {
      results.push({
        configId: config.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { scanned: configs.length, results };
}

async function createActionFromProposal(
  config: { id: string; organizationId: string; customerId: string; writeWhitelistEnabled: boolean },
  proposal: { id: string; actionType: GoogleAdsAutopilotActionType; beforeState: unknown; afterState: unknown; payload: unknown },
  metrics: GoogleAdsAutopilotMetrics,
) {
  const providerWrite = canAutopilotProviderWrite({
    customerId: config.customerId,
    writeWhitelistEnabled: config.writeWhitelistEnabled,
  });

  const action = await prisma.googleAdsAutopilotAction.create({
    data: {
      proposalId: proposal.id,
      configId: config.id,
      organizationId: config.organizationId,
      customerId: config.customerId,
      actionType: proposal.actionType,
      status: GoogleAdsAutopilotActionStatus.PENDING,
      idempotencyKey: buildAutopilotActionIdempotencyKey(proposal.id),
      beforeState: proposal.beforeState as Prisma.InputJsonValue,
      afterState: proposal.afterState as Prisma.InputJsonValue,
      payload: proposal.payload as Prisma.InputJsonValue,
      providerWriteEnabled: providerWrite,
    },
  });

  const now = new Date();
  for (const horizon of ['H24', 'D3', 'D7'] as GoogleAdsAutopilotOutcomeHorizon[]) {
    await prisma.googleAdsAutopilotOutcome.create({
      data: {
        actionId: action.id,
        organizationId: config.organizationId,
        horizon,
        verdict: GoogleAdsAutopilotOutcomeVerdict.PENDING,
        metricsBefore: metrics as unknown as Prisma.InputJsonValue,
        metricsAfter: {},
        scheduledFor: new Date(now.getTime() + AUTOPILOT_OUTCOME_HORIZONS_MS[horizon]),
      },
    });
  }

  return action;
}

async function enqueueExecute(organizationId: string, actionId: string, queueName: string) {
  const { Queue } = await import('bullmq');
  const { bullConnection, queuePrefix } = await import('../config');
  const q = new Queue(queueName, { connection: bullConnection, prefix: queuePrefix });
  try {
    await q.add(
      'execute-autopilot-action',
      { kind: 'execute', organizationId, actionId },
      { jobId: `autopilot-exec:${actionId}`, removeOnComplete: 100, attempts: 2 },
    );
  } finally {
    await q.close();
  }
}

async function processAutopilotExecute(
  payload: { organizationId: string; actionId: string },
  job: Job,
  redis?: Redis,
) {
  const { organizationId, actionId } = payload;
  const action = await prisma.googleAdsAutopilotAction.findFirst({
    where: { id: actionId, organizationId },
    include: { proposal: true, config: true },
  });
  if (!action) throw new Error(`Autopilot action ${actionId} không tồn tại`);

  if (
    action.status === GoogleAdsAutopilotActionStatus.SUCCEEDED ||
    action.status === GoogleAdsAutopilotActionStatus.SKIPPED_DISABLED
  ) {
    return { skipped: true, reason: action.status };
  }

  const proposalStatus = action.proposal.status;
  if (
    proposalStatus === GoogleAdsAutopilotProposalStatus.REJECTED ||
    proposalStatus === GoogleAdsAutopilotProposalStatus.CANCELLED ||
    proposalStatus === GoogleAdsAutopilotProposalStatus.EXPIRED
  ) {
    await prisma.googleAdsAutopilotAction.update({
      where: { id: actionId },
      data: {
        status: GoogleAdsAutopilotActionStatus.SKIPPED_DISABLED,
        lastError: `proposal_${proposalStatus.toLowerCase()}`,
        completedAt: new Date(),
      },
    });
    return { skipped: true, reason: `proposal_${proposalStatus}` };
  }

  const lockKey = `ads-autopilot-lock:${organizationId}:${actionId}`;
  const lockOwner = `worker:${process.pid}:${job.id}`;
  let lockAcquired = !redis;
  if (redis) {
    const ok = await redis.set(lockKey, lockOwner, 'EX', 120, 'NX');
    lockAcquired = ok === 'OK';
    if (!lockAcquired) return { skipped: true, reason: 'lock_held' };
  }

  try {
    // Re-fetch config — kill switch / mode change có hiệu lực ngay
    const config = await prisma.googleAdsAutopilotConfig.findUnique({ where: { id: action.configId } });
    if (!config) throw new Error('Autopilot config không tồn tại');

    if (isAutopilotGlobalKillSwitch() || !config.enabled || config.emergencyStop) {
      await prisma.googleAdsAutopilotAction.update({
        where: { id: actionId },
        data: {
          status: GoogleAdsAutopilotActionStatus.SKIPPED_DISABLED,
          lastError: 'kill_switch_active',
          preWriteChecks: { KILL_SWITCH: { ok: false, detail: 'kill_switch_active' } } as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });
      await prisma.auditLog.create({
        data: {
          organizationId,
          action: AUTO_APPLY_AUDIT_ACTIONS.KILL_SWITCH,
          entityType: 'GoogleAdsAutopilotAction',
          entityId: actionId,
          metadata: { global: isAutopilotGlobalKillSwitch(), configEnabled: config.enabled },
        },
      });
      return { skipped: true, reason: 'kill_switch' };
    }

    const duplicate = await prisma.googleAdsAutopilotAction.findFirst({
      where: {
        idempotencyKey: action.idempotencyKey,
        status: GoogleAdsAutopilotActionStatus.SUCCEEDED,
        id: { not: actionId },
      },
    });

    await prisma.googleAdsAutopilotAction.update({
      where: { id: actionId },
      data: {
        status: GoogleAdsAutopilotActionStatus.EXECUTING,
        attemptCount: { increment: 1 },
        executedAt: new Date(),
        bullJobId: String(job.id),
      },
    });

    await assertTenantOwnsCustomer(organizationId, config.customerId);

    const guardrails = guardrailsFromConfig(config);
    const actionsToday = await resetActionsTodayIfNeeded(
      config.id,
      config.actionsResetDate,
      config.actionsToday,
    );
    const pausedByAutopilotCampaignIds = await getPausedByAutopilotCampaignIds(config.id);
    const { metrics, campaignStatus } = await fetchFreshMetrics(
      organizationId,
      action.proposal.campaignId,
    );
    const hasConnection = await hasGoogleConnection(organizationId);

    const proposalInput: GoogleAdsAutopilotProposalInput = {
      actionType: action.actionType,
      campaignId: action.proposal.campaignId ?? undefined,
      externalCampaignId: action.proposal.externalCampaignId ?? undefined,
      beforeState: (action.beforeState ?? {}) as Record<string, unknown>,
      afterState: (action.afterState ?? {}) as Record<string, unknown>,
      payload: (action.payload ?? {}) as Record<string, unknown>,
      evidence: {},
      source: 'POLICY',
    };

    const preWrite = runAutoApplyPreWriteChecks({
      proposal: proposalInput,
      config: {
        enabled: config.enabled,
        emergencyStop: config.emergencyStop,
        mode: config.mode,
        cooldownMinutes: config.cooldownMinutes,
        allowAutoPause: config.allowAutoPause,
        minRoas: config.minRoas != null ? decimal(config.minRoas) : null,
        lastActionAt: config.lastActionAt,
        actionsToday,
        createdAt: config.createdAt,
      },
      guardrails,
      metrics,
      campaignStatus,
      hasConnection,
      idempotencyDuplicate: Boolean(duplicate),
      lockAcquired,
      pausedByAutopilotCampaignIds,
    });

    const rollbackSnapshot = buildRollbackSnapshot({
      beforeState: (action.beforeState ?? {}) as Record<string, unknown>,
      actionType: action.actionType,
      campaignId: action.proposal.campaignId,
    });

    await prisma.googleAdsAutopilotAction.update({
      where: { id: actionId },
      data: {
        preWriteChecks: preWrite as unknown as Prisma.InputJsonValue,
        rollbackSnapshot: rollbackSnapshot as Prisma.InputJsonValue,
      },
    });

    if (!preWrite.allowed) {
      await prisma.googleAdsAutopilotAction.update({
        where: { id: actionId },
        data: {
          status: GoogleAdsAutopilotActionStatus.FAILED,
          lastError: `pre_write_blocked:${preWrite.failedStep ?? preWrite.reasons.join(',')}`,
          completedAt: new Date(),
        },
      });
      await prisma.auditLog.create({
        data: {
          organizationId,
          action: AUTO_APPLY_AUDIT_ACTIONS.PRE_WRITE_BLOCKED,
          entityType: 'GoogleAdsAutopilotAction',
          entityId: actionId,
          metadata: preWrite as unknown as Prisma.InputJsonValue,
        },
      });
      return { ok: false, reason: 'pre_write_blocked', preWrite };
    }

    const providerWrite =
      !shouldSkipWriteDryRun() &&
      canAutopilotProviderWrite({
        customerId: config.customerId,
        writeWhitelistEnabled: config.writeWhitelistEnabled,
      }) &&
      action.providerWriteEnabled;

    const dryRun = createDryRunAutopilotMutatePort();
    let mutate = dryRun.port;

    if (providerWrite) {
      const conn = await prisma.adConnection.findUnique({
        where: {
          organizationId_provider: { organizationId, provider: AdConnectionProvider.GOOGLE },
        },
      });
      if (!conn?.encryptedCredentials) throw new Error('Không có Google OAuth credentials');
      const key = process.env.ENCRYPTION_KEY;
      if (!key) throw new Error('ENCRYPTION_KEY chưa cấu hình');
      const plain = JSON.parse(decryptSecret(conn.encryptedCredentials, key)) as {
        refreshToken?: string;
      };
      if (!plain.refreshToken) throw new Error('Thiếu Google refresh token');
      const accessToken = await refreshGoogleAccessToken(plain.refreshToken);
      mutate = createLiveGoogleAdsAutopilotMutatePort({
        accessToken,
        customerId: config.customerId,
        loginCustomerId: config.loginCustomerId,
      });
    }

    let providerResult: Record<string, unknown> | null = null;
    try {
      providerResult = await applyAutopilotMutate(action, mutate, config.customerId);
      await applyLocalAutopilotMirror(action);

      // Verify post-write
      if (action.proposal.campaignId) {
        const verified = await prisma.adManagerCampaign.findUnique({
          where: { id: action.proposal.campaignId },
        });
        const after = (action.afterState ?? {}) as { status?: string; budget?: number };
        if (
          (action.actionType === 'PAUSE_CAMPAIGN' || action.actionType === 'ENABLE_CAMPAIGN') &&
          after.status &&
          verified?.status !== after.status &&
          after.status === 'PAUSED' &&
          verified?.status !== 'PAUSED'
        ) {
          throw new Error('verify_failed:status_mismatch');
        }
      }

      await prisma.googleAdsAutopilotConfig.update({
        where: { id: config.id },
        data: { actionsToday: { increment: 1 }, lastActionAt: new Date() },
      });

      const auditAction = providerWrite
        ? AUTO_APPLY_AUDIT_ACTIONS.EXECUTED
        : AUTO_APPLY_AUDIT_ACTIONS.DRY_RUN;

      await prisma.googleAdsAutopilotAction.update({
        where: { id: actionId },
        data: {
          status: GoogleAdsAutopilotActionStatus.SUCCEEDED,
          providerResult: JSON.parse(
            JSON.stringify({ ...providerResult, dryRun: !providerWrite, calls: dryRun.calls }),
          ) as Prisma.InputJsonValue,
          completedAt: new Date(),
          providerWriteEnabled: providerWrite,
        },
      });

      if (
        action.proposal.status === GoogleAdsAutopilotProposalStatus.PENDING ||
        action.proposal.status === GoogleAdsAutopilotProposalStatus.APPROVED
      ) {
        await prisma.googleAdsAutopilotProposal.update({
          where: { id: action.proposalId },
          data: { status: GoogleAdsAutopilotProposalStatus.AUTO_EXECUTED },
        });
      }

      await prisma.auditLog.create({
        data: {
          organizationId,
          action: auditAction,
          entityType: 'GoogleAdsAutopilotAction',
          entityId: actionId,
          metadata: JSON.parse(
            JSON.stringify({ providerWrite, providerResult, preWriteSteps: preWrite.steps }),
          ) as Prisma.InputJsonValue,
        },
      });

      return { ok: true, providerWrite, providerResult, dryRun: !providerWrite };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      try {
        await rollbackAutopilotAction(action, rollbackSnapshot);
        await prisma.auditLog.create({
          data: {
            organizationId,
            action: AUTO_APPLY_AUDIT_ACTIONS.ROLLBACK,
            entityType: 'GoogleAdsAutopilotAction',
            entityId: actionId,
            metadata: JSON.parse(JSON.stringify({ error: message, rollbackSnapshot })) as Prisma.InputJsonValue,
          },
        });
      } catch (rollbackErr) {
        const rbMsg = rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
        await prisma.auditLog.create({
          data: {
            organizationId,
            action: AUTO_APPLY_AUDIT_ACTIONS.ROLLBACK,
            entityType: 'GoogleAdsAutopilotAction',
            entityId: actionId,
            metadata: { error: message, rollbackFailed: rbMsg },
          },
        });
      }

      await prisma.googleAdsAutopilotAction.update({
        where: { id: actionId },
        data: {
          status: GoogleAdsAutopilotActionStatus.PARTIAL,
          lastError: message,
          partialState: providerResult as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });
      throw err;
    }
  } finally {
    await releaseLock(redis, lockKey, lockOwner);
  }
}

async function rollbackAutopilotAction(
  action: {
    actionType: GoogleAdsAutopilotActionType;
    proposal: { campaignId: string | null };
    beforeState: unknown;
  },
  rollbackSnapshot: Record<string, unknown>,
) {
  if (!action.proposal.campaignId) return;
  const before = (rollbackSnapshot.beforeState ?? action.beforeState ?? {}) as {
    status?: string;
    budget?: number;
  };
  if (
    action.actionType === 'PAUSE_CAMPAIGN' ||
    action.actionType === 'ENABLE_CAMPAIGN'
  ) {
    const status =
      before.status === 'PAUSED' ? AdCampaignStatus.PAUSED : AdCampaignStatus.ACTIVE;
    await prisma.adManagerCampaign.update({
      where: { id: action.proposal.campaignId },
      data: { status },
    });
  }
  if (action.actionType === 'UPDATE_BUDGET' && before.budget != null) {
    await prisma.adManagerCampaign.update({
      where: { id: action.proposal.campaignId },
      data: { budget: before.budget },
    });
  }
}

async function applyAutopilotMutate(
  action: {
    actionType: GoogleAdsAutopilotActionType;
    proposal: { externalCampaignId: string | null; keywordResource: string | null; keywordText: string | null };
    afterState: unknown;
    payload: unknown;
  },
  mutate: ReturnType<typeof createDryRunAutopilotMutatePort>['port'],
  customerId: string,
): Promise<Record<string, unknown>> {
  const cid = customerId.replace(/-/g, '');
  const after = (action.afterState ?? {}) as { status?: string; budget?: number };
  const payload = (action.payload ?? {}) as { proposedDailyBudget?: number; budgetMicros?: number };
  const ext = action.proposal.externalCampaignId ?? '';
  const campaignResource = ext.includes('/') ? ext : `customers/${cid}/campaigns/${ext}`;

  switch (action.actionType) {
    case 'PAUSE_CAMPAIGN':
      return { resource: await mutate.pauseCampaign(campaignResource), field: 'status', value: 'PAUSED' };
    case 'ENABLE_CAMPAIGN':
      return { resource: await mutate.enableCampaign(campaignResource), field: 'status', value: 'ENABLED' };
    case 'UPDATE_BUDGET': {
      const budget = after.budget ?? payload.proposedDailyBudget ?? 0;
      const micros = Math.round(budget * 1_000_000);
      const budgetResource = `customers/${cid}/campaignBudgets/${ext || '0'}`;
      return {
        resource: await mutate.updateCampaignBudget(budgetResource, micros),
        field: 'budget',
        value: budget,
      };
    }
    case 'PAUSE_KEYWORD': {
      const kw = action.proposal.keywordResource ?? '';
      if (!kw) throw new Error('Thiếu keyword resource');
      return { resource: await mutate.pauseKeyword(kw), field: 'keyword', value: 'PAUSED' };
    }
    case 'ADD_NEGATIVE_KEYWORD': {
      const text = action.proposal.keywordText ?? '';
      if (!text) throw new Error('Thiếu negative keyword text');
      return {
        resource: await mutate.addNegativeKeyword(campaignResource, text),
        field: 'negative_keyword',
        value: text,
      };
    }
    default:
      throw new Error(`Unsupported autopilot action ${action.actionType}`);
  }
}

async function applyLocalAutopilotMirror(action: {
  actionType: GoogleAdsAutopilotActionType;
  proposal: { campaignId: string | null };
  afterState: unknown;
}) {
  if (!action.proposal.campaignId) return;
  const after = (action.afterState ?? {}) as { status?: string; budget?: number };
  if (
    action.actionType === 'PAUSE_CAMPAIGN' ||
    action.actionType === 'ENABLE_CAMPAIGN'
  ) {
    const status =
      after.status === 'PAUSED' ? AdCampaignStatus.PAUSED : AdCampaignStatus.ACTIVE;
    await prisma.adManagerCampaign.update({
      where: { id: action.proposal.campaignId },
      data: { status },
    });
  }
  if (action.actionType === 'UPDATE_BUDGET' && after.budget != null) {
    await prisma.adManagerCampaign.update({
      where: { id: action.proposal.campaignId },
      data: { budget: after.budget },
    });
  }
}

async function processAutopilotOutcomes(payload: { organizationId?: string }) {
  const now = new Date();
  const pending = await prisma.googleAdsAutopilotOutcome.findMany({
    where: {
      verdict: GoogleAdsAutopilotOutcomeVerdict.PENDING,
      scheduledFor: { lte: now },
      ...(payload.organizationId ? { organizationId: payload.organizationId } : {}),
    },
    include: { action: { include: { proposal: true } } },
    take: 100,
  });

  let evaluated = 0;
  for (const row of pending) {
    const campaignId = row.action.proposal.campaignId;
    if (!campaignId) continue;

    const insight = await prisma.adInsight.findFirst({
      where: { organizationId: row.organizationId, campaignId },
      orderBy: { dateTo: 'desc' },
    });
    if (!insight) continue;

    const before = row.metricsBefore as GoogleAdsAutopilotMetrics;
    const after = toMetrics(insight);
    const verdict = evaluateOutcomeVerdict(before, after, row.action.actionType);

    await prisma.googleAdsAutopilotOutcome.update({
      where: { id: row.id },
      data: {
        verdict,
        metricsAfter: after as unknown as Prisma.InputJsonValue,
        delta: {
          spend: after.spend - before.spend,
          conversions: after.conversions - before.conversions,
        } as Prisma.InputJsonValue,
        evaluatedAt: now,
      },
    });
    evaluated += 1;
  }

  return { evaluated, pending: pending.length };
}
