import { Queue } from 'bullmq';
import { AutomationTriggerType, prisma } from '@marketingspa/database';
import { automationFlowMatchesFunnel, QUEUE_NAMES } from '@marketingspa/shared';
import { bullConnection, queuePrefix } from '../config';

let queue: Queue | null = null;

function getQueue() {
  if (!queue) {
    queue = new Queue(QUEUE_NAMES.AUTOMATION_MESSAGE, {
      connection: bullConnection,
      prefix: queuePrefix,
    });
  }
  return queue;
}

/** Enqueue funnel-scoped automation jobs from the worker (inbound MESSAGE_RECEIVED). */
export async function dispatchFunnelAutomation(
  organizationId: string,
  triggerType: AutomationTriggerType,
  payload: {
    leadId?: string | null;
    customerId?: string | null;
    appointmentId?: string | null;
    context?: Record<string, string>;
    dedupeKey?: string;
    flowId?: string;
  },
) {
  const lead = payload.leadId
    ? await prisma.lead.findFirst({
        where: { id: payload.leadId, organizationId },
        select: { funnelRecommendationId: true },
      })
    : payload.customerId
      ? await prisma.lead.findFirst({
          where: { customerId: payload.customerId, organizationId },
          orderBy: { createdAt: 'desc' },
          select: { id: true, funnelRecommendationId: true },
        })
      : null;

  const leadId = payload.leadId ?? (lead && 'id' in lead ? lead.id : null);
  const funnelId = lead?.funnelRecommendationId ?? null;

  const flows = await prisma.automationFlow.findMany({
    where: {
      organizationId,
      triggerType,
      isActive: true,
      isPaused: false,
      ...(payload.flowId ? { id: payload.flowId } : {}),
    },
  });

  for (const flow of flows) {
    if (!automationFlowMatchesFunnel(flow.funnelId, funnelId)) continue;
    const idempotencyKey =
      payload.dedupeKey ??
      `${flow.id}:${triggerType}:${leadId ?? ''}:${payload.customerId ?? ''}`;
    await getQueue().add(
      'run-automation',
      {
        organizationId,
        flowId: flow.id,
        funnelId: flow.funnelId,
        leadId,
        customerId: payload.customerId,
        appointmentId: payload.appointmentId,
        context: payload.context ?? {},
        idempotencyKey,
        fromStep: 0,
      },
      {
        jobId: `auto:${idempotencyKey}`.slice(0, 120),
        delay: Math.max(0, flow.delayMinutes) * 60_000,
        attempts: 3,
        backoff: { type: 'exponential', delay: 15_000 },
        removeOnComplete: 200,
        removeOnFail: 100,
      },
    );
  }
}
