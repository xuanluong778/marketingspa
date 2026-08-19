import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { CREDIT_FEATURE_CODES } from '@marketingspa/shared';
import { OpenAiService } from '../openai/openai.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreditService, type PaidFeatureContext } from '../credit/credit.service';
import {
  analyzeVideoAngle,
  checkAdPolicyRisk,
  generateMarketingContent,
  generatePersonalContent,
  rewriteContentVariant,
  scoreAdContent,
  scorePersonalContent,
  suggestAdCta,
  suggestAdInsights,
  suggestPersonalIdeas,
  suggestPersonalTitles,
} from './content-marketing-logic';
import { assertExclusiveProductService } from './ad-product-service.logic';
import {
  generateAdvancedArticle,
  generateAdvancedTitles,
  optimizeAdvancedCta,
  rewriteAdvancedArticle,
} from './advanced-article-logic';
import { suggestAdvancedField } from './advanced-field-suggest.logic';
import { buildIndustrySuggestions } from './industry-suggestions.logic';
import type {
  AnalyzeOpinionStoryDto,
  AnalyzeVideoDto,
  CheckPolicyDto,
  GenerateAdvancedArticleDto,
  GenerateAdvancedTitlesDto,
  GenerateContentDto,
  IndustrySuggestionsDto,
  OpinionAnalyzeDto,
  OpinionGenerateDto,
  OpinionRewriteDto,
  OpinionScoreNaturalnessDto,
  OpinionSuggestFieldDto,
  OptimizeAdvancedCtaDto,
  TeleprompterScriptRewriteDto,
  RewriteAdvancedArticleDto,
  RewriteContentDto,
  ScoreContentDto,
  SuggestAdCtaDto,
  SuggestAdInsightsDto,
  SuggestAdvancedFieldDto,
  SuggestPersonalIdeasDto,
  SuggestPersonalTitlesDto,
} from './dto/content-marketing.dto';
import type {
  FacebookPolicyAnalyzeMediaDto,
  FacebookPolicyCheckDto,
  FacebookPolicyImportUrlDto,
  FacebookPolicyRewriteDto,
} from './dto/facebook-policy.dto';
import {
  checkFacebookAdPolicy,
  rewriteFacebookAdPolicy,
} from './facebook-policy/facebook-policy.logic';
import {
  analyzeOpinionStory,
  generateOpinionContent,
} from './opinion-story.logic';
import { analyzeOpinionSource } from './opinion-analyze.logic';
import {
  generateOpinionPair,
  rewriteOpinionPair,
} from './opinion-generate.logic';
import { scoreOpinionNaturalness } from './opinion-score-naturalness.logic';
import { suggestOpinionField } from './opinion-suggest-field.logic';
import { rewriteTeleprompterScript } from './teleprompter-script.logic';
import {
  analyzeLandingSignals,
  importPolicyUrl,
} from './facebook-policy/facebook-policy-import.logic';
import {
  analyzePolicyImage,
  analyzePolicyTranscriptOnly,
  analyzePolicyVideo,
  findingsFromMediaText,
} from './facebook-policy/facebook-policy-media.logic';
import { checkFacebookAdPolicyMerged } from './facebook-policy/facebook-policy-merge.logic';
import { RagKbService } from '../rag-kb/rag-kb.service';
import { buildRagQuery, withKnowledgeOpenAi } from '../rag-kb/rag-prompt.util';

@Injectable()
export class ContentMarketingService {
  constructor(
    private readonly openai: OpenAiService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly ragKb: RagKbService,
    private readonly credit: CreditService,
  ) {}

  private requireOrg(organizationId?: string | null): string {
    if (!organizationId) {
      throw new BadRequestException('Thiếu organizationId');
    }
    return organizationId;
  }

  private withAiCredit<T>(
    organizationId: string | undefined | null,
    featureCode: string,
    action: string,
    fn: (ctx: PaidFeatureContext) => Promise<T>,
  ): Promise<T> {
    const org = this.requireOrg(organizationId);
    return this.credit.runPaidFeature({
      organizationId: org,
      featureCode,
      referenceId: `${featureCode}:${action}:${randomUUID()}`,
      reason: action,
      fn,
    });
  }

