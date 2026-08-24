/**
 * E2E: Marketing Autopilot → Tạo Draft (4 types + no auto-publish)
 *
 * node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-marketing-autopilot-draft-create-e2e.ts
 */
import { randomUUID } from 'crypto';
import type { ConfigService } from '@nestjs/config';
import {
  normalizeAutopilotPlanForDraft,
  normalizeConfirmDraftTypesFilter,
  resolveConfirmDraftTypes,
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

type Case = { name: string; ok: boolean; detail?: string };

function asConfigService(v: 'true' | 'false'): ConfigService {
  return { get: () => v } as unknown as ConfigService;
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function main() {
  const results: Case[] = [];
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
            prompt: dto.prompt ?? 'draft e2e',
            source: 'fallback',
            status: 'DRAFT',
            result: {
              schemaVersion: 'funnel-generator.v1',
              analysis: { summary: 'draft e2e' },
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
              name: 'Draft E2E Funnel',
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
          leads: { total: 10, hot: 2, unassigned: 1, noFollowUp: 3 },
          bookings: { total: 2, upcoming: 1, completed: 1 },
          conversion: { leadToBookingRate: 20 },
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

  const missionOrchestrator = {
    startMissionAfterCreate: async () => null,
    toPublicMission: (m: any) => m,
  } as any;

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
    data: { name: 'Autopilot Draft E2E Org', slug: `autopilot-draft-e2e-${suffix}` },
  });
  const role = await prisma.role.create({
    data: { organizationId: org.id, code: 'OWNER', name: 'Owner', description: 'test' },
  });
  const user = await prisma.user.create({
    data: {
      email: `draft.e2e.${suffix}@example.com`,
      name: 'Draft E2E User',
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
    // Normalize / filter unit checks
    const normalized = normalizeAutopilotPlanForDraft({});
    assert(normalized.offer.productName, 'normalize productName');
    assert(normalized.content.themes.length > 0, 'normalize themes');
    assert(normalized.funnel.stages.length > 0, 'normalize stages');
    assert(
      normalizeConfirmDraftTypesFilter([null, undefined, 'CONTENT_DRAFT', 'x'])?.join(',') ===
        'CONTENT_DRAFT',
      'normalizeConfirmDraftTypesFilter',
    );
    assert(
      resolveConfirmDraftTypes([], ['CONTENT_DRAFT']).allowed.join(',') === 'CONTENT_DRAFT',
      'explicit filter creates CONTENT_DRAFT without NBA',
    );

    const project = await service.create(authUser as any, {
      projectName: 'Draft E2E Project',
      productName: 'Gói Marketing Test',
      productPrice: 2_000_000,
      customerProfile: 'Chủ spa 25-45',
      targetArea: 'Hà Nội',
      monthlyBudget: 10_000_000,
      primaryGoal: 'Tăng Booking',
    } as any);

    // Corrupt stored plan to prove normalize heals incomplete AI payload
    await prisma.marketingAutopilotProject.update({
      where: { id: project.id },
      data: {
        analysisJson: {
          ...(project.analysisJson as object),
          plan: { offer: { productName: 'Gói Marketing Test' } },
          nextBestActions: [],
          safety: { policy: 'READ_ONLY', highRiskActionSuggestionsBlocked: [] },
        } as any,
      },
    });
    const analysisRow = await prisma.marketingAutopilotAnalysis.findFirst({
      where: { projectId: project.id, organizationId: org.id },
      orderBy: { createdAt: 'desc' },
    });
    if (analysisRow) {
      await prisma.marketingAutopilotAnalysis.update({
        where: { id: analysisRow.id },
        data: {
          recommendationJson: {
            ...(analysisRow.recommendationJson as object),
            plan: { offer: { productName: 'Gói Marketing Test' } },
            nextBestActions: [],
            safety: { policy: 'READ_ONLY', highRiskActionSuggestionsBlocked: [] },
          } as any,
        },
      });
    }

    const types = [
      'CONTENT_DRAFT',
      'FUNNEL_DRAFT',
      'AUTOMATION_DRAFT',
      'CAMPAIGN_DRAFT',
    ] as const;

    const created: Record<
      string,
      { draftId: string; editUrl: string; status: string; externalEntityId: string | null }
    > = {};

    for (const type of types) {
      const confirm = await service.confirmDraft(
        authUser as any,
        project.id,
        `draft-e2e:${project.id}:${type}:${suffix}`,
        [type],
      );
      const row = (confirm.results ?? confirm.drafts)?.[0] as any;
      assert(row, `${type} missing result`);
      assert(row.draftId || row.id, `${type} missing draftId`);
      assert(row.type === type, `${type} type mismatch`);
      assert(String(row.status).toUpperCase() === 'DRAFT', `${type} status!=DRAFT got ${row.status}`);
      assert(typeof row.editUrl === 'string' && row.editUrl.length > 0, `${type} missing editUrl`);

      const dbDraft = await prisma.marketingAutopilotDraft.findFirst({
        where: {
          organizationId: org.id,
          projectId: project.id,
          type,
        },
        orderBy: { createdAt: 'desc' },
      });
      assert(dbDraft, `${type} missing DB row`);
      assert(dbDraft.organizationId === org.id, `${type} org isolation`);
      assert(String(dbDraft.status).toUpperCase() === 'DRAFT', `${type} DB status`);

      const adapter = ((dbDraft.payload as any)?.adapter ?? {}) as Record<string, unknown>;
      const externalEntityId =
        (typeof row.externalEntityId === 'string' && row.externalEntityId) ||
        (typeof adapter.externalEntityId === 'string' && adapter.externalEntityId) ||
        null;
      assert(externalEntityId, `${type} missing externalEntityId payload=${JSON.stringify(adapter)}`);

      created[type] = {
        draftId: row.draftId ?? row.id,
        editUrl: row.editUrl,
        status: row.status,
        externalEntityId,
      };
      results.push({
        name: type,
        ok: true,
        detail: `draftId=${created[type].draftId} entity=${externalEntityId}`,
      });
    }

    // NO_AUTO_PUBLISH: external entities must remain draft/paused/inactive
    const contentId = created.CONTENT_DRAFT.externalEntityId!;
    const funnelId = created.FUNNEL_DRAFT.externalEntityId!;
    const flowId = created.AUTOMATION_DRAFT.externalEntityId!;
    const campaignId = created.CAMPAIGN_DRAFT.externalEntityId!;

    const [content, funnelRec, flow, campaign] = await Promise.all([
      prisma.contentTeleprompterSource.findFirst({
        where: { id: contentId, organizationId: org.id },
      }),
      // FUNNEL_DRAFT external entity = FunnelRecommendation (canvas), not FunnelBlueprint
      prisma.marketingAutopilotFunnelSpec.findFirst({
        where: { id: funnelId, organizationId: org.id },
      }),
      prisma.automationFlow.findFirst({ where: { id: flowId, organizationId: org.id } }),
      prisma.messagingCampaign.findFirst({ where: { id: campaignId, organizationId: org.id } }),
    ]);

    const noAutoPublish =
      !!content &&
      funnelRec?.status === 'DRAFT' &&
      !!funnelRec?.completeSpec &&
      flow?.isActive === false &&
      flow?.isPaused === true &&
      campaign?.status === 'DRAFT';

    const contentQuality =
      !!content &&
      !/##\s*(Themes|Formats|Channels)/i.test(content.editedScript) &&
      content.editedScript.includes('AUTOPILOT_CONTENT_BUNDLE_JSON') &&
      content.editedScript.length > 500;

    results.push({
      name: 'CONTENT_DRAFT_QUALITY',
      ok: contentQuality,
      detail: contentQuality
        ? `scriptLen=${content?.editedScript.length}`
        : `generic or short script len=${content?.editedScript?.length ?? 0}`,
    });

    results.push({
      name: 'NO_AUTO_PUBLISH',
      ok: noAutoPublish,
      detail: noAutoPublish
        ? `funnelRec=${funnelRec?.status} flowActive=${flow?.isActive} campaign=${campaign?.status}`
        : `FAIL funnelRec=${funnelRec?.status} hasSpec=${!!funnelRec?.completeSpec} flowActive=${flow?.isActive} paused=${flow?.isPaused} campaign=${campaign?.status} content=${!!content}`,
    });

    assert(noAutoPublish, 'auto-publish safety violated');
    assert(contentQuality, 'content draft quality');
  } finally {
    // Best-effort cleanup of test org (cascade)
    await prisma.organization.delete({ where: { id: org.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }

  const labels: Record<string, string> = {
    CONTENT_DRAFT: 'CONTENT_DRAFT',
    FUNNEL_DRAFT: 'FUNNEL_DRAFT',
    AUTOMATION_DRAFT: 'AUTOMATION_DRAFT',
    CAMPAIGN_DRAFT: 'CAMPAIGN_DRAFT',
    NO_AUTO_PUBLISH: 'NO_AUTO_PUBLISH',
  };

  let allPass = true;
  for (const r of results) {
    const tag = labels[r.name] ?? r.name;
    console.log(`${tag} ${r.ok ? 'PASS' : 'FAIL'}${r.detail ? ` — ${r.detail}` : ''}`);
    if (!r.ok) allPass = false;
  }

  if (!allPass) {
    process.exitCode = 1;
    throw new Error('Marketing Autopilot draft E2E failed');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
