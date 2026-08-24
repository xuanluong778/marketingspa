import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import type { ConfigService } from '@nestjs/config';
import {
  computeOutcome,
  extractOutcomeMetrics,
  buildPlannerBusinessLearningsPayload,
} from '@marketingspa/shared';
import { PrismaService } from '../apps/api/src/prisma/prisma.service';
import { AuditService } from '../apps/api/src/audit/audit.service';
import { MarketingAutopilotService } from '../apps/api/src/marketing-autopilot/marketing-autopilot.service';
import { MarketingAutopilotPlannerService } from '../apps/api/src/marketing-autopilot/marketing-autopilot-planner.service';
import { MarketingAutopilotOutcomeLearningService } from '../apps/api/src/marketing-autopilot/outcome/marketing-autopilot-outcome-learning.service';
import type { MarketingAutopilotDraftAdapter } from '../apps/api/src/marketing-autopilot/marketing-autopilot-draft.adapter';
import type { MarketingContextEngineService } from '../apps/api/src/marketing-autopilot/context/marketing-context-engine.service';
import type { OpenAiService } from '../apps/api/src/openai/openai.service';
import type { MarketingContextSnapshotPayload } from '../apps/api/src/marketing-autopilot/context/marketing-context.types';

type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
};

function assert(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}

function asConfigService(v: 'true' | 'false'): ConfigService {
  return { get: () => v } as unknown as ConfigService;
}