  /** OpenAI đã gắn Knowledge Base của đúng organizationId (fail-open). */
  private async openaiWithKb(
    organizationId: string | undefined,
    ...queryParts: Array<string | null | undefined>
  ): Promise<OpenAiService> {
    if (!organizationId) return this.openai;
    const query = buildRagQuery(...queryParts);
    if (!query) return this.openai;
    const block = await this.ragKb.getPromptBlock(organizationId, query, {
      limit: 5,
      mode: 'content',
    });
    return withKnowledgeOpenAi(this.openai, block);
  }

  async industrySuggestions(dto: IndustrySuggestionsDto, organizationId?: string) {
    return this.withAiCredit(
      organizationId,
      CREDIT_FEATURE_CODES.CONTENT_AI_GENERATE,
      'industrySuggestions',
      async (ctx) => {
        const openai = await this.openaiWithKb(
          organizationId,
          dto.industryName,
          dto.customIndustry,
          dto.q,
        );
        ctx.markProviderStarted();
        return buildIndustrySuggestions(dto, openai);
      },
    );
  }

  async generateAdvanced(dto: GenerateAdvancedArticleDto, organizationId?: string) {
    return this.withAiCredit(
      organizationId,
      CREDIT_FEATURE_CODES.CONTENT_AI_GENERATE,
      'generateAdvanced',
      async (ctx) => {
        const openai = await this.openaiWithKb(
          organizationId,
          dto.productService,
          dto.painPoints,
          dto.desires,
          dto.industryName,
          dto.customIndustry,
        );
        ctx.markProviderStarted();
        return generateAdvancedArticle(dto, openai);
      },
    );
  }

  async rewriteAdvanced(dto: RewriteAdvancedArticleDto, organizationId?: string) {
    return this.withAiCredit(
      organizationId,
      CREDIT_FEATURE_CODES.CONTENT_AI_GENERATE,
      'rewriteAdvanced',
      async (ctx) => {
        const openai = await this.openaiWithKb(
          organizationId,
          dto.productService,
          dto.painPoints,
          dto.desires,
          dto.industryName,
          dto.previousArticle?.slice(0, 200),
        );
        ctx.markProviderStarted();
        return rewriteAdvancedArticle(dto, openai);
      },
    );
  }

  async optimizeAdvancedCta(dto: OptimizeAdvancedCtaDto, organizationId?: string) {
    return this.withAiCredit(
      organizationId,
      CREDIT_FEATURE_CODES.CONTENT_AI_GENERATE,
      'optimizeAdvancedCta',
      async (ctx) => {
        const openai = await this.openaiWithKb(
          organizationId,
          dto.productService,
          dto.ctaType,
          dto.finalArticle?.slice(0, 200),
        );
        ctx.markProviderStarted();
        return optimizeAdvancedCta(dto, openai);
      },
    );
  }

  async generateAdvancedTitles(dto: GenerateAdvancedTitlesDto, organizationId?: string) {
    return this.withAiCredit(
      organizationId,
      CREDIT_FEATURE_CODES.CONTENT_AI_GENERATE,
      'generateAdvancedTitles',
      async (ctx) => {
        const openai = await this.openaiWithKb(
          organizationId,
          dto.productService,
          dto.industryName,
          dto.finalArticle?.slice(0, 200),
        );
        ctx.markProviderStarted();
        return generateAdvancedTitles(dto, openai);
      },
    );
  }

  async suggestAdvancedField(dto: SuggestAdvancedFieldDto, organizationId?: string) {
    return this.withAiCredit(
      organizationId,
      CREDIT_FEATURE_CODES.CONTENT_AI_GENERATE,
      'suggestAdvancedField',
      async (ctx) => {
        const openai = await this.openaiWithKb(
          organizationId,
          dto.field,
          dto.productService,
          dto.painPoints,
        );
        ctx.markProviderStarted();
        return suggestAdvancedField(dto, openai);
      },
    );
  }

