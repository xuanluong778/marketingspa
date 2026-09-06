import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { MarketingAutopilotService } from './marketing-autopilot.service';
import { MarketingContextEngineService } from './context/marketing-context-engine.service';
import { MarketingAutopilotAutofillService } from './marketing-autopilot-autofill.service';
import { MarketingAutopilotOutcomeLearningService } from './outcome/marketing-autopilot-outcome-learning.service';
import { MarketingAutopilotOutcomeLoopService } from './outcome/marketing-autopilot-outcome-loop.service';
import { MarketingMissionOrchestratorService } from './orchestrator/marketing-mission-orchestrator.service';
import { MarketingAutopilotCommandCenterService } from './command-center/marketing-autopilot-command-center.service';
import { MarketingAutopilotGuardrailService } from './marketing-autopilot-guardrail.service';
import {
  CreateMarketingAutopilotProjectDto,
  MarketingAutopilotProjectQueryDto,
  UpdateMarketingAutopilotProjectDto,
  MarketingAutopilotConfirmDraftDto,
  MarketingAutopilotRegenerateContentDto,
  AutofillMarketingAutopilotDto,
  UpdateMarketingAutopilotGuardrailDto,
  MarketingAutopilotEmergencyStopDto,
} from './dto/marketing-autopilot.dto';

@Controller('marketing-autopilot')
@UseGuards(JwtAuthGuard, TenantGuard)
export class MarketingAutopilotController {
  constructor(
    private readonly service: MarketingAutopilotService,
    private readonly contextEngine: MarketingContextEngineService,
    private readonly autofillService: MarketingAutopilotAutofillService,
    private readonly outcomeLearning: MarketingAutopilotOutcomeLearningService,
    private readonly outcomeLoop: MarketingAutopilotOutcomeLoopService,
    private readonly missionOrchestrator: MarketingMissionOrchestratorService,
    private readonly commandCenter: MarketingAutopilotCommandCenterService,
    private readonly guardrailService: MarketingAutopilotGuardrailService,
  ) {}

  @Get('guardrail')
  getGuardrail(@CurrentUser() user: AuthUser) {
    return this.guardrailService.getOrCreate(user.organizationId);
  }

  @Patch('guardrail')
  updateGuardrail(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateMarketingAutopilotGuardrailDto,
  ) {
    return this.guardrailService.update(user, dto);
  }

  @Post('emergency-stop')
  setEmergencyStop(
    @CurrentUser() user: AuthUser,
    @Body() dto: MarketingAutopilotEmergencyStopDto,
  ) {
    return this.guardrailService.setEmergencyStop(user, dto.emergencyStop);
  }

  @Get('command-center')
  getCommandCenter(@CurrentUser() user: AuthUser) {
    return this.commandCenter.getCommandCenter(user.organizationId, user);
  }

  @Get('context')
  getContext(@CurrentUser() user: AuthUser) {
    return this.contextEngine.getContext(user.organizationId, { user });
  }

  @Post('context/refresh')
  refreshContext(@CurrentUser() user: AuthUser) {
    return this.contextEngine.refreshContext(user.organizationId, user);
  }

  @Get('status')
  status(@CurrentUser() user: AuthUser) {
    return this.service.getStatus(user.organizationId);
  }

  @Get('form-options')
  getFormOptions(@CurrentUser() user: AuthUser) {
    return this.autofillService.getFormOptions(user.organizationId);
  }

  @Post('autofill')
  autofill(@CurrentUser() user: AuthUser, @Body() body: AutofillMarketingAutopilotDto) {
    return this.autofillService.autofill(user, body);
  }

  @Get('projects/filter-options')
  getProjectFilterOptions(@CurrentUser() user: AuthUser) {
    return this.service.getProjectFilterOptions(user.organizationId);
  }

  @Get('projects')
  findAll(@CurrentUser() user: AuthUser, @Query() query: MarketingAutopilotProjectQueryDto) {
    return this.service.findAll(user.organizationId, query);
  }

  @Get('projects/:id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user.organizationId, id);
  }