function emptyContext(orgId: string, overrides?: Partial<MarketingContextSnapshotPayload['metrics']>): MarketingContextSnapshotPayload {
  return {
    organizationId: orgId,
    generatedAt: new Date().toISOString(),
    timeRange: { from: new Date(Date.now() - 30 * 86400000).toISOString(), to: new Date().toISOString() },
    engineVersion: 'v1',
    metrics: {
      leads: { total: 40, hot: 5, unassigned: 3, noFollowUp: 12 },
      bookings: { total: 4, upcoming: 1, completed: 3 },
      conversion: { leadToBookingRate: 10 },
      revenue: { total: 2_000_000, currency: 'VND' },
      ads: { spend: 5_000_000, impressions: 10000, clicks: 200, ctr: 2, cpc: 25000, cpl: 125000, roas: 0.8 },
      email: { campaigns: 2, sent: 100, openRate: 25, clickRate: 3 },
      chatbot: { bots: 1, openConversations: 2, leadsCaptured: 8 },
      funnel: { activeFunnels: 1, pipelineStages: 4, leadsInFunnel: 10 },
      campaigns: { messagingActive: 1, messagingSent: 50, legacyCampaigns: 0 },
      content: { teleprompterSources: 2, autoPostDrafts: 1, autoPostPublished: 0 },
      automation: { activeFlows: 1, pausedFlows: 0, logsSuccess: 10, logsFailed: 1 },
      ...(overrides as any),
    },
    insights: [],
    sources: [{ domain: 'crm.leads', status: 'OK', recordCount: 40 }],
  };
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();

  const audit = new AuditService(prisma);
  const config = asConfigService('true');

  const orgA = await prisma.organization.create({
    data: { name: 'Outcome Org A', slug: `outcome-a-${randomUUID().slice(0, 8)}` },
  });
  const orgB = await prisma.organization.create({
    data: { name: 'Outcome Org B', slug: `outcome-b-${randomUUID().slice(0, 8)}` },
  });
  const roleA = await prisma.role.create({
    data: { organizationId: orgA.id, code: 'OWNER', name: 'Owner', description: 't' },
  });
  const roleB = await prisma.role.create({
    data: { organizationId: orgB.id, code: 'OWNER', name: 'Owner', description: 't' },
  });
  const userA = await prisma.user.create({
    data: {
      email: `oa.${randomUUID().slice(0, 8)}@example.com`,
      name: 'User A',
      organizationId: orgA.id,
      roleId: roleA.id,
      authProvider: 'LOCAL',
      isActive: true,
    },
  });
  const userB = await prisma.user.create({
    data: {
      email: `ob.${randomUUID().slice(0, 8)}@example.com`,
      name: 'User B',
      organizationId: orgB.id,
      roleId: roleB.id,
      authProvider: 'LOCAL',
      isActive: true,
    },
  });

  const authA: AuthUser = {
    id: userA.id,
    email: userA.email,
    name: userA.name,
    role: 'OWNER',
    organizationId: orgA.id,
  };

  const snapshotId = randomUUID();
  const contextEngine = {
    getContext: async (organizationId: string) => ({
      snapshot: emptyContext(organizationId),
      snapshotId,
      fromCache: false,
    }),
  } as unknown as MarketingContextEngineService;

  const draftAdapter = {
    createDraft: async (type: string) => ({
      adapter: 'MockDraftAdapter',
      externalEntityType: 'mock',
      externalEntityId: `mock-${type}`,
    }),
  } as unknown as MarketingAutopilotDraftAdapter;

  const contentDraft = {
    createContentDraft: async () => ({ ideas: [] }),
    upsertTeleprompterFromBundle: async () => ({ id: 'mock-content' }),
  } as any;

  const openai = {
    isConfigured: () => false,
    getDefaultModel: () => 'gpt-4o-mini',
    chatCompletion: async () => {
      throw new Error('no llm');
    },
  } as unknown as OpenAiService;

  const planner = new MarketingAutopilotPlannerService(openai, {
    get: (k: string) => (k === 'MARKETING_AUTOPILOT_PLANNER_MODEL' ? 'gpt-4o-mini' : undefined),
  } as ConfigService);

  const outcomeLearning = new MarketingAutopilotOutcomeLearningService(prisma, contextEngine);
  const missionOrchestrator = {
    startMissionAfterCreate: async () => null,
    toPublicMission: (m: any) => m,
  } as any;
  const service = new MarketingAutopilotService(
    prisma,
    config,
    audit,
    draftAdapter,
    contentDraft,
    contextEngine,
    planner,
    outcomeLearning,
    missionOrchestrator,
  );

  const dto = {
    projectName: 'Outcome Test',
    productName: 'Serum Glow',
    productPrice: 500000,
    customerProfile: 'Nữ 28-40 HCM',
    targetArea: 'TP.HCM',
    monthlyBudget: 10_000_000,
    primaryGoal: 'Tăng booking',
  };

  const project = await service.create(authA as any, dto as any);
  const tracksAfterStrategy = await outcomeLearning.listTracksForOrg(orgA.id, project.id);
  const strategyTrack = tracksAfterStrategy.find((t) => t.actionType === 'STRATEGY');
  assert(strategyTrack, 'Missing STRATEGY outcome track');
  assert(strategyTrack.evaluations.length === 3, 'Expected horizons 1/7/30');
  assert(
    strategyTrack.evaluations.every((e) => [1, 7, 30].includes(e.horizonDays) && e.status === 'PENDING'),
    'Horizons not pending',
  );
  const before = strategyTrack.beforeMetricsJson as any;
  assert(before.leads === 40 && before.cpl === 125000, 'Before metrics missing');

  const confirm = await service.confirmDraft(authA as any, project.id, `outcome:${project.id}`);
  assert((confirm.drafts ?? []).length > 0, 'Expected drafts');
  const tracksAfterDraft = await outcomeLearning.listTracksForOrg(orgA.id, project.id);
  const draftTracks = tracksAfterDraft.filter((t) => t.actionType === 'DRAFT');
  assert(draftTracks.length === confirm.drafts.length, 'Draft tracks mismatch');

  const afterImproved = extractOutcomeMetrics({
    leads: { total: 55 },
    bookings: { total: 8 },
    conversion: { leadToBookingRate: 14 },
    revenue: { total: 4_000_000 },
    ads: { spend: 5_000_000, cpl: 90_000, roas: 1.5 },
    email: { openRate: 30, clickRate: 5 },
    chatbot: { leadsCaptured: 12 },
    funnel: { leadsInFunnel: 15 },
  });
  const day7 = await outcomeLearning.forceEvaluateHorizon(orgA.id, strategyTrack.id, 7, afterImproved);
  const outcome = day7.outcomeJson as any;
  assert(outcome.verdict === 'IMPROVED', `Expected IMPROVED got ${outcome.verdict}`);
  assert(outcome.correlationOnly === true, 'Must mark correlationOnly');

  const learnings = await outcomeLearning.getBusinessLearningsForPlanner(orgA.id);
  assert(learnings.disclaimer.toLowerCase().includes('correlation'), 'Disclaimer missing');
  assert(learnings.learnings.length > 0, 'Expected business learnings');
  assert(
    learnings.learnings.every((l) => l.correlationOnly === true),
    'All learnings must be correlationOnly',
  );
  assert(
    learnings.learnings.some((l) => l.category === 'OFFER' || l.category === 'TACTIC_SUCCESS'),
    'Expected offer/tactic learning',
  );

  // Tenant isolation: org B cannot see org A track
  let tenantBlocked = false;
  try {
    await outcomeLearning.forceEvaluateHorizon(orgB.id, strategyTrack.id, 1, afterImproved);
  } catch {
    tenantBlocked = true;
  }
  assert(tenantBlocked, 'Tenant isolation failed');

  const learningsB = await outcomeLearning.getBusinessLearningsForPlanner(orgB.id);
  assert(learningsB.learnings.length === 0, 'Org B must not see Org A learnings');

  // Learning context for planner payload
  const payload = buildPlannerBusinessLearningsPayload(learnings.learnings);
  assert(payload.learnings.length === learnings.learnings.length, 'Planner payload mismatch');
  assert(payload.disclaimer.includes('Correlation') || payload.disclaimer.includes('tương quan') || payload.disclaimer.toLowerCase().includes('correlation'), 'Caveat missing');

  // Decline path → TACTIC_FAILED
  const afterWorse = extractOutcomeMetrics({
    leads: { total: 20 },
    bookings: { total: 1 },
    conversion: { leadToBookingRate: 5 },
    revenue: { total: 500_000 },
    ads: { spend: 5_000_000, cpl: 250_000, roas: 0.2 },
    email: { openRate: 10, clickRate: 1 },
    chatbot: { leadsCaptured: 2 },
    funnel: { leadsInFunnel: 3 },
  });
  const draftTrack = draftTracks[0]!;
  await outcomeLearning.forceEvaluateHorizon(orgA.id, draftTrack.id, 7, afterWorse);
  const learnings2 = await outcomeLearning.getBusinessLearningsForPlanner(orgA.id);
  assert(
    learnings2.learnings.some((l) => l.category === 'TACTIC_FAILED'),
    'Expected TACTIC_FAILED learning',
  );

  // Existing system still works (create + confirm already passed)
  const existingSystemPass = Boolean(project.id) && (confirm.drafts?.length ?? 0) > 0;

  // Unit: insufficient data outcome
  const insuff = computeOutcome(
    extractOutcomeMetrics({ leads: { total: null }, bookings: { total: null }, conversion: { leadToBookingRate: null }, ads: {} }),
    extractOutcomeMetrics({ leads: { total: null }, bookings: { total: null }, conversion: { leadToBookingRate: null }, ads: {} }),
  );
  assert(insuff.verdict === 'INSUFFICIENT_DATA', 'INSUFFICIENT_DATA expected');

  const changedFiles = execSync('git status --porcelain', { cwd: process.cwd() })
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean);
  const facebookFilesModifiedNone = !changedFiles.some((f) => {
    const path = f.replace(/^..\s+/, '').trim();
    if (!path.includes('apps/api/src/facebook/') && !path.includes('apps/api/src/auto-post/')) {
      return false;
    }
    return /\.(ts|tsx)$/.test(path) && !/\.d\.ts$/.test(path);
  });

  const outcomeTrackingPass =
    Boolean(strategyTrack) &&
    draftTracks.length > 0 &&
    strategyTrack.evaluations.length === 3 &&
    outcome.verdict === 'IMPROVED';
  const businessMemoryPass = learnings.learnings.length > 0 && learnings2.learnings.some((l) => l.category === 'TACTIC_FAILED');
  const tenantPass = tenantBlocked && learningsB.learnings.length === 0;
  const learningContextPass = payload.learnings.every((l) => l.correlationOnly === true);

  console.log(`OUTCOME TRACKING ${outcomeTrackingPass ? 'PASS' : 'FAIL'}`);
  console.log(`BUSINESS MEMORY ${businessMemoryPass ? 'PASS' : 'FAIL'}`);
  console.log(`TENANT ${tenantPass ? 'PASS' : 'FAIL'}`);
  console.log(`LEARNING CONTEXT ${learningContextPass ? 'PASS' : 'FAIL'}`);
  console.log(`EXISTING SYSTEM ${existingSystemPass ? 'PASS' : 'FAIL'}`);
  console.log(`FACEBOOK FILES MODIFIED ${facebookFilesModifiedNone ? 'NONE' : 'CHANGED'}`);

  if (
    !outcomeTrackingPass ||
    !businessMemoryPass ||
    !tenantPass ||
    !learningContextPass ||
    !existingSystemPass ||
    !facebookFilesModifiedNone
  ) {
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