  async generate(dto: GenerateContentDto, organizationId?: string) {
    if (dto.mode !== 'personal') {
      try {
        assertExclusiveProductService(dto);
      } catch (e) {
        throw new BadRequestException(e instanceof Error ? e.message : 'Invalid ad payload');
      }
    }
    return this.withAiCredit(
      organizationId,
      CREDIT_FEATURE_CODES.CONTENT_AI_GENERATE,
      'generate',
      async (ctx) => {
        const openai = await this.openaiWithKb(
          organizationId,
          dto.productService,
          dto.postTopic,
          dto.targetAudience,
          dto.industryName,
          dto.customIndustry,
          dto.storyIdea,
          dto.personalAngle,
        );
        ctx.markProviderStarted();
        if (dto.mode === 'personal') {
          const generated =
            dto.creationMode === 'opinion'
              ? await generateOpinionContent(dto, openai)
              : await generatePersonalContent(dto, openai);
          const score = scorePersonalContent({ content: generated.content, mode: 'personal' });
          return { ...generated, score };
        }
        const generated = await generateMarketingContent(dto, openai);
        const policy = checkAdPolicyRisk({
          content: generated.content,
          platform: dto.platform,
          industryId: dto.industryId,
          industryName: dto.industryName,
          customIndustry: dto.customIndustry,
        });
        const score = scoreAdContent(
          {
            content: generated.content,
            platform: dto.platform,
            mode: dto.mode,
            adObjective: dto.adObjective,
            industryId: dto.industryId,
            industryName: dto.industryName,
            customIndustry: dto.customIndustry,
          },
          policy,
        );
        return { ...generated, policy, score };
      },
    );
  }

  async analyzeVideo(dto: AnalyzeVideoDto, organizationId?: string) {
    return this.withAiCredit(
      organizationId,
      CREDIT_FEATURE_CODES.AI_ANALYSIS,
      'analyzeVideo',
      async (ctx) => {
        const openai = await this.openaiWithKb(
          organizationId,
          dto.transcript?.slice(0, 300),
          dto.videoUrl,
        );
        ctx.markProviderStarted();
        return analyzeVideoAngle(dto, openai);
      },
    );
  }

  async analyzeOpinionStory(dto: AnalyzeOpinionStoryDto, organizationId?: string) {
    return this.withAiCredit(
      organizationId,
      CREDIT_FEATURE_CODES.AI_ANALYSIS,
      'analyzeOpinionStory',
      async (ctx) => {
        const openai = await this.openaiWithKb(
          organizationId,
          dto.sourceText?.slice(0, 300),
          dto.sourceUrl,
        );
        ctx.markProviderStarted();
        return analyzeOpinionStory(dto, openai);
      },
    );
  }

  async analyzeOpinion(dto: OpinionAnalyzeDto, userId: string, organizationId: string) {
    return this.withAiCredit(
      organizationId,
      CREDIT_FEATURE_CODES.AI_ANALYSIS,
      'analyzeOpinion',
      async (ctx) => {
        const openai = await this.openaiWithKb(
          organizationId,
          dto.story?.slice(0, 400),
          dto.transcript?.slice(0, 300),
          dto.url,
        );
        ctx.markProviderStarted();
        return analyzeOpinionSource({
          dto,
          userId,
          organizationId,
          prisma: this.prisma,
          config: this.config,
          openai,
        });
      },
    );
  }

  async generateOpinion(dto: OpinionGenerateDto, organizationId?: string) {
    return this.withAiCredit(
      organizationId,
      CREDIT_FEATURE_CODES.CONTENT_AI_GENERATE,
      'generateOpinion',
      async (ctx) => {
        const openai = await this.openaiWithKb(
          organizationId,
          dto.topic,
          dto.angle,
          dto.story?.slice(0, 300),
        );
        ctx.markProviderStarted();
        return generateOpinionPair(dto, openai);
      },
    );
  }

