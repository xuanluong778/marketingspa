/**
 * E2E: Marketing Autopilot AI Orchestrator A→Z
 * Brief 1 lần → pipeline → READY_FOR_APPROVAL (+ 4 draft assets, no auto-publish)
 *
 * node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-marketing-autopilot-mission-e2e.ts
 */
import { randomUUID } from 'crypto';
import type { ConfigService } from '@nestjs/config';
import { Prisma } from '@marketingspa/database';
import {
  emptyMissionStepsMap,
  resolveMissionIdempotencyKey,
} from '@marketingspa/shared';
import { PrismaService } from '../apps/api/src/prisma/prisma.service';
import { AuditService } from '../apps/api/src/audit/audit.service';
import { MarketingAutopilotService } from '../apps/api/src/marketing-autopilot/marketing-autopilot.service';
import { MarketingAutopilotDraftAdapter } from '../apps/api/src/marketing-autopilot/marketing-autopilot-draft.adapter';
import { MarketingAutopilotContentDraftService } from '../apps/api/src/marketing-autopilot/marketing-autopilot-content-draft.service';
import { TeleprompterSourceService } from '../apps/api/src/content-marketing/teleprompter-source.service';
import { FunnelBuilderService } from '../apps/api/src/marketing-autopilot/compat/domain-stubs';
import { AutomationService } from '../apps/api/src/automation/automation.service';
import { MessagingCampaignService } from '../apps/api/src/messaging-campaign/messaging-campaign.service';
import { runMarketingMissionPipeline } from '../apps/api/src/marketing-autopilot/orchestrator/mission-pipeline.runner';
import type { MarketingMissionOrchestratorService } from '../apps/api/src/marketing-autopilot/orchestrator/marketing-mission-orchestrator.service';
import type { MarketingContextEngineService } from '../apps/api/src/marketing-autopilot/context/marketing-context-engine.service';
import type { MarketingAutopilotPlannerService } from '../apps/api/src/marketing-autopilot/marketing-autopilot-planner.service';
import type { MarketingAutopilotOutcomeLearningService } from '../apps/api/src/marketing-autopilot/outcome/marketing-autopilot-outcome-learning.service';
import type { OpenAiService } from '../apps/api/src/openai/openai.service';

type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
};

