import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@marketingspa/database';
import {
  OUTCOME_LEARNING_HORIZONS,
  buildPlannerBusinessLearningsPayload,
  computeOutcome,
  extractOutcomeMetrics,
  normalizeLearningKey,
  type BusinessLearningPlannerItem,
  type OutcomeMetricsSnapshot,
  type OutcomeResult,
} from '@marketingspa/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { MarketingContextEngineService } from '../context/marketing-context-engine.service';
import type { MarketingContextSnapshotPayload } from '../context/marketing-context.types';
import type { AutopilotAnalysis } from '../marketing-autopilot.types';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';

type TrackCreateBase = {
  organizationId: string;
  createdById: string;
  projectId: string;
  analysisId?: string | null;
  productName: string;
  customerProfile: string;
  targetArea: string;
  primaryGoal: string;
  analysis: AutopilotAnalysis;
  snapshot: MarketingContextSnapshotPayload;
  snapshotId?: string | null;
};

@Injectable()
export class MarketingAutopilotOutcomeLearningService {
  private readonly logger = new Logger(MarketingAutopilotOutcomeLearningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contextEngine: MarketingContextEngineService,
  ) {}

  async recordStrategyBaseline(input: TrackCreateBase) {
    const before = extractOutcomeMetrics(input.snapshot.metrics);
    const channels = input.analysis.suggestedChannels ?? [];
    const offer = {
      productName: input.productName,
      productPrice: input.analysis.plan?.offer?.productPrice ?? null,
      valueProps: input.analysis.plan?.offer?.valueProps ?? [],
      valueProposition: input.analysis.plan?.valueProposition ?? null,
    };

    const track = await this.prisma.marketingAutopilotOutcomeTrack.create({
      data: {
        organizationId: input.organizationId,
        createdById: input.createdById,
        projectId: input.projectId,
        analysisId: input.analysisId ?? null,
        actionType: 'STRATEGY',
        status: 'OPEN',
        recommendationJson: {
          summary: input.analysis.summary,
          nextBestActions: input.analysis.nextBestActions ?? [],
          budgetSplit: input.analysis.budgetSplit ?? [],
          score: input.analysis.score,
        } as Prisma.InputJsonValue,
        beforeMetricsJson: before as unknown as Prisma.InputJsonValue,
        beforeSnapshotId: input.snapshotId ?? null,
        baselineAt: new Date(),
        productName: input.productName,
        customerProfile: input.customerProfile,
        targetArea: input.targetArea,
        primaryGoal: input.primaryGoal,
        channelsJson: channels as Prisma.InputJsonValue,
        offerJson: offer as Prisma.InputJsonValue,
      },
    });

    await this.scheduleEvaluations(track.id, input.organizationId, track.baselineAt);
    return track;
  }

  async recordDraftBaselines(input: {
    organizationId: string;
    createdById: string;
    projectId: string;
    analysisId?: string | null;
    draftRunId: string;
    drafts: Array<{ id: string; type: string; recommendationId?: string | null }>;
    productName: string;
    customerProfile: string;
    targetArea: string;
    primaryGoal: string;
    analysis: AutopilotAnalysis;
    snapshot: MarketingContextSnapshotPayload;
    snapshotId?: string | null;
    missionId?: string | null;
  }) {
    const before = extractOutcomeMetrics(input.snapshot.metrics);
    const channels = input.analysis.suggestedChannels ?? [];
    const offer = {
      productName: input.productName,
      productPrice: input.analysis.plan?.offer?.productPrice ?? null,
      valueProps: input.analysis.plan?.offer?.valueProps ?? [],
    };

    const created = [];
    for (const draft of input.drafts) {
      const recommendationId = draft.recommendationId ?? `nba:${draft.type}`;
      const track = await this.prisma.marketingAutopilotOutcomeTrack.create({
        data: {
          organizationId: input.organizationId,
          createdById: input.createdById,
          projectId: input.projectId,
          missionId: input.missionId ?? null,
          analysisId: input.analysisId ?? null,
          draftRunId: input.draftRunId,
          draftId: draft.id,
          recommendationId,
          actionType: 'DRAFT',
          draftType: draft.type as any,
          status: 'OPEN',
          recommendationJson: {
            summary: input.analysis.summary,
            draftType: draft.type,
            recommendationId,
            nextBestActions: (input.analysis.nextBestActions ?? []).filter(
              (a: { recommendedDraft?: string; type?: string }) =>
                (a.recommendedDraft ?? a.type) === draft.type,
            ),
          } as Prisma.InputJsonValue,
          beforeMetricsJson: before as unknown as Prisma.InputJsonValue,
          beforeSnapshotId: input.snapshotId ?? null,
          baselineAt: new Date(),
          productName: input.productName,
          customerProfile: input.customerProfile,
          targetArea: input.targetArea,
          primaryGoal: input.primaryGoal,
          channelsJson: channels as Prisma.InputJsonValue,
          offerJson: offer as Prisma.InputJsonValue,
        },
      });
      await this.scheduleEvaluations(track.id, input.organizationId, track.baselineAt);
      created.push(track);
    }
    return created;
  }

