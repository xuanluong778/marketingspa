import type { Job } from 'bullmq';
import { Queue } from 'bullmq';
import {
  AutomationTriggerType,
  FunnelPublishStatus,
  FunnelRuntimeLogStatus,
  LeadPipelineStatus,
  MarketingFunnelEventType,
  PaymentStatus,
  Prisma,
  prisma,
} from '@marketingspa/database';
import {
  canvasRuntimeIdempotencyKey,
  conversionForCanvasEvent,
  evaluateFunnelEdgeCondition,
  isFunnelPassthroughNode,
  mapCanvasEventToAutomationTrigger,
  mapConversionToFunnelEventType,
  parseFunnelCompleteSpec,
  readCanvasNodeMeta,
  resolveGoalConversion,
  selectCanvasTransitions,
  shouldAdvancePipeline,
  QUEUE_NAMES,
  type FunnelCanvasRuntimeContext,
  type FunnelCanvasRuntimeJobData,
} from '@marketingspa/shared';
import { bullConnection, queuePrefix } from '../config';
import { dispatchFunnelAutomation } from './dispatch-funnel-automation';
import { applyCanvasScoreDelta } from './apply-funnel-score';

const MAX_WALK = 16;
const LEGACY: Record<string, LeadPipelineStatus> = {
  NEW: LeadPipelineStatus.NEW,
  CONTACTED: LeadPipelineStatus.CONTACTED,
  QUALIFIED: LeadPipelineStatus.QUALIFIED,
  BOOKED: LeadPipelineStatus.BOOKED,
  CONFIRMED: LeadPipelineStatus.CONFIRMED,
  VISITED: LeadPipelineStatus.VISITED,
  PURCHASED: LeadPipelineStatus.PURCHASED,
  LOST: LeadPipelineStatus.LOST,
};

export async function processCanvasRuntime(job: Job) {
  const data = job.data as FunnelCanvasRuntimeJobData;
  if (!data?.organizationId || !data.leadId || !data.funnelId || !data.nodeId) {
    throw new Error('Invalid canvas runtime job');
  }
  const live = await loadLive(data.organizationId, data.leadId, data.funnelId);
  if (!live) return { skipped: true, reason: 'inactive' };
  if (live.funnel.publishedVersion !== data.publishedVersion) {
    return { skipped: true, reason: 'version_mismatch' };
  }
  const ctx: FunnelCanvasRuntimeContext = {
    event: data.event,
    branch: (data.branch as FunnelCanvasRuntimeContext['branch']) ?? (data.event === 'TIMEOUT' ? 'timeout' : 'default'),
    stageCode: live.lead.stage?.code ?? live.lead.pipelineStatus,
    pipelineStatus: live.lead.pipelineStatus,
    qualification: live.lead.qualification,
    score: live.lead.score,
    tags: live.lead.tags,
    conversion: conversionForCanvasEvent({ event: data.event }),
    revenue: data.revenue,
  };
  await enterNode(live, data.nodeId, ctx, data, data.edgeId ?? null, new Set(), 0);
  return { ok: true };
}

async function loadLive(organizationId: string, leadId: string, funnelId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId },
    include: { stage: { select: { code: true } } },
  });
  if (!lead) return null;
  const funnel = await prisma.funnelRecommendation.findFirst({
    where: { id: funnelId, organizationId, status: FunnelPublishStatus.ACTIVE },
  });
  if (!funnel) return null;
  const raw = funnel.publishedSpec ?? funnel.completeSpec;
  if (!raw) return null;
  const spec = parseFunnelCompleteSpec(raw);
  return { lead, funnel, spec };
}

type Live = NonNullable<Awaited<ReturnType<typeof loadLive>>>;

