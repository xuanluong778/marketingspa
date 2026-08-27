import { Inject, Injectable, Logger, NotFoundException, BadRequestException, forwardRef } from '@nestjs/common';
import {
  AutomationTriggerType,
  LeadPipelineStatus,
  Prisma,
} from '@marketingspa/database';
import {
  applyScoreDelta,
  clampLeadScore,
  detectAskPrice,
  proposeScoringForFunnel,
  qualificationAfterScore,
  shouldAdvancePipeline,
  WS_EVENTS,
  type FunnelScoringEventType,
  type ScoringConfigProposal,
} from '@marketingspa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PipelineService } from './pipeline.service';
import { LeadAssignmentService } from './lead-assignment.service';
import { AutomationEngineService } from './automation-engine.service';
import { EventsGateway } from '../events/events.gateway';
import { FunnelCanvasRuntimeService } from './funnel-canvas-runtime.service';
import { assertLeadTransition } from '../common/utils/status-transitions.util';

const SCORE_EVENT_ACTION = 'SCORE_EVENT';

@Injectable()
export class LeadScoringService {
  private readonly logger = new Logger(LeadScoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: PipelineService,
    private readonly assignment: LeadAssignmentService,
    private readonly automation: AutomationEngineService,
    private readonly events: EventsGateway,
    @Inject(forwardRef(() => FunnelCanvasRuntimeService))
    private readonly canvasRuntime: FunnelCanvasRuntimeService,
  ) {}

  async getConfig(organizationId: string, funnelId: string) {
    await this.assertFunnel(organizationId, funnelId);
    const config = await this.prisma.funnelScoringConfig.findFirst({
      where: { organizationId, funnelId },
      include: {
        rules: { orderBy: { position: 'asc' } },
        mqlStage: { select: { id: true, name: true, code: true } },
        sqlStage: { select: { id: true, name: true, code: true } },
      },
    });
    return config;
  }

  async propose(organizationId: string, funnelId: string): Promise<ScoringConfigProposal> {
    const rec = await this.prisma.funnelRecommendation.findFirst({
      where: { id: funnelId, organizationId },
      select: { selectedSlug: true, prompt: true, completeSpec: true },
    });
    if (!rec) throw new NotFoundException('Funnel không tồn tại');
    const completeSpec =
      rec.completeSpec && typeof rec.completeSpec === 'object'
        ? (rec.completeSpec as {
            leadScoring?: {
              maxScore?: number;
              hotThreshold?: number;
              mqlThreshold?: number;
              sqlThreshold?: number;
              rules?: Array<{ key?: string; label?: string; points?: number }>;
            };
          })
        : null;
    return proposeScoringForFunnel({
      selectedSlug: rec.selectedSlug,
      prompt: rec.prompt,
      completeSpec,
    });
  }

