import type { Job } from 'bullmq';
import {
  AutomationLogStatus,
  LeadAssignmentMode,
  MessageChannel,
  Prisma,
  prisma,
} from '@marketingspa/database';
import { renderTemplate } from '../lib/template';
import { checkMessagingEligibilityBeforeSend } from '../lib/messaging-eligibility';

type AutomationAction =
  | { type: 'SEND_MESSAGE'; templateId?: string }
  | { type: 'SEND_EMAIL'; templateId?: string }
  | { type: 'CREATE_TASK'; title: string; dueInMinutes?: number }
  | { type: 'ASSIGN_EMPLOYEE'; employeeId?: string }
  | { type: 'CHANGE_STATUS'; pipelineStatus: string }
  | { type: 'ADD_TAG'; tag: string }
  | { type: 'CREATE_APPOINTMENT'; branchId?: string; delayMinutes?: number };

function inQuietHours(start?: string | null, end?: string | null) {
  if (!start || !end) return false;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (start <= end) return hhmm >= start && hhmm < end;
  return hhmm >= start || hhmm < end;
}

export async function processAutomationMessage(job: Job) {
  const data = job.data as {
    organizationId: string;
    flowId: string;
    customerId?: string | null;
    leadId?: string | null;
    appointmentId?: string | null;
    context?: Record<string, string>;
    idempotencyKey?: string;
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

  const actions = (Array.isArray(flow.actions) ? flow.actions : []) as AutomationAction[];
  const steps: AutomationAction[] =
    actions.length > 0 ? actions : flow.messageTemplate ? [{ type: 'SEND_MESSAGE' }] : [];

  let lastContent: string | undefined;
  for (let i = 0; i < steps.length; i++) {
    const action = steps[i]!;
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
        if (data.leadId && action.pipelineStatus) {
          await prisma.lead.update({
            where: { id: data.leadId },
            data: { pipelineStatus: action.pipelineStatus as never },
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