async function enterNode(
  live: Live,
  nodeId: string,
  ctx: FunnelCanvasRuntimeContext,
  extra: FunnelCanvasRuntimeJobData,
  edgeId: string | null,
  seen: Set<string>,
  depth: number,
) {
  extra = { ...extra, fromSchedule: extra.fromSchedule ?? true };
  if (depth > MAX_WALK) return;
  const node = live.spec.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  const walkKey = `${nodeId}:${String(ctx.event).toUpperCase()}`;
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
  const claimed = await claim(live, extra, {
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
    result = { ...result, ...(await executeNode(live, nodeId, ctx, extra)) };
    if (result.skipped) branch = 'default';
    const delta = readCanvasNodeMeta(node).scoreDelta;
    if (
      !result.scheduledDelay &&
      typeof delta === 'number' &&
      delta !== 0 &&
      result.reason !== 'condition_failed'
    ) {
      const scored = await applyCanvasScoreDelta({
        organizationId: extra.organizationId,
        leadId: extra.leadId,
        points: delta,
      });
      result.scoreDelta = scored;
      if (typeof scored.next === 'number') {
        live.lead.score = scored.next;
        ctx.score = scored.next;
      }
    }
  } catch (err) {
    await prisma.funnelRuntimeLog.update({
      where: { id: claimed.id },
      data: {
        status: FunnelRuntimeLogStatus.FAILED,
        executedAt: new Date(),
        branch: 'failure',
        result: { error: err instanceof Error ? err.message : String(err) } as Prisma.InputJsonValue,
      },
    });
    await follow(live, nodeId, { ...ctx, branch: 'failure', event: 'FAILURE' }, extra, seen, depth + 1);
    return;
  }

  await prisma.funnelRuntimeLog.update({
    where: { id: claimed.id },
    data: {
      status: FunnelRuntimeLogStatus.SUCCESS,
      executedAt: new Date(),
      branch: String(branch),
      result: result as Prisma.InputJsonValue,
    },
  });
  if (result.scheduledDelay) return;
  await follow(live, nodeId, { ...ctx, branch }, extra, seen, depth + 1);
}

async function follow(
  live: Live,
  fromNodeId: string,
  ctx: FunnelCanvasRuntimeContext,
  extra: FunnelCanvasRuntimeJobData,
  seen: Set<string>,
  depth: number,
) {
  for (const t of selectCanvasTransitions(live.spec, fromNodeId, ctx)) {
    if (t.kind === 'now') {
      await enterNode(
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
    await schedule(live, extra, t);
  }
}

async function schedule(
  live: Live,
  extra: FunnelCanvasRuntimeJobData,
  t: { edgeId: string; toNodeId: string; event: string; branch: string; delayMinutes: number },
) {
  const idempotencyKey = canvasRuntimeIdempotencyKey({
    funnelId: live.funnel.id,
    publishedVersion: live.funnel.publishedVersion,
    leadId: extra.leadId,
    nodeId: t.toNodeId,
    event: t.event,
    edgeId: t.edgeId,
  });
  try {
    await prisma.funnelRuntimeLog.create({
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
        scheduledFor: new Date(Date.now() + Math.max(0, t.delayMinutes) * 60_000),
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return;
    throw err;
  }
  const queue = new Queue(QUEUE_NAMES.AUTOMATION_MESSAGE, {
    connection: bullConnection,
    prefix: queuePrefix,
  });
  try {
    await queue.add(
      'run-canvas-runtime',
      {
        ...extra,
        nodeId: t.toNodeId,
        event: t.event,
        branch: t.branch,
        edgeId: t.edgeId,
      } satisfies FunnelCanvasRuntimeJobData,
      {
        jobId: `canvas:${idempotencyKey}`.slice(0, 120),
        delay: Math.max(0, t.delayMinutes) * 60_000,
        attempts: 3,
      },
    );
  } finally {
    await queue.close();
  }
}

async function claim(
  live: Live,
  extra: FunnelCanvasRuntimeJobData,
  row: { nodeId: string; edgeId: string | null; event: string; branch: string | null; idempotencyKey: string },
) {
  const existing = await prisma.funnelRuntimeLog.findUnique({
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
    if (
      existing.status === FunnelRuntimeLogStatus.SCHEDULED ||
      existing.status === FunnelRuntimeLogStatus.FAILED
    ) {
      return prisma.funnelRuntimeLog.update({
        where: { id: existing.id },
        data: { status: FunnelRuntimeLogStatus.PENDING },
      });
    }
    return null;
  }
  try {
    return await prisma.funnelRuntimeLog.create({
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

async function executeNode(
  live: Live,
  nodeId: string,
  ctx: FunnelCanvasRuntimeContext,
  extra: FunnelCanvasRuntimeJobData,
): Promise<Record<string, unknown>> {
  const node = live.spec.nodes.find((n) => n.id === nodeId)!;
  const nodeMeta = readCanvasNodeMeta(node);
  if (node.type === 'FORM' || isFunnelPassthroughNode(node.type)) {
    return { skipped: true, reason: 'passthrough' };
  }
  if (node.type === 'STAGE') {
    const code = (nodeMeta.stageCode || node.stage?.code || '').toUpperCase();
    if (!code && !nodeMeta.stageId) return { skipped: true, reason: 'no_stage_code' };
    const current = (live.lead.stage?.code || live.lead.pipelineStatus).toUpperCase();
    if (code && current === code) return { skipped: true, reason: 'already_at_stage', code };
    const stage =
      (nodeMeta.stageId
        ? await prisma.funnelStage.findFirst({
            where: { id: nodeMeta.stageId, organizationId: extra.organizationId, isActive: true },
          })
        : null) ??
      (code
        ? await prisma.funnelStage.findFirst({
            where: { organizationId: extra.organizationId, code, isActive: true },
          })
        : null);
    if (!stage) return { skipped: true, reason: 'stage_missing', code };
    const nextStatus = LEGACY[stage.code] ?? live.lead.pipelineStatus;
    if (
      nextStatus !== live.lead.pipelineStatus &&
      !shouldAdvancePipeline(live.lead.pipelineStatus, nextStatus)
    ) {
      return { skipped: true, reason: 'no_regress', from: live.lead.pipelineStatus, to: nextStatus };
    }
    await prisma.lead.update({
      where: { id: extra.leadId },
      data: {
        stageId: stage.id,
        pipelineId: stage.pipelineId,
        pipelineStatus: nextStatus,
        lostReason: stage.isLost ? 'funnel-canvas' : undefined,
        convertedAt: stage.isWon ? new Date() : undefined,
        lastContactedAt: new Date(),
      },
    });
    live.lead.pipelineStatus = nextStatus;
    await prisma.marketingFunnelEvent.create({
      data: {
        organizationId: extra.organizationId,
        funnelId: live.funnel.id,
        leadId: extra.leadId,
        eventType: MarketingFunnelEventType.STAGE_CHANGED,
        idempotencyKey: `CANVAS_STAGE:${live.funnel.id}:${extra.leadId}:${stage.code}`,
        metadata: { nodeId, from: current, to: stage.code, source: 'funnel-canvas' },
      },
    }).catch((err) => {
      if ((err as { code?: string }).code !== 'P2002') throw err;
    });
    void dispatchFunnelAutomation(extra.organizationId, AutomationTriggerType.STAGE_CHANGED, {
      leadId: extra.leadId,
      customerId: live.lead.customerId,
      context: { stageId: stage.id, stageCode: nextStatus, previousStatus: current },
      dedupeKey: `STAGE_CHANGED:${extra.leadId}:${stage.id}`,
    });
    return { applied: true, code: stage.code };
  }

  if (node.type === 'BOOKING') {
    const bookingEvent = nodeMeta.bookingEvent ?? 'BOOKING_CREATED';
    const eventType =
      bookingEvent === 'BOOKING_CONFIRMED'
        ? MarketingFunnelEventType.APPOINTMENT_CONFIRMED
        : bookingEvent === 'BOOKING_CANCELLED'
          ? MarketingFunnelEventType.APPOINTMENT_CANCELLED
          : bookingEvent === 'VISIT' || bookingEvent === 'BOOKING_COMPLETED'
            ? MarketingFunnelEventType.CUSTOMER_ARRIVED
            : MarketingFunnelEventType.APPOINTMENT_BOOKED;
    await prisma.marketingFunnelEvent.create({
      data: {
        organizationId: extra.organizationId,
        funnelId: live.funnel.id,
        leadId: extra.leadId,
        eventType,
        appointmentId: extra.appointmentId ?? undefined,
        idempotencyKey: `CANVAS_BOOKING:${live.funnel.id}:${extra.leadId}:${nodeId}:${bookingEvent}`,
        metadata: { nodeId, bookingEvent, source: 'funnel-canvas' },
      },
    }).catch((err) => {
      if ((err as { code?: string }).code !== 'P2002') throw err;
    });
    return { bookingEvent };
  }

  if (node.type === 'AUTOMATION') {
    const inbound = String(ctx.event);
    const mapped = mapCanvasEventToAutomationTrigger(inbound);
    const metaTrigger = String(nodeMeta.triggerType ?? '');
    const delayed = Boolean(extra.fromSchedule);
    let triggerName =
      metaTrigger ||
      (inbound === 'TIMEOUT' || inbound === 'LEAD_UNTOUCHED' ? 'LEAD_UNTOUCHED' : mapped);
    if (!triggerName) return { skipped: true, reason: 'no_trigger' };
    if (
      (inbound === 'FORM_SUBMITTED' || inbound === 'LEAD_CREATED') &&
      triggerName === 'LEAD_CREATED'
    ) {
      if (!delayed) {
        return { skipped: true, reason: 'already_dispatched_on_lead_create' };
      }
      triggerName = 'LEAD_UNTOUCHED';
    }
    const trigger = triggerName as AutomationTriggerType;
    void dispatchFunnelAutomation(extra.organizationId, trigger, {
      leadId: extra.leadId,
      customerId: live.lead.customerId,
      appointmentId: extra.appointmentId,
      flowId: nodeMeta.flowId,
      context: { canvasNodeId: nodeId, event: inbound },
      dedupeKey: `CANVAS_AUTO:${live.funnel.id}:${nodeId}:${extra.leadId}:${triggerName}`,
    });
    return { dispatched: triggerName, flowId: nodeMeta.flowId ?? null };
  }

  if (node.type === 'GOAL') {
    const conversion = resolveGoalConversion(node, live.spec, ctx);
    if (!conversion) return { skipped: true, reason: 'no_conversion' };
    const eventType = mapConversionToFunnelEventType(conversion) as MarketingFunnelEventType;
    let revenue = extra.revenue ?? null;
    let orderId = extra.orderId ?? null;
    let paymentId = extra.paymentId ?? null;
    if (conversion === 'PURCHASE' && revenue == null) {
      const payment = await prisma.payment.findFirst({
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
      }
    }
    await prisma.marketingFunnelEvent.create({
      data: {
        organizationId: extra.organizationId,
        funnelId: live.funnel.id,
        leadId: extra.leadId,
        eventType,
        amount: revenue != null ? new Prisma.Decimal(revenue) : undefined,
        orderId: orderId ?? undefined,
        paymentId: paymentId ?? undefined,
        appointmentId: extra.appointmentId ?? undefined,
        idempotencyKey: `CANVAS_GOAL:${live.funnel.id}:${extra.leadId}:${conversion}:${nodeId}`,
        metadata: { conversion, nodeId, source: 'funnel-canvas', revenue },
      },
    }).catch((err) => {
      if ((err as { code?: string }).code !== 'P2002') throw err;
    });
    return { conversion, revenue };
  }

  if (node.type === 'RETARGET') {
    if (nodeMeta.conditionField) {
      const ok = evaluateFunnelEdgeCondition(
        {
          field: nodeMeta.conditionField,
          op: (nodeMeta.conditionOp as 'gte') ?? 'gte',
          value: nodeMeta.conditionValue ?? 0,
        },
        ctx,
      );
      if (!ok) return { skipped: true, reason: 'condition_failed' };
    }
    if ((nodeMeta.delayMinutes ?? 0) > 0 && !extra.fromSchedule) {
      await schedule(live, extra, {
        edgeId: `node-delay:${nodeId}`,
        toNodeId: nodeId,
        event: String(ctx.event || 'LEAD_UNTOUCHED'),
        branch: 'default',
        delayMinutes: nodeMeta.delayMinutes ?? 0,
      });
      return { scheduledDelay: true, delayMinutes: nodeMeta.delayMinutes, skipped: true };
    }
    const capDays = live.spec.remarketing?.frequencyCapDays ?? 7;
    const source = `funnel-canvas-retarget:${live.funnel.id}:${nodeId}`;
    const existing = await prisma.crmTask.findFirst({
      where: {
        organizationId: extra.organizationId,
        leadId: extra.leadId,
        source,
        createdAt: { gte: new Date(Date.now() - capDays * 24 * 60 * 60_000) },
      },
    });
    if (existing) return { skipped: true, reason: 'frequency_cap', taskId: existing.id };
    const audience = live.spec.remarketing?.audiences?.find((a) => a.key === nodeMeta.audienceKey);
    const task = await prisma.crmTask.create({
      data: {
        organizationId: extra.organizationId,
        leadId: extra.leadId,
        customerId: live.lead.customerId,
        title: `Remarketing: ${audience?.label || live.spec.remarketing?.offer || live.spec.offer}`.slice(0, 160),
        dueAt: new Date(Date.now() + 60 * 60_000),
        source,
      },
    });
    const trigger = (nodeMeta.triggerType &&
    Object.values(AutomationTriggerType).includes(nodeMeta.triggerType as AutomationTriggerType)
      ? nodeMeta.triggerType
      : 'LEAD_UNTOUCHED') as AutomationTriggerType;
    void dispatchFunnelAutomation(extra.organizationId, trigger, {
      leadId: extra.leadId,
      customerId: live.lead.customerId,
      flowId: nodeMeta.flowId,
      context: { canvasNodeId: nodeId, event: String(ctx.event), audienceKey: nodeMeta.audienceKey ?? '' },
      dedupeKey: `CANVAS_RETARGET:${live.funnel.id}:${nodeId}:${extra.leadId}`,
    });
    return { taskId: task.id, ads: false, audienceKey: nodeMeta.audienceKey ?? null };
  }

  return { skipped: true, reason: 'noop' };
}
