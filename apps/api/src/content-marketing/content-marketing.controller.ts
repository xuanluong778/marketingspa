import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ContentMarketingService } from './content-marketing.service';
import { ContentIndustryService } from './content-industry.service';
import { OpinionVoiceProfileService } from './opinion-voice-profile.service';
import { TeleprompterSourceService } from './teleprompter-source.service';
import { TeleprompterRecordingService } from './teleprompter-recording.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PlatformAdminGuard } from '../common/guards/platform-admin.guard';
import {
  AnalyzeOpinionStoryDto,
  AnalyzeVideoDto,
  CheckPolicyDto,
  CompleteTeleprompterRecordingDto,
  GenerateAdvancedArticleDto,
  GenerateAdvancedTitlesDto,
  GenerateContentDto,
  InitTeleprompterRecordingDto,
  ListTeleprompterRecordingsQueryDto,
  OptimizeAdvancedCtaDto,
  OpinionAnalyzeDto,
  OpinionGenerateDto,
  OpinionRewriteDto,
  OpinionScoreNaturalnessDto,
  OpinionSuggestFieldDto,
  RenameTeleprompterRecordingDto,
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
  StartAdUrlAnalyzeDto,
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
import { AdUrlAnalyzeService } from './ad-url-analyze.service';
import { TELEPROMPTER_RECORDING_LIMITS } from './teleprompter-recording-files';

@Controller('content-marketing')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ContentMarketingController {
  constructor(
    private readonly service: ContentMarketingService,
    private readonly industries: ContentIndustryService,
    private readonly voiceProfiles: OpinionVoiceProfileService,
    private readonly teleprompterSources: TeleprompterSourceService,
    private readonly teleprompterRecordings: TeleprompterRecordingService,
    private readonly adUrlAnalyze: AdUrlAnalyzeService,
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
  industrySuggestions(@CurrentUser() user: AuthUser, @Body() dto: IndustrySuggestionsDto) {
    return this.service.industrySuggestions(dto, user.organizationId);
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
  optimizeAdvancedCta(@CurrentUser() user: AuthUser, @Body() dto: OptimizeAdvancedCtaDto) {
    return this.service.optimizeAdvancedCta(dto, user.organizationId);
  }

  @Post('advanced/titles')
  generateAdvancedTitles(
    @CurrentUser() user: AuthUser,
    @Body() dto: GenerateAdvancedTitlesDto,
  ) {
    return this.service.generateAdvancedTitles(dto, user.organizationId);
  }

  @Post('advanced/suggest-field')
  suggestAdvancedField(@CurrentUser() user: AuthUser, @Body() dto: SuggestAdvancedFieldDto) {
    return this.service.suggestAdvancedField(dto, user.organizationId);
  }

  @Post('generate')
  generate(@CurrentUser() user: AuthUser, @Body() dto: GenerateContentDto) {
    return this.service.generate(dto, user.organizationId);
  }

  @Post('analyze-video')
  analyzeVideo(@CurrentUser() user: AuthUser, @Body() dto: AnalyzeVideoDto) {
    return this.service.analyzeVideo(dto, user.organizationId);
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
  rewrite(@CurrentUser() user: AuthUser, @Body() dto: RewriteContentDto) {
    return this.service.rewrite(dto, user.organizationId);
  }

  @Post('suggest-insights')
  suggestInsights(@CurrentUser() user: AuthUser, @Body() dto: SuggestAdInsightsDto) {
    return this.service.suggestInsights(dto, user.organizationId);
  }

  @Post('suggest-cta')
  suggestCta(@CurrentUser() user: AuthUser, @Body() dto: SuggestAdCtaDto) {
    return this.service.suggestCta(dto, user.organizationId);
  }

  @Post('ad-url-analyze')
  startAdUrlAnalyze(@CurrentUser() user: AuthUser, @Body() dto: StartAdUrlAnalyzeDto) {
    return this.adUrlAnalyze.start(user, dto);
  }

  @Get('ad-url-analyze/:id')
  getAdUrlAnalyze(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.adUrlAnalyze.get(user, id);
  }

  @Post('ad-url-analyze/:id/cancel')
  cancelAdUrlAnalyze(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.adUrlAnalyze.cancel(user, id);
  }

  @Post('suggest-personal-ideas')
  suggestPersonalIdeas(@CurrentUser() user: AuthUser, @Body() dto: SuggestPersonalIdeasDto) {
    return this.service.suggestPersonalIdeas(dto, user.organizationId);
  }

  @Post('suggest-personal-titles')
  suggestPersonalTitles(
    @CurrentUser() user: AuthUser,
    @Body() dto: SuggestPersonalTitlesDto,
  ) {
    return this.service.suggestPersonalTitles(dto, user.organizationId);
  }

  @Post('analyze-opinion-story')
  analyzeOpinionStory(@CurrentUser() user: AuthUser, @Body() dto: AnalyzeOpinionStoryDto) {
    return this.service.analyzeOpinionStory(dto, user.organizationId);
  }

  @Post('opinion/analyze')
  analyzeOpinion(@CurrentUser() user: AuthUser, @Body() dto: OpinionAnalyzeDto) {
    return this.service.analyzeOpinion(dto, user.id, user.organizationId);
  }

  @Post('opinion/generate')
  generateOpinion(@CurrentUser() user: AuthUser, @Body() dto: OpinionGenerateDto) {
    return this.service.generateOpinion(dto, user.organizationId);
  }

  @Post('opinion/rewrite')
  rewriteOpinion(@CurrentUser() user: AuthUser, @Body() dto: OpinionRewriteDto) {
    return this.service.rewriteOpinion(dto, user.organizationId);
  }

  @Post('opinion/score-naturalness')
  scoreOpinionNaturalness(
    @CurrentUser() user: AuthUser,
    @Body() dto: OpinionScoreNaturalnessDto,
  ) {
    return this.service.scoreOpinionNaturalness(dto, user.organizationId);
  }

  @Post('opinion/suggest-field')
  suggestOpinionField(@CurrentUser() user: AuthUser, @Body() dto: OpinionSuggestFieldDto) {
    return this.service.suggestOpinionField(dto, user.organizationId);
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
  rewriteTeleprompterScript(
    @CurrentUser() user: AuthUser,
    @Body() dto: TeleprompterScriptRewriteDto,
  ) {
    return this.service.rewriteTeleprompterScript(dto, user.organizationId);
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

  // --- Teleprompter recordings (multipart upload; binary not in Postgres) ---

  @Post('teleprompter-recordings/upload/init')
  initTeleprompterRecording(
    @CurrentUser() user: AuthUser,
    @Body() dto: InitTeleprompterRecordingDto,
  ) {
    return this.teleprompterRecordings.initUpload(user, {
      ...dto,
      size: Number(dto.size),
      duration: dto.duration != null ? Number(dto.duration) : undefined,
      partSize: dto.partSize != null ? Number(dto.partSize) : undefined,
    });
  }

  @Post('teleprompter-recordings/:id/parts/:partNumber')
  @UseInterceptors(
    FileInterceptor('chunk', {
      storage: memoryStorage(),
      limits: { fileSize: TELEPROMPTER_RECORDING_LIMITS.maxPartSize },
    }),
  )
  uploadTeleprompterPart(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('partNumber') partNumber: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.teleprompterRecordings.uploadPart(
      user,
      id,
      Number(partNumber),
      file ? { buffer: file.buffer, size: file.size, mimetype: file.mimetype } : undefined,
    );
  }

  @Post('teleprompter-recordings/:id/complete')
  completeTeleprompterRecording(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CompleteTeleprompterRecordingDto,
  ) {
    return this.teleprompterRecordings.completeUpload(user, id, dto || {});
  }

  @Post('teleprompter-recordings/:id/cancel')
  cancelTeleprompterRecording(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.teleprompterRecordings.cancelUpload(user, id);
  }

  @Get('teleprompter-recordings')
  listTeleprompterRecordings(
    @CurrentUser() user: AuthUser,
    @Query() query: ListTeleprompterRecordingsQueryDto,
  ) {
    return this.teleprompterRecordings.list(user, {
      cursor: query.cursor,
      status: query.status,
      limit: query.limit ? Number(query.limit) : undefined,
    });
  }

  @Get('teleprompter-recordings/:id')
  getTeleprompterRecording(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.teleprompterRecordings.detail(user, id);
  }

  @Patch('teleprompter-recordings/:id')
  renameTeleprompterRecording(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RenameTeleprompterRecordingDto,
  ) {
    return this.teleprompterRecordings.rename(user, id, dto.title);
  }

  @Delete('teleprompter-recordings/:id')
  deleteTeleprompterRecording(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.teleprompterRecordings.softDelete(user, id);
  }

  @Post('teleprompter-recordings/:id/download-url')
  teleprompterRecordingDownloadUrl(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.teleprompterRecordings.createDownloadUrl(user, id);
  }

  @Get('teleprompter-recordings/:id/download')
  downloadTeleprompterRecording(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('token') token?: string,
  ) {
    if (token?.trim()) {
      return this.teleprompterRecordings.streamDownloadByToken(id, token.trim());
    }
    return this.teleprompterRecordings.streamOwned(user, id);
  }

  @Post('facebook-policy/check')
  checkFacebookPolicy(@CurrentUser() user: AuthUser, @Body() dto: FacebookPolicyCheckDto) {
    return this.service.checkFacebookPolicy(dto, user.organizationId);
  }

  @Post('facebook-policy/rewrite')
  rewriteFacebookPolicy(@CurrentUser() user: AuthUser, @Body() dto: FacebookPolicyRewriteDto) {
    return this.service.rewriteFacebookPolicy(dto, user.organizationId);
  }

  @Post('facebook-policy/import-url')
  importFacebookPolicyUrl(@CurrentUser() user: AuthUser, @Body() dto: FacebookPolicyImportUrlDto) {
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
    @CurrentUser() user: AuthUser,
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
      user.organizationId,
    );
  }
}
