import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZALO_OA_OAUTH_COOKIE } from './zalo-oauth.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ZaloMarketingService } from './zalo-marketing.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  ConnectZaloZbsDto,
  CreateZaloCampaignDto,
  PreviewZaloAudienceDto,
  PreviewZaloCampaignDto,
  ScheduleZaloCampaignDto,
  StartZaloOAuthDto,
  SyncZbsTemplatesDto,
  TestZaloZbsSendDto,
  UpdateZaloCampaignDto,
  ZaloCampaignQueryDto,
} from './dto/zalo-marketing.dto';

@Controller('zalo-marketing')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class ZaloMarketingController {
  constructor(private readonly service: ZaloMarketingService) {}

  @Get('overview')
  @RequirePermissions('automation.view')
  overview(@CurrentUser() user: AuthUser) {
    return this.service.overview(user.organizationId);
  }

  @Get('reports')
  @RequirePermissions('automation.view')
  reports(@CurrentUser() user: AuthUser) {
    return this.service.reports(user.organizationId);
  }

  @Get('oa')
  @RequirePermissions('automation.view')
  listOas(@CurrentUser() user: AuthUser) {
    return this.service.listOas(user.organizationId);
  }

  @Get('oa/:id')
  @RequirePermissions('automation.view')
  getOa(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getOa(user.organizationId, id);
  }

  @Post('oa/:id/disconnect')
  @RequirePermissions('automation.integration.manage')
  disconnectOa(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.disconnectOa(user.organizationId, id, user.id);
  }

  @Post('oa/:id/refresh')
  @RequirePermissions('automation.integration.manage')
  refreshOa(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.refreshOa(user.organizationId, id, user.id);
  }

  @Post('oauth/start')
  @RequirePermissions('automation.integration.manage')
  async startOAuth(
    @CurrentUser() user: AuthUser,
    @Body() dto: StartZaloOAuthDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const started = await this.service.startOAuth(user.id, user.organizationId, dto.returnPath);
    res.cookie(ZALO_OA_OAUTH_COOKIE, started.cookieValue, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60 * 1000,
    });
    return {
      url: started.url,
      state: started.state,
      redirectUri: started.redirectUri,
      appIdMasked: started.appIdMasked,
    };
  }

  @Post('oa/zbs')
  @RequirePermissions('automation.integration.manage')
  connectZbs(@CurrentUser() user: AuthUser, @Body() dto: ConnectZaloZbsDto) {
    return this.service.connectZbs(user.organizationId, dto, user.id);
  }

  @Post('templates/sync')
  @RequirePermissions('automation.integration.manage')
  syncTemplates(@CurrentUser() user: AuthUser, @Body() dto: SyncZbsTemplatesDto) {
    return this.service.syncZbsTemplates(user.organizationId, dto.connectionId, user.id);
  }

  @Get('templates')
  @RequirePermissions('automation.view')
  listTemplates(
    @CurrentUser() user: AuthUser,
    @Query('connectionId') connectionId?: string,
  ) {
    return this.service.listZbsTemplates(user.organizationId, connectionId);
  }

  @Get('campaigns')
  @RequirePermissions('automation.view')
  listCampaigns(@CurrentUser() user: AuthUser, @Query() query: ZaloCampaignQueryDto) {
    return this.service.listCampaigns(user.organizationId, query);
  }

  @Post('campaigns')
  @RequirePermissions('automation.campaign.create')
  createCampaign(@CurrentUser() user: AuthUser, @Body() dto: CreateZaloCampaignDto) {
    return this.service.createCampaign(user.organizationId, dto, user.id);
  }

  @Get('campaigns/:id')
  @RequirePermissions('automation.view')
  getCampaign(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getCampaign(user.organizationId, id);
  }

  @Patch('campaigns/:id')
  @RequirePermissions('automation.campaign.create')
  updateCampaign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateZaloCampaignDto,
  ) {
    return this.service.updateCampaign(user.organizationId, id, dto, user.id);
  }

  @Delete('campaigns/:id')
  @RequirePermissions('automation.campaign.create')
  removeCampaign(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.organizationId, id, user.id);
  }

  @Post('campaigns/:id/preview-segment')
  @RequirePermissions('automation.view')
  previewSegment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.previewSegment(user.organizationId, id);
  }

  @Post('campaigns/:id/preview-eligibility')
  @RequirePermissions('automation.view')
  previewEligibility(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { limit?: number; identityIds?: string[] },
  ) {
    return this.service.previewEligibility(user.organizationId, id, body);
  }

  @Post('campaigns/:id/preview')
  @RequirePermissions('automation.view')
  previewCampaign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PreviewZaloCampaignDto,
  ) {
    return this.service.previewCampaign(user.organizationId, id, dto);
  }

  @Post('audience/preview')
  @RequirePermissions('automation.view')
  previewAudience(@CurrentUser() user: AuthUser, @Body() dto: PreviewZaloAudienceDto) {
    return this.service.previewAudience(user.organizationId, dto);
  }

  @Post('audience/import')
  @RequirePermissions('automation.campaign.create')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  importAudience(
    @CurrentUser() user: AuthUser,
    @Query('connectionId') connectionId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.importAudience(user.organizationId, connectionId, file);
  }

  @Post('test/zbs')
  @RequirePermissions('automation.campaign.send')
  testZbs(@CurrentUser() user: AuthUser, @Body() dto: TestZaloZbsSendDto) {
    return this.service.testZbsSend(user.organizationId, dto);
  }

  @Post('campaigns/:id/schedule')
  @RequirePermissions('automation.campaign.approve')
  schedule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ScheduleZaloCampaignDto,
  ) {
    return this.service.schedule(user.organizationId, id, dto, user.id);
  }

  @Post('campaigns/:id/start')
  @RequirePermissions('automation.campaign.send')
  start(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.start(user.organizationId, id, user.id);
  }

  @Post('campaigns/:id/pause')
  @RequirePermissions('automation.campaign.pause')
  pause(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.pause(user.organizationId, id, user.id);
  }

  @Get('campaigns/:id/dashboard')
  @RequirePermissions('automation.view')
  dashboard(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.dashboard(user.organizationId, id);
  }
}
