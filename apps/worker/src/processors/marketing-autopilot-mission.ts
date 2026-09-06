/**
 * BullMQ: Marketing Autopilot AI Orchestrator A→Z mission runner.
 * Prisma-only (no Nest API imports) so the worker package typechecks on origin/main.
 * All created assets stay DRAFT. Funnel/Email live on Autopilot-owned tables.
 */
import type { Job } from 'bullmq';
import { AutomationTriggerType, MessageChannel, MessagingCampaignKind, prisma } from '@marketingspa/database';
import {
  buildFallbackFunnelComplete,
  buildFallbackFunnelRecommendations,
  marketingMissionQueuePayloadSchema,
  normalizeAutopilotPlanForDraft,
  resolveAutopilotDraftEditUrl,
} from '@marketingspa/shared';
import { runMarketingMissionPipeline } from '../lib/marketing-mission-pipeline';

type AuthUserLite = { id: string; organizationId: string };
type DraftType = 'CONTENT_DRAFT' | 'FUNNEL_DRAFT' | 'AUTOMATION_DRAFT' | 'CAMPAIGN_DRAFT';

async function createDraft(
  type: DraftType,
  user: AuthUserLite,
  plan: unknown,
  project: {
    id: string;
    name: string;
    productName?: string;
    primaryGoal?: string;
    customerProfile?: string;
    targetArea?: string;
    productPrice?: number;
  },
) {
  const safePlan = normalizeAutopilotPlanForDraft(plan, {
    productName: project.productName,
    primaryGoal: project.primaryGoal,
    customerProfile: project.customerProfile,
    targetArea: project.targetArea,
    productPrice: project.productPrice,
  }) as {
    offer: { productName: string; primaryGoal: string; productPrice?: number; valueProps?: string[] };
    customersTarget: { targetProfile: string; targetArea: string };
    valueProposition?: string;
    chatbot?: { keyFlows?: string[]; purpose?: string };
    crm?: { lifecycle?: string[] };
  };

  if (type === 'CONTENT_DRAFT') {
    const script = [
      `Autopilot content — ${project.name}`,
      safePlan.offer.primaryGoal,
      safePlan.valueProposition ?? (safePlan.offer.valueProps ?? []).join('; '),
    ].join('\n\n');
    const row = await prisma.contentTeleprompterSource.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        sourceType: 'marketing_autopilot',
        sourceTitle: `Autopilot — ${project.name}`.slice(0, 500),
        originalScript: script,
        editedScript: script,
      },
    });
    return {
      adapter: 'TeleprompterSourceService',
      externalEntityType: 'teleprompter_source',
      externalEntityId: row.id,
      editUrl: resolveAutopilotDraftEditUrl('CONTENT_DRAFT', row.id),
    };
  }

  if (type === 'FUNNEL_DRAFT') {
    const prompt = `Autopilot Funnel — ${project.name}. ${safePlan.offer.primaryGoal}. DRAFT ONLY.`;
    const preview = buildFallbackFunnelRecommendations(prompt);
    const slug = preview.recommendations[0]?.templateSlug ?? 'consultation';
    const complete = buildFallbackFunnelComplete({
      templateSlug: slug,
      option: preview.recommendations[0],
      analysis: preview.analysis,
    });
    const row = await prisma.marketingAutopilotFunnelSpec.create({
      data: {
        organizationId: user.organizationId,
        createdById: user.id,
        prompt,
        result: preview as object,
        source: 'fallback',
        selectedSlug: slug,
        selectedAt: new Date(),
        completeSpec: complete as object,
        completeSource: 'fallback',
        completeGeneratedAt: new Date(),
        status: 'DRAFT',
      },
    });
    return {
      adapter: 'FunnelGeneratorService',
      externalEntityType: 'funnel_recommendation',
      externalEntityId: row.id,
      editUrl: resolveAutopilotDraftEditUrl('FUNNEL_DRAFT', row.id),
    };
  }

  if (type === 'AUTOMATION_DRAFT') {
    const flow = await prisma.automationFlow.create({
      data: {
        organizationId: user.organizationId,
        name: `Autopilot Automation — ${project.name}`.slice(0, 200),
        triggerType: AutomationTriggerType.LEAD_CREATED,
        isActive: false,
        isPaused: true,
        delayMinutes: 0,
        channel: MessageChannel.EMAIL,
        actions: [{ type: 'DRAFT_STEP', order: 1, text: 'Autopilot draft' }],
        triggerConfig: { source: 'marketing_autopilot_worker', draftOnly: true },
      },
    });
    return {
      adapter: 'AutomationService',
      externalEntityType: 'automation_flow',
      externalEntityId: flow.id,
      editUrl: resolveAutopilotDraftEditUrl('AUTOMATION_DRAFT', flow.id),
    };
  }

  const campaign = await prisma.messagingCampaign.create({
    data: {
      organizationId: user.organizationId,
      name: `Autopilot Campaign — ${project.name}`.slice(0, 200),
      channel: MessageChannel.MESSENGER,
      campaignType: MessagingCampaignKind.BROADCAST,
      createdByUserId: user.id,
      segmentConfig: { source: 'marketing_autopilot_worker', draftOnly: true },
      variables: { productName: safePlan.offer.productName },
    },
  });
  return {
    adapter: 'MessagingCampaignService',
    externalEntityType: 'messaging_campaign',
    externalEntityId: campaign.id,
    editUrl: resolveAutopilotDraftEditUrl('CAMPAIGN_DRAFT', campaign.id),
  };
}