  private async scheduleEvaluations(trackId: string, organizationId: string, baselineAt: Date) {
    const rows = OUTCOME_LEARNING_HORIZONS.map((days) => ({
      organizationId,
      trackId,
      horizonDays: days,
      dueAt: new Date(baselineAt.getTime() + days * 24 * 60 * 60 * 1000),
      status: 'PENDING' as const,
    }));
    await this.prisma.marketingAutopilotOutcomeEvaluation.createMany({ data: rows });
  }

  async evaluateDue(organizationId?: string, opts?: { now?: Date; forceTrackId?: string }) {
    const now = opts?.now ?? new Date();
    const where: Record<string, unknown> = {
      status: 'PENDING',
      ...(organizationId ? { organizationId } : {}),
      ...(opts?.forceTrackId
        ? { trackId: opts.forceTrackId }
        : { dueAt: { lte: now } }),
    };

    const due = await this.prisma.marketingAutopilotOutcomeEvaluation.findMany({
      where,
      include: { track: true },
      orderBy: { dueAt: 'asc' },
      take: 100,
    });

    const results = [];
    for (const evaluation of due) {
      results.push(await this.evaluateOne(evaluation.id, { now }));
    }
    return results;
  }

  async evaluateOne(evaluationId: string, opts?: { now?: Date; afterMetrics?: OutcomeMetricsSnapshot; snapshotId?: string | null }) {
    const evaluation = await this.prisma.marketingAutopilotOutcomeEvaluation.findUnique({
      where: { id: evaluationId },
      include: { track: true },
    });
    if (!evaluation) throw new NotFoundException('Outcome evaluation not found');

    const orgId = evaluation.organizationId;
    let after = opts?.afterMetrics;
    let snapshotId = opts?.snapshotId ?? null;

    if (!after) {
      const ctx = await this.contextEngine.getContext(orgId);
      after = extractOutcomeMetrics(ctx.snapshot.metrics);
      snapshotId = ctx.snapshotId ?? null;
    }

    const before = evaluation.track.beforeMetricsJson as unknown as OutcomeMetricsSnapshot;
    const outcome = computeOutcome(before, after);

    const updated = await this.prisma.marketingAutopilotOutcomeEvaluation.update({
      where: { id: evaluation.id },
      data: {
        status: 'DONE',
        evaluatedAt: opts?.now ?? new Date(),
        afterMetricsJson: after as unknown as Prisma.InputJsonValue,
        afterSnapshotId: snapshotId,
        outcomeJson: outcome as unknown as Prisma.InputJsonValue,
      },
      include: { track: true },
    });

    await this.prisma.marketingAutopilotOutcomeTrack.update({
      where: { id: evaluation.trackId },
      data: { status: evaluation.horizonDays >= 30 ? 'COMPLETED' : 'EVALUATING' },
    });

    if (evaluation.horizonDays >= 7) {
      await this.upsertLearningsFromOutcome(updated.track, outcome, after, evaluation.horizonDays);
    }

    return updated;
  }

  /** Force-evaluate a track horizon (tests / manual backfill). Tenant-scoped. */
  async forceEvaluateHorizon(
    organizationId: string,
    trackId: string,
    horizonDays: number,
    afterMetrics: OutcomeMetricsSnapshot,
  ) {
    const track = await this.prisma.marketingAutopilotOutcomeTrack.findFirst({
      where: { id: trackId, organizationId },
    });
    if (!track) throw new NotFoundException('Outcome track not found for organization');

    const evaluation = await this.prisma.marketingAutopilotOutcomeEvaluation.findFirst({
      where: { trackId, organizationId, horizonDays },
    });
    if (!evaluation) throw new NotFoundException('Outcome evaluation horizon not found');

    return this.evaluateOne(evaluation.id, { afterMetrics, now: new Date() });
  }

