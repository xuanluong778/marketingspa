/**
 * AI Executor — after Blueprint, create REAL draft assets via existing domain services.
 * All assets DRAFT/PAUSED; linked by missionId via MarketingMissionAsset (+ AutopilotDraft registry).
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  AdDraftStatus,
  AdPlatform,
  AutoPostType,
  ChatbotBotStatus,
  MessageChannel,
  MessagingCampaignKind,
  MessagingProviderKind,
  Prisma,
} from '@marketingspa/database';
import { normalizeAutopilotPlanForDraft, resolveAutopilotDraftEditUrl, sortDraftTypesByDependency } from '@marketingspa/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { TeleprompterSourceService } from '../../content-marketing/teleprompter-source.service';
import { FunnelBuilderService, FunnelGeneratorService } from '../compat/domain-stubs';
import { AutomationService } from '../../automation/automation.service';
import { MessagingCampaignService } from '../../messaging-campaign/messaging-campaign.service';
import { AutoPostService } from '../../auto-post/auto-post.service';
import { EmailMarketingService } from '../compat/domain-stubs';
import { ChatbotCskhService } from '../../chatbot-cskh/chatbot-cskh.service';
import { LeadScoringService } from '../compat/domain-stubs';
import { AiAdsManagerService } from '../../ai-ads-manager/ai-ads-manager.service';
import { MarketingAutopilotDraftAdapter } from '../marketing-autopilot-draft.adapter';
import type { MarketingAutopilotPlan } from '../marketing-autopilot.types';

export type ExecutorAssetRecord = {
  module: string;
  entityType: string;
  entityId: string;
  status: string;
  adapter: string;
  assetType?: string;
  recommendationId?: string | null;
  editUrl?: string | null;
  metadata?: Record<string, unknown>;
};

export type ExecutorResult = {
  assets: ExecutorAssetRecord[];
  skipped: Array<{ module: string; reason: string }>;
  draftRegistry: Array<{ type: string; draftId: string; externalEntityId: string }>;
};

@Injectable()
export class MarketingAutopilotExecutorService {
  private readonly logger = new Logger(MarketingAutopilotExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly draftAdapter: MarketingAutopilotDraftAdapter,
    private readonly teleprompter: TeleprompterSourceService,
    private readonly funnelBuilder: FunnelBuilderService,
    private readonly funnelGenerator: FunnelGeneratorService,
    private readonly automation: AutomationService,
    private readonly messagingCampaign: MessagingCampaignService,
    private readonly autoPost: AutoPostService,
    private readonly emailMarketing: EmailMarketingService,
    private readonly chatbot: ChatbotCskhService,
    private readonly leadScoring: LeadScoringService,
    private readonly aiAds: AiAdsManagerService,
  ) {}

  async executeMissionAssets(input: {
    missionId: string;
    user: AuthUser;
    project: {
      id: string;
      name: string;
      productName: string;
      primaryGoal: string;
      customerProfile: string;
      targetArea: string;
      productPrice: number;
    };
    plan: unknown;
    draftRunId: string;
  }): Promise<ExecutorResult> {
    const { missionId, user, project, draftRunId } = input;
    const plan = normalizeAutopilotPlanForDraft(input.plan, {
      productName: project.productName,
      primaryGoal: project.primaryGoal,
      customerProfile: project.customerProfile,
      targetArea: project.targetArea,
      productPrice: project.productPrice,
    }) as MarketingAutopilotPlan;

    const assets: ExecutorAssetRecord[] = [];
    const skipped: ExecutorResult['skipped'] = [];
    const draftRegistry: ExecutorResult['draftRegistry'] = [];

    const register = async (row: ExecutorAssetRecord) => {
      assets.push(row);
      await this.prisma.marketingMissionAsset.upsert({
        where: {
          organizationId_entityType_entityId: {
            organizationId: user.organizationId,
            entityType: row.entityType,
            entityId: row.entityId,
          },
        },
        create: {
          organizationId: user.organizationId,
          missionId,
          module: row.module,
          assetType: row.assetType ?? null,
          recommendationId: row.recommendationId ?? null,
          entityType: row.entityType,
          entityId: row.entityId,
          editUrl: row.editUrl ?? null,
          status: row.status,
          adapter: row.adapter,
          metadataJson: {
            missionId,
            draftOnly: true,
            liveActionsEnabled: false,
            editUrl: row.editUrl ?? null,
            recommendationId: row.recommendationId ?? null,
            ...(row.metadata ?? {}),
          } as Prisma.InputJsonValue,
        },
        update: {
          missionId,
          status: row.status,
          assetType: row.assetType ?? undefined,
          recommendationId: row.recommendationId ?? undefined,
          editUrl: row.editUrl ?? undefined,
          metadataJson: {
            missionId,
            draftOnly: true,
            liveActionsEnabled: false,
            editUrl: row.editUrl ?? null,
            recommendationId: row.recommendationId ?? null,
            ...(row.metadata ?? {}),
          } as Prisma.InputJsonValue,
        },
      });
    };

    const soft = async (module: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        this.logger.warn(`[executor] ${module} skipped: ${reason}`);
        skipped.push({ module, reason });
      }
    };

    // Dependency order: Funnel → Content → Automation → Campaign
    const coreTypes = sortDraftTypesByDependency([
      'FUNNEL_DRAFT',
      'CONTENT_DRAFT',
      'AUTOMATION_DRAFT',
      'CAMPAIGN_DRAFT',
    ]);

    let funnelDomainId: string | null = null;

    for (const type of coreTypes) {
      await soft(type, async () => {
        const existing = await this.prisma.marketingAutopilotDraft.findFirst({
          where: { organizationId: user.organizationId, missionId, type },
          orderBy: { createdAt: 'desc' },
        });
        if (existing) {
          const payload = existing.payload as {
            adapter?: {
              externalEntityId?: string;
              externalEntityType?: string;
              editUrl?: string;
              adapter?: string;
            };
          };
          const entityId = payload?.adapter?.externalEntityId ?? existing.id;
          const entityType = payload?.adapter?.externalEntityType ?? `autopilot_${type.toLowerCase()}`;
          const editUrl =
            payload?.adapter?.editUrl ?? resolveAutopilotDraftEditUrl(type, entityId);
          draftRegistry.push({
            type,
            draftId: existing.id,
            externalEntityId: entityId,
          });
          if (type === 'FUNNEL_DRAFT') funnelDomainId = entityId;
          await register({
            module:
              type === 'CONTENT_DRAFT'
                ? 'CONTENT'
                : type === 'FUNNEL_DRAFT'
                  ? 'FUNNEL'
                  : type === 'AUTOMATION_DRAFT'
                    ? 'AUTOMATION'
                    : 'CAMPAIGN',
            assetType: type,
            entityType,
            entityId,
            editUrl,
            status: existing.status || 'DRAFT',
            adapter: payload?.adapter?.adapter ?? 'existing_draft',
            recommendationId: `nba:${type}`,
            metadata: { reused: true, draftId: existing.id },
          });
          return;
        }
        const adapterResult = await this.draftAdapter.createDraft(type, user, plan, project);
        const editUrl =
          adapterResult.editUrl ??
          resolveAutopilotDraftEditUrl(type, adapterResult.externalEntityId);
        const draft = await this.prisma.marketingAutopilotDraft.create({
          data: {
            organizationId: user.organizationId,
            createdById: user.id,
            projectId: project.id,
            runId: draftRunId,
            missionId,
            type,
            status: 'DRAFT',
            payload: {
              generatedBy: 'marketing_autopilot_executor',
              draftOnly: true,
              liveActionsEnabled: false,
              missionId,
              plan,
              adapter: { ...adapterResult, editUrl },
            } as Prisma.InputJsonValue,
          },
        });
        draftRegistry.push({
          type,
          draftId: draft.id,
          externalEntityId: adapterResult.externalEntityId,
        });
        if (type === 'FUNNEL_DRAFT') funnelDomainId = adapterResult.externalEntityId;
        await register({
          module:
            type === 'CONTENT_DRAFT'
              ? 'CONTENT'
              : type === 'FUNNEL_DRAFT'
                ? 'FUNNEL'
                : type === 'AUTOMATION_DRAFT'
                  ? 'AUTOMATION'
                  : 'CAMPAIGN',
          assetType: type,
          entityType: adapterResult.externalEntityType,
          entityId: adapterResult.externalEntityId,
          editUrl,
          status: 'DRAFT',
          adapter: adapterResult.adapter,
          recommendationId: `nba:${type}`,
          metadata: {
            ...((adapterResult.metadata as Record<string, unknown>) ?? {}),
            draftId: draft.id,
            editUrl,
          },
        });
      });
    }

    // --- Funnel Recommendation only if core FUNNEL_DRAFT did not create one ---
    let funnelRecId: string | null = funnelDomainId;
    await soft('FUNNEL_RECOMMENDATION', async () => {
      if (funnelRecId) return;
      const existing = await this.prisma.marketingMissionAsset.findFirst({
        where: { missionId, entityType: 'funnel_recommendation' },
      });
      if (existing) {
        funnelRecId = existing.entityId;
        return;
      }
      const prompt =
        `Autopilot Mission ${missionId.slice(0, 8)}. ` +
        `Mục tiêu: ${plan.offer.primaryGoal}. Sản phẩm: ${plan.offer.productName}. ` +
        `Khách: ${plan.customersTarget.targetProfile}. Khu vực: ${plan.customersTarget.targetArea}. ` +
        `DRAFT ONLY — không publish.`;
      const rec = await this.funnelGenerator.generate(
        user,
        {
          prompt,
          productService: plan.offer.productName,
          region: plan.customersTarget.targetArea,
          budget: String(plan.budget?.monthlyBudget ?? project.productPrice ?? 0),
        } as any,
        { skipQuota: true },
      );
      funnelRecId = rec.id;
      const firstSlug =
        (rec as { recommendations?: Array<{ templateSlug?: string }> }).recommendations?.[0]
          ?.templateSlug === 'lead-magnet'
          ? 'consultation'
          : (rec as { recommendations?: Array<{ templateSlug?: string }> }).recommendations?.[0]
              ?.templateSlug ?? 'consultation';
      if (firstSlug) {
        await this.prisma.marketingAutopilotFunnelSpec.update({
          where: { id: rec.id },
          data: { selectedSlug: firstSlug, selectedAt: new Date() },
        });
        try {
          await this.funnelGenerator.generateComplete(user, rec.id);
        } catch (completeErr) {
          this.logger.warn(
            `[executor] generateComplete soft-fail: ${completeErr instanceof Error ? completeErr.message : String(completeErr)}`,
          );
        }
      }
      const row = await this.prisma.marketingAutopilotFunnelSpec.findFirst({
        where: { id: rec.id, organizationId: user.organizationId },
      });
      const editUrl = resolveAutopilotDraftEditUrl('FUNNEL_DRAFT', rec.id);
      await register({
        module: 'FUNNEL',
        assetType: 'FUNNEL_DRAFT',
        entityType: 'funnel_recommendation',
        entityId: rec.id,
        editUrl,
        status: row?.status ?? 'DRAFT',
        adapter: 'FunnelGeneratorService',
        recommendationId: `nba:FUNNEL_DRAFT`,
        metadata: {
          selectedSlug: firstSlug,
          hasCompleteSpec: !!row?.completeSpec,
          applied: false,
          deployable: false,
          editUrl,
        },
      });
    });

    // --- CRM lead scoring mapped to funnel (draft config) ---
    if (funnelRecId) {
      await soft('CRM_SCORING', async () => {
        await this.leadScoring.upsertConfig(user.organizationId, funnelRecId!, {
          maxScore: 100,
          mqlThreshold: 50,
          sqlThreshold: 80,
          isActive: true,
          source: 'marketing_autopilot_executor',
          rules: (plan.crm?.lifecycle ?? ['New', 'MQL', 'SQL']).slice(0, 5).map((stage: string, i: number) => ({
            key: `autopilot_${stage}`.toLowerCase().replace(/\s+/g, '_'),
            label: `Autopilot: ${stage}`,
            eventType: 'custom',
            points: 10 + i * 5,
            isActive: true,
            position: i + 1,
          })),
        });
        const cfg = await this.prisma.marketingAutopilotScoringConfig.findFirst({
          where: { organizationId: user.organizationId, funnelId: funnelRecId! },
        });
        if (cfg) {
          await register({
            module: 'CRM',
            entityType: 'funnel_scoring_config',
            entityId: cfg.id,
            status: 'DRAFT',
            adapter: 'LeadScoringService',
            metadata: { funnelId: funnelRecId, missionId },
          });
        }
      });
    }

    // --- Content AutoPost drafts (visible on /auto-post) — reuse Fanpage connection ---
    await soft('CONTENT_AUTOPOST', async () => {
      const defaultFanpage = await this.prisma.autoPostFacebookPage.findFirst({
        where: {
          userId: user.id,
          connection: {
            organizationId: user.organizationId,
            status: { notIn: ['DISCONNECTED', 'ERROR', 'TOKEN_EXPIRED'] },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
      const themes = plan.content?.themes?.length
        ? plan.content.themes.slice(0, 3)
        : [plan.offer.primaryGoal, plan.offer.productName];
      for (const theme of themes) {
        const caption = [
          `${theme}`,
          '',
          plan.valueProposition ?? plan.offer.valueProps?.[0] ?? plan.offer.productName,
          '',
          `CTA: ${plan.offer.primaryGoal}`,
          `#${plan.offer.productName.replace(/\s+/g, '')} #MarketingAutopilot`,
        ].join('\n');
        const post = await this.autoPost.saveDraft(user, {
          postType: AutoPostType.SPA_SALES,
          topic: `Autopilot: ${theme}`.slice(0, 500),
          caption,
          cta: plan.offer.primaryGoal.slice(0, 200),
          spaService: plan.offer.productName.slice(0, 200),
          targetAudience: plan.customersTarget.targetProfile.slice(0, 500),
          tone: 'professional',
          promotion: plan.offer.primaryGoal.slice(0, 300),
          fanpageId: defaultFanpage?.id,
        } as any);
        if (String(post.status) !== 'DRAFT') {
          throw new Error(`AutoPost phải DRAFT, nhận ${post.status}`);
        }
        await register({
          module: 'CONTENT',
          entityType: 'auto_post',
          entityId: post.id,
          status: 'DRAFT',
          adapter: 'AutoPostService',
          metadata: {
            topic: theme,
            missionId,
            fanpageId: defaultFanpage?.id ?? null,
            pageId: defaultFanpage?.pageId ?? null,
          },
        });
      }
    });

    // --- Extra content: ads copy + video hook on teleprompter already created; add facebookPost enrich ---
    await soft('CONTENT_ADS_COPY', async () => {
      const source = await this.teleprompter.upsert(user, {
        sourceType: 'marketing_autopilot_ads_copy',
        sourceRoute: `/marketing-autopilot/missions/${missionId}`,
        sourceTitle: `Ads Copy Draft — ${project.name}`.slice(0, 500),
        originalScript: [
          `Headline: ${plan.offer.productName} — ${plan.offer.primaryGoal}`,
          `Primary text: ${plan.valueProposition ?? plan.offer.valueProps.join('; ')}`,
          `Audience: ${plan.customersTarget.targetProfile}`,
          `CTA: Tìm hiểu / Đặt lịch ngay`,
          'DRAFT ONLY — không chạy Ads live.',
        ].join('\n'),
        editedScript: [
          `Headline: ${plan.offer.productName} — ${plan.offer.primaryGoal}`,
          `Primary text: ${plan.valueProposition ?? plan.offer.valueProps.join('; ')}`,
          `Audience: ${plan.customersTarget.targetProfile}`,
          `CTA: Tìm hiểu / Đặt lịch ngay`,
          'DRAFT ONLY — không chạy Ads live.',
        ].join('\n'),
        clientContentId: `autopilot-ads-copy-${missionId}`,
        facebookPost: `${plan.offer.productName}: ${plan.offer.primaryGoal}. ${plan.valueProposition ?? ''}`.slice(
          0,
          2000,
        ),
        videoHook: plan.content?.themes?.[0],
      } as any);
      await register({
        module: 'CONTENT',
        entityType: 'content_teleprompter_source',
        entityId: source.id,
        status: 'DRAFT',
        adapter: 'TeleprompterSourceService',
        metadata: { kind: 'ads_copy', missionId },
      });
    });

    // --- Chatbot DRAFT ---
    await soft('CHATBOT', async () => {
      const bot = await this.chatbot.createBot(user.organizationId, {
        botName: `Autopilot CSKH — ${project.name}`.slice(0, 120),
        businessName: plan.offer.productName,
        industry: 'spa',
        mainServices: (plan.offer.valueProps?.slice(0, 5) ?? [plan.offer.productName]).join(', '),
        greeting: `Xin chào! Mình hỗ trợ tư vấn ${plan.offer.productName}.`,
        consultationTone: 'friendly',
        status: ChatbotBotStatus.DRAFT,
      } as any);
      if (String(bot.status) !== 'DRAFT') {
        throw new Error(`Chatbot phải DRAFT, nhận ${bot.status}`);
      }
      await register({
        module: 'CHATBOT',
        entityType: 'chatbot_bot',
        entityId: bot.id,
        status: 'DRAFT',
        adapter: 'ChatbotCskhService',
        metadata: { missionId },
      });
      if (funnelRecId) {
        await this.prisma.marketingAutopilotFunnelSpec.update({
          where: { id: funnelRecId },
          data: { chatbotBotId: bot.id },
        });
      }
    });

    // --- Email campaign draft ---
    await soft('EMAIL', async () => {
      const campaign = await this.emailMarketing.createCampaign(
        user.organizationId,
        {
          name: `Autopilot Email — ${project.name}`.slice(0, 200),
          subject: `${plan.offer.productName}: ${plan.offer.primaryGoal}`.slice(0, 200),
        } as any,
        user.id,
      );
      await register({
        module: 'EMAIL',
        entityType: 'email_campaign',
        entityId: campaign.id,
        status: campaign.status ?? 'DRAFT',
        adapter: 'EmailMarketingService',
        metadata: { missionId, draftOnly: true },
      });
    });

    // --- Zalo campaign draft if OA connected ---
    await soft('ZALO', async () => {
      const oa = await this.prisma.messagingChannelConnection.findFirst({
        where: {
          organizationId: user.organizationId,
          providerKind: MessagingProviderKind.ZALO_OA,
        },
        orderBy: { updatedAt: 'desc' },
      });
      if (!oa || String(oa.status) === 'DISCONNECTED' || String(oa.status) === 'ERROR') {
        skipped.push({ module: 'ZALO', reason: 'Chưa kết nối Zalo OA' });
        return;
      }
      const campaign = await this.messagingCampaign.create(
        user.organizationId,
        {
          name: `Autopilot Zalo — ${project.name}`.slice(0, 200),
          channel: MessageChannel.ZALO,
          campaignType: MessagingCampaignKind.BROADCAST,
          channelConnectionId: oa.id,
          segmentConfig: {
            source: 'marketing_autopilot_executor',
            missionId,
            draftOnly: true,
          },
          variables: {
            productName: plan.offer.productName,
            primaryGoal: plan.offer.primaryGoal,
          },
        } as any,
        user.id,
      );
      if (String(campaign.status) !== 'DRAFT') {
        throw new Error(`Zalo campaign phải DRAFT, nhận ${campaign.status}`);
      }
      await register({
        module: 'ZALO',
        entityType: 'messaging_campaign',
        entityId: campaign.id,
        status: 'DRAFT',
        adapter: 'MessagingCampaignService',
        metadata: { channel: 'ZALO', channelConnectionId: oa.id, missionId },
      });
    });

    // --- Facebook/Google Ads creative draft (never live) ---
    await soft('ADS', async () => {
      if (!this.aiAds) {
        // Fallback: create AdDraft row directly (DRAFT)
        const draft = await this.prisma.adDraft.create({
          data: {
            userId: user.id,
            organizationId: user.organizationId,
            platform: AdPlatform.META,
            status: AdDraftStatus.DRAFT,
            objective: plan.offer.primaryGoal,
            budget: plan.budget?.monthlyBudget ? plan.budget.monthlyBudget / 30 : null,
            audience: plan.customersTarget.targetProfile,
            headline: `${plan.offer.productName} — ${plan.offer.primaryGoal}`.slice(0, 200),
            content: (plan.valueProposition ?? plan.offer.valueProps.join('; ')).slice(0, 2000),
            cta: 'Đặt lịch ngay',
            landingPage: '/dat-lich',
            creative: {
              missionId,
              draftOnly: true,
              liveAdsBlocked: true,
              source: 'marketing_autopilot_executor',
            } as Prisma.InputJsonValue,
            aiGenerated: true,
          },
        });
        await register({
          module: 'ADS',
          entityType: 'ad_draft',
          entityId: draft.id,
          status: 'DRAFT',
          adapter: 'Prisma.adDraft',
          metadata: { platform: 'META', missionId, liveAdsBlocked: true },
        });
        return;
      }
      const draft = await this.aiAds.generateDraft(user, {
        platform: AdPlatform.META,
        objective: plan.offer.primaryGoal,
        product: plan.offer.productName,
        audience: plan.customersTarget.targetProfile,
        budget: plan.budget?.monthlyBudget ? Math.round(plan.budget.monthlyBudget / 30) : undefined,
      });
      if (String(draft.status) !== 'DRAFT') {
        throw new Error(`AdDraft phải DRAFT, nhận ${draft.status}`);
      }
      await register({
        module: 'ADS',
        entityType: 'ad_draft',
        entityId: draft.id,
        status: 'DRAFT',
        adapter: 'AiAdsManagerService',
        metadata: { platform: draft.platform, missionId, liveAdsBlocked: true },
      });
    });

    // Safety: ensure no automation left active from this mission
    const autoAssets = assets.filter((a) => a.entityType === 'automation_flow');
    for (const a of autoAssets) {
      await this.prisma.automationFlow.updateMany({
        where: { id: a.entityId, organizationId: user.organizationId },
        data: { isActive: false, isPaused: true },
      });
    }

    return { assets, skipped, draftRegistry };
  }
}