  async rewriteOpinion(dto: OpinionRewriteDto, organizationId?: string) {
    return this.withAiCredit(
      organizationId,
      CREDIT_FEATURE_CODES.CONTENT_AI_GENERATE,
      'rewriteOpinion',
      async (ctx) => {
        const openai = await this.openaiWithKb(
          organizationId,
          dto.topic,
          dto.facebookPost?.slice(0, 200),
          dto.videoScript?.slice(0, 200),
          dto.content?.slice(0, 200),
        );
        ctx.markProviderStarted();
        return rewriteOpinionPair(dto, openai);
      },
    );
  }

  async rewriteTeleprompterScript(
    dto: TeleprompterScriptRewriteDto,
    organizationId?: string,
  ) {
    return this.withAiCredit(
      organizationId,
      CREDIT_FEATURE_CODES.CONTENT_AI_GENERATE,
      'rewriteTeleprompterScript',
      async (ctx) => {
        const openai = await this.openaiWithKb(
          organizationId,
          dto.title,
          dto.script?.slice(0, 400),
          dto.mode,
        );
        ctx.markProviderStarted();
        return rewriteTeleprompterScript(dto.script, dto.mode, openai, dto.title);
      },
    );
  }

  async scoreOpinionNaturalness(
    dto: OpinionScoreNaturalnessDto,
    organizationId?: string,
  ) {
    return this.withAiCredit(
      organizationId,
      CREDIT_FEATURE_CODES.AI_ANALYSIS,
      'scoreOpinionNaturalness',
      async (ctx) => {
        const openai = await this.openaiWithKb(organizationId, dto.content?.slice(0, 300));
        ctx.markProviderStarted();
        return scoreOpinionNaturalness(dto, openai);
      },
    );
  }

  async suggestOpinionField(dto: OpinionSuggestFieldDto, organizationId?: string) {
    return this.withAiCredit(
      organizationId,
      CREDIT_FEATURE_CODES.CONTENT_AI_GENERATE,
      'suggestOpinionField',
      async (ctx) => {
        const openai = await this.openaiWithKb(
          organizationId,
          dto.field,
          dto.themeLabel,
          dto.subtopic,
          dto.currentValue,
          dto.context,
        );
        ctx.markProviderStarted();
        return suggestOpinionField(dto, openai);
      },
    );
  }

  checkPolicy(dto: CheckPolicyDto) {
    return checkAdPolicyRisk(dto);
  }

  score(dto: ScoreContentDto) {
    if (dto.mode === 'personal') {
      return scorePersonalContent(dto);
    }
    const policy = checkAdPolicyRisk({
      content: dto.content,
      platform: dto.platform,
      industryId: dto.industryId,
      industryName: dto.industryName,
      customIndustry: dto.customIndustry,
    });
    return { ...scoreAdContent(dto, policy), policy };
  }

  async rewrite(dto: RewriteContentDto, organizationId?: string) {
    return this.withAiCredit(
      organizationId,
      CREDIT_FEATURE_CODES.CONTENT_AI_GENERATE,
      'rewrite',
      async (ctx) => {
        const openai = await this.openaiWithKb(
          organizationId,
          dto.content?.slice(0, 300),
          dto.mode,
          dto.tone,
        );
        ctx.markProviderStarted();
        return rewriteContentVariant(dto, openai);
      },
    );
  }

  async suggestInsights(dto: SuggestAdInsightsDto, organizationId?: string) {
    return this.withAiCredit(
      organizationId,
      CREDIT_FEATURE_CODES.CONTENT_AI_GENERATE,
      'suggestInsights',
      async (ctx) => {
        const openai = await this.openaiWithKb(
          organizationId,
          dto.productService,
          dto.targetAudience,
          dto.adObjective,
        );
        ctx.markProviderStarted();
        return suggestAdInsights(dto, openai);
      },
    );
  }

  async suggestCta(dto: SuggestAdCtaDto, organizationId?: string) {
    return this.withAiCredit(
      organizationId,
      CREDIT_FEATURE_CODES.CONTENT_AI_GENERATE,
      'suggestCta',
      async (ctx) => {
        const openai = await this.openaiWithKb(
          organizationId,
          dto.productService,
          dto.adObjective,
          dto.offer,
          dto.targetAudience,
        );
        ctx.markProviderStarted();
        return suggestAdCta(dto, openai);
      },
    );
  }

