import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FunnelBuilderService } from './funnel-builder.service';
import { FunnelTemplateService } from './funnel-template.service';
import { FunnelGeneratorService } from './funnel-generator.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  ApplyFunnelBlueprintDto,
  GenerateFunnelBlueprintDto,
  ListFunnelBlueprintsQueryDto,
} from './dto/funnel-builder.dto';
import {
  ApplyFunnelTemplateDto,
  CloneFunnelTemplateDto,
  ListFunnelTemplatesQueryDto,
  UpdateFunnelTemplateDto,
} from './dto/funnel-template.dto';
import {
  GenerateFunnelRecommendationsDto,
  SaveFunnelCompleteDraftDto,
  SelectFunnelRecommendationDto,
} from './dto/funnel-generator.dto';
import { BindFunnelChatbotDto } from './dto/funnel-capture.dto';
import { FunnelLeadCaptureService } from './funnel-lead-capture.service';
import { LeadScoringService } from '../crm/lead-scoring.service';
import { CustomerJourneyService } from '../crm/customer-journey.service';
import { FunnelValidatorService } from './funnel-validator.service';
import { FunnelConsultantService } from './funnel-consultant.service';
import { FunnelLifecycleService } from './funnel-lifecycle.service';
import { FunnelInlineEditService } from './funnel-inline-edit.service';
import { FunnelCanvasRuntimeService } from '../crm/funnel-canvas-runtime.service';
import { UpsertFunnelScoringDto } from './dto/funnel-scoring.dto';
import { FunnelJourneyQueryDto } from './dto/customer-journey.dto';
import {
  FunnelConsultantApplyDto,
  FunnelConsultantProposeDto,
} from './dto/funnel-consultant.dto';
import { FunnelPublishDto } from './dto/funnel-lifecycle.dto';
import {
  FunnelInlineContentPatchDto,
  FunnelPublishLiveUpdateDto,
} from './dto/funnel-inline-edit.dto';

