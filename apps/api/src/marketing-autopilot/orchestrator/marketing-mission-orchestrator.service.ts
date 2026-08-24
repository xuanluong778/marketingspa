import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@marketingspa/database';
import {
  MARKETING_MISSION_STEP_LABELS,
  buildImmutableApprovalSnapshot,
  buildMissionApprovalSummary,
  emptyMissionStepsMap,
  resolveMissionIdempotencyKey,
  type MarketingMissionStep,
} from '@marketingspa/shared';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { QueueEnqueueService } from '../../common/services/queue-enqueue.service';
import { MARKETING_AUTOPILOT_MISSION_QUEUE } from '../../queue/queue.constants';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { MarketingAutopilotDraftAdapter } from '../marketing-autopilot-draft.adapter';
import { MarketingContextEngineService } from '../context/marketing-context-engine.service';
import { MarketingAutopilotExecutorService } from './marketing-autopilot-executor.service';
import { MarketingAutopilotExecutionEngineService } from './marketing-autopilot-execution-engine.service';
import { MarketingAutopilotOutcomeLoopService } from '../outcome/marketing-autopilot-outcome-loop.service';
import { runMarketingMissionPipeline } from './mission-pipeline.runner';

@Injectable()
export class MarketingMissionOrchestratorService {
  private readonly logger = new Logger(MarketingMissionOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly enqueue: QueueEnqueueService,
    @Inject(MARKETING_AUTOPILOT_MISSION_QUEUE) private readonly missionQueue: Queue,
    private readonly draftAdapter: MarketingAutopilotDraftAdapter,
    private readonly contextEngine: MarketingContextEngineService,
    private readonly executor: MarketingAutopilotExecutorService,
    private readonly executionEngine: MarketingAutopilotExecutionEngineService,
    private readonly outcomeLoop: MarketingAutopilotOutcomeLoopService,
  ) {}

  /**
   * Additive hook after classic create(): open mission + enqueue BullMQ (+ inline kick).
   * Does not change create() response contract beyond optional `mission` field.
   */
  async startMissionAfterCreate(
    user: AuthUser,
    project: { id: string },
    opts?: { idempotencyKey?: string },
  ) {
    const idempotencyKey = resolveMissionIdempotencyKey({
      clientKey: opts?.idempotencyKey,
      projectId: project.id,
    });

    const existing = await this.prisma.marketingMission.findFirst({
      where: { organizationId: user.organizationId, idempotencyKey },
    });
    if (existing) {
      this.kickMissionPipeline(existing.id, user.organizationId, project.id);
      return this.toPublicMission(existing);
    }

    const mission = await this.prisma.marketingMission.create({
      data: {
        organizationId: user.organizationId,
        createdById: user.id,
        projectId: project.id,
        idempotencyKey,
        status: 'DRAFT',
        currentStep: 'BRIEF',
        progressPercent: 0,
        stepsJson: emptyMissionStepsMap() as unknown as Prisma.InputJsonValue,
      },
    });

    await this.prisma.marketingAutopilotProject.update({
      where: { id: project.id },
      data: { status: 'ORCHESTRATING' },
    });

    // Inline first — BullMQ jobId must not contain ":"; enqueue must never block the pipeline.
    this.kickMissionPipeline(mission.id, user.organizationId, project.id);

    return this.toPublicMission(mission);
  }

  /** BullMQ rejects custom ids that contain ":". */
  private missionJobId(missionId: string) {
    return `marketing-mission-${missionId}`;
  }

