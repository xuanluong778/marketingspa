import {
  AutomationTriggerType,
  LeadPipelineStatus,
  prisma,
} from '@marketingspa/database';
import {
  applyScoreDelta,
  detectAskPrice,
  qualificationAfterScore,
  shouldAdvancePipeline,
  WS_EVENTS,
  type FunnelScoringEventType,
} from '@marketingspa/shared';
import type Redis from 'ioredis';
import { publishRealtime } from './realtime';
import { dispatchFunnelAutomation } from './dispatch-funnel-automation';

const SCORE_EVENT_ACTION = 'SCORE_EVENT';

/** Worker-side scoring (inbound / NO_REPLY) — same rules as API LeadScoringService. */
export async function applyFunnelScoreEvent(input: {
  organizationId: string;
  leadId?: string | null;
  customerId?: string | null;
  eventType: FunnelScoringEventType;
  text?: string | null;
  source?: string;
  redis?: Redis;
}) {
  let leadId = input.leadId ?? null;
  if (!leadId && input.customerId) {
    const found = await prisma.lead.findFirst({
      where: { organizationId: input.organizationId, customerId: input.customerId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    leadId = found?.id ?? null;
  }
  if (!leadId) return { skipped: true, reason: 'no_lead' };

  const eventType: FunnelScoringEventType =
    input.eventType === 'CHATBOT_REPLY' && detectAskPrice(input.text)
      ? 'ASK_PRICE'
      : input.eventType;

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId: input.organizationId },
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
    },
  });
  if (!lead?.funnelRecommendationId) return { skipped: true, reason: 'no_funnel' };

  const config = await prisma.funnelScoringConfig.findFirst({
    where: {
      organizationId: input.organizationId,
      funnelId: lead.funnelRecommendationId,
      isActive: true,
    },
    include: { rules: { where: { isActive: true, eventType } } },
  });
  if (!config || !config.rules.length) return { skipped: true, reason: 'no_rule' };

  const cooldown = await isCoolingDown(
    input.organizationId,
    lead.id,
    eventType,
    config.rules[0]?.condition,
  );
  if (cooldown) return { skipped: true, reason: 'cooldown' };

  const points = config.rules.reduce((s, r) => s + r.points, 0);
  const { previous, next, delta } = applyScoreDelta(lead.score, points, config.maxScore);
  if (delta === 0 && points === 0) return { skipped: true, reason: 'noop' };

  const q = qualificationAfterScore(
    previous,
    next,
    config.mqlThreshold,
    config.sqlThreshold,
    lead.qualification,
  );

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      score: next,
      qualification: q.qualification ?? undefined,
      mqlReachedAt: q.crossedMql ? new Date() : undefined,
      sqlReachedAt: q.crossedSql ? new Date() : undefined,
    },
  });

  await prisma.leadActivity.create({
    data: {
      organizationId: input.organizationId,
      leadId: lead.id,
      action: SCORE_EVENT_ACTION,
      fromValue: String(previous),
      toValue: String(next),
      metadata: { eventType, points: delta, source: input.source ?? eventType },
    },
  });
  await prisma.leadActivity.create({
    data: {
      organizationId: input.organizationId,
      leadId: lead.id,
      action: 'SCORE_CHANGED',
      fromValue: String(previous),
      toValue: String(next),
      metadata: { eventType, qualification: q.qualification, crossed: q.crossed },
    },
  });

  if (input.redis) {
    await publishRealtime(input.redis, input.organizationId, WS_EVENTS.LEAD_SCORE_CHANGED, {
      leadId: lead.id,
      name: lead.name,
      score: next,
      previousScore: previous,
      qualification: q.qualification,
    });
  }

  await dispatchFunnelAutomation(input.organizationId, AutomationTriggerType.SCORE_CHANGED, {
    leadId: lead.id,
    customerId: lead.customerId,
    context: {
      score: String(next),
      previousScore: String(previous),
      crossed: q.crossed ?? '',
      eventType,
    },
    dedupeKey: `SCORE_CHANGED:${lead.id}:${next}:${q.crossed ?? 'n'}`,
  });

  if (q.qualification === 'MQL' || q.qualification === 'SQL') {
    await syncQualificationStage(input.organizationId, lead.id, q.qualification, config);
  }
  if (q.crossed) {
    await onThreshold(input.organizationId, lead, q.crossed, next, config, input.redis);
  }

  return { ok: true, previous, next, crossed: q.crossed };
}