  async upsertConfig(
    organizationId: string,
    funnelId: string,
    dto: {
      maxScore?: number;
      mqlThreshold?: number;
      sqlThreshold?: number;
      mqlStageId?: string | null;
      sqlStageId?: string | null;
      isActive?: boolean;
      source?: string;
      rules?: Array<{
        key: string;
        label: string;
        eventType: string;
        points: number;
        condition?: Record<string, unknown>;
        isActive?: boolean;
        position?: number;
      }>;
    },
  ) {
    await this.assertFunnel(organizationId, funnelId);
    if (dto.mqlStageId) await this.assertStage(organizationId, dto.mqlStageId);
    if (dto.sqlStageId) await this.assertStage(organizationId, dto.sqlStageId);

    const maxScore = clampLeadScore(dto.maxScore ?? 100, 100) || 100;
    let mql = dto.mqlThreshold ?? 50;
    let sql = dto.sqlThreshold ?? 80;
    mql = Math.min(maxScore, Math.max(0, Math.round(mql)));
    sql = Math.min(maxScore, Math.max(mql, Math.round(sql)));
    if (sql < mql) throw new BadRequestException('SQL threshold phải ≥ MQL');

    const existing = await this.prisma.funnelScoringConfig.findFirst({
      where: { organizationId, funnelId },
      select: { id: true },
    });

    const config = existing
      ? await this.prisma.funnelScoringConfig.update({
          where: { id: existing.id },
          data: {
            maxScore,
            mqlThreshold: mql,
            sqlThreshold: sql,
            mqlStageId: dto.mqlStageId === undefined ? undefined : dto.mqlStageId,
            sqlStageId: dto.sqlStageId === undefined ? undefined : dto.sqlStageId,
            isActive: dto.isActive ?? true,
            source: dto.source ?? 'manual',
          },
        })
      : await this.prisma.funnelScoringConfig.create({
          data: {
            organizationId,
            funnelId,
            maxScore,
            mqlThreshold: mql,
            sqlThreshold: sql,
            mqlStageId: dto.mqlStageId ?? undefined,
            sqlStageId: dto.sqlStageId ?? undefined,
            isActive: dto.isActive ?? true,
            source: dto.source ?? 'manual',
          },
        });

    if (dto.rules) {
      await this.prisma.funnelScoringRule.deleteMany({
        where: { organizationId, configId: config.id },
      });
      if (dto.rules.length) {
        await this.prisma.funnelScoringRule.createMany({
          data: dto.rules.map((r, i) => ({
            organizationId,
            configId: config.id,
            key: r.key.slice(0, 64),
            label: r.label.slice(0, 120),
            eventType: r.eventType,
            points: Math.min(100, Math.max(-50, Math.round(r.points))),
            condition: (r.condition ?? {}) as Prisma.InputJsonValue,
            isActive: r.isActive ?? true,
            position: r.position ?? i,
          })),
        });
      }
    }

    return this.getConfig(organizationId, funnelId);
  }

  async applyProposed(organizationId: string, funnelId: string) {
    const proposal = await this.propose(organizationId, funnelId);
    await this.pipeline.ensureDefaultPipeline(organizationId);
    const existing = await this.prisma.funnelScoringConfig.findFirst({
      where: { organizationId, funnelId },
      select: { mqlStageId: true, sqlStageId: true },
    });
    const mqlStage = await this.pipeline.resolveStageForStatus(
      organizationId,
      LeadPipelineStatus.QUALIFIED,
    );
    const sqlStage = await this.pipeline.resolveStageForStatus(
      organizationId,
      LeadPipelineStatus.BOOKED,
    );
    return this.upsertConfig(organizationId, funnelId, {
      maxScore: proposal.maxScore,
      mqlThreshold: proposal.mqlThreshold,
      sqlThreshold: proposal.sqlThreshold,
      mqlStageId: existing?.mqlStageId ?? mqlStage?.id ?? null,
      sqlStageId: existing?.sqlStageId ?? sqlStage?.id ?? null,
      source: 'ai',
      rules: proposal.rules,
    });
  }

