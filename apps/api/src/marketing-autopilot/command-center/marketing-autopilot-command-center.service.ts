import { Injectable } from '@nestjs/common';
import { ACTIVATION_EVENT, recordActivationEvent } from '@marketingspa/database';
import {
  AUTOPILOT_ACTION_LIFECYCLE,
  COMMAND_CENTER_VERSION,
  assertCommandCenterNoFakeMetrics,
  buildCommandCenterActions,
  buildCommandCenterBoard,
  commandCenterHasMinimumContext,
  isFullAutopilotActive,
  type CommandCenterBoardInput,
} from '@marketingspa/shared';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { MarketingContextEngineService } from '../context/marketing-context-engine.service';
import { MarketingAutopilotGuardrailService } from '../marketing-autopilot-guardrail.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MarketingAutopilotCommandCenterService {
  constructor(
    private readonly contextEngine: MarketingContextEngineService,
    private readonly guardrailService: MarketingAutopilotGuardrailService,
    private readonly prisma: PrismaService,
  ) {}

  async getCommandCenter(organizationId: string, user?: AuthUser) {
    const { snapshot, fromCache, snapshotId } = await this.contextEngine.getContext(
      organizationId,
      { user },
    );
    const guardrail = await this.guardrailService.getOrCreate(organizationId);
    const effectiveMode = this.guardrailService.resolveEffectiveMode(guardrail);

    const metrics = snapshot.metrics;
    const input: CommandCenterBoardInput = {
      organizationId: snapshot.organizationId,
      generatedAt: snapshot.generatedAt,
      timeRange: snapshot.timeRange,
      engineVersion: snapshot.engineVersion,
      fromCache,
      metrics: {
        leads: metrics.leads,
        bookings: metrics.bookings,
        revenue: metrics.revenue,
        ads: metrics.ads,
        customers: metrics.customers,
        email: metrics.email,
        zalo: metrics.zalo,
        automation: metrics.automation,
        funnel: metrics.funnel,
        conversion: metrics.conversion,
        businessEvents: metrics.businessEvents,
      },
      sources: snapshot.sources,
      bottlenecks: snapshot.bottlenecks,
      opportunities: snapshot.opportunities,
      insights: snapshot.insights,
    };

    const { kpis, requiredCoverage } = buildCommandCenterBoard(input);
    const nextBestActions = buildCommandCenterActions(input);
    const noFakeMetrics = assertCommandCenterNoFakeMetrics({ kpis, actions: nextBestActions });
    const minimumData = commandCenterHasMinimumContext(snapshot.sources);
    const present = snapshot.sources.map((s) => s.domain);
    const coveragePass = requiredCoverage.every((d) => present.includes(d));

    const [pendingApprovals, runningMissions, recentExecutions, pendingOptimizations] =
      await Promise.all([
        this.prisma.marketingMission.count({
          where: { organizationId, status: 'READY_FOR_APPROVAL' },
        }),
        this.prisma.marketingMission.count({
          where: {
            organizationId,
            status: { in: ['QUEUED', 'RUNNING', 'APPROVED'] },
          },
        }),
        this.prisma.marketingAutopilotExecutionLog.findMany({
          where: { organizationId },
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: {
            id: true,
            missionId: true,
            module: true,
            entityType: true,
            entityId: true,
            action: true,
            result: true,
            message: true,
            createdAt: true,
          },
        }),
        this.prisma.marketingAutopilotOptimizationProposal.count({
          where: { organizationId, status: 'PENDING_APPROVAL' },
        }),
      ]);

    const recentErrors = recentExecutions.filter(
      (l) => l.result === 'FAILED' || l.result.startsWith('BLOCKED_'),
    );

    const result = {
      version: COMMAND_CENTER_VERSION,
      snapshotId,
      fromCache,
      generatedAt: snapshot.generatedAt,
      timeRange: snapshot.timeRange,
      engineVersion: snapshot.engineVersion,
      lifecycle: AUTOPILOT_ACTION_LIFECYCLE,
      kpis,
      nextBestActions,
      sources: snapshot.sources,
      coverage: {
        required: requiredCoverage,
        present,
        okCount: snapshot.sources.filter((s) => s.status === 'OK').length,
        minimumData,
        pass: coveragePass,
      },
      noFakeMetrics,
      safety: {
        draftOnly: effectiveMode === 'RECOMMEND_ONLY',
        approvalRequired: effectiveMode !== 'FULL_AUTOPILOT',
        llmInventedMetrics: false,
        facebookReadOnly: !guardrail.allowFacebookPublish,
      },
      operational: {
        autopilotMode: guardrail.autopilotMode,
        effectiveMode,
        fullAutopilotEnabled: guardrail.fullAutopilotEnabled,
        fullAutopilotActive: isFullAutopilotActive(guardrail),
        emergencyStop: guardrail.emergencyStop,
        cooldownMinutes: guardrail.cooldownMinutes,
        pendingMissionApprovals: pendingApprovals,
        runningMissions,
        pendingOptimizationApprovals: pendingOptimizations,
        recentExecutions,
        recentErrors,
        liveChannels: {
          email: guardrail.allowEmailSend,
          googleAds: guardrail.allowGoogleAdsPublish,
          automation: guardrail.allowAutomationActivation,
          zalo: guardrail.allowZaloSend,
          facebook: guardrail.allowFacebookPublish,
        },
      },
    };

    void recordActivationEvent(this.prisma, {
      organizationId,
      eventType: ACTIVATION_EVENT.FIRST_AUTOPILOT_ANALYSIS,
      source: 'autopilot.command_center',
    }).catch(() => undefined);

    return result;
  }
}