  kickMissionPipeline(missionId: string, organizationId: string, projectId: string) {
    void this.processMission(missionId).catch((err) => {
      this.logger.warn(
        `Inline mission ${missionId} failed (worker may retry): ${err instanceof Error ? err.message : String(err)}`,
      );
    });
    void this.enqueueMission(missionId, organizationId, projectId).catch((err) => {
      this.logger.warn(
        `Enqueue mission ${missionId} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  async enqueueMission(missionId: string, organizationId: string, projectId: string) {
    await this.enqueue.add(
      this.missionQueue,
      'run-marketing-mission',
      { missionId, organizationId, projectId },
      {
        jobId: this.missionJobId(missionId),
        attempts: 5,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    );
  }

  async processMission(missionId: string) {
    return runMarketingMissionPipeline(missionId, {
      prisma: this.prisma as any,
      logger: this.logger,
      getContext: async (organizationId, user) => {
        const res = await this.contextEngine.getContext(organizationId, { user });
        return { snapshotId: res.snapshotId };
      },
      createDraft: (type, user, plan, project) =>
        this.draftAdapter.createDraft(type, user, plan, project),
      executeAssets: (input) => this.executor.executeMissionAssets(input),
    });
  }

  async getLatestMissionForProject(organizationId: string, projectId: string) {
    const mission = await this.prisma.marketingMission.findFirst({
      where: { organizationId, projectId },
      orderBy: { createdAt: 'desc' },
      include: {
        drafts: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        assets: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        approvals: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });
    if (!mission) return null;
    return this.toPublicMissionDetailed(mission);
  }

  async getMission(organizationId: string, missionId: string) {
    const mission = await this.prisma.marketingMission.findFirst({
      where: { id: missionId, organizationId },
      include: {
        drafts: { orderBy: { createdAt: 'desc' }, take: 20 },
        assets: { orderBy: { createdAt: 'desc' }, take: 50 },
        approvals: { orderBy: { version: 'desc' }, take: 1 },
      },
    });
    if (!mission) {
      throw new NotFoundException('Không tìm thấy Marketing Mission');
    }
    return this.toPublicMissionDetailed(mission);
  }

  /** Resume failed mission (additive). */
  async resumeMission(user: AuthUser, missionId: string) {
    const mission = await this.prisma.marketingMission.findFirst({
      where: { id: missionId, organizationId: user.organizationId },
    });
    if (!mission) {
      throw new NotFoundException('Không tìm thấy Marketing Mission');
    }
    if (
      mission.status === 'READY_FOR_APPROVAL' ||
      mission.status === 'APPROVED' ||
      mission.status === 'QUEUED' ||
      (mission.status === 'RUNNING' && mission.readyAt)
    ) {
      return this.getMission(user.organizationId, mission.id);
    }
    await this.prisma.marketingMission.update({
      where: { id: mission.id },
      data: { status: 'DRAFT', errorJson: Prisma.DbNull },
    });
    this.kickMissionPipeline(mission.id, user.organizationId, mission.projectId);
    return this.getMission(user.organizationId, mission.id);
  }

  /**
   * Approval-first: one-click approve all drafts — immutable snapshot + QUEUED → RUNNING.
   * Does not require per-draft approval. Does not live-publish Facebook/Ads.
   */
  async approveAndRun(user: AuthUser, missionId: string) {
    const mission = await this.prisma.marketingMission.findFirst({
      where: { id: missionId, organizationId: user.organizationId },
      include: {
        assets: { orderBy: { createdAt: 'asc' } },
        approvals: { orderBy: { version: 'desc' }, take: 1 },
      },
    });
    if (!mission) {
      throw new NotFoundException('Không tìm thấy Marketing Mission');
    }

    // Idempotent: already approved → return latest
    if (
      mission.status === 'APPROVED' ||
      mission.status === 'QUEUED' ||
      (mission.status === 'RUNNING' && mission.readyAt)
    ) {
      return this.getMission(user.organizationId, mission.id);
    }

    if (mission.status !== 'READY_FOR_APPROVAL') {
      throw new BadRequestException(
        `Mission chưa READY_FOR_APPROVAL (hiện: ${mission.status}). Đợi AI hoàn tất trước khi duyệt.`,
      );
    }

    const analysis = await this.prisma.marketingAutopilotAnalysis.findFirst({
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
      approver: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      approvedAt: approvedAt.toISOString(),
    });

    let approval: { id: string };
    try {
      approval = await this.prisma.$transaction(async (tx) => {
        // Optimistic concurrency: only one approver wins READY_FOR_APPROVAL → APPROVED
        const claimed = await tx.marketingMission.updateMany({
          where: {
            id: mission.id,
            organizationId: user.organizationId,
            status: 'READY_FOR_APPROVAL',
          },
          data: {
            status: 'APPROVED',
            approvedAt,
            approvalVersion: nextVersion,
          },
        });
        if (claimed.count !== 1) {
          throw new BadRequestException(
            'Mission đã được duyệt bởi phiên khác hoặc không còn READY_FOR_APPROVAL.',
          );
        }

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

        await tx.marketingAutopilotProject.update({
          where: { id: mission.projectId },
          data: { status: 'APPROVED' },
        });

        return row;
      });
    } catch (err) {
      // Unique (missionId, version) race → treat as already approved
      const code = (err as { code?: string })?.code;
      if (code === 'P2002') {
        return this.getMission(user.organizationId, mission.id);
      }
      if (err instanceof BadRequestException) {
        // Lost race after another approver claimed — return latest mission state
        const latest = await this.getMission(user.organizationId, mission.id);
        if (
          latest.status === 'APPROVED' ||
          latest.status === 'QUEUED' ||
          latest.status === 'RUNNING'
        ) {
          return latest;
        }
        throw err;
      }
      throw err;
    }

    // APPROVED → QUEUED → RUNNING (soft run; no live Facebook/Ads publish)
    void this.runApprovedMission(mission.id, approval.id).catch((err) => {
      this.logger.warn(
        `Approved run ${mission.id} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    return this.getMission(user.organizationId, mission.id);
  }

  /** Post-approval runner: QUEUED → RUNNING → Execution Engine (gated). */
  async runApprovedMission(missionId: string, approvalId: string) {
    const mission = await this.prisma.marketingMission.findFirst({
      where: { id: missionId },
    });
    if (!mission) return;

    await this.prisma.marketingMission.update({
      where: { id: missionId },
      data: { status: 'QUEUED' },
    });
    await this.prisma.marketingMissionApproval.update({
      where: { id: approvalId },
      data: { runStatus: 'QUEUED' },
    });
    await this.prisma.marketingAutopilotProject.update({
      where: { id: mission.projectId },
      data: { status: 'QUEUED' },
    });

    await this.prisma.marketingMission.update({
      where: { id: missionId },
      data: { status: 'RUNNING' },
    });
    await this.prisma.marketingMissionApproval.update({
      where: { id: approvalId },
      data: { runStatus: 'RUNNING', startedAt: new Date() },
    });
    await this.prisma.marketingAutopilotProject.update({
      where: { id: mission.projectId },
      data: { status: 'RUNNING' },
    });

    // Mark registry assets as APPROVED before execution gates
    await this.prisma.marketingMissionAsset.updateMany({
      where: { missionId, status: 'DRAFT' },
      data: { status: 'APPROVED' },
    });

    const user: AuthUser = {
      id: mission.createdById,
      organizationId: mission.organizationId,
      email: '',
      name: '',
      role: 'OWNER',
    };

    let execResult: Awaited<
      ReturnType<MarketingAutopilotExecutionEngineService['executeApprovedMission']>
    > | null = null;
    try {
      execResult = await this.executionEngine.executeApprovedMission({
        user,
        missionId,
        approvalId,
      });
      this.logger.log(
        `[execution] mission ${missionId} executed=${execResult.executed} blocked=${execResult.blocked} failed=${execResult.failed} skipped=${execResult.skipped}`,
      );
    } catch (err) {
      this.logger.warn(
        `[execution] mission ${missionId} engine error (mission continues): ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    await this.prisma.marketingMissionApproval.update({
      where: { id: approvalId },
      data: {
        runStatus: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    this.logger.log(
      `[approval] mission ${missionId} RUNNING+EXECUTED — snapshot immutable; gated outbound`,
    );

    void this.outcomeLoop
      .startMissionLoop({
        organizationId: mission.organizationId,
        missionId,
        projectId: mission.projectId,
        approvalId,
      })
      .catch((err) => {
        this.logger.warn(
          `[outcome-loop] start failed for ${missionId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    return execResult;
  }

  /**
   * Public enricher for list/detail — pass analysisJson when already loaded (findAll).
   */
  async toPublicMissionDetailed(
    mission: {
      id: string;
      organizationId: string;
      createdById: string;
      projectId: string;
      idempotencyKey: string;
      status: string;
      currentStep: string;
      progressPercent: number;
      stepsJson: unknown;
      blueprintJson?: unknown;
      errorJson?: unknown;
      attemptCount?: number;
      readyAt?: Date | null;
      approvedAt?: Date | null;
      approvalVersion?: number;
      createdAt: Date;
      updatedAt: Date;
      drafts?: unknown[];
      assets?: Array<{
        id: string;
        module: string;
        entityType: string;
        entityId: string;
        status: string;
        adapter?: string;
        missionId?: string;
      }>;
      approvals?: Array<{
        id: string;
        version: number;
        approvedAt: Date;
        approvedById: string;
        runStatus: string;
        snapshotJson?: unknown;
      }>;
    },
    analysisJsonHint?: Record<string, unknown> | null,
  ) {
    const base = this.toPublicMission(mission);
    let analysisJson = analysisJsonHint ?? null;
    if (!analysisJson) {
      const analysis = await this.prisma.marketingAutopilotAnalysis.findFirst({
        where: {
          projectId: mission.projectId,
          organizationId: mission.organizationId,
        },
        orderBy: { createdAt: 'desc' },
      });
      analysisJson = (analysis?.recommendationJson ?? {}) as Record<string, unknown>;
    }
    const plan = analysisJson.plan ?? analysisJson;
    const latestApproval = mission.approvals?.[0] ?? null;

    const approvalSummary = buildMissionApprovalSummary({
      status: mission.status,
      currentStep: mission.currentStep,
      currentStepLabel: base.currentStepLabel,
      progressPercent: mission.progressPercent,
      plan,
      analysis: analysisJson,
      blueprint: mission.blueprintJson,
      assets: mission.assets ?? [],
      approval: latestApproval
        ? {
            id: latestApproval.id,
            version: latestApproval.version,
            approvedAt: latestApproval.approvedAt,
            approvedById: latestApproval.approvedById,
            runStatus: latestApproval.runStatus,
          }
        : null,
    });

    return {
      ...base,
      approvedAt: mission.approvedAt ?? null,
      approvalVersion: mission.approvalVersion ?? 0,
      approval: latestApproval
        ? {
            id: latestApproval.id,
            version: latestApproval.version,
            approvedAt: latestApproval.approvedAt,
            approvedById: latestApproval.approvedById,
            runStatus: latestApproval.runStatus,
            snapshot: latestApproval.snapshotJson ?? null,
          }
        : null,
      approvalSummary,
      planPreview: plan,
    };
  }

  toPublicMission(mission: {
    id: string;
    organizationId: string;
    createdById: string;
    projectId: string;
    idempotencyKey: string;
    status: string;
    currentStep: string;
    progressPercent: number;
    stepsJson: unknown;
    blueprintJson?: unknown;
    errorJson?: unknown;
    attemptCount?: number;
    readyAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
    drafts?: unknown[];
  }) {
    const step = mission.currentStep as MarketingMissionStep;
    return {
      id: mission.id,
      organizationId: mission.organizationId,
      createdById: mission.createdById,
      projectId: mission.projectId,
      idempotencyKey: mission.idempotencyKey,
      status: mission.status,
      currentStep: mission.currentStep,
      currentStepLabel:
        MARKETING_MISSION_STEP_LABELS[step] ?? mission.currentStep,
      progressPercent: mission.progressPercent,
      steps: mission.stepsJson,
      blueprint: mission.blueprintJson,
      error: mission.errorJson ?? null,
      attemptCount: mission.attemptCount ?? 0,
      readyAt: mission.readyAt ?? null,
      createdAt: mission.createdAt,
      updatedAt: mission.updatedAt,
      drafts: mission.drafts ?? [],
      assets: (mission as { assets?: unknown[] }).assets ?? [],
      orchestrator: 'marketing-autopilot-a-z',
      draftOnly: true,
      liveActionsEnabled: false,
    };
  }
}