  /**
   * Increment/decrement lead score from a funnel event.
   * Fire-and-forget safe: never throws to caller after lookup misses.
   */
  async applyEvent(input: {
    organizationId: string;
    leadId?: string | null;
    eventType: FunnelScoringEventType;
    text?: string | null;
    source?: string;
  }) {
    try {
      if (!input.leadId) return { skipped: true, reason: 'no_lead' };
      const eventType: FunnelScoringEventType =
        input.eventType === 'CHATBOT_REPLY' && detectAskPrice(input.text)
          ? 'ASK_PRICE'
          : input.eventType;

      const lead = await this.prisma.lead.findFirst({
        where: { id: input.leadId, organizationId: input.organizationId },
        select: {
          id: true,
          name: true,
          score: true,
          qualification: true,
          funnelRecommendationId: true,
          customerId: true,
          assignedToId: true,
          pipelineStatus: true,
          stageId: true,
          pipelineId: true,
          branchId: true,
          leadSourceId: true,
        },
      });
      if (!lead?.funnelRecommendationId) return { skipped: true, reason: 'no_funnel' };

      const config = await this.prisma.funnelScoringConfig.findFirst({
        where: {
          organizationId: input.organizationId,
          funnelId: lead.funnelRecommendationId,
          isActive: true,
        },
        include: { rules: { where: { isActive: true, eventType } } },
      });
      if (!config || config.rules.length === 0) return { skipped: true, reason: 'no_rule' };

      const allowed = [];
      for (const rule of config.rules) {
        if (await this.isCoolingDown(input.organizationId, lead.id, eventType, rule.condition)) {
          continue;
        }
        allowed.push(rule);
      }
      if (!allowed.length) return { skipped: true, reason: 'cooldown' };

      const points = allowed.reduce((s, r) => s + r.points, 0);
      const { previous, next, delta } = applyScoreDelta(lead.score, points, config.maxScore);
      if (delta === 0 && points === 0) return { skipped: true, reason: 'noop' };

      return this.commitScoreChange({
        organizationId: input.organizationId,
        lead,
        previous,
        next,
        eventType,
        points: delta,
        source: input.source ?? eventType,
        config,
      });
    } catch (err) {
      this.logger.warn(
        `applyEvent failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { skipped: true, reason: 'error' };
    }
  }

  /** Canvas Inspector scoreDelta — bump score then MQL/SQL / CRM stage. */
  async applyCanvasScoreDelta(organizationId: string, leadId: string, points: number) {
    try {
      const lead = await this.prisma.lead.findFirst({
        where: { id: leadId, organizationId },
        select: {
          id: true,
          name: true,
          score: true,
          qualification: true,
          funnelRecommendationId: true,
          customerId: true,
          assignedToId: true,
          pipelineStatus: true,
          stageId: true,
          pipelineId: true,
          branchId: true,
          leadSourceId: true,
        },
      });
      if (!lead) return { skipped: true, reason: 'no_lead' as const };
      const config = lead.funnelRecommendationId
        ? await this.prisma.funnelScoringConfig.findFirst({
            where: { organizationId, funnelId: lead.funnelRecommendationId, isActive: true },
          })
        : null;
      const { previous, next, delta } = applyScoreDelta(lead.score, points, config?.maxScore ?? 100);
      if (delta === 0) return { skipped: true, reason: 'noop' as const, previous, next };
      if (!config) {
        await this.prisma.lead.update({ where: { id: lead.id }, data: { score: next } });
        await this.onAbsoluteScoreSet(organizationId, leadId, previous);
        return { previous, next, delta, qualification: lead.qualification };
      }
      const result = await this.commitScoreChange({
        organizationId,
        lead,
        previous,
        next,
        eventType: 'CTA_CLICK',
        points: delta,
        source: 'funnel-canvas',
        config,
      });
      return { previous, next, delta, qualification: result.qualification, crossed: result.crossed };
    } catch (err) {
      this.logger.warn(
        `applyCanvasScoreDelta failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { skipped: true, reason: 'error' as const };
    }
  }

  /** After manual PATCH score — check MQL/SQL without double-adding points. */
  async onAbsoluteScoreSet(organizationId: string, leadId: string, previousScore: number) {
    try {
      const lead = await this.prisma.lead.findFirst({
        where: { id: leadId, organizationId },
        select: {
          id: true,
          name: true,
          score: true,
          qualification: true,
          funnelRecommendationId: true,
          customerId: true,
          assignedToId: true,
          pipelineStatus: true,
          stageId: true,
          pipelineId: true,
          branchId: true,
          leadSourceId: true,
        },
      });
      if (!lead?.funnelRecommendationId) return;
      const config = await this.prisma.funnelScoringConfig.findFirst({
        where: { organizationId, funnelId: lead.funnelRecommendationId, isActive: true },
      });
      if (!config) {
        await this.prisma.leadActivity.create({
          data: {
            organizationId,
            leadId,
            action: 'SCORE_CHANGED',
            fromValue: String(previousScore),
            toValue: String(lead.score),
          },
        });
        void this.automation.dispatch(organizationId, AutomationTriggerType.SCORE_CHANGED, {
          leadId,
          customerId: lead.customerId,
          context: {
            score: String(lead.score),
            previousScore: String(previousScore),
          },
          dedupeKey: `SCORE_CHANGED:${leadId}:${lead.score}`,
        });
        return;
      }
      await this.commitScoreChange({
        organizationId,
        lead,
        previous: previousScore,
        next: lead.score,
        eventType: 'FORM_SUBMITTED',
        points: lead.score - previousScore,
        source: 'manual',
        config,
        skipEventLog: true,
      });
    } catch (err) {
      this.logger.warn(
        `onAbsoluteScoreSet failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async commitScoreChange(input: {
    organizationId: string;
    lead: {
      id: string;
      name: string;
      score: number;
      qualification: string | null;
      funnelRecommendationId: string | null;
      customerId: string | null;
      assignedToId: string | null;
      pipelineStatus: LeadPipelineStatus;
      stageId: string | null;
      pipelineId: string | null;
      branchId?: string | null;
      leadSourceId?: string | null;
    };
    previous: number;
    next: number;
    eventType: FunnelScoringEventType;
    points: number;
    source: string;
    config: {
      id: string;
      maxScore: number;
      mqlThreshold: number;
      sqlThreshold: number;
      mqlStageId: string | null;
      sqlStageId: string | null;
    };
    skipEventLog?: boolean;
  }) {
    const q = qualificationAfterScore(
      input.previous,
      input.next,
      input.config.mqlThreshold,
      input.config.sqlThreshold,
      input.lead.qualification,
    );

    const updated = await this.prisma.lead.update({
      where: { id: input.lead.id },
      data: {
        score: input.next,
        qualification: q.qualification ?? undefined,
        mqlReachedAt: q.crossedMql ? new Date() : undefined,
        sqlReachedAt: q.crossedSql ? new Date() : undefined,
      },
      select: { assignedToId: true, customerId: true, score: true, qualification: true },
    });

    if (!input.skipEventLog) {
      await this.prisma.leadActivity.create({
        data: {
          organizationId: input.organizationId,
          leadId: input.lead.id,
          action: SCORE_EVENT_ACTION,
          fromValue: String(input.previous),
          toValue: String(input.next),
          metadata: {
            eventType: input.eventType,
            points: input.points,
            source: input.source,
          },
        },
      });
    }

    await this.prisma.leadActivity.create({
      data: {
        organizationId: input.organizationId,
        leadId: input.lead.id,
        action: 'SCORE_CHANGED',
        fromValue: String(input.previous),
        toValue: String(input.next),
        metadata: {
          eventType: input.eventType,
          qualification: q.qualification,
          crossed: q.crossed,
        },
      },
    });

    this.events.emitToOrg(input.organizationId, WS_EVENTS.LEAD_SCORE_CHANGED, {
      leadId: input.lead.id,
      name: input.lead.name,
      score: input.next,
      previousScore: input.previous,
      qualification: q.qualification,
    });

    void this.automation.dispatch(input.organizationId, AutomationTriggerType.SCORE_CHANGED, {
      leadId: input.lead.id,
      customerId: updated.customerId ?? input.lead.customerId,
      context: {
        score: String(input.next),
        previousScore: String(input.previous),
        crossed: q.crossed ?? '',
        eventType: input.eventType,
      },
      dedupeKey: `SCORE_CHANGED:${input.lead.id}:${input.next}:${q.crossed ?? 'n'}`,
    });

    if (q.qualification === 'MQL' || q.qualification === 'SQL') {
      await this.syncQualificationStage({
        organizationId: input.organizationId,
        leadId: input.lead.id,
        qualification: q.qualification,
        config: input.config,
      });
    }

    if (q.crossed) {
      await this.onThresholdReached({
        organizationId: input.organizationId,
        lead: input.lead,
        crossed: q.crossed,
        score: input.next,
        config: input.config,
        assignedToId: updated.assignedToId ?? input.lead.assignedToId,
      });
    }

    return {
      ok: true,
      previous: input.previous,
      next: input.next,
      crossed: q.crossed,
      qualification: q.qualification,
    };
  }

  /** Fresh DB read — never regress; skip if already at/beyond target. */
  private async syncQualificationStage(input: {
    organizationId: string;
    leadId: string;
    qualification: 'MQL' | 'SQL';
    config: { mqlStageId: string | null; sqlStageId: string | null };
  }) {
    const targetStageId =
      input.qualification === 'SQL' ? input.config.sqlStageId : input.config.mqlStageId;
    const fallback =
      input.qualification === 'SQL' ? LeadPipelineStatus.BOOKED : LeadPipelineStatus.QUALIFIED;

    const live = await this.prisma.lead.findFirst({
      where: { id: input.leadId, organizationId: input.organizationId },
      select: {
        id: true,
        name: true,
        pipelineStatus: true,
        stageId: true,
        pipelineId: true,
        customerId: true,
      },
    });
    if (!live) return;

    const stage =
      (targetStageId
        ? await this.prisma.funnelStage.findFirst({
            where: { id: targetStageId, organizationId: input.organizationId, isActive: true },
          })
        : null) ??
      (await this.pipeline.resolveStageForStatus(
        input.organizationId,
        fallback,
        live.pipelineId ?? undefined,
      ));
    if (!stage) return;
    if (live.stageId === stage.id) return;

    const currentStage = live.stageId
      ? await this.prisma.funnelStage.findFirst({
          where: { id: live.stageId, organizationId: input.organizationId },
          select: { position: true, pipelineId: true },
        })
      : null;
    if (
      currentStage &&
      currentStage.pipelineId === stage.pipelineId &&
      currentStage.position >= stage.position
    ) {
      return;
    }

    const pointers = this.pipeline.leadPointersFromStage(stage);
    const nextStatus = pointers.pipelineStatus ?? live.pipelineStatus;
    if (nextStatus !== live.pipelineStatus && !shouldAdvancePipeline(live.pipelineStatus, nextStatus)) {
      return;
    }
    if (nextStatus !== live.pipelineStatus) {
      try {
        assertLeadTransition(live.pipelineStatus, nextStatus);
      } catch {
        return;
      }
    }

    await this.prisma.lead.update({
      where: { id: live.id },
      data: {
        stageId: pointers.stageId ?? live.stageId,
        pipelineId: pointers.pipelineId ?? live.pipelineId,
        pipelineStatus: nextStatus,
        lastContactedAt: new Date(),
        slaRespondBy: stage.slaMinutes
          ? new Date(Date.now() + stage.slaMinutes * 60_000)
          : undefined,
      },
    });
    await this.prisma.leadActivity.create({
      data: {
        organizationId: input.organizationId,
        leadId: live.id,
        action: 'STATUS_CHANGED',
        fromValue: live.pipelineStatus,
        toValue: nextStatus,
        metadata: {
          reason: `${input.qualification}_THRESHOLD`,
          stageId: stage.id,
        },
      },
    });
    this.events.broadcastLeadStatusChanged(input.organizationId, {
      leadId: live.id,
      name: live.name,
      previousStatus: live.pipelineStatus,
      pipelineStatus: nextStatus,
    });
    void this.automation.dispatch(input.organizationId, AutomationTriggerType.STAGE_CHANGED, {
      leadId: live.id,
      customerId: live.customerId,
      context: {
        stageId: stage.id,
        stageCode: nextStatus,
        previousStatus: live.pipelineStatus,
        crossed: input.qualification,
      },
      dedupeKey: `STAGE_CHANGED:${live.id}:${stage.id}:${input.qualification}`,
    });
  }

  private async onThresholdReached(input: {
    organizationId: string;
    lead: {
      id: string;
      name: string;
      pipelineStatus: LeadPipelineStatus;
      stageId: string | null;
      pipelineId: string | null;
      customerId: string | null;
      funnelRecommendationId?: string | null;
      branchId?: string | null;
      leadSourceId?: string | null;
    };
    crossed: 'MQL' | 'SQL';
    score: number;
    config: { mqlStageId: string | null; sqlStageId: string | null };
    assignedToId: string | null;
  }) {
    const targetStageId = input.crossed === 'SQL' ? input.config.sqlStageId : input.config.mqlStageId;
    const fallbackCode = input.crossed === 'SQL' ? LeadPipelineStatus.BOOKED : LeadPipelineStatus.QUALIFIED;

    let stage = targetStageId
      ? await this.prisma.funnelStage.findFirst({
          where: { id: targetStageId, organizationId: input.organizationId, isActive: true },
        })
      : await this.pipeline.resolveStageForStatus(
          input.organizationId,
          fallbackCode,
          input.lead.pipelineId ?? undefined,
        );

    await this.syncQualificationStage({
      organizationId: input.organizationId,
      leadId: input.lead.id,
      qualification: input.crossed,
      config: input.config,
    });

    await this.prisma.leadActivity.create({
      data: {
        organizationId: input.organizationId,
        leadId: input.lead.id,
        action: input.crossed === 'SQL' ? 'SQL_REACHED' : 'MQL_REACHED',
        toValue: String(input.score),
        metadata: { score: input.score, stageId: stage?.id ?? null },
      },
    });

    let assigneeId = input.assignedToId;
    if (!assigneeId) {
      const attr = await this.prisma.leadAttribution.findFirst({
        where: { leadId: input.lead.id },
        select: { adCampaignId: true },
      });
      assigneeId =
        (await this.assignment.autoAssign(input.organizationId, {
          branchId: input.lead.branchId,
          leadSourceId: input.lead.leadSourceId,
          adCampaignId: attr?.adCampaignId,
          score: input.score,
        })) ?? null;
      if (assigneeId) {
        await this.prisma.lead.update({
          where: { id: input.lead.id },
          data: { assignedToId: assigneeId },
        });
        await this.prisma.leadActivity.create({
          data: {
            organizationId: input.organizationId,
            leadId: input.lead.id,
            action: 'LEAD_ASSIGNED',
            toValue: assigneeId,
            metadata: { reason: `${input.crossed}_HANDOFF` },
          },
        });
      }
    }

    await this.prisma.crmTask.create({
      data: {
        organizationId: input.organizationId,
        leadId: input.lead.id,
        title:
          input.crossed === 'SQL'
            ? `SQL — gọi chốt lịch/lead ${input.lead.name}`
            : `MQL — liên hệ lead ${input.lead.name}`,
        dueAt: new Date(Date.now() + 15 * 60_000),
        source: 'lead-scoring',
      },
    });

    this.events.emitToOrg(input.organizationId, WS_EVENTS.LEAD_QUALIFIED, {
      leadId: input.lead.id,
      name: input.lead.name,
      qualification: input.crossed,
      score: input.score,
      assignedToId: assigneeId,
    });

    void this.canvasRuntime.advance({
      organizationId: input.organizationId,
      leadId: input.lead.id,
      event: input.crossed,
      funnelId: input.lead.funnelRecommendationId,
      stageCode: stage?.code ?? fallbackCode,
    });
  }

  private async isCoolingDown(
    organizationId: string,
    leadId: string,
    eventType: string,
    condition: unknown,
  ): Promise<boolean> {
    const c = (condition && typeof condition === 'object' ? condition : {}) as {
      once?: boolean;
      cooldownMinutes?: number;
    };
    if (!c.once && !c.cooldownMinutes) return false;
    const since = c.once
      ? new Date(0)
      : new Date(Date.now() - Math.max(1, c.cooldownMinutes ?? 0) * 60_000);
    const rows = await this.prisma.leadActivity.findMany({
      where: {
        organizationId,
        leadId,
        action: SCORE_EVENT_ACTION,
        createdAt: { gte: since },
      },
      select: { metadata: true },
      take: 40,
    });
    return rows.some((row) => {
      const meta = row.metadata as { eventType?: string } | null;
      return meta?.eventType === eventType;
    });
  }

  private async assertFunnel(organizationId: string, funnelId: string) {
    const rec = await this.prisma.funnelRecommendation.findFirst({
      where: { id: funnelId, organizationId },
      select: { id: true },
    });
    if (!rec) throw new NotFoundException('Funnel không tồn tại hoặc không thuộc tổ chức');
    return rec;
  }

  private async assertStage(organizationId: string, stageId: string) {
    const stage = await this.prisma.funnelStage.findFirst({
      where: { id: stageId, organizationId, isActive: true },
      select: { id: true },
    });
    if (!stage) throw new BadRequestException('Stage không hợp lệ');
  }
}
