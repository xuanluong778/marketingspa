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
import { AutomationService } from './automation.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  CreateMessageTemplateDto,
  UpdateMessageTemplateDto,
  PreviewMessageTemplateDto,
  CreateAutomationFlowDto,
  UpdateAutomationFlowDto,
  SimulateAutomationDto,
  TemplateQueryDto,
  LogQueryDto,
} from './dto/automation.dto';

@Controller('automation')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class AutomationController {
  constructor(private readonly service: AutomationService) {}

  private canApprove(user: AuthUser) {
    return (
      user.role === 'OWNER' ||
      (user.permissions ?? []).includes('automation.campaign.approve')
    );
  }

  @Get('variables')
  @RequirePermissions('automation.view')
  listVariables() {
    return this.service.getVariableCatalog();
  }

  @Get('templates')
  @RequirePermissions('automation.view')
  listTemplates(@CurrentUser() user: AuthUser, @Query() query: TemplateQueryDto) {
    return this.service.listTemplates(user.organizationId, query);
  }

  @Post('templates')
  @RequirePermissions('automation.template.manage')
  createTemplate(@CurrentUser() user: AuthUser, @Body() dto: CreateMessageTemplateDto) {
    return this.service.createTemplate(user.organizationId, dto, user.id);
  }

  @Patch('templates/:id')
  @RequirePermissions('automation.template.manage')
  updateTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateMessageTemplateDto,
  ) {
    return this.service.updateTemplate(user.organizationId, id, dto, user.id);
  }

  @Post('templates/:id/preview')
  @RequirePermissions('automation.view')
  previewTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PreviewMessageTemplateDto,
  ) {
    return this.service.previewTemplate(user.organizationId, id, dto);
  }

  @Delete('templates/:id')
  @RequirePermissions('automation.template.manage')
  deleteTemplate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deleteTemplate(user.organizationId, id, user.id);
  }

  @Get('funnels')
  @RequirePermissions('automation.view')
  listFunnels(@CurrentUser() user: AuthUser) {
    return this.service.listFunnels(user.organizationId);
  }

  @Get('flows')
  @RequirePermissions('automation.view')
  listFlows(@CurrentUser() user: AuthUser) {
    return this.service.listFlows(user.organizationId);
  }

  @Post('flows')
  @RequirePermissions('automation.campaign.create')
  createFlow(@CurrentUser() user: AuthUser, @Body() dto: CreateAutomationFlowDto) {
    return this.service.createFlow(
      user.organizationId,
      dto,
      user.id,
      this.canApprove(user),
    );
  }

  @Patch('flows/:id')
  @RequirePermissions('automation.campaign.create')
  updateFlow(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAutomationFlowDto,
  ) {
    return this.service.updateFlow(
      user.organizationId,
      id,
      dto,
      user.id,
      this.canApprove(user),
    );
  }

  @Post('flows/:id/approve')
  @RequirePermissions('automation.campaign.approve')
  approveFlow(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.approveFlow(user.organizationId, id, user.id);
  }

  @Delete('flows/:id')
  @RequirePermissions('automation.campaign.create')
  deleteFlow(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deleteFlow(user.organizationId, id, user.id);
  }

  @Patch('flows/:id/pause')
  @RequirePermissions('automation.campaign.pause')
  pauseFlow(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { isPaused?: boolean },
  ) {
    return this.service.pauseFlow(
      user.organizationId,
      id,
      body.isPaused ?? true,
      user.id,
    );
  }

  @Post('flows/:id/simulate')
  @RequirePermissions('automation.campaign.send')
  simulate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SimulateAutomationDto,
  ) {
    return this.service.simulate(user.organizationId, id, dto, user.id);
  }

  @Get('logs')
  @RequirePermissions('automation.logs.view')
  listLogs(@CurrentUser() user: AuthUser, @Query() query: LogQueryDto) {
    return this.service.listLogs(user.organizationId, query);
  }
}
