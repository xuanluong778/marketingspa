import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import {
  AutomationTriggerType,
  FunnelPublishStatus,
  FunnelRuntimeLogStatus,
  LeadPipelineStatus,
  MarketingFunnelEventType,
  PaymentStatus,
  Prisma,
} from '@marketingspa/database';
import {
  canvasRuntimeIdempotencyKey,
  conversionForCanvasEvent,
  entryCanvasNodeIds,
  evaluateFunnelEdgeCondition,
  isFunnelPassthroughNode,
  mapCanvasEventToAutomationTrigger,
  mapConversionToFunnelEventType,
  parseFunnelCompleteSpec,
  readCanvasNodeMeta,
  resolveGoalConversion,
  selectCanvasTransitions,
  shouldAdvancePipeline,
  type FunnelCanvasRuntimeContext,
  type FunnelCanvasRuntimeJobData,
} from '@marketingspa/shared';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AUTOMATION_MESSAGE_QUEUE } from '../queue/queue.constants';
import { QueueEnqueueService } from '../common/services/queue-enqueue.service';
import { PipelineService } from './pipeline.service';
import { AutomationEngineService } from './automation-engine.service';
import { CustomerJourneyService } from './customer-journey.service';
import { LeadScoringService } from './lead-scoring.service';
import { assertLeadTransition } from '../common/utils/status-transitions.util';

const MAX_WALK = 16;

@Injectable()
export class FunnelCanvasRuntimeService {
  private readonly logger = new Logger(FunnelCanvasRuntimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: PipelineService,
    private readonly automation: AutomationEngineService,
    private readonly journey: CustomerJourneyService,
    private readonly queueEnqueue: QueueEnqueueService,
    @Inject(AUTOMATION_MESSAGE_QUEUE) private readonly queue: Queue,
    @Inject(forwardRef(() => LeadScoringService))
    private readonly scoring: LeadScoringService,
  ) {}

