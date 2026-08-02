import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAiService } from '../openai/openai.service';
import { PrismaService } from '../prisma/prisma.service';
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

@Injectable()
export class ContentMarketingService {
  constructor(
    private readonly openai: OpenAiService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Hook trừ credit content — chưa bật billing content */
  private async tryDebitContentCredit(_organizationId?: string): Promise<void> {
    // Placeholder: tích hợp CreditWallet khi billing content được bật
  }

  industrySuggestions(dto: IndustrySuggestionsDto) {
    return buildIndustrySuggestions(dto, this.openai);
  }

  async generateAdvanced(dto: GenerateAdvancedArticleDto, organizationId?: string) {
    await this.tryDebitContentCredit(organizationId);
    return generateAdvancedArticle(dto, this.openai);
  }

  async rewriteAdvanced(dto: RewriteAdvancedArticleDto, organizationId?: string) {
    await this.tryDebitContentCredit(organizationId);
    return rewriteAdvancedArticle(dto, this.openai);
  }

  async optimizeAdvancedCta(dto: OptimizeAdvancedCtaDto) {
    return optimizeAdvancedCta(dto, this.openai);
  }

  async generateAdvancedTitles(dto: GenerateAdvancedTitlesDto) {
    return generateAdvancedTitles(dto, this.openai);
  }

  suggestAdvancedField(dto: SuggestAdvancedFieldDto) {
    return suggestAdvancedField(dto, this.openai);
  }

  async generate(dto: GenerateContentDto) {
    if (dto.mode === 'personal') {
      const generated =
        dto.creationMode === 'opinion'
          ? await generateOpinionContent(dto, this.openai)
          : await generatePersonalContent(dto, this.openai);
      const score = scorePersonalContent({ content: generated.content, mode: 'personal' });
      return { ...generated, score };
    }
    const generated = await generateMarketingContent(dto, this.openai);
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
  }

  analyzeVideo(dto: AnalyzeVideoDto) {
    return analyzeVideoAngle(dto, this.openai);
  }

  analyzeOpinionStory(dto: AnalyzeOpinionStoryDto) {
    return analyzeOpinionStory(dto, this.openai);
  }

  analyzeOpinion(dto: OpinionAnalyzeDto, userId: string, organizationId: string) {
    return analyzeOpinionSource({
      dto,
      userId,
      organizationId,
      prisma: this.prisma,
      config: this.config,
      openai: this.openai,
    });
  }

  generateOpinion(dto: OpinionGenerateDto) {
    return generateOpinionPair(dto, this.openai);
  }

  rewriteOpinion(dto: OpinionRewriteDto) {
    return rewriteOpinionPair(dto, this.openai);
  }

  rewriteTeleprompterScript(dto: TeleprompterScriptRewriteDto) {
    return rewriteTeleprompterScript(dto.script, dto.mode, this.openai, dto.title);
  }

  scoreOpinionNaturalness(dto: OpinionScoreNaturalnessDto) {
    return scoreOpinionNaturalness(dto, this.openai);
  }

  suggestOpinionField(dto: OpinionSuggestFieldDto) {
    return suggestOpinionField(dto, this.openai);
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

  rewrite(dto: RewriteContentDto) {
    return rewriteContentVariant(dto, this.openai);
  }

  suggestInsights(dto: SuggestAdInsightsDto) {
    return suggestAdInsights(dto, this.openai);
  }

  suggestCta(dto: SuggestAdCtaDto) {
    return suggestAdCta(dto, this.openai);
  }

  suggestPersonalIdeas(dto: SuggestPersonalIdeasDto) {
    return suggestPersonalIdeas(dto, this.openai);
  }

  suggestPersonalTitles(dto: SuggestPersonalTitlesDto) {
    return suggestPersonalTitles(dto, this.openai);
  }

  checkFacebookPolicy(dto: FacebookPolicyCheckDto, organizationId?: string | null) {
    const hasMediaExtras = Boolean(
      dto.imageOcrText?.trim() || dto.transcript?.trim() || dto.landingPageText?.trim(),
    );
    if (!hasMediaExtras) {
      return checkFacebookAdPolicy(
        { ...dto, organizationId: organizationId ?? null },
        this.openai,
      );
    }

    const media = [];
    if (dto.imageOcrText?.trim()) {
      media.push({
        mediaType: 'image' as const,
        ocrText: dto.imageOcrText,
        transcript: '',
        caption: '',
        visualNotes: [],
        regions: [],
        findings: findingsFromMediaText(dto.imageOcrText, 'img'),
        insufficientData: false,
        statusHint: 'OK' as const,
        warnings: [],
      });
    }
    if (dto.transcript?.trim()) {
      media.push({
        mediaType: 'transcript' as const,
        ocrText: '',
        transcript: dto.transcript,
        caption: '',
        visualNotes: [],
        regions: [],
        findings: findingsFromMediaText(dto.transcript, 'tr'),
        insufficientData: false,
        statusHint: 'OK' as const,
        warnings: [],
      });
    }

    return checkFacebookAdPolicyMerged({
      input: { ...dto, organizationId: organizationId ?? null },
      media,
      landingImport: dto.landingPageText?.trim()
        ? {
            sourceType: 'landing_page',
            url: dto.landingUrl || '',
            editable: true,
            primaryText: dto.landingPageText,
            warnings: [],
            insufficientData: false,
            landing: analyzeLandingSignals('', dto.landingPageText),
          }
        : undefined,
      openai: this.openai,
    });
  }

  rewriteFacebookPolicy(dto: FacebookPolicyRewriteDto, organizationId?: string | null) {
    const primaryText = dto.primaryText?.trim() || dto.contentToRewrite?.trim() || '';
    return rewriteFacebookAdPolicy(
      {
        ...dto,
        primaryText: primaryText || dto.primaryText,
        organizationId: organizationId ?? null,
      },
      this.openai,
    );
  }

  importFacebookPolicyUrl(
    dto: FacebookPolicyImportUrlDto,
    userId: string,
    organizationId: string,
  ) {
    return importPolicyUrl({
      url: dto.url,
      urlKind: dto.urlKind,
      fanpageId: dto.fanpageId,
      userId,
      organizationId,
      prisma: this.prisma,
      config: this.config,
    });
  }

  async analyzeFacebookPolicyMedia(
    dto: FacebookPolicyAnalyzeMediaDto,
    file?: { buffer: Buffer; mimetype?: string; originalname?: string; size?: number },
    thumb?: { buffer: Buffer; mimetype?: string },
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
    }

    return analyzePolicyImage({
      buffer: file!.buffer,
      mimeType: file?.mimetype || 'image/jpeg',
      filename: file?.originalname,
      caption: dto.caption,
      openai: this.openai,
    });
  }

  status() {
    return {
      aiConfigured: this.openai.isConfigured(),
      model: this.openai.getDefaultModel(),
    };
  }
}
