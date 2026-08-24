import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../apps/api/src/prisma/prisma.service';
import { AuditService } from '../apps/api/src/audit/audit.service';
import { MarketingAutopilotService } from '../apps/api/src/marketing-autopilot/marketing-autopilot.service';
import type { MarketingAutopilotDraftAdapter } from '../apps/api/src/marketing-autopilot/marketing-autopilot-draft.adapter';
import type { MarketingContextEngineService } from '../apps/api/src/marketing-autopilot/context/marketing-context-engine.service';
import type { MarketingAutopilotPlannerService } from '../apps/api/src/marketing-autopilot/marketing-autopilot-planner.service';
import type { MarketingAutopilotOutcomeLearningService } from '../apps/api/src/marketing-autopilot/outcome/marketing-autopilot-outcome-learning.service';

type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
  permissions?: string[];
  employeeId?: string | null;
};

function asConfigService(v: 'true' | 'false'): ConfigService {
  return { get: () => v } as unknown as ConfigService;
}

function assert(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();

  const audit = new AuditService(prisma);
  const config = asConfigService('true');
  const draftAdapter = {
    createDraft: async (type: string) => ({
      adapter: 'MockMarketingAutopilotDraftAdapter',
      externalEntityType: 'mock_entity',
      externalEntityId: `mock-${type}-${randomUUID()}`,
    }),
  } as unknown as MarketingAutopilotDraftAdapter;
  const contextEngine = {
    getContext: async (orgId: string) => ({
      snapshot: {
        organizationId: orgId,
        generatedAt: new Date().toISOString(),
        timeRange: { from: new Date(Date.now() - 30 * 86400000).toISOString(), to: new Date().toISOString() },
        engineVersion: 'v1',
        metrics: {
          leads: { total: null, hot: null, unassigned: null, noFollowUp: null },
          bookings: { total: null, upcoming: null, completed: null },
          conversion: { leadToBookingRate: null },
          revenue: { total: null, currency: 'VND' },
          ads: { spend: null, impressions: null, clicks: null, ctr: null, cpc: null, cpl: null, roas: null },
          email: { campaigns: null, sent: null, openRate: null, clickRate: null },
          chatbot: { bots: null, openConversations: null, leadsCaptured: null },
          funnel: { activeFunnels: null, pipelineStages: null, leadsInFunnel: null },
          campaigns: { messagingActive: null, messagingSent: null, legacyCampaigns: null },
          content: { teleprompterSources: null, autoPostDrafts: null, autoPostPublished: null },
          automation: { activeFlows: null, pausedFlows: null, logsSuccess: null, logsFailed: null },
        },
        insights: [],
        sources: [],
      },
      snapshotId: null,
      fromCache: false,
    }),
  } as unknown as MarketingContextEngineService;
  const planner = {
    plan: async (_dto: unknown, context: { snapshotId?: string | null }, heuristicFallback: () => unknown) => ({
      analysis: heuristicFallback(),
      engine: 'heuristic-orchestrator',
    }),
  } as unknown as MarketingAutopilotPlannerService;
  const outcomeLearning = {
    getBusinessLearningsForPlanner: async () => ({
      disclaimer: 'Correlation only',
      learnings: [],
    }),
    recordStrategyBaseline: async () => null,
    recordDraftBaselines: async () => [],
  } as unknown as MarketingAutopilotOutcomeLearningService;
  const missionOrchestrator = {
    startMissionAfterCreate: async () => null,
    toPublicMission: (m: any) => m,
  } as any;
  const service = new MarketingAutopilotService(
    prisma,
    config,
    audit,
    draftAdapter,
    {} as any,
    contextEngine,
    planner,
    outcomeLearning,
    missionOrchestrator,
  );

  // Create two tenants to verify tenant isolation
  const org1 = await prisma.organization.create({
    data: { name: 'Autopilot MVP Org 1', slug: `autopilot-mvp-org1-${randomUUID().slice(0, 8)}` },
  });
  const org2 = await prisma.organization.create({
    data: { name: 'Autopilot MVP Org 2', slug: `autopilot-mvp-org2-${randomUUID().slice(0, 8)}` },
  });

  const role1 = await prisma.role.create({
    data: { organizationId: org1.id, code: 'OWNER', name: 'Owner', description: 'test' },
  });
  const role2 = await prisma.role.create({
    data: { organizationId: org2.id, code: 'OWNER', name: 'Owner', description: 'test' },
  });

  const user1 = await prisma.user.create({
    data: {
      email: `mvp.${randomUUID().slice(0, 8)}@example.com`,
      name: 'Autopilot MVP User1',
      organizationId: org1.id,
      roleId: role1.id,
      authProvider: 'LOCAL',
      isActive: true,
    },
  });

  const user2 = await prisma.user.create({
    data: {
      email: `mvp.${randomUUID().slice(0, 8)}@example.com`,
      name: 'Autopilot MVP User2',
      organizationId: org2.id,
      roleId: role2.id,
      authProvider: 'LOCAL',
      isActive: true,
    },
  });

  const authUser1: AuthUser = {
    id: user1.id,
    email: user1.email,
    name: user1.name,
    role: 'OWNER',
    organizationId: org1.id,
  };

  const project = await service.create(authUser1 as any, {
    projectName: 'MVP Test Project',
    productName: 'Serum Test',
    productPrice: 500000,
    customerProfile: 'Nữ 28-40 tuổi, quan tâm trị nám',
    targetArea: 'TP.HCM',
    monthlyBudget: 15000000,
    primaryGoal: 'Tăng lead tư vấn và booking',
  } as any);

  const createdProjectId = project.id as string;

  // AI PLAN check
  const planPayload = await service.getPlan(org1.id, createdProjectId);
  const analysisPlan = planPayload.plan ?? planPayload; // safety fallback
  const requiredKeys = [
    'customersTarget',
    'offer',
    'funnel',
    'content',
    'ads',
    'crm',
    'chatbot',
    'emailMessengerZalo',
    'remarketing',
    'kpi',
    'budget',
    'timeline',
  ];
  const hasAllPlanKeys = requiredKeys.every((k) => Boolean((analysisPlan as any)?.[k]));
  const allowedDraftTypes = new Set(['CONTENT_DRAFT', 'FUNNEL_DRAFT', 'AUTOMATION_DRAFT', 'CAMPAIGN_DRAFT']);
  const nextBest = Array.isArray(planPayload.nextBestActions) ? planPayload.nextBestActions : [];
  const nextBestTypes = nextBest.map((x: any) => x?.type).filter(Boolean);
  const allNextBestAllowed = nextBestTypes.every((t: string) => allowedDraftTypes.has(t));

  const aiPlanPass = hasAllPlanKeys && allNextBestAllowed && nextBestTypes.length >= 4;

  // DRAFT ENGINE check
  const idempotencyKey1 = `mvp-run:${createdProjectId}:1`;
  const confirm1 = await service.confirmDraft(authUser1 as any, createdProjectId, idempotencyKey1);
  const createdDraftTypes1 = (confirm1.drafts ?? []).map((d: any) => d.type);
  const draftEnginePass =
    createdDraftTypes1.length >= 4 &&
    createdDraftTypes1.every((t: string) => allowedDraftTypes.has(t)) &&
    ['CONTENT_DRAFT', 'FUNNEL_DRAFT', 'AUTOMATION_DRAFT', 'CAMPAIGN_DRAFT'].every((t) =>
      createdDraftTypes1.includes(t),
    );

  // HIGH-RISK BLOCK check (inject disallowed nextBestAction types in analysis json)
  const latestAnalysis = await prisma.marketingAutopilotAnalysis.findFirst({
    where: { projectId: createdProjectId, organizationId: org1.id },
    orderBy: { createdAt: 'desc' },
  });
  assert(latestAnalysis, 'Missing marketing_autopilot_analyses for project');
  const injected = {
    ...(latestAnalysis.recommendationJson as any),
    nextBestActions: [{ type: 'SEND_EMAIL', label: 'Should be blocked' }],
  };
  await prisma.marketingAutopilotAnalysis.update({
    where: { id: latestAnalysis.id },
    data: { recommendationJson: injected },
  });

  const idempotencyKey2 = `mvp-run:${createdProjectId}:2`;
  const confirm2 = await service.confirmDraft(authUser1 as any, createdProjectId, idempotencyKey2);
  const run2 = confirm2.draftRun as any;
  const highRiskBlockPass =
    (confirm2.drafts ?? []).length === 0 && run2?.status === 'BLOCKED' && (run2?.blockedActionsJson?.blockedHighRiskActionSuggestions ?? []).length > 0;

  // EXISTING SYSTEM check (smoke: service status + tenant isolation)
  const existingSystemPass = (() => {
    const st = service.getStatus(org1.id);
    assert(st.enabled === true, 'Expected enabled=true in MVP test');
    return true;
  })();

  // Tenant isolation: user2 must not be able to confirm org1 project
  let tenantIsolationOk = false;
  try {
    await service.confirmDraft(user2 as any, createdProjectId, `mvp-run:${createdProjectId}:tenant`);
  } catch {
    tenantIsolationOk = true;
  }

  // FACEBOOK SAFETY check: we only create draft types we own
  const facebookSafetyPass =
    createdDraftTypes1.every((t: string) => allowedDraftTypes.has(t)) &&
    (confirm1.draftRun as any)?.blockedActionsJson?.blockedHighRiskActionSuggestions?.length === 0;

  // FACEBOOK FILES MODIFIED check: ensure no changes under known Meta/Facebook app-review sensitive areas.
  const changedFiles = execSync('git diff --name-only').toString().trim().split('\n').filter(Boolean);
  const forbiddenPatterns = [
    'apps/api/src/auto-post/',
    'apps/api/src/auto-post',
    'apps/api/src/facebook/',
    'apps/api/src/facebook',
  ];
  const facebookFilesModifiedNone = !changedFiles.some((f) => forbiddenPatterns.some((p) => f.includes(p)));

  console.log(`AI PLAN: ${aiPlanPass ? 'PASS' : 'FAIL'}`);
  console.log(`DRAFT ENGINE: ${draftEnginePass ? 'PASS' : 'FAIL'}`);
  console.log(`HIGH-RISK BLOCK: ${highRiskBlockPass ? 'PASS' : 'FAIL'}`);
  console.log(`EXISTING SYSTEM: ${existingSystemPass && tenantIsolationOk ? 'PASS' : 'FAIL'}`);
  console.log(`FACEBOOK SAFETY: ${facebookSafetyPass ? 'PASS' : 'FAIL'}`);
  console.log(`FACEBOOK FILES MODIFIED: ${facebookFilesModifiedNone ? 'NONE' : 'CHANGED'}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  // Ensure harness always sees a failure signal
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

