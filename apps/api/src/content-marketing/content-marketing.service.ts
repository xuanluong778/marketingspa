import { Injectable } from '@nestjs/common';
import { OpenAiService } from '../openai/openai.service';
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
} from './content-marketing-logic';
import {
  generateAdvancedArticle,
  generateAdvancedTitles,
  optimizeAdvancedCta,
  rewriteAdvancedArticle,
} from './advanced-article-logic';
import { suggestAdvancedField } from './advanced-field-suggest.logic';
import type {
  AnalyzeVideoDto,
  CheckPolicyDto,
  GenerateAdvancedArticleDto,
  GenerateAdvancedTitlesDto,
  GenerateContentDto,
  OptimizeAdvancedCtaDto,
  RewriteAdvancedArticleDto,
  RewriteContentDto,
  ScoreContentDto,
  SuggestAdCtaDto,
  SuggestAdInsightsDto,
  SuggestAdvancedFieldDto,
  SuggestPersonalIdeasDto,
} from './dto/content-marketing.dto';

@Injectable()
export class ContentMarketingService {
  constructor(private readonly openai: OpenAiService) {}

  /** Hook trừ credit content — chưa bật billing content */
  private async tryDebitContentCredit(_organizationId?: string): Promise<void> {
    // Placeholder: tích hợp CreditWallet khi billing content được bật
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
      const generated = await generatePersonalContent(dto, this.openai);
      const score = scorePersonalContent({ content: generated.content, mode: 'personal' });
      return { ...generated, score };
    }
    const generated = await generateMarketingContent(dto, this.openai);
    const policy = checkAdPolicyRisk({ content: generated.content, platform: dto.platform });
    const score = scoreAdContent(
      {
        content: generated.content,
        platform: dto.platform,
        mode: dto.mode,
        adObjective: dto.adObjective,
      },
      policy,
    );
    return { ...generated, policy, score };
  }

  analyzeVideo(dto: AnalyzeVideoDto) {
    return analyzeVideoAngle(dto, this.openai);
  }

  checkPolicy(dto: CheckPolicyDto) {
    return checkAdPolicyRisk(dto);
  }

  score(dto: ScoreContentDto) {
    if (dto.mode === 'personal') {
      return scorePersonalContent(dto);
    }
    const policy = checkAdPolicyRisk({ content: dto.content, platform: dto.platform });
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

  status() {
    return {
      aiConfigured: this.openai.isConfigured(),
      model: this.openai.getDefaultModel(),
    };
  }
}
