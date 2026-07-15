import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ContentMarketingService } from './content-marketing.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import {
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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';

@Controller('content-marketing')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ContentMarketingController {
  constructor(private readonly service: ContentMarketingService) {}

  @Get('status')
  status() {
    return this.service.status();
  }

  @Post('generate-advanced')
  generateAdvanced(@CurrentUser() user: AuthUser, @Body() dto: GenerateAdvancedArticleDto) {
    return this.service.generateAdvanced(dto, user.organizationId);
  }

  @Post('advanced/rewrite')
  rewriteAdvanced(@CurrentUser() user: AuthUser, @Body() dto: RewriteAdvancedArticleDto) {
    return this.service.rewriteAdvanced(dto, user.organizationId);
  }

  @Post('advanced/optimize-cta')
  optimizeAdvancedCta(@Body() dto: OptimizeAdvancedCtaDto) {
    return this.service.optimizeAdvancedCta(dto);
  }

  @Post('advanced/titles')
  generateAdvancedTitles(@Body() dto: GenerateAdvancedTitlesDto) {
    return this.service.generateAdvancedTitles(dto);
  }

  @Post('advanced/suggest-field')
  suggestAdvancedField(@Body() dto: SuggestAdvancedFieldDto) {
    return this.service.suggestAdvancedField(dto);
  }

  @Post('generate')
  generate(@Body() dto: GenerateContentDto) {
    return this.service.generate(dto);
  }

  @Post('analyze-video')
  analyzeVideo(@Body() dto: AnalyzeVideoDto) {
    return this.service.analyzeVideo(dto);
  }

  @Post('check-policy')
  checkPolicy(@Body() dto: CheckPolicyDto) {
    return this.service.checkPolicy(dto);
  }

  @Post('score')
  score(@Body() dto: ScoreContentDto) {
    return this.service.score(dto);
  }

  @Post('rewrite')
  rewrite(@Body() dto: RewriteContentDto) {
    return this.service.rewrite(dto);
  }

  @Post('suggest-insights')
  suggestInsights(@Body() dto: SuggestAdInsightsDto) {
    return this.service.suggestInsights(dto);
  }

  @Post('suggest-cta')
  suggestCta(@Body() dto: SuggestAdCtaDto) {
    return this.service.suggestCta(dto);
  }

  @Post('suggest-personal-ideas')
  suggestPersonalIdeas(@Body() dto: SuggestPersonalIdeasDto) {
    return this.service.suggestPersonalIdeas(dto);
  }
}
