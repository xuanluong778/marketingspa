import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FunnelPublishStatus, Prisma, SubscriptionStatus, AutomationTriggerType, MessageChannel } from '@marketingspa/database';
import {
  assertFunnelCanActivate,
  canTransitionFunnelStatus,
  diffFunnelCompleteSpecs,
  ensureFunnelActivateRequirements,
  parseFunnelCompleteSpec,
  resolveFunnelQuota,
  sanitizeFunnelUserPrompt,
  type FunnelCompleteSpec,
  type FunnelPublishStatus as SharedStatus,
} from '@marketingspa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { FunnelValidatorService } from './funnel-validator.service';
import { PipelineService } from '../crm/pipeline.service';
import { LeadScoringService } from '../crm/lead-scoring.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';

@Injectable()
export class FunnelLifecycleService {
  private readonly logger = new Logger(FunnelLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly validator: FunnelValidatorService,
    private readonly pipeline: PipelineService,
    private readonly scoring: LeadScoringService,
  ) {}

  async assertFunnel(organizationId: string, id: string) {
    const row = await this.prisma.funnelRecommendation.findFirst({
      where: { id, organizationId },
    });
    if (!row) throw new NotFoundException('Funnel không tồn tại');
    return row;
  }

  assertMutableWorkingCopy(status: FunnelPublishStatus) {
    if (status === FunnelPublishStatus.ARCHIVED) {
      throw new BadRequestException('Funnel ARCHIVED — clone để chỉnh, không sửa trực tiếp');
    }
  }

  /** Public capture uses frozen publishedSpec while ACTIVE. */
  liveSpecJson(row: {
    status: FunnelPublishStatus;
    publishedSpec: unknown;
    completeSpec: unknown;
  }): unknown {
    if (row.status === FunnelPublishStatus.ACTIVE && row.publishedSpec) {
      return row.publishedSpec;
    }
    return row.completeSpec;
  }