  private async upsertLearningsFromOutcome(
    track: {
      id: string;
      organizationId: string;
      productName: string;
      customerProfile: string;
      targetArea: string;
      primaryGoal: string;
      channelsJson: unknown;
      offerJson: unknown;
      draftType: string | null;
      actionType: string;
    },
    outcome: OutcomeResult,
    after: OutcomeMetricsSnapshot,
    horizonDays: number,
  ) {
    const channels = Array.isArray(track.channelsJson)
      ? (track.channelsJson as string[])
      : [];
    const offer = (track.offerJson ?? {}) as { productName?: string; valueProposition?: string };

    const items: Array<{
      category: 'OFFER' | 'SEGMENT' | 'CONTENT_CHANNEL' | 'METRIC_BASELINE' | 'TACTIC_SUCCESS' | 'TACTIC_FAILED';
      key: string;
      title: string;
      summary: string;
      confidence: string;
      evidence: Record<string, unknown>;
    }> = [];

    if (track.productName.trim()) {
      items.push({
        category: 'OFFER',
        key: normalizeLearningKey(`offer:${track.productName}`),
        title: `Offer: ${track.productName}`,
        summary:
          outcome.verdict === 'IMPROVED'
            ? `Offer "${track.productName}" đi kèm outcome cải thiện sau ${horizonDays} ngày (tương quan).`
            : outcome.verdict === 'DECLINED'
              ? `Offer "${track.productName}" đi kèm outcome kém hơn sau ${horizonDays} ngày (tương quan).`
              : `Offer "${track.productName}" có outcome hỗn hợp/thiếu dữ liệu sau ${horizonDays} ngày.`,
        confidence: outcome.verdict === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT_DATA' : 'LOW',
        evidence: { verdict: outcome.verdict, horizonDays, offer },
      });
    }

    if (track.customerProfile.trim()) {
      items.push({
        category: 'SEGMENT',
        key: normalizeLearningKey(`segment:${track.customerProfile}`),
        title: `Segment: ${track.customerProfile.slice(0, 80)}`,
        summary: `Segment theo profile "${track.customerProfile.slice(0, 120)}" — verdict ${outcome.verdict} @${horizonDays}d (correlation only).`,
        confidence: outcome.verdict === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT_DATA' : 'LOW',
        evidence: {
          verdict: outcome.verdict,
          targetArea: track.targetArea,
          customerProfile: track.customerProfile,
        },
      });
    }

    for (const ch of channels.slice(0, 5)) {
      items.push({
        category: 'CONTENT_CHANNEL',
        key: normalizeLearningKey(`channel:${ch}`),
        title: `Channel: ${ch}`,
        summary: `Kênh "${ch}" xuất hiện trong recommendation với verdict ${outcome.verdict} @${horizonDays}d.`,
        confidence: 'LOW',
        evidence: { channel: ch, verdict: outcome.verdict, horizonDays },
      });
    }

    if (after.cpl != null || after.conversionRate != null) {
      items.push({
        category: 'METRIC_BASELINE',
        key: 'metric-baseline-org',
        title: 'CPL / booking rate lịch sử',
        summary: `CPL=${after.cpl ?? 'n/a'}, conversion=${after.conversionRate ?? 'n/a'}%, bookings=${after.bookings ?? 'n/a'} (snapshot sau ${horizonDays}d).`,
        confidence: after.cpl != null || after.conversionRate != null ? 'MEDIUM' : 'INSUFFICIENT_DATA',
        evidence: {
          cpl: after.cpl,
          cpa: after.cpa,
          conversionRate: after.conversionRate,
          roas: after.roas,
          bookings: after.bookings,
          leads: after.leads,
        },
      });
    }

    const tacticLabel =
      track.actionType === 'DRAFT' && track.draftType
        ? `Draft ${track.draftType}`
        : `Strategy ${track.primaryGoal || 'plan'}`;

    if (outcome.verdict === 'IMPROVED') {
      items.push({
        category: 'TACTIC_SUCCESS',
        key: normalizeLearningKey(`success:${tacticLabel}`),
        title: `Chiến thuật hiệu quả (tương quan): ${tacticLabel}`,
        summary: `${tacticLabel} đi kèm cải thiện metric sau ${horizonDays} ngày. Không khẳng định nhân quả.`,
        confidence: 'LOW',
        evidence: { verdict: outcome.verdict, deltas: outcome.deltas, horizonDays },
      });
    } else if (outcome.verdict === 'DECLINED') {
      items.push({
        category: 'TACTIC_FAILED',
        key: normalizeLearningKey(`failed:${tacticLabel}`),
        title: `Chiến thuật kém hiệu quả (tương quan): ${tacticLabel}`,
        summary: `${tacticLabel} đi kèm metric xấu đi sau ${horizonDays} ngày. Cần kiểm chứng — correlation ≠ causation.`,
        confidence: 'LOW',
        evidence: { verdict: outcome.verdict, deltas: outcome.deltas, horizonDays },
      });
    }

    for (const item of items) {
      const existing = await this.prisma.marketingAutopilotBusinessLearning.findUnique({
        where: {
          organizationId_category_key: {
            organizationId: track.organizationId,
            category: item.category,
            key: item.key,
          },
        },
        select: { sourceTrackIds: true, sampleSize: true },
      });
      const prev = Array.isArray(existing?.sourceTrackIds)
        ? (existing!.sourceTrackIds as string[])
        : [];
      const sourceTrackIds = [...new Set([...prev, track.id])].slice(-20);

      await this.prisma.marketingAutopilotBusinessLearning.upsert({
        where: {
          organizationId_category_key: {
            organizationId: track.organizationId,
            category: item.category,
            key: item.key,
          },
        },
        create: {
          organizationId: track.organizationId,
          category: item.category,
          key: item.key,
          title: item.title,
          summary: item.summary,
          evidenceJson: item.evidence as Prisma.InputJsonValue,
          confidence: item.confidence,
          sampleSize: 1,
          correlationOnly: true,
          sourceTrackIds: sourceTrackIds as Prisma.InputJsonValue,
          isActive: true,
          lastObservedAt: new Date(),
        },
        update: {
          title: item.title,
          summary: item.summary,
          evidenceJson: item.evidence as Prisma.InputJsonValue,
          confidence: item.confidence,
          sampleSize: (existing?.sampleSize ?? 0) + 1,
          correlationOnly: true,
          lastObservedAt: new Date(),
          isActive: true,
          sourceTrackIds: sourceTrackIds as Prisma.InputJsonValue,
        },
      });
    }
  }