  async suggestPersonalIdeas(dto: SuggestPersonalIdeasDto, organizationId?: string) {
    return this.withAiCredit(
      organizationId,
      CREDIT_FEATURE_CODES.CONTENT_AI_GENERATE,
      'suggestPersonalIdeas',
      async (ctx) => {
        const openai = await this.openaiWithKb(
          organizationId,
          dto.postTopic,
          dto.targetAudience,
          dto.topicGroupLabel,
        );
        ctx.markProviderStarted();
        return suggestPersonalIdeas(dto, openai);
      },
    );
  }

  async suggestPersonalTitles(dto: SuggestPersonalTitlesDto, organizationId?: string) {
    return this.withAiCredit(
      organizationId,
      CREDIT_FEATURE_CODES.CONTENT_AI_GENERATE,
      'suggestPersonalTitles',
      async (ctx) => {
        const openai = await this.openaiWithKb(
          organizationId,
          dto.subtopicLabel,
          dto.topicGroupLabel,
        );
        ctx.markProviderStarted();
        return suggestPersonalTitles(dto, openai);
      },
    );
  }

  async checkFacebookPolicy(dto: FacebookPolicyCheckDto, organizationId?: string | null) {
    const run = async () => {
      const input = this.normalizeFacebookPolicyInput(dto, organizationId);
      const hasMediaExtras = Boolean(
        input.imageOcrText?.trim() || input.transcript?.trim() || input.landingPageText?.trim(),
      );
      if (!hasMediaExtras) {
        return checkFacebookAdPolicy(input, this.openai);
      }

      const media = [];
      if (input.imageOcrText?.trim()) {
        media.push({
          mediaType: 'image' as const,
          ocrText: input.imageOcrText,
          transcript: '',
          caption: '',
          visualNotes: [],
          regions: [],
          findings: findingsFromMediaText(input.imageOcrText, 'img'),
          insufficientData: false,
          statusHint: 'OK' as const,
          warnings: [],
        });
      }
      if (input.transcript?.trim()) {
        media.push({
          mediaType: 'transcript' as const,
          ocrText: '',
          transcript: input.transcript,
          caption: '',
          visualNotes: [],
          regions: [],
          findings: findingsFromMediaText(input.transcript, 'tr'),
          insufficientData: false,
          statusHint: 'OK' as const,
          warnings: [],
        });
      }

      return checkFacebookAdPolicyMerged({
        input,
        media,
        landingImport: input.landingPageText?.trim()
          ? {
              sourceType: 'landing_page' as const,
              url: input.landingUrl || '',
              editable: true as const,
              primaryText: input.landingPageText,
              warnings: [],
              insufficientData: false,
              landing: analyzeLandingSignals('', input.landingPageText),
            }
          : undefined,
        openai: this.openai,
      });
    };
    if (!this.openai.isConfigured()) return run();
    return this.withAiCredit(
      organizationId,
      CREDIT_FEATURE_CODES.AI_ANALYSIS,
      'checkFacebookPolicy',
      async (ctx) => {
        ctx.markProviderStarted();
        return run();
      },
    );
  }

  async rewriteFacebookPolicy(
    dto: FacebookPolicyRewriteDto,
    organizationId?: string | null,
  ) {
    return this.withAiCredit(
      organizationId,
      CREDIT_FEATURE_CODES.CONTENT_AI_GENERATE,
      'rewriteFacebookPolicy',
      async (ctx) => {
        const input = this.normalizeFacebookPolicyInput(dto, organizationId);
        const primaryText =
          input.primaryText?.trim() || input.contentToRewrite?.trim() || '';
        const openai = await this.openaiWithKb(
          organizationId || undefined,
          primaryText.slice(0, 300),
        );
        ctx.markProviderStarted();
        return rewriteFacebookAdPolicy(
          {
            ...input,
            primaryText: primaryText || input.primaryText,
          },
          openai,
        );
      },
    );
  }

