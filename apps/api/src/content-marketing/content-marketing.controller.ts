import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ContentMarketingService } from './content-marketing.service';
import { ContentIndustryService } from './content-industry.service';
import { OpinionVoiceProfileService } from './opinion-voice-profile.service';
import { TeleprompterSourceService } from './teleprompter-source.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PlatformAdminGuard } from '../common/guards/platform-admin.guard';
import {
  AnalyzeOpinionStoryDto,
  AnalyzeVideoDto,
  CheckPolicyDto,
  GenerateAdvancedArticleDto,
  GenerateAdvancedTitlesDto,
  GenerateContentDto,
  OptimizeAdvancedCtaDto,
  OpinionAnalyzeDto,
  OpinionGenerateDto,
  OpinionRewriteDto,
  OpinionScoreNaturalnessDto,
  OpinionSuggestFieldDto,
  UpsertOpinionVoiceProfileDto,
  UpsertTeleprompterSourceDto,
  TeleprompterScriptRewriteDto,
  RewriteAdvancedArticleDto,
  RewriteContentDto,
  ScoreContentDto,
  SuggestAdCtaDto,
  SuggestAdInsightsDto,
  SuggestAdvancedFieldDto,
  SuggestPersonalIdeasDto,
  SuggestPersonalTitlesDto,
  IndustrySuggestionsDto,
} from './dto/content-marketing.dto';
import {
  FacebookPolicyAnalyzeMediaDto,
  FacebookPolicyCheckDto,
  FacebookPolicyImportUrlDto,
  FacebookPolicyRewriteDto,
} from './dto/facebook-policy.dto';
import {
  CreateContentIndustryDto,
  ListIndustriesQueryDto,
  UpdateContentIndustryDto,
  UpsertIndustryPreferenceDto,
} from './dto/content-industry.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';

@Controller('content-marketing')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ContentMarketingController {
  constructor(
    private readonly service: ContentMarketingService,
    private readonly industries: ContentIndustryService,
    private readonly voiceProfiles: OpinionVoiceProfileService,
    private readonly teleprompterSources: TeleprompterSourceService,
  ) {}

  @Get('status')
  status() {
    return this.service.status();
  }

  @Get('industries')
  listIndustries(@Query() query: ListIndustriesQueryDto) {
    return this.industries.listPublic(query.q);
  }

  @Post('industry-suggestions')
  industrySuggestions(@Body() dto: IndustrySuggestionsDto) {
    return this.service.industrySuggestions(dto);
  }

  @Get('industry-preference')
  getIndustryPreference(@CurrentUser() user: AuthUser) {
    return this.industries.getPreference(user);
  }

  @Put('industry-preference')
  upsertIndustryPreference(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpsertIndustryPreferenceDto,
  ) {
    return this.industries.upsertPreference(user, dto);
  }

  @Get('admin/industries')
  @UseGuards(PlatformAdminGuard)
  adminListIndustries() {
    return this.industries.adminList();
  }

  @Post('admin/industries')
  @UseGuards(PlatformAdminGuard)
  adminCreateIndustry(@Body() dto: CreateContentIndustryDto) {
    return this.industries.adminCreate(dto);
  }

  @Patch('admin/industries/:id')
  @UseGuards(PlatformAdminGuard)
  adminUpdateIndustry(@Param('id') id: string, @Body() dto: UpdateContentIndustryDto) {
    return this.industries.adminUpdate(id, dto);
  }

  @Post('admin/industries/:id/hide')
  @UseGuards(PlatformAdminGuard)
  adminHideIndustry(@Param('id') id: string) {
    return this.industries.adminHide(id);
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

  @Post('suggest-personal-titles')
  suggestPersonalTitles(@Body() dto: SuggestPersonalTitlesDto) {
    return this.service.suggestPersonalTitles(dto);
  }

  @Post('analyze-opinion-story')
  analyzeOpinionStory(@Body() dto: AnalyzeOpinionStoryDto) {
    return this.service.analyzeOpinionStory(dto);
  }

  @Post('opinion/analyze')
  analyzeOpinion(
    @CurrentUser() user: AuthUser,
    @Body() dto: OpinionAnalyzeDto,
  ) {
    return this.service.analyzeOpinion(dto, user.id, user.organizationId);
  }

  @Post('opinion/generate')
  generateOpinion(@Body() dto: OpinionGenerateDto) {
    return this.service.generateOpinion(dto);
  }

  @Post('opinion/rewrite')
  rewriteOpinion(@Body() dto: OpinionRewriteDto) {
    return this.service.rewriteOpinion(dto);
  }

  @Post('opinion/score-naturalness')
  scoreOpinionNaturalness(@Body() dto: OpinionScoreNaturalnessDto) {
    return this.service.scoreOpinionNaturalness(dto);
  }

  @Post('opinion/suggest-field')
  suggestOpinionField(@Body() dto: OpinionSuggestFieldDto) {
    return this.service.suggestOpinionField(dto);
  }

  @Get('opinion/voice-profile')
  getOpinionVoiceProfile(@CurrentUser() user: AuthUser) {
    return this.voiceProfiles.getProfile(user);
  }

  @Put('opinion/voice-profile')
  upsertOpinionVoiceProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpsertOpinionVoiceProfileDto,
  ) {
    return this.voiceProfiles.upsertProfile(user, dto);
  }

  @Post('teleprompter/rewrite')
  rewriteTeleprompterScript(@Body() dto: TeleprompterScriptRewriteDto) {
    return this.service.rewriteTeleprompterScript(dto);
  }

  @Post('teleprompter-source')
  upsertTeleprompterSource(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpsertTeleprompterSourceDto,
  ) {
    return this.teleprompterSources.upsert(user, dto);
  }

  @Get('teleprompter-source/:id')
  getTeleprompterSource(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.teleprompterSources.getById(user, id);
  }

  @Post('facebook-policy/check')
  checkFacebookPolicy(
    @CurrentUser() user: AuthUser,
    @Body() dto: FacebookPolicyCheckDto,
  ) {
    return this.service.checkFacebookPolicy(dto, user.organizationId);
  }

  @Post('facebook-policy/rewrite')
  rewriteFacebookPolicy(
    @CurrentUser() user: AuthUser,
    @Body() dto: FacebookPolicyRewriteDto,
  ) {
    return this.service.rewriteFacebookPolicy(dto, user.organizationId);
  }

  @Post('facebook-policy/import-url')
  importFacebookPolicyUrl(
    @CurrentUser() user: AuthUser,
    @Body() dto: FacebookPolicyImportUrlDto,
  ) {
    return this.service.importFacebookPolicyUrl(dto, user.id, user.organizationId);
  }

  @Post('facebook-policy/analyze-media')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'file', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 },
      ],
      { limits: { fileSize: 25 * 1024 * 1024 } },
    ),
  )
  analyzeFacebookPolicyMedia(
    @Body() dto: FacebookPolicyAnalyzeMediaDto,
    @UploadedFiles()
    files?: {
      file?: Array<{ buffer: Buffer; mimetype?: string; originalname?: string; size?: number }>;
      thumbnail?: Array<{ buffer: Buffer; mimetype?: string }>;
    },
  ) {
    return this.service.analyzeFacebookPolicyMedia(
      dto,
      files?.file?.[0],
      files?.thumbnail?.[0],
    );
  }
}
