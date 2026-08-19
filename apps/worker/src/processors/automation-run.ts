import type { Job } from 'bullmq';
import {
  AutomationLogStatus,
  AutomationTriggerType,
  LeadAssignmentMode,
  MessageChannel,
  Prisma,
  prisma,
} from '@marketingspa/database';
import {
  automationFlowMatchesFunnel,
  isSafeWebhookUrl,
  normalizeAutomationAction,
  type NormalizedAutomationAction,
} from '@marketingspa/shared';
import { renderTemplate } from '../lib/template';
import { checkMessagingEligibilityBeforeSend } from '../lib/messaging-eligibility';
import { dispatchFunnelAutomation } from '../lib/dispatch-funnel-automation';

function inQuietHours(start?: string | null, end?: string | null) {
  if (!start || !end) return false;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (start <= end) return hhmm >= start && hhmm < end;
  return hhmm >= start || hhmm < end;
}

export async function processAutomationMessage(job: Job) {
  if (job.name === 'run-canvas-runtime') {
    const { processCanvasRuntime } = await import('../lib/run-canvas-runtime');
    return processCanvasRuntime(job);
  }

  const data = job.data as {
    organizationId: string;
    flowId: string;
    funnelId?: string | null;
    customerId?: string | null;
    leadId?: string | null;
    appointmentId?: string | null;
    context?: Record<string, string>;
    idempotencyKey?: string;
    fromStep?: number;
  };

  const { organizationId, flowId } = data;
  if (!organizationId || !flowId) throw new Error('Missing organizationId/flowId');

  const idempotencyKey =
    data.idempotencyKey ??
    `legacy:${flowId}:${data.leadId ?? ''}:${data.customerId ?? ''}:${job.id}`;

  const existing = await prisma.automationLog.findUnique({
    where: {
      organizationId_idempotencyKey: { organizationId, idempotencyKey },
    },
  });
  if (existing && existing.status !== AutomationLogStatus.FAILED) {
    return { skipped: true, reason: 'idempotent' };
  }

  const flow = await prisma.automationFlow.findFirst({
    where: { id: flowId, organizationId },
    include: { messageTemplate: true },
  });
  if (!flow || !flow.isActive || flow.isPaused) {
    return { skipped: true, reason: 'flow_inactive' };
  }

  if (data.leadId) {
    const lead = await prisma.lead.findFirst({
      where: { id: data.leadId, organizationId },
      select: { funnelRecommendationId: true },
    });
    if (!automationFlowMatchesFunnel(flow.funnelId, lead?.funnelRecommendationId)) {
      return { skipped: true, reason: 'funnel_mismatch' };
    }
  }

  if (flow.triggerType === AutomationTriggerType.NO_REPLY) {
    const watch = data.context?.noReplyWatchStartedAt
      ? new Date(data.context.noReplyWatchStartedAt)
      : null;
    const inbound = await prisma.messagingContactIdentity.findFirst({
      where: {
        organizationId,
        OR: [
          ...(data.leadId ? [{ leadId: data.leadId }] : []),
          ...(data.customerId ? [{ customerId: data.customerId }] : []),
        ],
        lastInboundAt:
          watch && !Number.isNaN(watch.getTime()) ? { gt: watch } : { not: null },
      },
      select: { id: true },
    });
    if (inbound) return { skipped: true, reason: 'replied' };
    const { applyFunnelScoreEvent } = await import('../lib/apply-funnel-score');
    void applyFunnelScoreEvent({
      organizationId,
      leadId: data.leadId,
      customerId: data.customerId,
      eventType: 'NO_REPLY',
      source: 'automation_no_reply',
    }).catch(() => undefined);
  }

  if (inQuietHours(flow.quietHoursStart, flow.quietHoursEnd)) {
    return { skipped: true, reason: 'quiet_hours' };
  }

  const channel = flow.channel ?? flow.messageTemplate?.channel ?? MessageChannel.ZALO;

  const eligibility = await checkMessagingEligibilityBeforeSend({
    organizationId,
    flowId: flow.id,
    channel,
    leadId: data.leadId,
    customerId: data.customerId,
    templateId: flow.messageTemplateId,
  });

  if (!eligibility.eligible) {
    const log = await prisma.automationLog.create({
      data: {
        organizationId,
        automationFlowId: flow.id,
        customerId: data.customerId ?? undefined,
        leadId: data.leadId ?? undefined,
        appointmentId: data.appointmentId ?? undefined,
        channel,
        status: AutomationLogStatus.SKIPPED,
        idempotencyKey,
        executedAt: new Date(),
        result: JSON.parse(
          JSON.stringify({ eligibility, reason: eligibility.reasonCode }),
        ) as Prisma.InputJsonValue,
      },
    });
    return { skipped: true, reason: eligibility.reasonCode, logId: log.id };
  }

  let context: Record<string, string> = { ...(data.context ?? {}) };
  if (data.customerId) {
    const c = await prisma.customer.findFirst({
      where: { id: data.customerId, organizationId },
      include: { branch: true },
    });
    if (c) {
      context = {
        ...context,
        customer_name: c.name,
        branch_name: c.branch?.name ?? '',
      };
    }
  }
  if (data.leadId) {
    const l = await prisma.lead.findFirst({
      where: { id: data.leadId, organizationId },
      include: { branch: true },
    });
    if (l) {
      context = {
        ...context,
        customer_name: l.name,
        phone: l.phone ?? '',
        branch_name: l.branch?.name ?? context.branch_name ?? '',
      };
    }
  }

  const steps = (Array.isArray(flow.actions) ? flow.actions : [])
    .map((raw) => normalizeAutomationAction(raw))
    .filter((a): a is Exclude<NormalizedAutomationAction, { type: 'UNKNOWN' }> => a.type !== 'UNKNOWN');
  const effective: Array<Exclude<NormalizedAutomationAction, { type: 'UNKNOWN' }>> =
    steps.length > 0 ? steps : flow.messageTemplate ? [{ type: 'SEND_MESSAGE' }] : [];

  let lastContent: string | undefined;
  const fromStep = Math.max(0, data.fromStep ?? 0);
  for (let i = fromStep; i < effective.length; i++) {
    const action = effective[i]!;
    switch (action.type) {
      case 'SEND_MESSAGE':
      case 'SEND_EMAIL': {
        let body = flow.messageTemplate?.body ?? 'Xin chào {{customer_name}}';
        if (action.templateId) {
          const t = await prisma.messageTemplate.findFirst({
            where: { id: action.templateId, organizationId },
          });
          if (t) body = t.body;
        }
        lastContent = renderTemplate(body, context);
        break;
      }
      case 'CREATE_TASK': {
        await prisma.crmTask.create({
          data: {
            organizationId,
            leadId: data.leadId ?? undefined,
            customerId: data.customerId ?? undefined,
            title: action.title,
            dueAt: new Date(Date.now() + (action.dueInMinutes ?? 60) * 60_000),
            source: 'automation',
          },
        });
        break;
      }
      case 'ASSIGN_EMPLOYEE': {
        if (!data.leadId) break;
        let employeeId = action.employeeId;
        if (!employeeId) {
          const rule = await prisma.leadAssignmentRule.findFirst({
            where: { organizationId, isActive: true },
          });
          const pool = await prisma.employee.findMany({
            where: { organizationId, isActive: true },
            orderBy: { createdAt: 'asc' },
          });
          if (pool.length) {
            const idx =
              rule?.mode === LeadAssignmentMode.ROUND_ROBIN || rule
                ? (rule.lastIndex + 1) % pool.length
                : 0;
            employeeId = pool[idx]!.id;
            if (rule) {
              await prisma.leadAssignmentRule.update({
                where: { id: rule.id },
                data: { lastIndex: idx },
              });
            }
          }
        }
        if (employeeId) {
          await prisma.lead.update({
            where: { id: data.leadId },
            data: { assignedToId: employeeId },
          });
        }
        break;
      }
      case 'CHANGE_STATUS': {
        if (data.leadId && (action.pipelineStatus || action.stageId)) {
          const stage = action.stageId
            ? await prisma.funnelStage.findFirst({
                where: { id: action.stageId, organizationId, isActive: true },
              })
            : await prisma.funnelStage.findFirst({
                where: {
                  organizationId,
                  isActive: true,
                  OR: [
                    { code: action.pipelineStatus! },
                    { legacyStatus: action.pipelineStatus as never },
                  ],
                },
                orderBy: { position: 'asc' },
              });
          const status = stage?.legacyStatus ?? action.pipelineStatus;
          await prisma.lead.update({
            where: { id: data.leadId },
            data: {
              ...(status ? { pipelineStatus: status as never } : {}),
              ...(stage
                ? { stageId: stage.id, pipelineId: stage.pipelineId }
                : {}),
            },
          });
        }
        break;
      }
      case 'ADD_TAG': {
        if (data.leadId) {
          const lead = await prisma.lead.findFirst({ where: { id: data.leadId } });
          if (lead) {
            await prisma.lead.update({
              where: { id: data.leadId },
              data: { tags: [...new Set([...(lead.tags ?? []), action.tag])] },
            });
          }
        }
        break;
      }
      case 'CREATE_APPOINTMENT': {
        if (!data.leadId) break;
        const lead = await prisma.lead.findFirst({
          where: { id: data.leadId, organizationId },
        });
        const branchId = action.branchId ?? lead?.branchId;
        if (lead && branchId) {
          await prisma.appointment.create({
            data: {
              organizationId,
              branchId,
              leadId: lead.id,
              customerId: lead.customerId,
              scheduledAt: new Date(Date.now() + (action.delayMinutes ?? 1440) * 60_000),
              note: 'Tạo bởi automation',
            },
          });
        }
        break;
      }
      case 'WAIT':
        break;
      case 'WEBHOOK': {
        if (!isSafeWebhookUrl(action.url)) break;
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 8_000);
        try {
          await fetch(action.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              organizationId,
              flowId: flow.id,
              leadId: data.leadId ?? null,
              customerId: data.customerId ?? null,
              event: 'automation.webhook',
            }),
            signal: ac.signal,
          });
        } catch {
          /* logged as step success with skip — don't fail the flow */
        } finally {
          clearTimeout(timer);
        }
        break;
      }
      default:
        break;
    }

    await prisma.automationLog
      .create({
        data: {
          organizationId,
          automationFlowId: flow.id,
          customerId: data.customerId ?? undefined,
          leadId: data.leadId ?? undefined,
          appointmentId: data.appointmentId ?? undefined,
          channel: flow.channel ?? flow.messageTemplate?.channel ?? MessageChannel.ZALO,
          renderedContent: lastContent,
          status: AutomationLogStatus.SUCCESS,
          stepIndex: i,
          stepName: action.type,
          idempotencyKey: `${idempotencyKey}:step:${i}`,
          executedAt: new Date(),
          result: {
            simulated: true,
            jobId: job.id,
            providerMode: eligibility.providerMode,
            estimatedCost: eligibility.estimatedCost,
          } as Prisma.InputJsonValue,
        },
      })
      .catch(() => undefined);

    if (action.type === 'SEND_MESSAGE' || action.type === 'SEND_EMAIL') {
      void dispatchFunnelAutomation(organizationId, AutomationTriggerType.NO_REPLY, {
        leadId: data.leadId,
        customerId: data.customerId,
        appointmentId: data.appointmentId,
        context: {
          ...(data.context ?? {}),
          noReplyWatchStartedAt: new Date().toISOString(),
        },
        dedupeKey: `NO_REPLY:${flow.id}:${data.leadId ?? data.customerId ?? ''}`,
      });
    }

    if (action.type === 'WAIT') {
      const { Queue } = await import('bullmq');
      const { QUEUE_NAMES } = await import('@marketingspa/shared');
      const { bullConnection, queuePrefix } = await import('../config');
      const queue = new Queue(QUEUE_NAMES.AUTOMATION_MESSAGE, {
        connection: bullConnection,
        prefix: queuePrefix,
      });
      try {
        await queue.add(
          'run-automation',
          {
            ...data,
            fromStep: i + 1,
            idempotencyKey: `${idempotencyKey}:from:${i + 1}`,
          },
          {
            jobId: `auto:${idempotencyKey}:from:${i + 1}`.slice(0, 120),
            delay: Math.max(0, action.minutes) * 60_000,
            attempts: 3,
          },
        );
      } finally {
        await queue.close();
      }
      return { waiting: true, nextStep: i + 1 };
    }
  }

  const log = await prisma.automationLog.create({
    data: {
      organizationId,
      automationFlowId: flow.id,
      customerId: data.customerId ?? undefined,
      leadId: data.leadId ?? undefined,
      appointmentId: data.appointmentId ?? undefined,
      channel: flow.channel ?? flow.messageTemplate?.channel ?? undefined,
      renderedContent: lastContent,
      status: AutomationLogStatus.SENT,
      stepName: 'completed',
      idempotencyKey,
      executedAt: new Date(),
      result: { simulated: true, jobId: job.id, steps: steps.length },
    },
  });

  return { logId: log.id, steps: steps.length };
}
