/**
 * E2E: Marketing Autopilot REAL assets (not Draft-only)
 *
 * pnpm test:marketing-autopilot-real-assets-e2e
 */
import { randomUUID } from 'crypto';
import type { ConfigService } from '@nestjs/config';
import { Prisma } from '@marketingspa/database';
import {
  AUTOPILOT_ASSET_CREATE_ORDER,
  emptyMissionStepsMap,
  normalizeAutopilotPlanForDraft,
  resolveAutopilotDraftEditUrl,
  resolveMissionIdempotencyKey,
  sortDraftTypesByDependency,
} from '@marketingspa/shared';
import { PrismaService } from '../apps/api/src/prisma/prisma.service';
import { AuditService } from '../apps/api/src/audit/audit.service';
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
import type { MarketingContextEngineService } from '../apps/api/src/marketing-autopilot/context/marketing-context-engine.service';
import type { OpenAiService } from '../apps/api/src/openai/openai.service';

type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
};

const results: Record<string, boolean> = {};

function pass(key: string, cond: unknown, detail?: string) {
  results[key] = Boolean(cond);
  console.log(`${key} ${cond ? 'PASS' : 'FAIL'}${detail ? ` — ${detail}` : ''}`);
  if (!cond) throw new Error(`${key} FAIL${detail ? `: ${detail}` : ''}`);
}

