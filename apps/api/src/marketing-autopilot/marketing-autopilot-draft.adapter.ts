import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  AutomationTriggerType,
  MessageChannel,
  MessagingCampaignKind,
  Prisma,
} from '@marketingspa/database';
import {
  buildFallbackFunnelComplete,
  buildFallbackFunnelRecommendations,
  normalizeAutopilotPlanForDraft,
  resolveAutopilotDraftEditUrl,
  type FunnelTemplateSlug,
} from '@marketingspa/shared';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { TeleprompterSourceService } from '../content-marketing/teleprompter-source.service';
import { FunnelBuilderService } from './compat/domain-stubs';
import { FunnelGeneratorService } from './compat/domain-stubs';
import { AutomationService } from '../automation/automation.service';
import { MessagingCampaignService } from '../messaging-campaign/messaging-campaign.service';
import { PrismaService } from '../prisma/prisma.service';
import { MarketingAutopilotContentDraftService } from './marketing-autopilot-content-draft.service';
import type {
  MarketingAutopilotDraftType,
  MarketingAutopilotPlan,
} from './marketing-autopilot.types';

export type AdapterDraftResult = {
  externalEntityType: string;
  externalEntityId: string;
  adapter: string;
  editUrl?: string;
  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class MarketingAutopilotDraftAdapter {
  private readonly logger = new Logger(MarketingAutopilotDraftAdapter.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly teleprompterSource: TeleprompterSourceService,
    private readonly funnelBuilder: FunnelBuilderService,
    private readonly funnelGenerator: FunnelGeneratorService,
    private readonly automation: AutomationService,
    private readonly messagingCampaign: MessagingCampaignService,
    private readonly contentDraft: MarketingAutopilotContentDraftService,
  ) {}

  async createDraft(
    type: MarketingAutopilotDraftType,
    user: AuthUser,
    plan: MarketingAutopilotPlan | unknown,
    project: {
      id: string;
      name: string;
      productName?: string;
      primaryGoal?: string;
      customerProfile?: string;
      targetArea?: string;
      productPrice?: number;
    },
  ): Promise<AdapterDraftResult> {
    const safePlan = normalizeAutopilotPlanForDraft(plan, {
      productName: project.productName,
      primaryGoal: project.primaryGoal,
      customerProfile: project.customerProfile,
      targetArea: project.targetArea,
      productPrice: project.productPrice,
    }) as MarketingAutopilotPlan;

    try {
      switch (type) {
        case 'CONTENT_DRAFT':
          return await this.createContentDraft(user, safePlan, project);
        case 'FUNNEL_DRAFT':
          return await this.createFunnelDraft(user, safePlan, project);
        case 'AUTOMATION_DRAFT':
          return await this.createAutomationDraft(user, safePlan, project.name);
        case 'CAMPAIGN_DRAFT':
          return await this.createCampaignDraft(user, safePlan, project.name);
        default:
          throw new BadRequestException(`Loại Draft không hỗ trợ: ${String(type)}`);
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.error(`createDraft(${type}) failed org=${user.organizationId}: ${detail}`);
      throw new BadRequestException(
        `Không tạo được ${type}: ${detail}. Kiểm tra dữ liệu plan (offer/content/funnel/crm) hoặc thử lại.`,
      );
    }
  }

  private async createContentDraft(
    user: AuthUser,
    plan: MarketingAutopilotPlan,
    project: {
      id: string;
      name: string;
      productName?: string;
      productPrice?: number;
      customerProfile?: string;
      targetArea?: string;
      primaryGoal?: string;
    },
  ): Promise<AdapterDraftResult> {
    const bundle = await this.contentDraft.generateBundle(plan, project);
    const row = await this.contentDraft.upsertTeleprompterFromBundle(user, project, bundle);

    const editUrl = resolveAutopilotDraftEditUrl('CONTENT_DRAFT', row.id);
    return {
      adapter: 'TeleprompterSourceService',
      externalEntityType: 'content_teleprompter_source',
      externalEntityId: row.id,
      editUrl,
      metadata: {
        sourceTitle: row.sourceTitle,
        grounded: true,
        draftOnly: true,
        livePublishBlocked: true,
        productName: plan.offer.productName,
        primaryGoal: plan.offer.primaryGoal,
        editUrl,
        contentIdeas: bundle.ideas,
        contentBundleVersion: bundle.version,
        ideaCount: bundle.ideas.length,
      },
    };
  }

  /**
   * Real Funnel asset = FunnelRecommendation + completeSpec (canvas-editable).
   * NOT FunnelBlueprint alone — UI opens via /funnel?draft={recommendationId}.
   */
  private async createFunnelDraft(
    user: AuthUser,
    plan: MarketingAutopilotPlan,
    project: { id: string; name: string },
  ): Promise<AdapterDraftResult> {
    const stages = plan.funnel?.stages?.length
      ? plan.funnel.stages
      : [
          { name: 'Awareness', objective: 'Thu hút' },
          { name: 'Conversion', objective: 'Chốt' },
        ];

    const prompt =
      `Autopilot Funnel — ${project.name}. ` +
      `Mục tiêu: ${plan.offer.primaryGoal}. ` +
      `Sản phẩm: ${plan.offer.productName} (${plan.offer.productPrice} VND). ` +
      `Khách hàng: ${plan.customersTarget.targetProfile}. ` +
      `Khu vực: ${plan.customersTarget.targetArea}. ` +
      `Value prop: ${plan.valueProposition ?? plan.offer.valueProps.join('; ')}. ` +
      `Bottlenecks: ${(plan.businessDiagnosis?.bottlenecks ?? []).join('; ') || 'n/a'}. ` +
      `Funnel stages: ${stages.map((s) => `${s.name}→${s.objective}`).join(' | ')}. ` +
      `DRAFT ONLY — không publish/live.`;

    const recId = await this.ensureFunnelRecommendationWithCompleteSpec(user, prompt, plan);

    try {
      const blueprint = await this.funnelBuilder.generate(user, {
        prompt,
        includeAutomations: false,
      });
      await this.funnelBuilder.apply(
        user,
        {
          blueprintId: blueprint.id,
          applyStages: true,
          applyFlows: false,
          activateFlows: false,
          deactivateMissingStages: false,
        },
        false,
      );
    } catch (err) {
      this.logger.warn(
        `Funnel CRM stage seed soft-fail: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const row = await this.prisma.marketingAutopilotFunnelSpec.findFirst({
      where: { id: recId, organizationId: user.organizationId },
    });
    if (!row?.completeSpec) {
      throw new BadRequestException('Funnel completeSpec chưa được tạo — không mở canvas được');
    }

    const editUrl = resolveAutopilotDraftEditUrl('FUNNEL_DRAFT', recId);
    return {
      adapter: 'FunnelGeneratorService',
      externalEntityType: 'funnel_recommendation',
      externalEntityId: recId,
      editUrl,
      metadata: {
        name: project.name,
        status: row.status,
        selectedSlug: row.selectedSlug,
        hasCompleteSpec: true,
        grounded: true,
        draftOnly: true,
        includeAutomations: false,
        editUrl,
        stages: stages.map((s) => s.name),
      },
    };
  }

  private defaultFunnelSlug(): FunnelTemplateSlug {
    return 'consultation';
  }

  private async persistFallbackCompleteSpec(
    recommendationId: string,
    slug: FunnelTemplateSlug,
    prompt: string,
  ) {
    const preview = buildFallbackFunnelRecommendations(prompt);
    const complete = buildFallbackFunnelComplete({
      templateSlug: slug,
      option: preview.recommendations.find((r) => r.templateSlug === slug),
      analysis: preview.analysis,
    });
    await this.prisma.marketingAutopilotFunnelSpec.update({
      where: { id: recommendationId },
      data: {
        selectedSlug: slug,
        selectedAt: new Date(),
        completeSpec: complete as unknown as Prisma.InputJsonValue,
        completeSource: 'fallback',
        completeGeneratedAt: new Date(),
      },
    });
  }

  private async ensureFunnelRecommendationWithCompleteSpec(
    user: AuthUser,
    prompt: string,
    plan: MarketingAutopilotPlan,
  ): Promise<string> {
    try {
      const rec = await Promise.race([
        this.funnelGenerator.generate(
          user,
          {
            prompt,
            productService: plan.offer.productName,
            region: plan.customersTarget.targetArea,
            budget: String(plan.budget?.monthlyBudget ?? plan.offer.productPrice ?? 0),
          } as Parameters<FunnelGeneratorService['generate']>[1],
          { skipQuota: true },
        ),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Funnel generate timeout')), 20_000);
        }),
      ]);
      const rawSlug =
        (rec as { recommendations?: Array<{ templateSlug?: string }> }).recommendations?.[0]
          ?.templateSlug ?? this.defaultFunnelSlug();
      const slug = (rawSlug === 'lead-magnet' ? this.defaultFunnelSlug() : rawSlug) as FunnelTemplateSlug;
      try {
        await this.prisma.marketingAutopilotFunnelSpec.update({
          where: { id: rec.id },
          data: { selectedSlug: slug, selectedAt: new Date() },
        });
        await Promise.race([
          this.funnelGenerator.generateComplete(user, rec.id),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Funnel generateComplete timeout')), 20_000);
          }),
        ]);
      } catch (completeErr) {
        this.logger.warn(
          `generateComplete fallback: ${completeErr instanceof Error ? completeErr.message : String(completeErr)}`,
        );
        await this.persistFallbackCompleteSpec(rec.id, slug, prompt);
      }
      return rec.id;
    } catch (err) {
      this.logger.warn(
        `Funnel generate fallback row: ${err instanceof Error ? err.message : String(err)}`,
      );
      const preview = buildFallbackFunnelRecommendations(prompt);
      const slug = (preview.recommendations[0]?.templateSlug ??
        this.defaultFunnelSlug()) as FunnelTemplateSlug;
      const complete = buildFallbackFunnelComplete({
        templateSlug: slug,
        option: preview.recommendations[0],
        analysis: preview.analysis,
      });
      const row = await this.prisma.marketingAutopilotFunnelSpec.create({
        data: {
          organizationId: user.organizationId,
          createdById: user.id,
          prompt,
          result: preview as unknown as Prisma.InputJsonValue,
          source: 'fallback',
          selectedSlug: slug,
          selectedAt: new Date(),
          completeSpec: complete as unknown as Prisma.InputJsonValue,
          completeSource: 'fallback',
          completeGeneratedAt: new Date(),
          status: 'DRAFT',
        },
      });
      return row.id;
    }
  }

  private async createAutomationDraft(
    user: AuthUser,
    plan: MarketingAutopilotPlan,
    projectName: string,
  ): Promise<AdapterDraftResult> {
    const keyFlows = plan.chatbot?.keyFlows?.length
      ? plan.chatbot.keyFlows
      : ['Chào hỏi', 'Tư vấn', 'CTA'];
    const lifecycle = plan.crm?.lifecycle?.length ? plan.crm.lifecycle : ['New', 'MQL', 'SQL'];

    const flow = await this.automation.createFlow(
      user.organizationId,
      {
        name: `Autopilot Automation — ${projectName}`.slice(0, 200),
        triggerType: AutomationTriggerType.LEAD_CREATED,
        isActive: false,
        isPaused: true,
        delayMinutes: 0,
        channel: MessageChannel.EMAIL,
        actions: [
          ...keyFlows.map((flowText, index) => ({
            type: 'DRAFT_STEP',
            order: index + 1,
            text: flowText,
          })),
          ...lifecycle.slice(0, 3).map((stage, index) => ({
            type: 'DRAFT_CRM_STAGE',
            order: keyFlows.length + index + 1,
            text: `CRM stage: ${stage}`,
          })),
        ],
        triggerConfig: {
          source: 'marketing_autopilot_v3',
          draftOnly: true,
          crmLifecycle: lifecycle,
          chatbotPurpose: plan.chatbot?.purpose ?? 'Tư vấn & thu lead',
          primaryGoal: plan.offer.primaryGoal,
          productName: plan.offer.productName,
          bottlenecks: plan.businessDiagnosis?.bottlenecks ?? [],
        },
      },
      user.id,
      false,
    );

    if (flow.isActive) {
      throw new BadRequestException('Automation Draft không được phép active — aborted');
    }

    const editUrl = resolveAutopilotDraftEditUrl('AUTOMATION_DRAFT', flow.id);
    return {
      adapter: 'AutomationService',
      externalEntityType: 'automation_flow',
      externalEntityId: flow.id,
      editUrl,
      metadata: {
        name: flow.name,
        isActive: flow.isActive,
        isPaused: flow.isPaused,
        grounded: true,
        draftOnly: true,
        livePublishBlocked: true,
        editUrl,
      },
    };
  }

  private async createCampaignDraft(
    user: AuthUser,
    plan: MarketingAutopilotPlan,
    projectName: string,
  ): Promise<AdapterDraftResult> {
    const campaign = await this.messagingCampaign.create(
      user.organizationId,
      {
        name: `Autopilot Campaign — ${projectName}`.slice(0, 200),
        channel: MessageChannel.EMAIL,
        campaignType: MessagingCampaignKind.BROADCAST,
        segmentConfig: {
          source: 'marketing_autopilot_v3',
          draftOnly: true,
          remarketing: plan.remarketing,
          communications: plan.communications,
          icp: plan.customersTarget,
          channelStrategy: plan.channelStrategy ?? [],
        },
        variables: {
          primaryGoal: plan.offer.primaryGoal,
          productName: plan.offer.productName,
          valueProposition: plan.valueProposition ?? '',
          targetArea: plan.customersTarget.targetArea,
        },
      },
      user.id,
    );

    if (String(campaign.status) !== 'DRAFT') {
      throw new BadRequestException(
        `Campaign phải ở trạng thái DRAFT, nhận được: ${campaign.status}`,
      );
    }

    const editUrl = resolveAutopilotDraftEditUrl('CAMPAIGN_DRAFT', campaign.id);
    return {
      adapter: 'MessagingCampaignService',
      externalEntityType: 'messaging_campaign',
      externalEntityId: campaign.id,
      editUrl,
      metadata: {
        name: campaign.name,
        status: campaign.status,
        channel: campaign.channel,
        grounded: true,
        draftOnly: true,
        liveSendBlocked: true,
        facebookWriteBlocked: true,
        editUrl,
      },
    };
  }
}