  async advance(input: {
    organizationId: string;
    leadId: string;
    event: string;
    funnelId?: string | null;
    branch?: string;
    stageCode?: string | null;
    previousStatus?: string | null;
    appointmentId?: string | null;
    orderId?: string | null;
    paymentId?: string | null;
    revenue?: number | null;
  }) {
    try {
      const live = await this.loadLive(input.organizationId, input.leadId, input.funnelId);
      if (!live) return { skipped: true, reason: 'inactive' };
      const ev = normalize(input.event);
      if (ev === 'FORM_SUBMITTED' || ev === 'LEAD_CREATED' || ev === 'CTA_CLICK') {
        const prior = await this.prisma.funnelRuntimeLog.findFirst({
          where: {
            organizationId: input.organizationId,
            funnelId: live.funnel.id,
            leadId: input.leadId,
            event: ev,
            publishedVersion: live.funnel.publishedVersion,
            status: FunnelRuntimeLogStatus.SUCCESS,
          },
          select: { id: true },
        });
        if (prior) return { skipped: true, reason: 'duplicate_event' };
      }
      const ctx = this.contextFromLead(live.lead, input);
      const entries = entryCanvasNodeIds(live.spec, ctx);
      const seen = new Set<string>();
      for (const nodeId of entries) {
        await this.enterNode(live, nodeId, ctx, input, null, seen, 0);
      }
      return { ok: true, entries: entries.length };
    } catch (err) {
      this.logger.warn(
        `Canvas advance failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { skipped: true, reason: 'error' };
    }
  }

  async continueJob(data: FunnelCanvasRuntimeJobData) {
    const live = await this.loadLive(data.organizationId, data.leadId, data.funnelId);
    if (!live) return { skipped: true, reason: 'inactive' };
    if (live.funnel.publishedVersion !== data.publishedVersion) {
      return { skipped: true, reason: 'version_mismatch' };
    }
    const ctx = this.contextFromLead(live.lead, {
      ...data,
      branch: data.branch ?? (data.event === 'TIMEOUT' ? 'timeout' : 'default'),
    });
    await this.enterNode(
      live,
      data.nodeId,
      ctx,
      { ...data, fromSchedule: true },
      data.edgeId ?? null,
      new Set(),
      0,
    );
    return { ok: true };
  }

  async listLogs(organizationId: string, funnelId: string, leadId?: string) {
    const funnel = await this.prisma.funnelRecommendation.findFirst({
      where: { id: funnelId, organizationId },
      select: { id: true },
    });
    if (!funnel) return [];
    return this.prisma.funnelRuntimeLog.findMany({
      where: {
        organizationId,
        funnelId,
        ...(leadId ? { leadId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  private contextFromLead(
    lead: {
      pipelineStatus: LeadPipelineStatus;
      qualification: string | null;
      score: number;
      tags: string[];
      stage: { code: string } | null;
    },
    input: {
      event: string;
      branch?: string;
      stageCode?: string | null;
      previousStatus?: string | null;
      revenue?: number | null;
    },
  ): FunnelCanvasRuntimeContext {
    return {
      event: input.event,
      branch: input.branch as FunnelCanvasRuntimeContext['branch'],
      stageCode: input.stageCode ?? lead.stage?.code ?? lead.pipelineStatus,
      previousStatus: input.previousStatus,
      pipelineStatus: lead.pipelineStatus,
      qualification: lead.qualification,
      score: lead.score,
      tags: lead.tags,
      conversion: conversionForCanvasEvent({ event: input.event }),
      revenue: input.revenue,
    };
  }

  private async loadLive(organizationId: string, leadId: string, funnelId?: string | null) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, organizationId },
      include: { stage: { select: { code: true } } },
    });
    if (!lead) return null;
    const id = funnelId || lead.funnelRecommendationId;
    if (!id) return null;
    const funnel = await this.prisma.funnelRecommendation.findFirst({
      where: { id, organizationId, status: FunnelPublishStatus.ACTIVE },
    });
    if (!funnel) return null;
    const raw = funnel.publishedSpec ?? funnel.completeSpec;
    if (!raw) return null;
    const spec = parseFunnelCompleteSpec(raw);
    return { lead, funnel, spec };
  }

  private async enterNode(
    live: NonNullable<Awaited<ReturnType<FunnelCanvasRuntimeService['loadLive']>>>,
    nodeId: string,
    ctx: FunnelCanvasRuntimeContext,
    extra: {
      organizationId: string;
      leadId: string;
      appointmentId?: string | null;
      orderId?: string | null;
      paymentId?: string | null;
      revenue?: number | null;
      fromSchedule?: boolean;
    },
    edgeId: string | null,
    seen: Set<string>,
    depth: number,
  ) {
    if (depth > MAX_WALK) return;
    const node = live.spec.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const walkKey = `${nodeId}:${normalize(ctx.event)}`;
    if (seen.has(walkKey)) return;
    seen.add(walkKey);

    const idempotencyKey = canvasRuntimeIdempotencyKey({
      funnelId: live.funnel.id,
      publishedVersion: live.funnel.publishedVersion,
      leadId: extra.leadId,
      nodeId,
      event: String(ctx.event),
      edgeId,
    });

    const claimed = await this.claim(live, extra, {
      nodeId,
      edgeId,
      event: String(ctx.event),
      branch: ctx.branch ? String(ctx.branch) : null,
      idempotencyKey,
    });
    if (!claimed) return;

    let branch: FunnelCanvasRuntimeContext['branch'] = 'success';
    let result: Record<string, unknown> = { nodeType: node.type };
    try {
      result = { ...result, ...(await this.executeNode(live, nodeId, ctx, extra)) };
      if (result.skipped) branch = 'default';
      const delta = readCanvasNodeMeta(node).scoreDelta;
      if (
        !result.scheduledDelay &&
        typeof delta === 'number' &&
        delta !== 0 &&
        result.reason !== 'condition_failed'
      ) {
        const scored = await this.scoring.applyCanvasScoreDelta(
          extra.organizationId,
          extra.leadId,
          delta,
        );
        result.scoreDelta = scored;
        if (typeof scored.next === 'number') {
          live.lead.score = scored.next;
          ctx.score = scored.next;
        }
        if (typeof scored.qualification === 'string' || scored.qualification === null) {
          live.lead.qualification = scored.qualification;
          ctx.qualification = scored.qualification;
        }
      }
    } catch (err) {
      branch = 'failure';
      result.error = err instanceof Error ? err.message : String(err);
      await this.prisma.funnelRuntimeLog.update({
        where: { id: claimed.id },
        data: {
          status: FunnelRuntimeLogStatus.FAILED,
          executedAt: new Date(),
          result: result as Prisma.InputJsonValue,
          branch: 'failure',
        },
      });
      await this.follow(live, nodeId, { ...ctx, branch: 'failure', event: 'FAILURE' }, extra, seen, depth + 1);
      return;
    }

    await this.prisma.funnelRuntimeLog.update({
      where: { id: claimed.id },
      data: {
        status: FunnelRuntimeLogStatus.SUCCESS,
        executedAt: new Date(),
        result: result as Prisma.InputJsonValue,
        branch: String(branch),
      },
    });

    if (result.scheduledDelay) return;

    await this.follow(
      live,
      nodeId,
      { ...ctx, branch },
      extra,
      seen,
      depth + 1,
    );
  }

  private async follow(
    live: NonNullable<Awaited<ReturnType<FunnelCanvasRuntimeService['loadLive']>>>,
    fromNodeId: string,
    ctx: FunnelCanvasRuntimeContext,
    extra: {
      organizationId: string;
      leadId: string;
      appointmentId?: string | null;
      orderId?: string | null;
      paymentId?: string | null;
      revenue?: number | null;
    },
    seen: Set<string>,
    depth: number,
  ) {
    const transitions = selectCanvasTransitions(live.spec, fromNodeId, ctx);
    for (const t of transitions) {
      if (t.kind === 'now') {
        await this.enterNode(
          live,
          t.toNodeId,
          { ...ctx, event: t.event, branch: t.branch === 'default' ? ctx.branch : t.branch },
          extra,
          t.edgeId,
          seen,
          depth,
        );
        continue;
      }
      await this.schedule(live, extra, t);
    }
  }

  private async schedule(
    live: NonNullable<Awaited<ReturnType<FunnelCanvasRuntimeService['loadLive']>>>,
    extra: {
      organizationId: string;
      leadId: string;
      appointmentId?: string | null;
      orderId?: string | null;
      paymentId?: string | null;
      revenue?: number | null;
    },
    t: {
      edgeId: string;
      toNodeId: string;
      event: string;
      branch: string;
      delayMinutes: number;
    },
  ) {
    const idempotencyKey = canvasRuntimeIdempotencyKey({
      funnelId: live.funnel.id,
      publishedVersion: live.funnel.publishedVersion,
      leadId: extra.leadId,
      nodeId: t.toNodeId,
      event: t.event,
      edgeId: t.edgeId,
    });
    const scheduledFor = new Date(Date.now() + Math.max(0, t.delayMinutes) * 60_000);
    try {
      await this.prisma.funnelRuntimeLog.create({
        data: {
          organizationId: extra.organizationId,
          funnelId: live.funnel.id,
          leadId: extra.leadId,
          nodeId: t.toNodeId,
          edgeId: t.edgeId,
          event: t.event,
          branch: t.branch,
          status: FunnelRuntimeLogStatus.SCHEDULED,
          publishedVersion: live.funnel.publishedVersion,
          idempotencyKey,
          scheduledFor,
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') return;
      throw err;
    }
    const payload: FunnelCanvasRuntimeJobData = {
      organizationId: extra.organizationId,
      funnelId: live.funnel.id,
      leadId: extra.leadId,
      nodeId: t.toNodeId,
      event: t.event,
      branch: t.branch,
      edgeId: t.edgeId,
      publishedVersion: live.funnel.publishedVersion,
      appointmentId: extra.appointmentId,
      orderId: extra.orderId,
      paymentId: extra.paymentId,
      revenue: extra.revenue,
      fromSchedule: true,
    };
    await this.queueEnqueue.add(
      this.queue,
      'run-canvas-runtime',
      payload,
      {
        jobId: `canvas:${idempotencyKey}`.slice(0, 120),
        delay: Math.max(0, t.delayMinutes) * 60_000,
        attempts: 3,
        backoff: { type: 'exponential', delay: 15_000 },
        removeOnComplete: 200,
        removeOnFail: 100,
      },
    );
  }

  private async claim(
    live: NonNullable<Awaited<ReturnType<FunnelCanvasRuntimeService['loadLive']>>>,
    extra: { organizationId: string; leadId: string },
    row: {
      nodeId: string;
      edgeId: string | null;
      event: string;
      branch: string | null;
      idempotencyKey: string;
    },
  ) {
    const existing = await this.prisma.funnelRuntimeLog.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: extra.organizationId,
          idempotencyKey: row.idempotencyKey,
        },
      },
    });
    if (existing) {
      if (
        existing.status === FunnelRuntimeLogStatus.SUCCESS ||
        existing.status === FunnelRuntimeLogStatus.SKIPPED ||
        existing.status === FunnelRuntimeLogStatus.PENDING
      ) {
        return null;
      }
      if (existing.status === FunnelRuntimeLogStatus.SCHEDULED) {
        return this.prisma.funnelRuntimeLog.update({
          where: { id: existing.id },
          data: { status: FunnelRuntimeLogStatus.PENDING },
        });
      }
      if (existing.status === FunnelRuntimeLogStatus.FAILED) {
        return this.prisma.funnelRuntimeLog.update({
          where: { id: existing.id },
          data: { status: FunnelRuntimeLogStatus.PENDING, result: Prisma.JsonNull },
        });
      }
      return null;
    }
    try {
      return await this.prisma.funnelRuntimeLog.create({
        data: {
          organizationId: extra.organizationId,
          funnelId: live.funnel.id,
          leadId: extra.leadId,
          nodeId: row.nodeId,
          edgeId: row.edgeId,
          event: row.event,
          branch: row.branch,
          status: FunnelRuntimeLogStatus.PENDING,
          publishedVersion: live.funnel.publishedVersion,
          idempotencyKey: row.idempotencyKey,
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') return null;
      throw err;
    }
  }

  private async executeNode(
    live: NonNullable<Awaited<ReturnType<FunnelCanvasRuntimeService['loadLive']>>>,
    nodeId: string,
    ctx: FunnelCanvasRuntimeContext,
    extra: {
      organizationId: string;
      leadId: string;
      appointmentId?: string | null;
      orderId?: string | null;
      paymentId?: string | null;
      revenue?: number | null;
      fromSchedule?: boolean;
    },
  ): Promise<Record<string, unknown>> {
    const node = live.spec.nodes.find((n) => n.id === nodeId)!;
    if (node.type === 'FORM' || isFunnelPassthroughNode(node.type)) {
      return { skipped: true, reason: 'passthrough' };
    }
    if (node.type === 'STAGE') return this.executeStage(live, nodeId, extra);
    if (node.type === 'BOOKING') return this.executeBooking(live, nodeId, extra);
    if (node.type === 'AUTOMATION') return this.executeAutomation(live, nodeId, ctx, extra);
    if (node.type === 'GOAL') return this.executeGoal(live, nodeId, ctx, extra);
    if (node.type === 'RETARGET') return this.executeRetarget(live, nodeId, ctx, extra);
    return { skipped: true, reason: 'noop' };
  }

  private async executeStage(
    live: NonNullable<Awaited<ReturnType<FunnelCanvasRuntimeService['loadLive']>>>,
    nodeId: string,
    extra: { organizationId: string; leadId: string },
  ) {
    const fresh = await this.prisma.lead.findFirst({
      where: { id: extra.leadId, organizationId: extra.organizationId },
      include: { stage: { select: { code: true } } },
    });
    if (fresh) {
      live.lead.pipelineStatus = fresh.pipelineStatus;
      live.lead.stageId = fresh.stageId;
      live.lead.pipelineId = fresh.pipelineId;
      live.lead.stage = fresh.stage;
    }
    const node = live.spec.nodes.find((n) => n.id === nodeId)!;
    const meta = readCanvasNodeMeta(node);
    const code = (meta.stageCode || node.stage?.code || '').toUpperCase();
    if (!code && !meta.stageId) return { skipped: true, reason: 'no_stage_code' };
    const current = (live.lead.stage?.code || live.lead.pipelineStatus).toUpperCase();
    if (code && current === code) return { skipped: true, reason: 'already_at_stage', code };

    const stage =
      (meta.stageId
        ? await this.prisma.funnelStage.findFirst({
            where: { id: meta.stageId, organizationId: extra.organizationId, isActive: true },
          })
        : null) ??
      (code
        ? await this.prisma.funnelStage.findFirst({
            where: { organizationId: extra.organizationId, code, isActive: true },
          })
        : null) ??
      (await this.pipeline.resolveStageForStatus(
        extra.organizationId,
        (code || current) as LeadPipelineStatus,
        live.lead.pipelineId ?? undefined,
      ));
    if (!stage) return { skipped: true, reason: 'stage_missing', code };

    const pointers = this.pipeline.leadPointersFromStage(stage);
    const nextStatus = pointers.pipelineStatus ?? live.lead.pipelineStatus;
    if (nextStatus !== live.lead.pipelineStatus) {
      if (!shouldAdvancePipeline(live.lead.pipelineStatus, nextStatus)) {
        return { skipped: true, reason: 'no_regress', from: live.lead.pipelineStatus, to: nextStatus };
      }
      try {
        assertLeadTransition(live.lead.pipelineStatus, nextStatus);
      } catch {
        throw new Error(`Invalid stage ${live.lead.pipelineStatus} → ${nextStatus}`);
      }
    }

    await this.prisma.lead.update({
      where: { id: extra.leadId },
      data: {
        stageId: pointers.stageId ?? live.lead.stageId,
        pipelineId: pointers.pipelineId ?? live.lead.pipelineId,
        pipelineStatus: nextStatus,
        lostReason: stage.isLost ? 'funnel-canvas' : undefined,
        convertedAt: stage.isWon ? new Date() : undefined,
        lastContactedAt: new Date(),
      },
    });
    live.lead.pipelineStatus = nextStatus;
    if (live.lead.stage) live.lead.stage.code = code;

    await this.journey.recordJourneyStep({
      organizationId: extra.organizationId,
      leadId: extra.leadId,
      funnelId: live.funnel.id,
      eventType: MarketingFunnelEventType.STAGE_CHANGED,
      idempotencyKey: `CANVAS_STAGE:${live.funnel.id}:${extra.leadId}:${code}`,
      metadata: { nodeId, from: current, to: code, source: 'funnel-canvas' },
    });

    void this.automation.dispatch(extra.organizationId, AutomationTriggerType.STAGE_CHANGED, {
      leadId: extra.leadId,
      customerId: live.lead.customerId,
      context: {
        stageId: stage.id,
        stageCode: nextStatus,
        previousStatus: current,
      },
      dedupeKey: `STAGE_CHANGED:${extra.leadId}:${stage.id}`,
    });

    return { applied: true, code };
  }

  private async executeAutomation(
    live: NonNullable<Awaited<ReturnType<FunnelCanvasRuntimeService['loadLive']>>>,
    nodeId: string,
    ctx: FunnelCanvasRuntimeContext,
    extra: { organizationId: string; leadId: string; appointmentId?: string | null; fromSchedule?: boolean },
  ) {
    const node = live.spec.nodes.find((n) => n.id === nodeId)!;
    const inbound = String(ctx.event);
    const mapped = mapCanvasEventToAutomationTrigger(inbound);
    const nodeMeta = readCanvasNodeMeta(node);
    const metaTrigger = String(nodeMeta.triggerType ?? '');
    const delayed = Boolean(
      extra && 'fromSchedule' in extra && (extra as { fromSchedule?: boolean }).fromSchedule,
    );
    let triggerName =
      metaTrigger ||
      (inbound === 'TIMEOUT' || inbound === 'LEAD_UNTOUCHED'
        ? 'LEAD_UNTOUCHED'
        : mapped);
    if (!triggerName) return { skipped: true, reason: 'no_trigger' };

    if ((inbound === 'FORM_SUBMITTED' || inbound === 'LEAD_CREATED') && triggerName === 'LEAD_CREATED') {
      if (!delayed) {
        return { skipped: true, reason: 'already_dispatched_on_lead_create', trigger: triggerName };
      }
      triggerName = 'LEAD_UNTOUCHED';
    }

    const trigger = triggerName as AutomationTriggerType;
    if (!Object.values(AutomationTriggerType).includes(trigger)) {
      return { skipped: true, reason: 'unknown_trigger', trigger: triggerName };
    }

    void this.automation.dispatch(extra.organizationId, trigger, {
      leadId: extra.leadId,
      customerId: live.lead.customerId,
      appointmentId: extra.appointmentId,
      flowId: nodeMeta.flowId,
      delayMinutesOverride: nodeMeta.delayMinutes,
      context: {
        canvasNodeId: nodeId,
        event: inbound,
        stageCode: String(ctx.stageCode ?? ''),
      },
      dedupeKey: `CANVAS_AUTO:${live.funnel.id}:${nodeId}:${extra.leadId}:${triggerName}`,
    });
    return { dispatched: triggerName, flowId: nodeMeta.flowId ?? null };
  }

  private async executeBooking(
    live: NonNullable<Awaited<ReturnType<FunnelCanvasRuntimeService['loadLive']>>>,
    nodeId: string,
    extra: { organizationId: string; leadId: string; appointmentId?: string | null },
  ) {
    const node = live.spec.nodes.find((n) => n.id === nodeId)!;
    const bookingEvent = readCanvasNodeMeta(node).bookingEvent ?? 'BOOKING_CREATED';
    const eventType =
      bookingEvent === 'BOOKING_CONFIRMED'
        ? MarketingFunnelEventType.APPOINTMENT_CONFIRMED
        : bookingEvent === 'BOOKING_CANCELLED'
          ? MarketingFunnelEventType.APPOINTMENT_CANCELLED
          : bookingEvent === 'VISIT' || bookingEvent === 'BOOKING_COMPLETED'
            ? MarketingFunnelEventType.CUSTOMER_ARRIVED
            : MarketingFunnelEventType.APPOINTMENT_BOOKED;
    await this.journey.recordJourneyStep({
      organizationId: extra.organizationId,
      leadId: extra.leadId,
      funnelId: live.funnel.id,
      eventType,
      appointmentId: extra.appointmentId,
      idempotencyKey: `CANVAS_BOOKING:${live.funnel.id}:${extra.leadId}:${nodeId}:${bookingEvent}`,
      metadata: { nodeId, bookingEvent, source: 'funnel-canvas' },
    });
    return { bookingEvent };
  }

  private async executeGoal(
    live: NonNullable<Awaited<ReturnType<FunnelCanvasRuntimeService['loadLive']>>>,
    nodeId: string,
    ctx: FunnelCanvasRuntimeContext,
    extra: {
      organizationId: string;
      leadId: string;
      appointmentId?: string | null;
      orderId?: string | null;
      paymentId?: string | null;
      revenue?: number | null;
    },
  ) {
    const node = live.spec.nodes.find((n) => n.id === nodeId)!;
    const conversion = resolveGoalConversion(node, live.spec, ctx);
    if (!conversion) return { skipped: true, reason: 'no_conversion' };
    const eventName = mapConversionToFunnelEventType(conversion);
    const eventType = eventName as MarketingFunnelEventType;

    let revenue = extra.revenue ?? null;
    let orderId = extra.orderId ?? null;
    let paymentId = extra.paymentId ?? null;
    if (conversion === 'PURCHASE' && revenue == null) {
      const payment = await this.prisma.payment.findFirst({
        where: {
          organizationId: extra.organizationId,
          status: PaymentStatus.COMPLETED,
          order: { leadId: extra.leadId },
        },
        orderBy: { paidAt: 'desc' },
        select: { id: true, amount: true, orderId: true },
      });
      if (payment) {
        revenue = Number(payment.amount);
        orderId = payment.orderId;
        paymentId = payment.id;
      } else {
        const order = await this.prisma.order.findFirst({
          where: { organizationId: extra.organizationId, leadId: extra.leadId },
          orderBy: { createdAt: 'desc' },
          select: { id: true, total: true },
        });
        if (order) {
          revenue = Number(order.total);
          orderId = order.id;
        }
      }
    }

    await this.journey.recordJourneyStep({
      organizationId: extra.organizationId,
      leadId: extra.leadId,
      funnelId: live.funnel.id,
      eventType,
      idempotencyKey: `CANVAS_GOAL:${live.funnel.id}:${extra.leadId}:${conversion}:${nodeId}`,
      amount: revenue,
      appointmentId: extra.appointmentId,
      orderId,
      paymentId,
      metadata: {
        conversion,
        nodeId,
        source: 'funnel-canvas',
        revenue,
      },
    });
    return { conversion, revenue };
  }

  private async executeRetarget(
    live: NonNullable<Awaited<ReturnType<FunnelCanvasRuntimeService['loadLive']>>>,
    nodeId: string,
    ctx: FunnelCanvasRuntimeContext,
    extra: {
      organizationId: string;
      leadId: string;
      appointmentId?: string | null;
      orderId?: string | null;
      paymentId?: string | null;
      revenue?: number | null;
      fromSchedule?: boolean;
    },
  ) {
    const node = live.spec.nodes.find((n) => n.id === nodeId)!;
    const meta = readCanvasNodeMeta(node);
    if (meta.conditionField) {
      const ok = evaluateFunnelEdgeCondition(
        {
          field: meta.conditionField,
          op: (meta.conditionOp as 'gte') ?? 'gte',
          value: meta.conditionValue ?? 0,
        },
        ctx,
      );
      if (!ok) return { skipped: true, reason: 'condition_failed' };
    }

    if ((meta.delayMinutes ?? 0) > 0 && !extra.fromSchedule) {
      await this.schedule(live, extra, {
        edgeId: `node-delay:${nodeId}`,
        toNodeId: nodeId,
        event: String(ctx.event || 'LEAD_UNTOUCHED'),
        branch: 'default',
        delayMinutes: meta.delayMinutes ?? 0,
      });
      return { scheduledDelay: true, delayMinutes: meta.delayMinutes, skipped: true };
    }

    const capDays = live.spec.remarketing?.frequencyCapDays ?? 7;
    const since = new Date(Date.now() - capDays * 24 * 60 * 60_000);
    const source = `funnel-canvas-retarget:${live.funnel.id}:${nodeId}`;
    const existing = await this.prisma.crmTask.findFirst({
      where: {
        organizationId: extra.organizationId,
        leadId: extra.leadId,
        source,
        createdAt: { gte: since },
      },
    });
    if (existing) return { skipped: true, reason: 'frequency_cap', taskId: existing.id };

    const audience = live.spec.remarketing?.audiences?.find((a) => a.key === meta.audienceKey);
    const offer = audience?.label || live.spec.remarketing?.offer || live.spec.offer;
    const task = await this.prisma.crmTask.create({
      data: {
        organizationId: extra.organizationId,
        leadId: extra.leadId,
        customerId: live.lead.customerId,
        title: `Remarketing: ${offer}`.slice(0, 160),
        dueAt: new Date(Date.now() + 60 * 60_000),
        source,
      },
    });

    const trigger = (meta.triggerType &&
    Object.values(AutomationTriggerType).includes(meta.triggerType as AutomationTriggerType)
      ? meta.triggerType
      : 'LEAD_UNTOUCHED') as AutomationTriggerType;
    void this.automation.dispatch(extra.organizationId, trigger, {
      leadId: extra.leadId,
      customerId: live.lead.customerId,
      flowId: meta.flowId,
      context: {
        canvasNodeId: nodeId,
        event: String(ctx.event),
        audienceKey: meta.audienceKey ?? '',
      },
      dedupeKey: `CANVAS_RETARGET:${live.funnel.id}:${nodeId}:${extra.leadId}`,
    });

    return { taskId: task.id, ads: false, audienceKey: meta.audienceKey ?? null };
  }
}

function normalize(v: string) {
  return v.trim().toUpperCase();
}