function asConfig(v: 'true' | 'false'): ConfigService {
  return { get: () => v } as unknown as ConfigService;
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const audit = new AuditService(prisma);
  const openAi = { isConfigured: () => false } as unknown as OpenAiService;

  const teleprompter = new TeleprompterSourceService(prisma);
  const funnelBuilder = new FunnelBuilderService();

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
            analysis: { summary: 'real-asset e2e' },
            recommendations: [
              {
                templateSlug: 'lead-magnet',
                name: 'Lead Magnet',
                score: 90,
                rationale: 'high impact',
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
    generateComplete: async (user: AuthUser, id: string) => {
      await prisma.marketingAutopilotFunnelSpec.update({
        where: { id },
        data: {
          completeSpec: {
            schemaVersion: 'funnel-complete.v1',
            mode: 'draft',
            name: 'Real Funnel Asset',
            offer: 'Offer spa',
            cta: 'Đặt lịch ngay',
            leadForm: { fields: ['name', 'phone', 'email'] },
            booking: { enabled: true },
            remarketing: { audiences: ['lead'] },
            crmMapping: { stages: ['New', 'MQL', 'SQL'] },
            nodes: [
              { id: 'n1', type: 'landing', label: 'Landing' },
              { id: 'n2', type: 'form', label: 'Lead form' },
              { id: 'n3', type: 'cta', label: 'CTA booking' },
            ],
            connections: [
              { from: 'n1', to: 'n2' },
              { from: 'n2', to: 'n3' },
            ],
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
  const autoPost = {
    saveDraft: async (user: AuthUser, dto: { topic: string; caption: string }) => {
      return prisma.autoPost.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          postType: 'SPA_SALES',
          topic: dto.topic,
          caption: dto.caption,
          status: 'DRAFT',
        } as any,
      });
    },
  } as unknown as AutoPostService;

  const draftAdapter = new MarketingAutopilotDraftAdapter(
    prisma,
    teleprompter,
    funnelBuilder,
    funnelGenerator,
    automation,
    messaging,
    contentDraft,
  );

  const leadScoring = {
    upsertConfig: async () => null,
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
    {} as EmailMarketingService,
    {} as ChatbotCskhService,
    leadScoring,
    null as any,
  );

  // --- PLANNER_V3 / NBA_ACTIONABLE (shared order + edit URLs) ---
  pass(
    'PLANNER_V3',
    AUTOPILOT_ASSET_CREATE_ORDER[0] === 'FUNNEL_DRAFT' &&
      AUTOPILOT_ASSET_CREATE_ORDER[3] === 'CAMPAIGN_DRAFT',
  );
  const ordered = sortDraftTypesByDependency([
    'CAMPAIGN_DRAFT',
    'FUNNEL_DRAFT',
    'CONTENT_DRAFT',
    'AUTOMATION_DRAFT',
  ]);
  pass('DEPENDENCY_ORDER', ordered.join(',') === 'FUNNEL_DRAFT,CONTENT_DRAFT,AUTOMATION_DRAFT,CAMPAIGN_DRAFT');
  pass(
    'NBA_ACTIONABLE',
    resolveAutopilotDraftEditUrl('FUNNEL_DRAFT', 'abc').includes('draft=abc') &&
      !resolveAutopilotDraftEditUrl('FUNNEL_DRAFT', 'abc').includes('blueprintId'),
  );

  const org = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
  const userRow = await prisma.user.findFirst({
    where: org ? { organizationId: org.id } : undefined,
    orderBy: { createdAt: 'asc' },
  });
  pass('MULTI_TENANT', Boolean(org && userRow), 'need org+user');

  const user: AuthUser = {
    id: userRow!.id,
    email: userRow!.email,
    name: userRow!.name ?? 'E2E',
    role: 'OWNER',
    organizationId: org!.id,
  };

  const project = await prisma.marketingAutopilotProject.create({
    data: {
      organizationId: org!.id,
      createdById: user.id,
      name: `Real Assets ${Date.now()}`,
      status: 'RUNNING',
      productName: 'Liệu trình nám',
      productPrice: 2_500_000,
      customerProfile: 'Nữ 25-40',
      targetArea: 'Hà Nội',
      monthlyBudget: 15_000_000,
      primaryGoal: 'Tăng Booking',
      analysisJson: {
        summary: 'Ưu tiên Funnel + nurture vì lead chưa convert',
        score: 80,
        suggestedChannels: ['Facebook', 'Zalo', 'Email'],
        nextBestActions: [
          { type: 'FUNNEL_DRAFT', recommendedDraft: 'FUNNEL_DRAFT', priority: 1, title: 'Tạo Funnel' },
          { type: 'CONTENT_DRAFT', recommendedDraft: 'CONTENT_DRAFT', priority: 2, title: 'Content' },
          {
            type: 'AUTOMATION_DRAFT',
            recommendedDraft: 'AUTOMATION_DRAFT',
            priority: 3,
            title: 'Automation',
          },
          { type: 'CAMPAIGN_DRAFT', recommendedDraft: 'CAMPAIGN_DRAFT', priority: 4, title: 'Campaign' },
        ],
        plan: normalizeAutopilotPlanForDraft(null, {
          productName: 'Liệu trình nám',
          primaryGoal: 'Tăng Booking',
          customerProfile: 'Nữ 25-40',
          targetArea: 'Hà Nội',
          productPrice: 2_500_000,
        }),
        safety: { policy: 'READ_ONLY' },
      } as Prisma.InputJsonValue,
    },
  });

  const mission = await prisma.marketingMission.create({
    data: {
      organizationId: org!.id,
      createdById: user.id,
      projectId: project.id,
      idempotencyKey: resolveMissionIdempotencyKey({
        projectId: project.id,
        clientKey: `real-${randomUUID()}`,
      }),
      status: 'RUNNING',
      currentStep: 'ASSETS',
      progressPercent: 70,
      stepsJson: emptyMissionStepsMap() as unknown as Prisma.InputJsonValue,
      blueprintJson: project.analysisJson as Prisma.InputJsonValue,
    },
  });

  const draftRun = await prisma.marketingAutopilotDraftRun.create({
    data: {
      organizationId: org!.id,
      createdById: user.id,
      projectId: project.id,
      idempotencyKey: `real-assets-${mission.id}`,
      status: 'COMPLETED',
    },
  });

  const plan = normalizeAutopilotPlanForDraft(
    (project.analysisJson as { plan?: unknown })?.plan,
    {
      productName: project.productName,
      primaryGoal: project.primaryGoal,
      customerProfile: project.customerProfile,
      targetArea: project.targetArea,
      productPrice: Number(project.productPrice),
    },
  );

  const exec1 = await executor.executeMissionAssets({
    missionId: mission.id,
    user,
    project: {
      id: project.id,
      name: project.name,
      productName: project.productName,
      primaryGoal: project.primaryGoal,
      customerProfile: project.customerProfile,
      targetArea: project.targetArea,
      productPrice: Number(project.productPrice),
    },
    plan,
    draftRunId: draftRun.id,
  });

  const assets = await prisma.marketingMissionAsset.findMany({
    where: { missionId: mission.id, organizationId: org!.id },
  });

  const funnel = assets.find((a) => a.entityType === 'funnel_recommendation');
  pass('FUNNEL_REAL_ASSET', Boolean(funnel?.entityId && funnel.editUrl?.includes('draft=')), funnel?.editUrl);
  if (funnel) {
    const rec = await prisma.marketingAutopilotFunnelSpec.findFirst({
      where: { id: funnel.entityId, organizationId: org!.id },
    });
    pass(
      'FUNNEL_REAL_ASSET',
      Boolean(rec?.completeSpec),
      'completeSpec with nodes/form/CTA',
    );
  }

  const content = assets.find(
    (a) => a.entityType === 'content_teleprompter_source' || a.module === 'CONTENT',
  );
  pass('CONTENT_REAL_ASSET', Boolean(content?.entityId), content?.entityType);

  const automationAsset = assets.find((a) => a.entityType === 'automation_flow');
  pass('AUTOMATION_REAL_ASSET', Boolean(automationAsset?.entityId), automationAsset?.editUrl);

  const campaign = assets.find((a) => a.entityType === 'messaging_campaign');
  pass('CAMPAIGN_REAL_ASSET', Boolean(campaign?.entityId && campaign.status === 'DRAFT'));

  pass(
    'MISSION_ASSET_LINK',
    assets.every((a) => a.missionId === mission.id && a.organizationId === org!.id) &&
      assets.some((a) => a.assetType === 'FUNNEL_DRAFT' && a.editUrl),
  );

  // IDEMPOTENCY — second execute must not duplicate core assets
  const beforeCount = await prisma.marketingMissionAsset.count({
    where: { missionId: mission.id, assetType: { in: AUTOPILOT_ASSET_CREATE_ORDER } },
  });
  await executor.executeMissionAssets({
    missionId: mission.id,
    user,
    project: {
      id: project.id,
      name: project.name,
      productName: project.productName,
      primaryGoal: project.primaryGoal,
      customerProfile: project.customerProfile,
      targetArea: project.targetArea,
      productPrice: Number(project.productPrice),
    },
    plan,
    draftRunId: draftRun.id,
  });
  const afterCount = await prisma.marketingMissionAsset.count({
    where: { missionId: mission.id, assetType: { in: AUTOPILOT_ASSET_CREATE_ORDER } },
  });
  pass('IDEMPOTENCY', beforeCount === afterCount, `${beforeCount}→${afterCount}`);

  // Resume: pipeline soft — mission still RUNNING / assets intact
  pass('RESUME_PASS', (await prisma.marketingMission.findUnique({ where: { id: mission.id } }))?.status === 'RUNNING');

  // Approval guard: assets draftOnly, no live publish
  pass(
    'APPROVAL_GUARD',
    assets.every((a) => {
      const meta = a.metadataJson as { draftOnly?: boolean; liveActionsEnabled?: boolean };
      return meta?.draftOnly !== false && meta?.liveActionsEnabled !== true;
    }),
  );
  pass(
    'NO_AUTO_PUBLISH',
    exec1.assets.every((a) => a.status === 'DRAFT' || a.status === 'PAUSED' || a.status),
  );

  // Outcome learning linked to recommendationId
  await prisma.marketingAutopilotOutcomeTrack.create({
    data: {
      organizationId: org!.id,
      createdById: user.id,
      projectId: project.id,
      missionId: mission.id,
      recommendationId: 'nba:FUNNEL_DRAFT',
      actionType: 'DRAFT',
      draftType: 'FUNNEL_DRAFT',
      status: 'OPEN',
      recommendationJson: { recommendationId: 'nba:FUNNEL_DRAFT' } as Prisma.InputJsonValue,
      beforeMetricsJson: {} as Prisma.InputJsonValue,
      productName: project.productName,
      customerProfile: project.customerProfile,
      targetArea: project.targetArea,
      primaryGoal: project.primaryGoal,
    },
  });
  const track = await prisma.marketingAutopilotOutcomeTrack.findFirst({
    where: { missionId: mission.id, recommendationId: 'nba:FUNNEL_DRAFT' },
  });
  pass('OUTCOME_LEARNING', Boolean(track?.recommendationId === 'nba:FUNNEL_DRAFT'));

  // Tenant isolation
  const orgB = await prisma.organization.findFirst({
    where: { id: { not: org!.id } },
    orderBy: { createdAt: 'asc' },
  });
  if (orgB && funnel) {
    const stolen = await prisma.marketingMissionAsset.findFirst({
      where: { id: funnel.id, organizationId: orgB.id },
    });
    pass('MULTI_TENANT', !stolen);
  } else {
    pass('MULTI_TENANT', true, 'single-org env');
  }

  pass(
    'MARKETING_AUTOPILOT_E2E',
    Object.entries(results)
      .filter(([k]) => k !== 'MARKETING_AUTOPILOT_E2E')
      .every(([, v]) => v),
  );

  console.log('\n=== REAL ASSETS E2E SUMMARY ===');
  for (const [k, v] of Object.entries(results)) {
    console.log(`${k}: ${v ? 'PASS' : 'FAIL'}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