  /** Map FE aliases; drop UI-only fields; org from JWT only. */
  private normalizeFacebookPolicyInput(
    dto: FacebookPolicyCheckDto,
    organizationId?: string | null,
  ) {
    const primaryText = [
      dto.primaryText,
      dto.content,
      dto.text,
      dto.adCopy,
      dto.contentToRewrite,
    ]
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .find((s) => s.length > 0);

    return {
      headline: dto.headline,
      primaryText: primaryText || dto.primaryText,
      description: dto.description,
      cta: dto.cta,
      productService: dto.productService,
      audience: dto.audience,
      country: dto.country,
      ageMin: dto.ageMin,
      ageMax: dto.ageMax,
      specialAdCategory: dto.specialAdCategory,
      brandName: dto.brandName,
      contentToRewrite: dto.contentToRewrite,
      imageOcrText: dto.imageOcrText,
      transcript: dto.transcript,
      landingPageText: dto.landingPageText,
      landingUrl: dto.landingUrl,
      organizationId: organizationId ?? null,
    };
  }

  async importFacebookPolicyUrl(
    dto: FacebookPolicyImportUrlDto,
    userId: string,
    organizationId: string,
  ) {
    try {
      return await importPolicyUrl({
        url: dto.url,
        urlKind: dto.urlKind,
        fanpageId: dto.fanpageId,
        userId,
        organizationId,
        prisma: this.prisma,
        config: this.config,
      });
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Import URL thất bại');
    }
  }

  async analyzeFacebookPolicyMedia(
    dto: FacebookPolicyAnalyzeMediaDto,
    file?: { buffer: Buffer; mimetype?: string; originalname?: string; size?: number },
    thumb?: { buffer: Buffer; mimetype?: string },
    organizationId?: string,
  ) {
    const mediaType =
      dto.mediaType ||
      (file?.mimetype?.startsWith('video/')
        ? 'video'
        : file?.mimetype?.startsWith('image/')
          ? 'image'
          : dto.transcript?.trim()
            ? 'transcript'
            : 'image');

    if (mediaType === 'transcript' || (!file && dto.transcript?.trim())) {
      return analyzePolicyTranscriptOnly({
        transcript: dto.transcript || '',
        caption: dto.caption,
      });
    }

    if (!file?.buffer?.length && !dto.transcript?.trim()) {
      return {
        mediaType,
        ocrText: '',
        transcript: '',
        caption: dto.caption || '',
        visualNotes: [],
        regions: [],
        findings: [],
        insufficientData: true,
        statusHint: 'INSUFFICIENT_DATA' as const,
        message: 'INSUFFICIENT_DATA: thiếu file hoặc transcript',
        warnings: ['Cần upload ảnh/video hoặc dán transcript.'],
      };
    }

    if (mediaType === 'video') {
      return this.withAiCredit(
        organizationId,
        CREDIT_FEATURE_CODES.AI_ANALYSIS,
        'analyzePolicyVideo',
        async (ctx) => {
          ctx.markProviderStarted();
          return analyzePolicyVideo({
            buffer: file?.buffer,
            mimeType: file?.mimetype,
            filename: file?.originalname,
            caption: dto.caption,
            manualTranscript: dto.transcript,
            thumbnailBuffer: thumb?.buffer,
            thumbnailMime: thumb?.mimetype,
            openai: this.openai,
          });
        },
      );
    }

    return this.withAiCredit(
      organizationId,
      CREDIT_FEATURE_CODES.CONTENT_AI_IMAGE,
      'analyzePolicyImage',
      async (ctx) => {
        ctx.markProviderStarted();
        return analyzePolicyImage({
          buffer: file!.buffer,
          mimeType: file?.mimetype || 'image/jpeg',
          filename: file?.originalname,
          caption: dto.caption,
          openai: this.openai,
        });
      },
    );
  }

  status() {
    return {
      aiConfigured: this.openai.isConfigured(),
      model: this.openai.getDefaultModel(),
    };
  }
}