async function syncQualificationStage(
  organizationId: string,
  leadId: string,
  qualification: 'MQL' | 'SQL',
  config: { mqlStageId: string | null; sqlStageId: string | null },
  redis?: Redis,
) {
  const targetId = qualification === 'SQL' ? config.sqlStageId : config.mqlStageId;
  const fallback = qualification === 'SQL' ? LeadPipelineStatus.BOOKED : LeadPipelineStatus.QUALIFIED;
  const live = await prisma.lead.findFirst({
    where: { id: leadId, organizationId },
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

  const stage = targetId
    ? await prisma.funnelStage.findFirst({
        where: { id: targetId, organizationId, isActive: true },
      })
    : await prisma.funnelStage.findFirst({
        where: {
          organizationId,
          isActive: true,
          OR: [{ code: fallback }, { legacyStatus: fallback }],
          ...(live.pipelineId ? { pipelineId: live.pipelineId } : {}),
        },
        orderBy: { position: 'asc' },
      });
  if (!stage) return;
  if (live.stageId === stage.id) return;

  const currentStage = live.stageId
    ? await prisma.funnelStage.findFirst({
        where: { id: live.stageId, organizationId },
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

  const nextStatus = (stage.legacyStatus ?? fallback) as LeadPipelineStatus;
  if (nextStatus !== live.pipelineStatus && !shouldAdvancePipeline(live.pipelineStatus, nextStatus)) {
    return;
  }

  await prisma.lead.update({
    where: { id: live.id },
    data: {
      stageId: stage.id,
      pipelineId: stage.pipelineId,
      pipelineStatus: nextStatus,
      lastContactedAt: new Date(),
    },
  });
  await prisma.leadActivity.create({
    data: {
      organizationId,
      leadId: live.id,
      action: 'STATUS_CHANGED',
      fromValue: live.pipelineStatus,
      toValue: nextStatus,
      metadata: { reason: `${qualification}_THRESHOLD`, stageId: stage.id },
    },
  });
  if (redis) {
    await publishRealtime(redis, organizationId, WS_EVENTS.LEAD_STATUS_CHANGED, {
      leadId: live.id,
      name: live.name,
      previousStatus: live.pipelineStatus,
      pipelineStatus: nextStatus,
    });
  }
  await dispatchFunnelAutomation(organizationId, AutomationTriggerType.STAGE_CHANGED, {
    leadId: live.id,
    customerId: live.customerId,
    context: {
      stageId: stage.id,
      stageCode: nextStatus,
      previousStatus: live.pipelineStatus,
      crossed: qualification,
    },
    dedupeKey: `STAGE_CHANGED:${live.id}:${stage.id}:${qualification}`,
  });
}

async function onThreshold(
  organizationId: string,
  lead: {
    id: string;
    name: string;
    pipelineStatus: LeadPipelineStatus;
    stageId: string | null;
    pipelineId: string | null;
    customerId: string | null;
    assignedToId: string | null;
  },
  crossed: 'MQL' | 'SQL',
  score: number,
  config: { mqlStageId: string | null; sqlStageId: string | null },
  redis?: Redis,
) {
  await syncQualificationStage(organizationId, lead.id, crossed, config, redis);

  const targetId = crossed === 'SQL' ? config.sqlStageId : config.mqlStageId;
  const fallback = crossed === 'SQL' ? LeadPipelineStatus.BOOKED : LeadPipelineStatus.QUALIFIED;
  const stage = targetId
    ? await prisma.funnelStage.findFirst({
        where: { id: targetId, organizationId, isActive: true },
      })
    : await prisma.funnelStage.findFirst({
        where: {
          organizationId,
          isActive: true,
          OR: [{ code: fallback }, { legacyStatus: fallback }],
          ...(lead.pipelineId ? { pipelineId: lead.pipelineId } : {}),
        },
        orderBy: { position: 'asc' },
      });

  await prisma.leadActivity.create({
    data: {
      organizationId,
      leadId: lead.id,
      action: crossed === 'SQL' ? 'SQL_REACHED' : 'MQL_REACHED',
      toValue: String(score),
      metadata: { score, stageId: stage?.id ?? null },
    },
  });

  await prisma.crmTask.create({
    data: {
      organizationId,
      leadId: lead.id,
      title:
        crossed === 'SQL'
          ? `SQL — gọi chốt lịch/lead ${lead.name}`
          : `MQL — liên hệ lead ${lead.name}`,
      dueAt: new Date(Date.now() + 15 * 60_000),
      source: 'lead-scoring',
    },
  });

  if (redis) {
    await publishRealtime(redis, organizationId, WS_EVENTS.LEAD_QUALIFIED, {
      leadId: lead.id,
      name: lead.name,
      qualification: crossed,
      score,
      assignedToId: lead.assignedToId,
    });
  }
}

async function isCoolingDown(
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
  const rows = await prisma.leadActivity.findMany({
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

export async function applyCanvasScoreDelta(input: {
  organizationId: string;
  leadId: string;
  points: number;
  redis?: Redis;
}) {
  if (!input.points || !Number.isFinite(input.points)) return { skipped: true, reason: 'no_delta' };
  const lead = await prisma.lead.findFirst({
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
    },
  });
  if (!lead) return { skipped: true, reason: 'no_lead' };
  const config = lead.funnelRecommendationId
    ? await prisma.funnelScoringConfig.findFirst({
        where: {
          organizationId: input.organizationId,
          funnelId: lead.funnelRecommendationId,
          isActive: true,
        },
      })
    : null;
  const { previous, next, delta } = applyScoreDelta(lead.score, input.points, config?.maxScore ?? 100);
  if (delta === 0) return { skipped: true, reason: 'noop', previous, next };
  const q = qualificationAfterScore(
    previous,
    next,
    config?.mqlThreshold ?? 50,
    config?.sqlThreshold ?? 80,
    lead.qualification,
  );
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      score: next,
      qualification: q.qualification ?? undefined,
      mqlReachedAt: q.crossedMql ? new Date() : undefined,
      sqlReachedAt: q.crossedSql ? new Date() : undefined,
    },
  });
  await prisma.leadActivity.create({
    data: {
      organizationId: input.organizationId,
      leadId: lead.id,
      action: SCORE_EVENT_ACTION,
      fromValue: String(previous),
      toValue: String(next),
      metadata: { eventType: 'CTA_CLICK', points: delta, source: 'funnel-canvas' },
    },
  });
  await prisma.leadActivity.create({
    data: {
      organizationId: input.organizationId,
      leadId: lead.id,
      action: 'SCORE_CHANGED',
      fromValue: String(previous),
      toValue: String(next),
      metadata: { eventType: 'CTA_CLICK', qualification: q.qualification, crossed: q.crossed },
    },
  });
  if (q.qualification === 'MQL' || q.qualification === 'SQL') {
    await syncQualificationStage(
      input.organizationId,
      lead.id,
      q.qualification,
      config ?? { mqlStageId: null, sqlStageId: null },
      input.redis,
    );
  }
  if (q.crossed && config) {
    await onThreshold(input.organizationId, lead, q.crossed, next, config, input.redis);
  }
  return { previous, next, delta, qualification: q.qualification, crossed: q.crossed };
}