function asConfigService(v: 'true' | 'false'): ConfigService {
  return { get: () => v } as unknown as ConfigService;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();

  const audit = new AuditService(prisma);
  const openAi = { isConfigured: () => false } as unknown as OpenAiService;
  const teleprompter = new TeleprompterSourceService(prisma);
  const funnelBuilder = new FunnelBuilderService();
  const automation = new AutomationService(prisma, audit, {} as any, {} as any);
  const messaging = new MessagingCampaignService(
    prisma,
    {} as any,
    {} as any,
    audit,
    {} as any,
    {} as any,
  );
  const contentDraft = new MarketingAutopilotContentDraftService(teleprompter, openAi);
  const draftAdapter = new MarketingAutopilotDraftAdapter(
    prisma,
    teleprompter,
    funnelBuilder,
    {
      generate: async (user: any, dto: any) => {
        const row = await prisma.marketingAutopilotFunnelSpec.create({
          data: {
            organizationId: user.organizationId,
            createdById: user.id,
            prompt: dto.prompt ?? 'mission e2e',
            source: 'fallback',
            status: 'DRAFT',
            result: {
              schemaVersion: 'funnel-generator.v1',
              analysis: { summary: 'mission e2e' },
              recommendations: [{ templateSlug: 'lead-magnet', name: 'LM', score: 80, rationale: 'x' }],
            } as any,
          },
        });
        return { id: row.id, recommendations: [{ templateSlug: 'lead-magnet' }] };
      },
      generateComplete: async (_u: any, id: string) => {
        await prisma.marketingAutopilotFunnelSpec.update({
          where: { id },
          data: {
            completeSpec: {
              schemaVersion: 'funnel-complete.v1',
              mode: 'draft',
              name: 'Mission E2E Funnel',
              offer: 'o',
              cta: 'c',
              leadForm: { fields: ['name'] },
              nodes: [],
              connections: [],
            } as any,
            completeSource: 'fallback',
            completeGeneratedAt: new Date(),
          },
        });
        return { recommendationId: id };
      },
    } as any,
    automation,
    messaging,
    contentDraft,
  );

  const pipelineDeps = {
    prisma: prisma as any,
    logger: console,
    getContext: async () => ({ snapshotId: null }),
    createDraft: (
      type: any,
      user: any,
      plan: any,
      project: any,
    ) => draftAdapter.createDraft(type, user, plan, project),
  };

  const missionOrchestrator = {
    toPublicMission: (m: any) => ({
      id: m.id,
      organizationId: m.organizationId,
      projectId: m.projectId,
      status: m.status,
      currentStep: m.currentStep,
      progressPercent: m.progressPercent,
      draftOnly: true,
      liveActionsEnabled: false,
    }),
    startMissionAfterCreate: async (user: AuthUser, project: { id: string }) => {
      const idempotencyKey = resolveMissionIdempotencyKey({ projectId: project.id });
      const mission = await prisma.marketingMission.create({
        data: {
          organizationId: user.organizationId,
          createdById: user.id,
          projectId: project.id,
          idempotencyKey,
          status: 'PENDING',
          currentStep: 'BRIEF',
          progressPercent: 0,
          stepsJson: emptyMissionStepsMap() as unknown as Prisma.InputJsonValue,
        },
      });
      await prisma.marketingAutopilotProject.update({
        where: { id: project.id },
        data: { status: 'ORCHESTRATING' },
      });
      // Deterministic: run pipeline to READY (BullMQ mocked in unit env)
      await runMarketingMissionPipeline(mission.id, pipelineDeps);
      const ready = await prisma.marketingMission.findFirst({ where: { id: mission.id } });
      return missionOrchestrator.toPublicMission(ready);
    },
    processMission: (missionId: string) => runMarketingMissionPipeline(missionId, pipelineDeps),
  } as unknown as MarketingMissionOrchestratorService;

  const contextEngine = {
    getContext: async (orgId: string) => ({
      snapshot: {
        organizationId: orgId,
        generatedAt: new Date().toISOString(),
        timeRange: {
          from: new Date(Date.now() - 30 * 86400000).toISOString(),
          to: new Date().toISOString(),
        },
        engineVersion: 'v2',
        metrics: {
          leads: { total: 12, hot: 2, unassigned: 1, noFollowUp: 4 },
          bookings: { total: 3, upcoming: 1, completed: 2 },
          conversion: { leadToBookingRate: 18 },
          revenue: { total: 0, currency: 'VND' },
          ads: {
            spend: null,
            impressions: null,
            clicks: null,
            ctr: null,
            cpc: null,
            cpl: null,
            roas: null,
          },
          email: { campaigns: null, sent: null, openRate: null, clickRate: null },
          chatbot: { bots: null, openConversations: null, leadsCaptured: null },
          funnel: { activeFunnels: null, pipelineStages: null, leadsInFunnel: null },
          campaigns: { messagingActive: null, messagingSent: null, legacyCampaigns: null },
          content: { teleprompterSources: 0, autoPostDrafts: 0, autoPostPublished: 0 },
          automation: { activeFlows: 0, pausedFlows: 0, logsSuccess: null, logsFailed: null },
        },
        insights: [],
        sources: [],
      },
      snapshotId: null,
      fromCache: false,
    }),
  } as unknown as MarketingContextEngineService;

  const planner = {
    plan: async (_dto: unknown, _ctx: unknown, heuristicFallback: () => unknown) => ({
      analysis: heuristicFallback(),
      engine: 'heuristic-orchestrator',
    }),
  } as unknown as MarketingAutopilotPlannerService;

  const outcomeLearning = {
    getBusinessLearningsForPlanner: async () => ({ disclaimer: 'Correlation only', learnings: [] }),
    recordStrategyBaseline: async () => null,
    recordDraftBaselines: async () => [],
  } as unknown as MarketingAutopilotOutcomeLearningService;

  const service = new MarketingAutopilotService(
    prisma,
    asConfigService('true'),
    audit,
    draftAdapter,
    contentDraft,
    contextEngine,
    planner,
    outcomeLearning,
    missionOrchestrator,
  );

  const suffix = randomUUID().slice(0, 8);
  const org = await prisma.organization.create({
    data: { name: 'Mission E2E Org', slug: `mission-e2e-${suffix}` },
  });
  const role = await prisma.role.create({
    data: { organizationId: org.id, code: 'OWNER', name: 'Owner', description: 'test' },
  });
  const user = await prisma.user.create({
    data: {
      email: `mission.e2e.${suffix}@example.com`,
      name: 'Mission E2E',
      organizationId: org.id,
      roleId: role.id,
      authProvider: 'LOCAL',
      isActive: true,
    },
  });
  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: 'OWNER',
    organizationId: org.id,
  };

  try {
    const project = await service.create(authUser as any, {
      projectName: 'Mission A-Z',
      productName: 'Gói Autopilot E2E',
      productPrice: 3_000_000,
      customerProfile: 'Chủ spa 30-45',
      targetArea: 'TP.HCM',
      monthlyBudget: 15_000_000,
      primaryGoal: 'Tăng Booking',
    } as any);

    assert(project?.id, 'project created');
    assert(project.mission?.id, 'mission started after create');
    assert(
      project.mission.status === 'READY_FOR_APPROVAL',
      `expected READY_FOR_APPROVAL got ${project.mission.status}`,
    );

    const mission = await prisma.marketingMission.findFirst({
      where: { id: project.mission.id, organizationId: org.id },
      include: { drafts: true },
    });
    assert(mission?.status === 'READY_FOR_APPROVAL', 'mission READY_FOR_APPROVAL');
    assert(mission?.progressPercent === 100, 'progress 100');

    const types = new Set((mission?.drafts ?? []).map((d) => d.type));
    for (const t of ['CONTENT_DRAFT', 'FUNNEL_DRAFT', 'AUTOMATION_DRAFT', 'CAMPAIGN_DRAFT']) {
      assert(types.has(t as any), `missing asset ${t}`);
    }

    for (const d of mission!.drafts) {
      assert(d.missionId === mission!.id, 'draft linked by missionId');
      assert(d.organizationId === org.id, 'tenant isolation');
      const payload = d.payload as any;
      assert(payload?.liveActionsEnabled !== true, 'no live actions');
    }

    const flowIds = mission!.drafts
      .filter((d) => d.type === 'AUTOMATION_DRAFT')
      .map((d) => (d.payload as any)?.adapter?.externalEntityId)
      .filter(Boolean);
    for (const id of flowIds) {
      const flow = await prisma.automationFlow.findFirst({
        where: { id, organizationId: org.id },
      });
      assert(flow?.isActive === false, 'automation not active');
    }

    const campaignIds = mission!.drafts
      .filter((d) => d.type === 'CAMPAIGN_DRAFT')
      .map((d) => (d.payload as any)?.adapter?.externalEntityId)
      .filter(Boolean);
    for (const id of campaignIds) {
      const c = await prisma.messagingCampaign.findFirst({
        where: { id, organizationId: org.id },
      });
      assert(c?.status === 'DRAFT', 'campaign stays DRAFT');
    }

    console.log('BRIEF_ONCE PASS');
    console.log('MISSION_PIPELINE PASS');
    console.log('READY_FOR_APPROVAL PASS');
    console.log('AUTO_ASSETS PASS');
    console.log('NO_AUTO_PUBLISH PASS');
  } finally {
    await prisma.organization.delete({ where: { id: org.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