async function executeAssets(input: {
  missionId: string;
  user: AuthUserLite;
  project: {
    id: string;
    name: string;
    productName: string;
    primaryGoal: string;
    customerProfile: string;
    targetArea: string;
    productPrice: number;
  };
}) {
  const { missionId, user, project } = input;
  const assets: Array<{ module: string; entityType: string; entityId: string; status: string }> = [];
  const skipped: Array<{ module: string; reason: string }> = [];
  const draftRegistry: Array<{ type: string; draftId: string; externalEntityId: string }> = [];

  const existingFunnel = await prisma.marketingMissionAsset.findFirst({
    where: { missionId, entityType: 'funnel_recommendation' },
  });
  let funnelId = existingFunnel?.entityId ?? null;
  if (!funnelId) {
    const preview = buildFallbackFunnelRecommendations(`Autopilot Mission ${missionId.slice(0, 8)}`);
    const row = await prisma.marketingAutopilotFunnelSpec.create({
      data: {
        organizationId: user.organizationId,
        createdById: user.id,
        prompt: `Autopilot Mission ${missionId}`,
        result: preview as object,
        source: 'fallback',
        status: 'DRAFT',
        selectedSlug: 'consultation',
        selectedAt: new Date(),
        completeSpec: buildFallbackFunnelComplete({ templateSlug: 'consultation' }) as object,
        completeSource: 'fallback',
        completeGeneratedAt: new Date(),
      },
    });
    funnelId = row.id;
    await prisma.marketingMissionAsset.create({
      data: {
        organizationId: user.organizationId,
        missionId,
        module: 'FUNNEL',
        assetType: 'FUNNEL_DRAFT',
        entityType: 'funnel_recommendation',
        entityId: row.id,
        status: 'DRAFT',
        adapter: 'FunnelGeneratorService',
        editUrl: resolveAutopilotDraftEditUrl('FUNNEL_DRAFT', row.id),
      },
    });
    assets.push({
      module: 'FUNNEL',
      entityType: 'funnel_recommendation',
      entityId: row.id,
      status: 'DRAFT',
    });
  }

  const post = await prisma.autoPost.create({
    data: {
      userId: user.id,
      organizationId: user.organizationId,
      postType: 'SPA_SALES',
      topic: `Autopilot: ${project.primaryGoal}`.slice(0, 500),
      caption: `${project.productName}\n\n[DRAFT — chưa publish Facebook]`,
      cta: project.primaryGoal.slice(0, 200),
      spaService: project.productName.slice(0, 200),
      targetAudience: project.customerProfile.slice(0, 500),
      status: 'DRAFT',
    },
  });
  assets.push({ module: 'CONTENT', entityType: 'auto_post', entityId: post.id, status: 'DRAFT' });

  const email = await prisma.marketingAutopilotEmailDraft.create({
    data: {
      organizationId: user.organizationId,
      name: `Autopilot Email — ${project.name}`.slice(0, 200),
      subject: `${project.productName}: ${project.primaryGoal}`.slice(0, 200),
      createdByUserId: user.id,
      status: 'DRAFT',
    },
  });
  assets.push({ module: 'EMAIL', entityType: 'email_campaign', entityId: email.id, status: 'DRAFT' });

  if (funnelId) {
    await prisma.marketingAutopilotScoringConfig.upsert({
      where: { funnelId },
      create: {
        organizationId: user.organizationId,
        funnelId,
        maxScore: 100,
        mqlThreshold: 50,
        sqlThreshold: 80,
        isActive: true,
        source: 'worker',
      },
      update: { source: 'worker' },
    });
  } else {
    skipped.push({ module: 'CRM_SCORING', reason: 'no funnel spec' });
  }

  return { assets, skipped, draftRegistry };
}

export async function processMarketingAutopilotMission(job: Job) {
  const parsed = marketingMissionQueuePayloadSchema.safeParse(job.data);
  if (!parsed.success) {
    throw new Error(`Invalid mission job payload: ${parsed.error.message}`);
  }
  const { missionId, organizationId } = parsed.data;

  const mission = await prisma.marketingMission.findFirst({
    where: { id: missionId, organizationId },
  });
  if (!mission) {
    console.warn(`[mission-worker] mission ${missionId} not found — skip`);
    return { skipped: true, reason: 'not_found' };
  }
  if (
    mission.status === 'READY_FOR_APPROVAL' ||
    mission.status === 'APPROVED' ||
    mission.status === 'QUEUED' ||
    (mission.status === 'RUNNING' && mission.readyAt)
  ) {
    return { skipped: true, reason: 'already_complete', missionId, status: mission.status };
  }

  const result = await runMarketingMissionPipeline(missionId, {
    prisma: prisma as any,
    logger: {
      warn: (m) => console.warn(m),
      error: (m, ...a) => console.error(m, ...a),
    },
    getContext: async () => ({ snapshotId: null }),
    createDraft: (type, user, plan, project) =>
      createDraft(type as DraftType, user, plan, project),
    executeAssets: (input) => executeAssets(input),
  });

  await job.updateProgress(result.progressPercent);
  return result;
}
