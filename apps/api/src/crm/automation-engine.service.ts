import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  AutomationLogStatus,
  AutomationTriggerType,
  LeadPipelineStatus,
  MessageChannel,
  Prisma,
} from '@marketingspa/database';
import {
  automationFlowMatchesFunnel,
  isSafeWebhookUrl,
  normalizeAutomationAction,
  scoreTriggerMatches,
  stageTriggerMatches,
  type NormalizedAutomationAction,
} from '@marketingspa/shared';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AUTOMATION_MESSAGE_QUEUE } from '../queue/queue.constants';
import { QueueEnqueueService } from '../common/services/queue-enqueue.service';
import { renderTemplate } from '../automation/template-renderer.util';
import { LeadAssignmentService } from './lead-assignment.service';
import { MessagingEligibilityService } from '../messaging/messaging-eligibility.service';
import { EmailMarketingService } from '../email-marketing/email-marketing.service';

export type AutomationAction = NormalizedAutomationAction;

@Injectable()
export class AutomationEngineService {
  private readonly logger = new Logger(AutomationEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueEnqueue: QueueEnqueueService,
    private readonly assignment: LeadAssignmentService,
    private readonly eligibility: MessagingEligibilityService,
    @Inject(AUTOMATION_MESSAGE_QUEUE) private readonly queue: Queue,
    @Optional() private readonly emailMarketing?: EmailMarketingService,
  ) {}