  async getQuota(organizationId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: {
        organizationId,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
      },
      include: { plan: { select: { code: true } } },
      orderBy: { currentPeriodEnd: 'desc' },
    });
    const isTrial = sub?.status === SubscriptionStatus.TRIALING;
    const quota = resolveFunnelQuota(sub?.plan?.code, isTrial);
    const [total, active] = await Promise.all([
      this.prisma.funnelRecommendation.count({
        where: { organizationId, status: { not: FunnelPublishStatus.ARCHIVED } },
      }),
      this.prisma.funnelRecommendation.count({
        where: { organizationId, status: FunnelPublishStatus.ACTIVE },
      }),
    ]);
    return { ...quota, usedFunnels: total, usedActive: active, planCode: sub?.plan?.code ?? null, isTrial };
  }

  async assertCanCreateFunnel(organizationId: string) {
    const q = await this.getQuota(organizationId);
    if (q.usedFunnels >= q.maxFunnels) {
      throw new ForbiddenException({
        code: 'FUNNEL_QUOTA',
        message: `Hết quota funnel (${q.usedFunnels}/${q.maxFunnels}) theo gói ${q.planCode ?? 'trial'}`,
        quota: q,
      });
    }
    return q;
  }

  async preparePublish(user: AuthUser, id: string) {
    const row = await this.assertFunnel(user.organizationId, id);
    this.assertMutableWorkingCopy(row.status);
    if (!row.completeSpec) throw new BadRequestException('Chưa có complete spec');
    const current = parseFunnelCompleteSpec(row.completeSpec);
    const prepared = ensureFunnelActivateRequirements(current);
    const validation = this.validator.validateCompleteSpec(prepared);
    await this.prisma.funnelRecommendation.update({
      where: { id: row.id },
      data: { completeSpec: prepared as unknown as Prisma.InputJsonValue },
    });
    return {
      recommendationId: row.id,
      complete: prepared,
      validation,
      applied: false,
      liveFrozen: row.status === FunnelPublishStatus.ACTIVE,
    };
  }

  async publish(user: AuthUser, id: string, summary?: string, canActivateFlows = false) {
    const row = await this.assertFunnel(user.organizationId, id);
    if (!canTransitionFunnelStatus(row.status as SharedStatus, 'ACTIVE')) {
      throw new BadRequestException(`Không publish từ ${row.status}`);
    }
    if (row.status === FunnelPublishStatus.ACTIVE) {
      throw new BadRequestException(
        'Funnel đang ACTIVE — pause trước khi publish version mới (không phá lead đang chạy)',
      );
    }
    if (!row.completeSpec) throw new BadRequestException('Chưa có complete spec');
    const spec = ensureFunnelActivateRequirements(parseFunnelCompleteSpec(row.completeSpec));
    const gate = assertFunnelCanActivate(spec);
    if (!gate.ok) {
      throw new BadRequestException({
        code: 'FUNNEL_NOT_READY',
        message: 'Funnel chưa đạt Validator — không ACTIVE',
        score: gate.score,
        blocking: gate.blocking,
      });
    }

    const q = await this.getQuota(user.organizationId);
    if (q.usedActive >= q.maxActive) {
      throw new ForbiddenException({
        code: 'FUNNEL_ACTIVE_QUOTA',
        message: `Hết quota funnel ACTIVE (${q.usedActive}/${q.maxActive})`,
        quota: q,
      });
    }

    const nextVersion = row.publishedVersion + 1;
    const specJson = spec as unknown as Prisma.InputJsonValue;

    await this.prisma.$transaction([
      this.prisma.funnelVersion.create({
        data: {
          organizationId: user.organizationId,
          funnelId: row.id,
          version: nextVersion,
          spec: specJson,
          summary: (summary || `Publish v${nextVersion}`).slice(0, 500),
          createdById: user.id,
        },
      }),
      this.prisma.funnelRecommendation.update({
        where: { id: row.id },
        data: {
          status: FunnelPublishStatus.ACTIVE,
          completeSpec: specJson,
          publishedSpec: specJson,
          publishedVersion: nextVersion,
          publishedAt: new Date(),
          pausedAt: null,
          archivedAt: null,
        },
      }),
    ]);

    this.logger.log(`Published funnel ${row.id} v${nextVersion} org=${user.organizationId}`);
    await this.bindPublishedCanvas(user.organizationId, row.id, spec, canActivateFlows);
    return {
      id: row.id,
      status: 'ACTIVE' as const,
      publishedVersion: nextVersion,
      score: gate.score,
      liveFrozen: true,
    };
  }

  async pause(user: AuthUser, id: string) {
    const row = await this.assertFunnel(user.organizationId, id);
    if (!canTransitionFunnelStatus(row.status as SharedStatus, 'PAUSED')) {
      throw new BadRequestException(`Không pause từ ${row.status}`);
    }
    await this.prisma.funnelRecommendation.update({
      where: { id: row.id },
      data: { status: FunnelPublishStatus.PAUSED, pausedAt: new Date() },
    });
    await this.setCanvasFlowsPaused(user.organizationId, row.id, true);
    return { id: row.id, status: 'PAUSED' as const };
  }

  async archive(user: AuthUser, id: string) {
    const row = await this.assertFunnel(user.organizationId, id);
    if (!canTransitionFunnelStatus(row.status as SharedStatus, 'ARCHIVED')) {
      throw new BadRequestException(`Không archive từ ${row.status}`);
    }
    await this.prisma.funnelRecommendation.update({
      where: { id: row.id },
      data: {
        status: FunnelPublishStatus.ARCHIVED,
        archivedAt: new Date(),
      },
    });
    await this.setCanvasFlowsPaused(user.organizationId, row.id, true);
    return { id: row.id, status: 'ARCHIVED' as const };
  }

  async listVersions(organizationId: string, id: string) {
    await this.assertFunnel(organizationId, id);
    return this.prisma.funnelVersion.findMany({
      where: { organizationId, funnelId: id },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        summary: true,
        createdById: true,
        createdAt: true,
      },
    });
  }

  async diffVersion(organizationId: string, id: string, versionId: string) {
    const row = await this.assertFunnel(organizationId, id);
    const ver = await this.prisma.funnelVersion.findFirst({
      where: { id: versionId, funnelId: id, organizationId },
    });
    if (!ver) throw new NotFoundException('Version không tồn tại');
    const current = row.completeSpec
      ? parseFunnelCompleteSpec(row.completeSpec)
      : parseFunnelCompleteSpec(ver.spec);
    const snap = parseFunnelCompleteSpec(ver.spec);
    return {
      version: ver.version,
      versionId: ver.id,
      diff: diffFunnelCompleteSpecs(snap, current),
    };
  }

  async restoreVersion(user: AuthUser, id: string, versionId: string) {
    const row = await this.assertFunnel(user.organizationId, id);
    this.assertMutableWorkingCopy(row.status);
    const ver = await this.prisma.funnelVersion.findFirst({
      where: { id: versionId, funnelId: id, organizationId: user.organizationId },
    });
    if (!ver) throw new NotFoundException('Version không tồn tại');
    const spec = parseFunnelCompleteSpec(ver.spec);
    await this.prisma.funnelRecommendation.update({
      where: { id: row.id },
      data: { completeSpec: spec as unknown as Prisma.InputJsonValue },
    });
    return {
      id: row.id,
      restoredVersion: ver.version,
      complete: spec,
      status: row.status,
      liveUnchanged: row.status === FunnelPublishStatus.ACTIVE,
      applied: false,
    };
  }

  async clone(user: AuthUser, id: string) {
    await this.assertCanCreateFunnel(user.organizationId);
    const row = await this.assertFunnel(user.organizationId, id);
    const scoring = await this.prisma.funnelScoringConfig.findFirst({
      where: { organizationId: user.organizationId, funnelId: id },
      include: { rules: true },
    });

    const cloned = await this.prisma.funnelRecommendation.create({
      data: {
        organizationId: user.organizationId,
        createdById: user.id,
        prompt: sanitizeFunnelUserPrompt(`Clone: ${row.prompt}`),
        result: row.result as Prisma.InputJsonValue,
        source: row.source,
        selectedSlug: row.selectedSlug,
        selectedAt: row.selectedSlug ? new Date() : null,
        completeSpec: row.completeSpec as Prisma.InputJsonValue | undefined,
        completeSource: row.completeSource,
        completeGeneratedAt: row.completeSpec ? new Date() : null,
        status: FunnelPublishStatus.DRAFT,
        clonedFromId: row.id,
        chatbotBotId: null,
        publishedVersion: 0,
      },
    });

    if (scoring) {
      await this.prisma.funnelScoringConfig.create({
        data: {
          organizationId: user.organizationId,
          funnelId: cloned.id,
          maxScore: scoring.maxScore,
          mqlThreshold: scoring.mqlThreshold,
          sqlThreshold: scoring.sqlThreshold,
          isActive: scoring.isActive,
          source: 'clone',
          rules: {
            create: scoring.rules.map((r) => ({
              organizationId: user.organizationId,
              key: r.key,
              label: r.label,
              eventType: r.eventType,
              points: r.points,
              condition: r.condition as Prisma.InputJsonValue,
              isActive: r.isActive,
              position: r.position,
            })),
          },
        },
      });
    }

    return {
      id: cloned.id,
      clonedFromId: row.id,
      status: 'DRAFT' as const,
      leadsCopied: 0,
      historyCopied: false,
    };
  }

  private async bindPublishedCanvas(
    organizationId: string,
    funnelId: string,
    spec: FunnelCompleteSpec,
    canActivateFlows: boolean,
  ) {
    try {
      const stages = (spec.stages ?? []).map((s, i) => ({
        name: s.name,
        code: s.code,
        position: s.position ?? i,
        color: s.color,
        category: s.category,
        probability: s.probability,
        slaMinutes: s.slaMinutes,
        isWon: s.isWon,
        isLost: s.isLost,
      }));
      if (stages.length) {
        await this.pipeline.applyStageProposals(organizationId, stages);
      }
    } catch (err) {
      this.logger.warn(`Canvas stage bind failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      await this.upsertCanvasFlows(organizationId, funnelId, spec, canActivateFlows);
    } catch (err) {
      this.logger.warn(`Canvas automation bind failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      const existing = await this.prisma.funnelScoringConfig.findFirst({
        where: { organizationId, funnelId },
        select: { id: true },
      });
      if (!existing) {
        await this.scoring.applyProposed(organizationId, funnelId);
      }
    } catch (err) {
      this.logger.warn(`Canvas scoring bind failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async upsertCanvasFlows(
    organizationId: string,
    funnelId: string,
    spec: FunnelCompleteSpec,
    canActivateFlows: boolean,
  ) {
    const desired = new Map<string, {
      name: string;
      triggerType: AutomationTriggerType;
      delayMinutes: number;
      channel?: MessageChannel;
      actions: unknown[];
      triggerConfig: Record<string, unknown>;
    }>();

    for (const [i, flow] of (spec.automations ?? []).entries()) {
      const triggerType = flow.triggerType as AutomationTriggerType;
      if (!Object.values(AutomationTriggerType).includes(triggerType)) continue;
      const canvasKey = `automation:${flow.triggerType}:${flow.name}`.slice(0, 80);
      desired.set(canvasKey, {
        name: flow.name.slice(0, 160),
        triggerType,
        delayMinutes: flow.delayMinutes ?? 0,
        channel: flow.channel as MessageChannel | undefined,
        actions: flow.actions ?? [],
        triggerConfig: { source: 'funnel-canvas', canvasKey, index: i },
      });
    }

    for (const [i, item] of (spec.followUp ?? []).entries()) {
      const mapped = mapFollowUpTrigger(item.trigger);
      if (!mapped) continue;
      const canvasKey = `followUp:${item.trigger}:${item.name}`.slice(0, 80);
      const actions = [
        {
          type: 'CREATE_TASK',
          title: item.message.slice(0, 160),
          dueInMinutes: 60,
        },
      ];
      desired.set(canvasKey, {
        name: item.name.slice(0, 160),
        triggerType: mapped.triggerType,
        delayMinutes: item.delayMinutes ?? 0,
        channel: mapFollowUpChannel(item.channel),
        actions,
        triggerConfig: {
          source: 'funnel-canvas',
          canvasKey,
          index: i,
          ...(mapped.stageCode ? { stageCode: mapped.stageCode } : {}),
        },
      });
    }

    const existing = await this.prisma.automationFlow.findMany({
      where: { organizationId, funnelId },
    });
    const byKey = new Map<string, (typeof existing)[number]>();
    for (const row of existing) {
      const cfg = (row.triggerConfig ?? {}) as Record<string, unknown>;
      if (cfg.source === 'funnel-canvas' && typeof cfg.canvasKey === 'string') {
        byKey.set(cfg.canvasKey, row);
      }
    }

    const keep = new Set(desired.keys());
    for (const [key, row] of byKey) {
      if (keep.has(key)) continue;
      await this.prisma.automationFlow.update({
        where: { id: row.id },
        data: { isPaused: true, isActive: false },
      });
    }

    for (const [canvasKey, flow] of desired) {
      const row = byKey.get(canvasKey);
      const data = {
        name: flow.name,
        triggerType: flow.triggerType,
        delayMinutes: flow.delayMinutes,
        channel: flow.channel,
        actions: flow.actions as Prisma.InputJsonValue,
        triggerConfig: flow.triggerConfig as Prisma.InputJsonValue,
        isPaused: false,
        isActive: canActivateFlows,
        funnelId,
      };
      if (row) {
        await this.prisma.automationFlow.update({ where: { id: row.id }, data });
      } else {
        await this.prisma.automationFlow.create({
          data: { organizationId, ...data },
        });
      }
    }
  }

  private async setCanvasFlowsPaused(organizationId: string, funnelId: string, paused: boolean) {
    const flows = await this.prisma.automationFlow.findMany({
      where: { organizationId, funnelId },
    });
    for (const flow of flows) {
      const cfg = (flow.triggerConfig ?? {}) as Record<string, unknown>;
      if (cfg.source !== 'funnel-canvas') continue;
      await this.prisma.automationFlow.update({
        where: { id: flow.id },
        data: { isPaused: paused },
      });
    }
  }
}

function mapFollowUpTrigger(trigger: string): { triggerType: AutomationTriggerType; stageCode?: string } | null {
  switch (trigger) {
    case 'LEAD_CREATED':
    case 'FORM_SUBMITTED':
      return { triggerType: AutomationTriggerType.LEAD_CREATED };
    case 'LEAD_UNTOUCHED':
      return { triggerType: AutomationTriggerType.LEAD_UNTOUCHED };
    case 'NO_SHOW':
      return { triggerType: AutomationTriggerType.NO_SHOW };
    case 'AFTER_VISIT':
      return { triggerType: AutomationTriggerType.STAGE_CHANGED, stageCode: 'VISITED' };
    case 'CUSTOM':
      return { triggerType: AutomationTriggerType.MANUAL };
    default:
      return null;
  }
}

function mapFollowUpChannel(channel: string): MessageChannel | undefined {
  if (channel === 'ZALO') return MessageChannel.ZALO;
  if (channel === 'SMS') return MessageChannel.SMS;
  if (channel === 'EMAIL') return MessageChannel.EMAIL;
  if (channel === 'MESSENGER') return MessageChannel.MESSENGER;
  return undefined;
}
