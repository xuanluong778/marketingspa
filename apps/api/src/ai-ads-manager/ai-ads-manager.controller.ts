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
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
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
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class AiAdsManagerController {
  constructor(private readonly service: AiAdsManagerService) {}

  @Get('dashboard')
  @RequirePermissions('ads.read')
  dashboard(@CurrentUser() user: AuthUser, @Query() q: CampaignsQueryDto) {
    return this.service.getDashboard(user, q.dateFrom, q.dateTo);
  }

  @Get('connections')
  @RequirePermissions('ads.read')
  connections(@CurrentUser() user: AuthUser) {
    return this.service.getConnections(user);
  }

  @Get('meta/oauth/start')
  @RequirePermissions('ads.connect')
  metaOAuthStart(@CurrentUser() user: AuthUser) {
    return this.service.getMetaOAuthStart(user);
  }

  @Get('google/oauth/start')
  @RequirePermissions('ads.connect')
  googleOAuthStart(@CurrentUser() user: AuthUser) {
    return this.service.getGoogleOAuthStart(user);
  }

  /** Paste refresh token bị từ chối — dùng google/oauth/start */
  @Post('connections/google')
  @RequirePermissions('ads.connect')
  connectGoogle(@CurrentUser() user: AuthUser, @Body() dto: ConnectGoogleDto) {
    return this.service.connectGoogle(user, dto);
  }

  @Post('connections/gmail')
  @RequirePermissions('ads.connect')
  connectGmail(@CurrentUser() user: AuthUser, @Body() dto: ConnectGmailDto) {
    return this.service.connectGmail(user, dto);
  }

  @Delete('connections/:provider')
  @RequirePermissions('ads.connect')
  disconnect(@CurrentUser() user: AuthUser, @Param('provider') provider: AdConnectionProvider) {
    return this.service.disconnect(user, provider);
  }

  @Post('sync')
  @RequirePermissions('ads.sync')
  sync(@CurrentUser() user: AuthUser, @Body() dto: SyncAdsDto) {
    return this.service.sync(user, dto);
  }

  @Get('sync-jobs')
  @RequirePermissions('ads.read')
  listSyncJobs(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.service.listSyncJobs(user, limit ? Number(limit) : 30);
  }

  @Get('sync-jobs/:jobId')
  @RequirePermissions('ads.read')
  getSyncJob(@CurrentUser() user: AuthUser, @Param('jobId') jobId: string) {
    return this.service.getSyncJob(user, jobId);
  }

  @Get('campaigns')
  @RequirePermissions('ads.read')
  campaigns(@CurrentUser() user: AuthUser, @Query() q: CampaignsQueryDto) {
    return this.service.getCampaigns(user, q.dateFrom, q.dateTo, {
      platform: q.platform,
      page: q.page ? Number(q.page) : 1,
      pageSize: q.pageSize ? Number(q.pageSize) : 20,
    });
  }

  @Get('settings')
  @RequirePermissions('ads.read')
  settings(@CurrentUser() user: AuthUser) {
    return this.service.getSettings(user);
  }

  @Patch('settings/auto-mode')
  @RequirePermissions('ads.manage')
  updateAutoMode(@CurrentUser() user: AuthUser, @Body() dto: UpdateAutoModeDto) {
    return this.service.updateAutoMode(user, dto);
  }

  @Patch('settings/emergency-stop')
  @RequirePermissions('ads.manage')
  emergencyStop(@CurrentUser() user: AuthUser, @Body() dto: EmergencyStopDto) {
    return this.service.setEmergencyStop(user, dto.emergencyStop);
  }

  @Get('rules')
  @RequirePermissions('ads.read')
  listRules(@CurrentUser() user: AuthUser) {
    return this.service.listRules(user);
  }

  @Post('rules')
  @RequirePermissions('ads.manage')
  createRule(@CurrentUser() user: AuthUser, @Body() dto: CreateAutomationRuleDto) {
    return this.service.createRule(user, dto);
  }

  @Patch('rules/:id')
  @RequirePermissions('ads.manage')
  updateRule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAutomationRuleDto,
  ) {
    return this.service.updateRule(user, id, dto);
  }

  @Delete('rules/:id')
  @RequirePermissions('ads.manage')
  deleteRule(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deleteRule(user, id);
  }

  @Post('campaigns/pause')
  @RequirePermissions('ads.manage')
  pauseCampaign(@CurrentUser() user: AuthUser, @Body() dto: CampaignActionDto) {
    return this.service.pauseCampaign(user, dto.campaignId);
  }

  @Post('campaigns/enable')
  @RequirePermissions('ads.manage')
  enableCampaign(@CurrentUser() user: AuthUser, @Body() dto: CampaignActionDto) {
    return this.service.enableCampaign(user, dto.campaignId);
  }

  @Post('campaigns/optimize')
  @RequirePermissions('ads.analyze')
  optimizeCampaign(@CurrentUser() user: AuthUser, @Body() dto: CampaignActionDto) {
    return this.service.optimizeCampaign(user, dto.campaignId);
  }

  @Get('logs')
  @RequirePermissions('ads.read')
  logs(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.service.listLogs(user, limit ? parseInt(limit, 10) : 50);
  }

  @Get('drafts')
  @RequirePermissions('ads.read')
  drafts(@CurrentUser() user: AuthUser) {
    return this.service.listDrafts(user);
  }

  @Post('drafts/generate')
  @RequirePermissions('ads.analyze')
  generateDraft(@CurrentUser() user: AuthUser, @Body() dto: GenerateAdDraftDto) {
    return this.service.generateDraft(user, dto);
  }

  @Post('drafts/publish')
  @RequirePermissions('ads.manage')
  publishDraft(@CurrentUser() user: AuthUser, @Body() dto: PublishDraftDto) {
    return this.service.publishDraft(user, dto.draftId);
  }

  @Get('email-reports')
  @RequirePermissions('ads.read')
  emailReports(@CurrentUser() user: AuthUser) {
    return this.service.getEmailReports(user);
  }

  @Post('email-reports')
  @RequirePermissions('ads.manage')
  upsertEmailReport(@CurrentUser() user: AuthUser, @Body() dto: UpsertEmailReportDto) {
    return this.service.upsertEmailReport(user, dto);
  }

  @Post('email-reports/send')
  @RequirePermissions('ads.analyze')
  sendReport(@CurrentUser() user: AuthUser, @Query() q: CampaignsQueryDto) {
    return this.service.sendReport(user, q.dateFrom, q.dateTo);
  }
}