  @Post('projects')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateMarketingAutopilotProjectDto) {
    return this.service.create(user, dto);
  }

  @Patch('projects/:id')
  updateProject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateMarketingAutopilotProjectDto,
  ) {
    return this.service.updateProject(user, id, dto);
  }

  @Delete('projects/:id')
  archiveProject(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.archiveProject(user, id);
  }

  @Get('projects/:id/plan')
  getPlan(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getPlan(user.organizationId, id);
  }

  @Post('projects/:id/content-ideas/regenerate')
  regenerateContentIdeas(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: MarketingAutopilotRegenerateContentDto,
  ) {
    return this.service.regenerateProjectContentDraft(user, id, body.ideaIndex);
  }

  @Post('projects/:id/content-ideas/:ideaIndex/save-studio')
  saveContentIdeaToStudio(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('ideaIndex') ideaIndex: string,
  ) {
    return this.service.saveContentIdeaToStudio(user, id, Number(ideaIndex));
  }

  @Get('projects/:id/content-ideas')
  getContentIdeas(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getProjectContentIdeas(user, id);
  }

  @Post('projects/:id/confirm')
  confirmDraft(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: MarketingAutopilotConfirmDraftDto,
    @Headers('idempotency-key') headerIdempotencyKey?: string,
  ) {
    const idempotencyKey = headerIdempotencyKey?.trim() || body.idempotencyKey?.trim();
    return this.service.confirmDraft(user, id, idempotencyKey, body.draftTypes);
  }

  /** Additive: latest AI Orchestrator mission for a project. */
  @Get('projects/:id/mission')
  getProjectMission(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.missionOrchestrator.getLatestMissionForProject(user.organizationId, id);
  }

  @Get('missions/:missionId')
  getMission(@CurrentUser() user: AuthUser, @Param('missionId') missionId: string) {
    return this.missionOrchestrator.getMission(user.organizationId, missionId);
  }

  @Post('missions/:missionId/resume')
  resumeMission(@CurrentUser() user: AuthUser, @Param('missionId') missionId: string) {
    return this.missionOrchestrator.resumeMission(user, missionId);
  }

  /** Approval-first: Duyệt & chạy — immutable snapshot, no per-draft approve. */
  @Post('missions/:missionId/approve')
  approveMission(@CurrentUser() user: AuthUser, @Param('missionId') missionId: string) {
    return this.missionOrchestrator.approveAndRun(user, missionId);
  }

  @Get('business-learnings')
  getBusinessLearnings(@CurrentUser() user: AuthUser) {
    return this.outcomeLearning.getLearningsForUser(user);
  }

  @Get('outcome-tracks')
  listOutcomeTracks(
    @CurrentUser() user: AuthUser,
    @Query('projectId') projectId?: string,
  ) {
    return this.outcomeLearning.listTracksForOrg(user.organizationId, projectId);
  }

  @Post('outcome-tracks/evaluate-due')
  evaluateDueOutcomes(@CurrentUser() user: AuthUser) {
    return this.outcomeLearning.evaluateDue(user.organizationId);
  }

  /** Outcome loop state for mission (additive — UI can poll later). */
  @Get('missions/:missionId/outcome-loop')
  getMissionOutcomeLoop(@CurrentUser() user: AuthUser, @Param('missionId') missionId: string) {
    return this.outcomeLoop.getLoopPublic(user.organizationId, missionId);
  }

  @Get('missions/:missionId/optimization-proposals')
  listOptimizationProposals(
    @CurrentUser() user: AuthUser,
    @Param('missionId') missionId: string,
  ) {
    return this.outcomeLoop.listProposals(user.organizationId, missionId);
  }

  /** APPROVAL_AUTOPILOT: user duyệt đề xuất tối ưu trước khi apply. */
  @Post('optimization-proposals/:proposalId/approve')
  approveOptimizationProposal(
    @CurrentUser() user: AuthUser,
    @Param('proposalId') proposalId: string,
  ) {
    return this.outcomeLoop.approveProposal(user, proposalId);
  }
}