  async getBusinessLearningsForPlanner(organizationId: string, limit = 20) {
    const rows = await this.prisma.marketingAutopilotBusinessLearning.findMany({
      where: { organizationId, isActive: true },
      orderBy: [{ lastObservedAt: 'desc' }, { sampleSize: 'desc' }],
      take: limit,
    });

    const items: BusinessLearningPlannerItem[] = rows.map((r: {
      category: string;
      key: string;
      title: string;
      summary: string;
      confidence: string;
      sampleSize: number;
      evidenceJson: unknown;
    }) => ({
      category: r.category,
      key: r.key,
      title: r.title,
      summary: r.summary,
      confidence: r.confidence,
      sampleSize: r.sampleSize,
      correlationOnly: true as const,
      evidence: (r.evidenceJson ?? {}) as Record<string, unknown>,
    }));

    return buildPlannerBusinessLearningsPayload(items);
  }

  async listTracksForOrg(organizationId: string, projectId?: string) {
    return this.prisma.marketingAutopilotOutcomeTrack.findMany({
      where: {
        organizationId,
        ...(projectId ? { projectId } : {}),
      },
      include: { evaluations: { orderBy: { horizonDays: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /** Tenant isolation helper for tests/API. */
  async assertTrackBelongsToOrg(trackId: string, organizationId: string) {
    const track = await this.prisma.marketingAutopilotOutcomeTrack.findFirst({
      where: { id: trackId, organizationId },
    });
    if (!track) throw new NotFoundException('Outcome track not found');
    return track;
  }

  async getLearningsForUser(user: AuthUser) {
    return this.getBusinessLearningsForPlanner(user.organizationId);
  }
}