@Controller('funnel-builder')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class FunnelBuilderController {
  constructor(
    private readonly service: FunnelBuilderService,
    private readonly templates: FunnelTemplateService,
    private readonly generator: FunnelGeneratorService,
    private readonly capture: FunnelLeadCaptureService,
    private readonly scoring: LeadScoringService,
    private readonly journey: CustomerJourneyService,
    private readonly validator: FunnelValidatorService,
    private readonly consultant: FunnelConsultantService,
    private readonly lifecycle: FunnelLifecycleService,
    private readonly inlineEdit: FunnelInlineEditService,
    private readonly canvasRuntime: FunnelCanvasRuntimeService,
  ) {}

  private canActivateFlows(user: AuthUser) {
    return (
      user.role === 'OWNER' ||
      (user.permissions ?? []).includes('automation.campaign.approve')
    );
  }

  // --- AI Funnel Generator (preview only) ---

  @Post('generate-recommendations')
  @RequirePermissions('lead.write')
  generateRecommendations(
    @CurrentUser() user: AuthUser,
    @Body() dto: GenerateFunnelRecommendationsDto,
  ) {
    return this.generator.generate(user, dto);
  }

  @Get('recommendations')
  @RequirePermissions('lead.read')
  listRecommendations(@CurrentUser() user: AuthUser) {
    return this.generator.list(user.organizationId);
  }

  @Get('quota')
  @RequirePermissions('lead.read')
  funnelQuota(@CurrentUser() user: AuthUser) {
    return this.lifecycle.getQuota(user.organizationId);
  }

  @Get('recommendations/:id')
  @RequirePermissions('lead.read')
  getRecommendation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.generator.get(user.organizationId, id);
  }

  @Post('recommendations/:id/select')
  @RequirePermissions('lead.write')
  selectRecommendation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SelectFunnelRecommendationDto,
  ) {
    return this.generator.select(user.organizationId, id, dto);
  }

  @Post('recommendations/:id/generate-complete')
  @RequirePermissions('lead.write')
  generateCompleteFunnel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.generator.generateComplete(user, id);
  }

  @Patch('recommendations/:id/complete-draft')
  @RequirePermissions('lead.write')
  saveCompleteDraft(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SaveFunnelCompleteDraftDto,
  ) {
    return this.generator.saveCompleteDraft(user, id, dto);
  }

  @Get('recommendations/:id/preview-form')
  @RequirePermissions('lead.read')
  getPreviewForm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inlineEdit.getPreviewForm(user, id);
  }

  @Patch('recommendations/:id/inline-content')
  @RequirePermissions('lead.write')
  saveInlineContent(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: FunnelInlineContentPatchDto,
  ) {
    return this.inlineEdit.saveInlineContent(user, id, dto.patch);
  }

  @Post('recommendations/:id/publish-live-update')
  @RequirePermissions('lead.write')
  publishLiveUpdate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: FunnelPublishLiveUpdateDto,
  ) {
    return this.lifecycle.publishLiveUpdate(user, id, dto.summary);
  }

  @Get('recommendations/:id/form')
  @RequirePermissions('lead.read')
  getFunnelForm(@Param('id') id: string) {
    return this.capture.getPublicForm(id);
  }

  @Post('recommendations/:id/bind-chatbot')
  @RequirePermissions('lead.write')
  bindChatbot(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: BindFunnelChatbotDto,
  ) {
    return this.capture.bindChatbot(user, id, dto.botId);
  }

  @Get('recommendations/:id/validate')
  @RequirePermissions('lead.read')
  async validateRecommendation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('explain') explain?: string,
  ) {
    const rec = await this.generator.get(user.organizationId, id);
    if (!rec.completeSpec) {
      return {
        ready: false,
        canActivate: false,
        score: 0,
        blocking: ['Chưa có Funnel Complete spec — generate complete trước'],
        message: 'Chưa có complete spec',
      };
    }
    const validation = this.validator.validateCompleteSpec(rec.completeSpec);
    const withExplain = explain === '1' || explain === 'true';
    const explanation = withExplain ? await this.validator.explain(validation) : undefined;
    return { ...validation, explanation };
  }

  @Post('validate')
  @RequirePermissions('lead.read')
  async validatePayload(
    @Body() body: { completeSpec?: unknown; draft?: unknown; explain?: boolean },
  ) {
    const validation = body.completeSpec
      ? this.validator.validateCompleteSpec(body.completeSpec)
      : body.draft
        ? this.validator.validateBlueprintDraft(body.draft)
        : null;
    if (!validation) {
      return { error: 'Cần completeSpec hoặc draft' };
    }
    const explanation = body.explain ? await this.validator.explain(validation) : undefined;
    return { ...validation, explanation };
  }

  @Post('recommendations/:id/consultant/propose')
  @RequirePermissions('lead.write')
  proposeConsultant(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: FunnelConsultantProposeDto,
  ) {
    return this.consultant.propose(user, id, dto);
  }

  @Post('recommendations/:id/consultant/apply')
  @RequirePermissions('lead.write')
  applyConsultant(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: FunnelConsultantApplyDto,
  ) {
    return this.consultant.apply(user, id, dto);
  }

  @Post('recommendations/:id/prepare-publish')
  @RequirePermissions('lead.write')
  preparePublish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.lifecycle.preparePublish(user, id);
  }

  @Post('recommendations/:id/publish')
  @RequirePermissions('lead.write')
  publishFunnel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: FunnelPublishDto,
  ) {
    return this.lifecycle.publish(user, id, dto.summary, this.canActivateFlows(user));
  }

  @Post('recommendations/:id/pause')
  @RequirePermissions('lead.write')
  pauseFunnel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.lifecycle.pause(user, id);
  }

  @Post('recommendations/:id/archive')
  @RequirePermissions('lead.write')
  archiveFunnel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.lifecycle.archive(user, id);
  }

  @Delete('recommendations/:id')
  @RequirePermissions('lead.write')
  deleteFunnel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.lifecycle.delete(user, id);
  }

  @Post('recommendations/:id/clone')
  @RequirePermissions('lead.write')
  cloneFunnel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.lifecycle.clone(user, id);
  }

  @Get('recommendations/:id/versions')
  @RequirePermissions('lead.read')
  listFunnelVersions(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.lifecycle.listVersions(user.organizationId, id);
  }

  @Get('recommendations/:id/versions/:versionId/diff')
  @RequirePermissions('lead.read')
  diffFunnelVersion(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    return this.lifecycle.diffVersion(user.organizationId, id, versionId);
  }

  @Post('recommendations/:id/versions/:versionId/restore')
  @RequirePermissions('lead.write')
  restoreFunnelVersion(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    return this.lifecycle.restoreVersion(user, id, versionId);
  }

  @Get('recommendations/:id/runtime')
  @RequirePermissions('lead.read')
  runtimeLogs(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('leadId') leadId?: string,
  ) {
    return this.canvasRuntime.listLogs(user.organizationId, id, leadId);
  }

  @Get('recommendations/:id/scoring')
  @RequirePermissions('lead.read')
  getScoring(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.scoring.getConfig(user.organizationId, id);
  }

  @Post('recommendations/:id/scoring/propose')
  @RequirePermissions('lead.write')
  proposeScoring(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.scoring.propose(user.organizationId, id);
  }

  @Post('recommendations/:id/scoring/apply-proposal')
  @RequirePermissions('lead.write')
  applyScoringProposal(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.scoring.applyProposed(user.organizationId, id);
  }

  @Patch('recommendations/:id/scoring')
  @RequirePermissions('lead.write')
  upsertScoring(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpsertFunnelScoringDto,
  ) {
    return this.scoring.upsertConfig(user.organizationId, id, dto);
  }

  // --- Template Engine ---

  @Get('templates')
  @RequirePermissions('lead.read')
  listTemplates(
    @CurrentUser() user: AuthUser,
    @Query() query: ListFunnelTemplatesQueryDto,
  ) {
    return this.templates.list(user.organizationId, query);
  }

  @Post('templates/sync')
  @RequirePermissions('lead.write')
  syncTemplates() {
    return this.templates.ensureSystemTemplates();
  }

  @Get('templates/:idOrSlug')
  @RequirePermissions('lead.read')
  getTemplate(@CurrentUser() user: AuthUser, @Param('idOrSlug') idOrSlug: string) {
    return this.templates.get(user.organizationId, idOrSlug);
  }

  @Post('templates/:idOrSlug/clone')
  @RequirePermissions('lead.write')
  cloneTemplate(
    @CurrentUser() user: AuthUser,
    @Param('idOrSlug') idOrSlug: string,
    @Body() dto: CloneFunnelTemplateDto,
  ) {
    return this.templates.clone(user, idOrSlug, dto);
  }

  @Patch('templates/:id')
  @RequirePermissions('lead.write')
  updateTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateFunnelTemplateDto,
  ) {
    return this.templates.update(user, id, dto);
  }

  @Post('templates/:idOrSlug/apply')
  @RequirePermissions('lead.write')
  applyTemplate(
    @CurrentUser() user: AuthUser,
    @Param('idOrSlug') idOrSlug: string,
    @Body() dto: ApplyFunnelTemplateDto,
  ) {
    return this.templates.apply(user, idOrSlug, dto, this.canActivateFlows(user));
  }

  @Patch('templates/:id/discard')
  @RequirePermissions('lead.write')
  discardTemplate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.templates.discard(user.organizationId, id);
  }

  // --- AI Blueprints ---

  @Get('blueprints')
  @RequirePermissions('lead.read')
  list(@CurrentUser() user: AuthUser, @Query() query: ListFunnelBlueprintsQueryDto) {
    return this.service.listBlueprints(user.organizationId, query);
  }

  @Get('blueprints/:id')
  @RequirePermissions('lead.read')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getBlueprint(user.organizationId, id);
  }

  @Post('generate')
  @RequirePermissions('lead.write')
  generate(@CurrentUser() user: AuthUser, @Body() dto: GenerateFunnelBlueprintDto) {
    return this.service.generate(user, dto);
  }

  @Post('apply')
  @RequirePermissions('lead.write')
  apply(@CurrentUser() user: AuthUser, @Body() dto: ApplyFunnelBlueprintDto) {
    return this.service.apply(user, dto, this.canActivateFlows(user));
  }

  @Get('recommendations/:id/journey')
  @RequirePermissions('lead.read')
  funnelJourney(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: FunnelJourneyQueryDto,
  ) {
    return this.journey.getFunnelJourney(user.organizationId, id, query);
  }

  @Patch('blueprints/:id/discard')
  @RequirePermissions('lead.write')
  discard(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.discard(user.organizationId, id);
  }
}