  /** Fire-and-forget enqueue — không chặn API */
  async dispatch(
    organizationId: string,
    triggerType: AutomationTriggerType,
    payload: {
      leadId?: string | null;
      customerId?: string | null;
      appointmentId?: string | null;
      context?: Record<string, string>;
      dedupeKey?: string;
      delayMinutesOverride?: number;
      fromStep?: number;
      flowId?: string;
    },
  ) {
    const lead = payload.leadId
      ? await this.prisma.lead.findFirst({
          where: { id: payload.leadId, organizationId },
          select: {
            funnelRecommendationId: true,
            stageId: true,
            pipelineStatus: true,
            score: true,
          },
        })
      : null;

    const flows = await this.prisma.automationFlow.findMany({
      where: {
        organizationId,
        triggerType,
        isActive: true,
        isPaused: false,
        ...(payload.flowId ? { id: payload.flowId } : {}),
      },
    });

    for (const flow of flows) {
      if (!automationFlowMatchesFunnel(flow.funnelId, lead?.funnelRecommendationId)) {
        continue;
      }
      if (triggerType === AutomationTriggerType.STAGE_CHANGED) {
        const cfg = (flow.triggerConfig ?? {}) as Record<string, unknown>;
        if (
          !stageTriggerMatches(cfg, {
            stageId: payload.context?.stageId ?? lead?.stageId,
            stageCode: payload.context?.stageCode ?? lead?.pipelineStatus ?? undefined,
            previousStatus: payload.context?.previousStatus,
          })
        ) {
          continue;
        }
      }
      if (triggerType === AutomationTriggerType.SCORE_CHANGED) {
        const cfg = (flow.triggerConfig ?? {}) as Record<string, unknown>;
        if (
          !scoreTriggerMatches(cfg, {
            score: Number(payload.context?.score ?? lead?.score ?? 0),
            previousScore: Number(payload.context?.previousScore ?? 0),
            crossed: payload.context?.crossed ?? null,
          })
        ) {
          continue;
        }
      }

      const idempotencyKey =
        payload.dedupeKey ??
        `${flow.id}:${triggerType}:${payload.leadId ?? ''}:${payload.appointmentId ?? ''}:${payload.customerId ?? ''}`;

      const delayMinutes =
        payload.delayMinutesOverride ??
        Math.max(0, flow.delayMinutes);

      await this.queueEnqueue.add(
        this.queue,
        'run-automation',
        {
          organizationId,
          flowId: flow.id,
          funnelId: flow.funnelId,
          leadId: payload.leadId,
          customerId: payload.customerId,
          appointmentId: payload.appointmentId,
          context: payload.context ?? {},
          idempotencyKey,
          fromStep: payload.fromStep ?? 0,
        },
        {
          jobId: `auto:${idempotencyKey}`.slice(0, 120),
          delay: delayMinutes * 60_000,
          attempts: 3,
          backoff: { type: 'exponential', delay: 15_000 },
          removeOnComplete: 200,
          removeOnFail: 100,
        },
      );
    }

    if (this.emailMarketing) {
      void this.emailMarketing.handleCrmTrigger(organizationId, triggerType, payload).catch((err) => {
        this.logger.warn(
          `Email automation trigger failed (${triggerType}): ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }
  }

  isInQuietHours(flow: { quietHoursStart?: string | null; quietHoursEnd?: string | null }) {
    if (!flow.quietHoursStart || !flow.quietHoursEnd) return false;
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const start = flow.quietHoursStart;
    const end = flow.quietHoursEnd;
    if (start <= end) return hhmm >= start && hhmm < end;
    return hhmm >= start || hhmm < end;
  }

  async processJob(data: {
    organizationId: string;
    flowId: string;
    funnelId?: string | null;
    leadId?: string | null;
    customerId?: string | null;
    appointmentId?: string | null;
    context?: Record<string, string>;
    idempotencyKey: string;
    fromStep?: number;
  }) {
    const existing = await this.prisma.automationLog.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: data.organizationId,
          idempotencyKey: data.idempotencyKey,
        },
      },
    });
    if (existing && existing.status !== AutomationLogStatus.FAILED) {
      return { skipped: true, reason: 'idempotent' };
    }

    const flow = await this.prisma.automationFlow.findFirst({
      where: { id: data.flowId, organizationId: data.organizationId },
      include: { messageTemplate: true },
    });
    if (!flow || !flow.isActive || flow.isPaused) {
      return { skipped: true, reason: 'flow_inactive' };
    }

    if (flow.triggerType === AutomationTriggerType.NO_REPLY) {
      const replied = await this.hasInboundSince(
        data.organizationId,
        data.leadId,
        data.customerId,
        data.context?.noReplyWatchStartedAt,
      );
      if (replied) return { skipped: true, reason: 'replied' };
    }

    if (this.isInQuietHours(flow)) {
      await this.prisma.automationLog.create({
        data: {
          organizationId: data.organizationId,
          automationFlowId: flow.id,
          leadId: data.leadId ?? undefined,
          customerId: data.customerId ?? undefined,
          appointmentId: data.appointmentId ?? undefined,
          status: AutomationLogStatus.SKIPPED,
          stepName: 'quiet_hours',
          idempotencyKey: `${data.idempotencyKey}:quiet`,
          executedAt: new Date(),
          result: { reason: 'quiet_hours', retryHint: flow.quietHoursEnd },
        },
      }).catch(() => undefined);
      // Re-enqueue after quiet hours end (approx + delay to end)
      const delayMs = 30 * 60_000;
      await this.queueEnqueue.add(
        this.queue,
        'run-automation',
        data,
        {
          jobId: `auto-retry-quiet:${data.idempotencyKey}`.slice(0, 120),
          delay: delayMs,
          attempts: 2,
        },
      );
      return { skipped: true, reason: 'quiet_hours_rescheduled' };
    }

    if (flow.maxSendsPerDay != null) {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const sentToday = await this.prisma.automationLog.count({
        where: {
          organizationId: data.organizationId,
          automationFlowId: flow.id,
          createdAt: { gte: dayStart },
          status: { in: [AutomationLogStatus.SENT, AutomationLogStatus.SUCCESS] },
        },
      });
      if (sentToday >= flow.maxSendsPerDay) {
        return { skipped: true, reason: 'max_sends_per_day' };
      }
    }

    if (flow.cooldownMinutes > 0 && data.leadId) {
      const since = new Date(Date.now() - flow.cooldownMinutes * 60_000);
      const recent = await this.prisma.automationLog.findFirst({
        where: {
          organizationId: data.organizationId,
          automationFlowId: flow.id,
          leadId: data.leadId,
          createdAt: { gte: since },
          status: { in: [AutomationLogStatus.SENT, AutomationLogStatus.SUCCESS] },
        },
      });
      if (recent) return { skipped: true, reason: 'cooldown' };
    }

    let context: Record<string, string> = { ...(data.context ?? {}) };
    if (data.leadId) {
      const lead = await this.prisma.lead.findFirst({
        where: { id: data.leadId, organizationId: data.organizationId },
        include: { branch: true, customer: true },
      });
      if (lead) {
        context = {
          ...context,
          customer_name: lead.name,
          phone: lead.phone ?? '',
          branch_name: lead.branch?.name ?? '',
        };
      }
    }

    const actions = (Array.isArray(flow.actions) ? flow.actions : []).map((raw) =>
      normalizeAutomationAction(raw),
    );
    const effectiveActions: NormalizedAutomationAction[] =
      actions.length > 0
        ? actions
        : flow.messageTemplate
          ? [{ type: 'SEND_MESSAGE' }]
          : [];

    const stepResults: unknown[] = [];
    let lastContent: string | undefined;
    const fromStep = Math.max(0, data.fromStep ?? 0);

    for (let i = fromStep; i < effectiveActions.length; i++) {
      const action = effectiveActions[i]!;
      const stepName = action.type;
      try {
        const result = await this.runAction(data.organizationId, flow, action, {
          leadId: data.leadId,
          customerId: data.customerId,
          appointmentId: data.appointmentId,
          context,
        });
        if (result && typeof result === 'object' && 'renderedContent' in result) {
          lastContent = (result as { renderedContent?: string }).renderedContent;
        }
        stepResults.push({ step: i, stepName, ok: true, result });
        await this.prisma.automationLog.create({
          data: {
            organizationId: data.organizationId,
            automationFlowId: flow.id,
            leadId: data.leadId ?? undefined,
            customerId: data.customerId ?? undefined,
            appointmentId: data.appointmentId ?? undefined,
            channel: flow.channel ?? flow.messageTemplate?.channel ?? MessageChannel.ZALO,
            renderedContent: lastContent,
            status: AutomationLogStatus.SUCCESS,
            stepIndex: i,
            stepName,
            idempotencyKey: `${data.idempotencyKey}:step:${i}`,
            executedAt: new Date(),
            result: result as Prisma.InputJsonValue,
          },
        }).catch(() => undefined);

        if (action.type === 'SEND_MESSAGE' || action.type === 'SEND_EMAIL') {
          void this.dispatch(data.organizationId, AutomationTriggerType.NO_REPLY, {
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

        if (
          action.type === 'WAIT' &&
          result &&
          typeof result === 'object' &&
          'waitMinutes' in result
        ) {
          const minutes = Math.max(0, Number((result as { waitMinutes: number }).waitMinutes) || 0);
          await this.queueEnqueue.add(
            this.queue,
            'run-automation',
            {
              ...data,
              fromStep: i + 1,
              idempotencyKey: `${data.idempotencyKey}:from:${i + 1}`,
            },
            {
              jobId: `auto:${data.idempotencyKey}:from:${i + 1}`.slice(0, 120),
              delay: minutes * 60_000,
              attempts: 3,
              backoff: { type: 'exponential', delay: 15_000 },
            },
          );
          return { ok: true, waiting: true, nextStep: i + 1 };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'action failed';
        this.logger.warn(`automation step failed: ${msg}`);
        await this.prisma.automationLog.create({
          data: {
            organizationId: data.organizationId,
            automationFlowId: flow.id,
            leadId: data.leadId ?? undefined,
            customerId: data.customerId ?? undefined,
            status: AutomationLogStatus.FAILED,
            stepIndex: i,
            stepName,
            idempotencyKey: `${data.idempotencyKey}:step:${i}:fail`,
            executedAt: new Date(),
            result: { error: msg },
          },
        }).catch(() => undefined);
        throw err;
      }
    }

    await this.prisma.automationLog.create({
      data: {
        organizationId: data.organizationId,
        automationFlowId: flow.id,
        leadId: data.leadId ?? undefined,
        customerId: data.customerId ?? undefined,
        appointmentId: data.appointmentId ?? undefined,
        channel: flow.channel ?? flow.messageTemplate?.channel,
        renderedContent: lastContent,
        status: AutomationLogStatus.SENT,
        stepName: 'completed',
        idempotencyKey: data.idempotencyKey,
        executedAt: new Date(),
        result: { steps: stepResults, simulated: true } as Prisma.InputJsonValue,
      },
    });

    return { ok: true, steps: stepResults.length };
  }

  private async runAction(
    organizationId: string,
    flow: {
      id: string;
      messageTemplateId?: string | null;
      messageTemplate?: { body: string; channel: MessageChannel } | null;
      channel?: MessageChannel | null;
    },
    action: AutomationAction,
    ctx: {
      leadId?: string | null;
      customerId?: string | null;
      appointmentId?: string | null;
      context: Record<string, string>;
    },
  ) {
    switch (action.type) {
      case 'SEND_MESSAGE':
      case 'SEND_EMAIL': {
        const channel =
          flow.channel ?? flow.messageTemplate?.channel ?? MessageChannel.ZALO;
        const eligibility = await this.eligibility.checkBeforeSend({
          organizationId,
          channel,
          campaignType: 'automation',
          flowId: flow.id,
          leadId: ctx.leadId ?? undefined,
          customerId: ctx.customerId ?? undefined,
          templateId: action.templateId ?? flow.messageTemplateId ?? undefined,
        });
        if (!eligibility.eligible) {
          return {
            skipped: true,
            reason: eligibility.reasonCode,
            message: eligibility.reasonMessage,
            providerMode: eligibility.providerMode,
            nextEligibleAt: eligibility.nextEligibleAt,
          };
        }
        let body = flow.messageTemplate?.body ?? 'Xin chào {{customer_name}}';
        if (action.templateId) {
          const t = await this.prisma.messageTemplate.findFirst({
            where: { id: action.templateId, organizationId },
          });
          if (t) body = t.body;
        }
        const renderedContent = renderTemplate(body, ctx.context);
        return {
          renderedContent,
          simulated: true,
          channel: action.type,
          providerMode: eligibility.providerMode,
          estimatedCost: eligibility.estimatedCost,
        };
      }
      case 'CREATE_TASK': {
        const dueAt = new Date(Date.now() + (action.dueInMinutes ?? 60) * 60_000);
        return this.prisma.crmTask.create({
          data: {
            organizationId,
            leadId: ctx.leadId ?? undefined,
            customerId: ctx.customerId ?? undefined,
            title: action.title,
            dueAt,
            source: 'automation',
          },
        });
      }
      case 'ASSIGN_EMPLOYEE': {
        if (!ctx.leadId) return { skipped: true };
        const lead = await this.prisma.lead.findFirst({
          where: { id: ctx.leadId, organizationId },
          select: {
            assignedToId: true,
            branchId: true,
            leadSourceId: true,
            score: true,
            attribution: { select: { adCampaignId: true } },
          },
        });
        if (!lead) return { skipped: true };
        // Respect existing assignee unless explicit employeeId
        if (lead.assignedToId && !action.employeeId) {
          return { skipped: true, reason: 'already_assigned', assignedToId: lead.assignedToId };
        }
        const employeeId =
          action.employeeId ??
          (await this.assignment.autoAssign(organizationId, {
            branchId: lead.branchId,
            leadSourceId: lead.leadSourceId,
            adCampaignId: lead.attribution?.adCampaignId,
            score: lead.score,
          }));
        if (!employeeId) return { skipped: true, reason: 'no_employee' };
        await this.prisma.lead.update({
          where: { id: ctx.leadId },
          data: { assignedToId: employeeId },
        });
        return { assignedToId: employeeId };
      }
      case 'CHANGE_STATUS': {
        if (!ctx.leadId || (!action.pipelineStatus && !action.stageId)) return { skipped: true };
        const stage = action.stageId
          ? await this.prisma.funnelStage.findFirst({
              where: { id: action.stageId, organizationId, isActive: true },
            })
          : await this.prisma.funnelStage.findFirst({
              where: {
                organizationId,
                isActive: true,
                OR: [
                  { code: action.pipelineStatus! },
                  { legacyStatus: action.pipelineStatus as LeadPipelineStatus },
                ],
              },
              orderBy: { position: 'asc' },
            });
        const status =
          (stage?.legacyStatus as LeadPipelineStatus | null) ??
          (action.pipelineStatus as LeadPipelineStatus | undefined);
        if (!status && !stage) return { skipped: true };
        await this.prisma.lead.update({
          where: { id: ctx.leadId },
          data: {
            ...(status ? { pipelineStatus: status as never } : {}),
            ...(stage
              ? { stageId: stage.id, pipelineId: stage.pipelineId }
              : {}),
          },
        });
        return {
          pipelineStatus: status ?? action.pipelineStatus,
          stageId: stage?.id,
          pipelineId: stage?.pipelineId,
        };
      }
      case 'ADD_TAG': {
        if (!ctx.leadId) return { skipped: true };
        const lead = await this.prisma.lead.findFirst({ where: { id: ctx.leadId } });
        if (!lead) return { skipped: true };
        const tags = [...new Set([...(lead.tags ?? []), action.tag])];
        await this.prisma.lead.update({ where: { id: ctx.leadId }, data: { tags } });
        return { tags };
      }
      case 'CREATE_APPOINTMENT': {
        if (!ctx.leadId) return { skipped: true };
        const lead = await this.prisma.lead.findFirst({
          where: { id: ctx.leadId, organizationId },
        });
        if (!lead?.branchId && !action.branchId) return { skipped: true, reason: 'no_branch' };
        const scheduledAt = new Date(Date.now() + (action.delayMinutes ?? 1440) * 60_000);
        return this.prisma.appointment.create({
          data: {
            organizationId,
            branchId: action.branchId ?? lead!.branchId!,
            leadId: lead!.id,
            customerId: lead!.customerId,
            scheduledAt,
            status: 'SCHEDULED',
            note: 'Tạo bởi automation',
          },
        });
      }
      case 'WAIT':
        return { waitMinutes: action.minutes, wait: true };
      case 'WEBHOOK': {
        if (!isSafeWebhookUrl(action.url)) {
          return { skipped: true, reason: 'unsafe_webhook_url' };
        }
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 8_000);
        try {
          const res = await fetch(action.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(action.secretHeader ? { 'X-MarketingAuto-Hook': action.secretHeader } : {}),
            },
            body: JSON.stringify({
              organizationId,
              flowId: flow.id,
              leadId: ctx.leadId ?? null,
              customerId: ctx.customerId ?? null,
              appointmentId: ctx.appointmentId ?? null,
              event: 'automation.webhook',
            }),
            signal: ac.signal,
          });
          return { ok: res.ok, status: res.status };
        } catch (err) {
          return {
            skipped: true,
            reason: 'webhook_failed',
            message: err instanceof Error ? err.message : 'webhook_failed',
          };
        } finally {
          clearTimeout(timer);
        }
      }
      default:
        return { skipped: true, reason: 'unknown_action' };
    }
  }

  private async hasInboundSince(
    organizationId: string,
    leadId?: string | null,
    customerId?: string | null,
    sinceIso?: string,
  ): Promise<boolean> {
    if (!leadId && !customerId) return false;
    const since = sinceIso ? new Date(sinceIso) : null;
    const row = await this.prisma.messagingContactIdentity.findFirst({
      where: {
        organizationId,
        OR: [
          ...(leadId ? [{ leadId }] : []),
          ...(customerId ? [{ customerId }] : []),
        ],
        lastInboundAt: since && !Number.isNaN(since.getTime()) ? { gt: since } : { not: null },
      },
      select: { id: true },
    });
    return Boolean(row);
  }
}
