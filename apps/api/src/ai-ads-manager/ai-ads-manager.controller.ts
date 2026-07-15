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
import { AdConnectionProvider } from '@marketingspa/database';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AiAdsManagerService } from './ai-ads-manager.service';
import {
  CampaignActionDto,
  CampaignsQueryDto,
  ConnectGmailDto,
  ConnectGoogleDto,
  CreateAutomationRuleDto,
  EmergencyStopDto,
  GenerateAdDraftDto,
  PublishDraftDto,
  SyncAdsDto,
  UpdateAutoModeDto,
  UpdateAutomationRuleDto,
  UpsertEmailReportDto,
} from './dto/ai-ads-manager.dto';

@Controller('ai-ads-manager')
@UseGuards(JwtAuthGuard, TenantGuard)
export class AiAdsManagerController {
  constructor(private readonly service: AiAdsManagerService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser, @Query() q: CampaignsQueryDto) {
    return this.service.getDashboard(user, q.dateFrom, q.dateTo);
  }

  @Get('connections')
  connections(@CurrentUser() user: AuthUser) {
    return this.service.getConnections(user);
  }

  @Get('meta/oauth/start')
  metaOAuthStart(@CurrentUser() user: AuthUser) {
    return this.service.getMetaOAuthStart(user);
  }

  @Post('connections/google')
  connectGoogle(@CurrentUser() user: AuthUser, @Body() dto: ConnectGoogleDto) {
    return this.service.connectGoogle(user, dto);
  }

  @Post('connections/gmail')
  connectGmail(@CurrentUser() user: AuthUser, @Body() dto: ConnectGmailDto) {
    return this.service.connectGmail(user, dto);
  }

  @Delete('connections/:provider')
  disconnect(
    @CurrentUser() user: AuthUser,
    @Param('provider') provider: AdConnectionProvider,
  ) {
    return this.service.disconnect(user, provider);
  }

  @Post('sync')
  sync(@CurrentUser() user: AuthUser, @Body() dto: SyncAdsDto) {
    return this.service.sync(user, dto);
  }

  @Get('campaigns')
  campaigns(@CurrentUser() user: AuthUser, @Query() q: CampaignsQueryDto) {
    return this.service.getCampaigns(user, q.dateFrom, q.dateTo);
  }

  @Get('settings')
  settings(@CurrentUser() user: AuthUser) {
    return this.service.getSettings(user);
  }

  @Patch('settings/auto-mode')
  updateAutoMode(@CurrentUser() user: AuthUser, @Body() dto: UpdateAutoModeDto) {
    return this.service.updateAutoMode(user, dto);
  }

  @Patch('settings/emergency-stop')
  emergencyStop(@CurrentUser() user: AuthUser, @Body() dto: EmergencyStopDto) {
    return this.service.setEmergencyStop(user, dto.emergencyStop);
  }

  @Get('rules')
  listRules(@CurrentUser() user: AuthUser) {
    return this.service.listRules(user);
  }

  @Post('rules')
  createRule(@CurrentUser() user: AuthUser, @Body() dto: CreateAutomationRuleDto) {
    return this.service.createRule(user, dto);
  }

  @Patch('rules/:id')
  updateRule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAutomationRuleDto,
  ) {
    return this.service.updateRule(user, id, dto);
  }

  @Delete('rules/:id')
  deleteRule(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deleteRule(user, id);
  }

  @Post('campaigns/pause')
  pauseCampaign(@CurrentUser() user: AuthUser, @Body() dto: CampaignActionDto) {
    return this.service.pauseCampaign(user, dto.campaignId);
  }

  @Post('campaigns/enable')
  enableCampaign(@CurrentUser() user: AuthUser, @Body() dto: CampaignActionDto) {
    return this.service.enableCampaign(user, dto.campaignId);
  }

  @Post('campaigns/optimize')
  optimizeCampaign(@CurrentUser() user: AuthUser, @Body() dto: CampaignActionDto) {
    return this.service.optimizeCampaign(user, dto.campaignId);
  }

  @Get('logs')
  logs(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.service.listLogs(user, limit ? parseInt(limit, 10) : 50);
  }

  @Get('drafts')
  drafts(@CurrentUser() user: AuthUser) {
    return this.service.listDrafts(user);
  }

  @Post('drafts/generate')
  generateDraft(@CurrentUser() user: AuthUser, @Body() dto: GenerateAdDraftDto) {
    return this.service.generateDraft(user, dto);
  }

  @Post('drafts/publish')
  publishDraft(@CurrentUser() user: AuthUser, @Body() dto: PublishDraftDto) {
    return this.service.publishDraft(user, dto.draftId);
  }

  @Get('email-reports')
  emailReports(@CurrentUser() user: AuthUser) {
    return this.service.getEmailReports(user);
  }

  @Post('email-reports')
  upsertEmailReport(@CurrentUser() user: AuthUser, @Body() dto: UpsertEmailReportDto) {
    return this.service.upsertEmailReport(user, dto);
  }

  @Post('email-reports/send')
  sendReport(@CurrentUser() user: AuthUser, @Query() q: CampaignsQueryDto) {
    return this.service.sendReport(user, q.dateFrom, q.dateTo);
  }
}
