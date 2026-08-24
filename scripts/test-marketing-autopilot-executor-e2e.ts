/**
 * E2E: AI Executor — brief 1 lần → READY + real assets visible on Funnel/Content/Automation/Campaign
 *
 * node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-marketing-autopilot-executor-e2e.ts
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
import { MarketingAutopilotExecutorService } from '../apps/api/src/marketing-autopilot/orchestrator/marketing-autopilot-executor.service';
import { TeleprompterSourceService } from '../apps/api/src/content-marketing/teleprompter-source.service';
import { FunnelBuilderService, FunnelGeneratorService, EmailMarketingService, LeadScoringService } from '../apps/api/src/marketing-autopilot/compat/domain-stubs';
import { AutomationService } from '../apps/api/src/automation/automation.service';
import { MessagingCampaignService } from '../apps/api/src/messaging-campaign/messaging-campaign.service';
import { AutoPostService } from '../apps/api/src/auto-post/auto-post.service';
import { ChatbotCskhService } from '../apps/api/src/chatbot-cskh/chatbot-cskh.service';
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

function asConfig(v: 'true' | 'false'): ConfigService {
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

  // FunnelGenerator needs templates + lifecycle — mock soft path via real service if constructable
  const funnelGenerator = {
    generate: async (user: AuthUser, dto: { prompt: string }) => {
      const row = await prisma.marketingAutopilotFunnelSpec.create({
        data: {
          organizationId: user.organizationId,
          createdById: user.id,
          prompt: dto.prompt,
          source: 'fallback',
          status: 'DRAFT',
          result: {
            schemaVersion: 'funnel-generator.v1',
            analysis: { summary: 'executor e2e' },
            recommendations: [
              {
                templateSlug: 'lead-magnet',
                name: 'Lead Magnet',
                score: 80,
                rationale: 'e2e',
              },
            ],
          } as any,
        },
      });
      return {
        id: row.id,
        recommendations: [{ templateSlug: 'lead-magnet' }],
      };
    },
    generateComplete: async (_user: AuthUser, id: string) => {
      await prisma.marketingAutopilotFunnelSpec.update({
        where: { id },
        data: {
          completeSpec: {
            schemaVersion: 'funnel-complete.v1',
            mode: 'draft',
            name: 'Executor Funnel',
            offer: 'Offer',
            cta: 'CTA',
            leadForm: { fields: ['name', 'phone'] },
            booking: { enabled: true },
            remarketing: { audiences: ['lead'] },
            nodes: [],
            connections: [],
          } as any,
          completeSource: 'fallback',
          completeGeneratedAt: new Date(),
        },
      });
      return { recommendationId: id, mode: 'draft' };
    },
  } as unknown as FunnelGeneratorService;

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
    funnelGenerator,
    automation,
    messaging,
    contentDraft,
  );

  const autoPost = {
    saveDraft: async (user: AuthUser, dto: any) => {
      const row = await prisma.autoPost.create({
        data: {
          userId: user.id,
          organizationId: user.organizationId,
          postType: 'SPA_SALES',
          topic: dto.topic,
          caption: dto.caption,
          cta: dto.cta ?? null,
          spaService: dto.spaService ?? null,
          targetAudience: dto.targetAudience ?? null,
          tone: dto.tone ?? null,
          promotion: dto.promotion ?? null,
          status: 'DRAFT',
        },
      });
      return { id: row.id, status: row.status };
    },
  } as unknown as AutoPostService;

  const emailMarketing = {
    createCampaign: async (orgId: string, dto: any, userId?: string) =>
      prisma.marketingAutopilotEmailDraft.create({
        data: {
          organizationId: orgId,
          name: dto.name,
          subject: dto.subject ?? null,
          createdByUserId: userId ?? null,
          status: 'DRAFT',
        },
      }),
  } as unknown as EmailMarketingService;

  const chatbot = {
    createBot: async (orgId: string, dto: any) => {
      const bot = await prisma.chatbotBot.create({
        data: {
          organizationId: orgId,
          botName: dto.botName,
          businessName: dto.businessName ?? null,
          industry: dto.industry ?? null,
          mainServices: Array.isArray(dto.mainServices)
            ? dto.mainServices.join(', ')
            : dto.mainServices ?? null,
          greeting: dto.greeting ?? null,
          consultationTone: dto.consultationTone ?? 'friendly',
          status: 'DRAFT',
        },
      });
      return { id: bot.id, status: bot.status };
    },
  } as unknown as ChatbotCskhService;

  const leadScoring = {
    upsertConfig: async (orgId: string, funnelId: string, dto: any) => {
      await prisma.marketingAutopilotScoringConfig.upsert({
        where: { funnelId },
        create: {
          organizationId: orgId,
          funnelId,
          maxScore: dto.maxScore ?? 100,
          mqlThreshold: dto.mqlThreshold ?? 50,
          sqlThreshold: dto.sqlThreshold ?? 80,
          isActive: true,
          source: dto.source ?? 'executor',
        },
        update: { source: dto.source ?? 'executor' },
      });
    },
  } as unknown as LeadScoringService;

  const executor = new MarketingAutopilotExecutorService(
    prisma,
    draftAdapter,
    teleprompter,
    funnelBuilder,
    funnelGenerator,
    automation,
    messaging,
    autoPost,
    emailMarketing,
    chatbot,
    leadScoring,
    null as any,
  );

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
          leads: { total: 8, hot: 1, unassigned: 1, noFollowUp: 2 },
          bookings: { total: 1, upcoming: 0, completed: 1 },
          conversion: { leadToBookingRate: 10 },
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
    plan: async (_d: unknown, _c: unknown, fb: () => unknown) => ({
      analysis: fb(),
      engine: 'heuristic-orchestrator',
    }),
  } as unknown as MarketingAutopilotPlannerService;

  const outcomeLearning = {
    getBusinessLearningsForPlanner: async () => ({ disclaimer: 'x', learnings: [] }),
    recordStrategyBaseline: async () => null,
    recordDraftBaselines: async () => [],
  } as unknown as MarketingAutopilotOutcomeLearningService;

  const pipelineDeps = {
    prisma: prisma as any,
    logger: console,
    getContext: async () => ({ snapshotId: null }),
    createDraft: (type: any, user: any, plan: any, project: any) =>
      draftAdapter.createDraft(type, user, plan, project),
    executeAssets: (input: any) => executor.executeMissionAssets(input),
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
      await runMarketingMissionPipeline(mission.id, pipelineDeps);
      const ready = await prisma.marketingMission.findFirst({ where: { id: mission.id } });
      return missionOrchestrator.toPublicMission(ready);
    },
  } as unknown as MarketingMissionOrchestratorService;

  const service = new MarketingAutopilotService(
    prisma,
    asConfig('true'),
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
    data: { name: 'Executor E2E Org', slug: `executor-e2e-${suffix}` },
  });
  const role = await prisma.role.create({
    data: { organizationId: org.id, code: 'OWNER', name: 'Owner', description: 't' },
  });
  const user = await prisma.user.create({
    data: {
      email: `executor.e2e.${suffix}@example.com`,
      name: 'Executor E2E',
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
      projectName: 'Executor A-Z',
      productName: 'Serum Glow',
      productPrice: 1_500_000,
      customerProfile: 'Nữ 28-40',
      targetArea: 'Hà Nội',
      monthlyBudget: 12_000_000,
      primaryGoal: 'Tăng Booking',
    } as any);

    assert(project.mission?.status === 'READY_FOR_APPROVAL', 'READY_FOR_APPROVAL');

    const missionId = project.mission.id;
    const assets = await prisma.marketingMissionAsset.findMany({
      where: { organizationId: org.id, missionId },
    });
    assert(assets.length >= 4, `expected assets>=4 got ${assets.length}`);
    assert(
      assets.every((a) => a.missionId === missionId),
      'all assets have missionId',
    );

    // Visibility: Funnel / Content / Automation / Campaign tabs
    const funnels = await prisma.marketingAutopilotFunnelSpec.findMany({
      where: { organizationId: org.id },
    });
    assert(funnels.some((f) => f.status === 'DRAFT'), 'FUNNEL_TAB_VISIBLE');

    const posts = await prisma.autoPost.findMany({
      where: { organizationId: org.id, userId: user.id, status: 'DRAFT' },
    });
    assert(posts.length >= 1, 'CONTENT_TAB_VISIBLE');

    const flows = await prisma.automationFlow.findMany({
      where: { organizationId: org.id },
    });
    assert(
      flows.some((f) => f.isActive === false && f.isPaused === true),
      'AUTOMATION_TAB_VISIBLE_PAUSED',
    );

    const campaigns = await prisma.messagingCampaign.findMany({
      where: { organizationId: org.id, status: 'DRAFT' },
    });
    assert(campaigns.length >= 1, 'CAMPAIGN_TAB_VISIBLE');

    // No live publish
    assert(
      !flows.some((f) => f.isActive === true),
      'NO_AUTO_PUBLISH_FLOWS',
    );
    assert(
      campaigns.every((c) => c.status === 'DRAFT'),
      'NO_AUTO_PUBLISH_CAMPAIGNS',
    );
    assert(
      posts.every((p) => p.status === 'DRAFT'),
      'NO_AUTO_PUBLISH_CONTENT',
    );

    console.log('BRIEF_ONCE PASS');
    console.log('READY_FOR_APPROVAL PASS');
    console.log('FUNNEL_TAB_VISIBLE PASS');
    console.log('CONTENT_TAB_VISIBLE PASS');
    console.log('AUTOMATION_TAB_VISIBLE PASS');
    console.log('CAMPAIGN_TAB_VISIBLE PASS');
    console.log('MISSION_ID_ON_ASSETS PASS');
    console.log('NO_AUTO_PUBLISH PASS');
  } finally {
    await prisma.organization.delete({ where: { id: org.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
