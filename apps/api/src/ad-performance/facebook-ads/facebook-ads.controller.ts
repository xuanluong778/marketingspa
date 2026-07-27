import { Body, Controller, Delete, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { isAutoPostOAuthState } from '../../auto-post/auto-post-config';
import { AutoPostFacebookService } from '../../auto-post/auto-post-facebook.service';
import { FacebookAdsService } from './facebook-ads.service';
import { AdsSyncQueueService } from '../ads-sync-queue.service';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import {
  ConnectFacebookTokenDto,
  CreateFacebookCampaignDto,
  FacebookCampaignsQueryDto,
  SelectAdAccountDto,
  SyncFacebookAdsDto,
} from './dto/facebook-ads.dto';

const AdsGuards = [JwtAuthGuard, TenantGuard, PermissionsGuard] as const;

@Controller('ad-performance/facebook')
export class FacebookAdsController {
  constructor(
    private readonly service: FacebookAdsService,
    private readonly adsSyncQueue: AdsSyncQueueService,
    private readonly autoPostFacebook: AutoPostFacebookService,
  ) {}

  @Get('oauth/start')
  @UseGuards(...AdsGuards)
  @RequirePermissions('ads.connect')
  oauthStart(@CurrentUser() user: AuthUser) {
    return this.service.getOAuthStartUrl(user);
  }

  /** Test mode: dán User Access Token hoặc dùng META_ACCESS_TOKEN từ .env */
  @Post('connect-token')
  @UseGuards(...AdsGuards)
  @RequirePermissions('ads.connect')
  connectToken(@CurrentUser() user: AuthUser, @Body() dto: ConnectFacebookTokenDto) {
    return this.service.connectWithAccessToken(user, dto);
  }

  /** Public OAuth callback — state HMAC-signed; không gắn JWT guard */
  @Get('oauth/callback')
  async oauthCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    if (isAutoPostOAuthState(state)) {
      const { redirectUrl } = await this.autoPostFacebook.handleOAuthCallback(code, state, error);
      return res.redirect(redirectUrl);
    }
    const { redirectUrl } = await this.service.handleOAuthCallback(code, state, error);
    return res.redirect(redirectUrl);
  }

  @Get('status')
  @UseGuards(...AdsGuards)
  @RequirePermissions('ads.read')
  status(@CurrentUser() user: AuthUser) {
    return this.service.getStatus(user);
  }

  @Get('ad-accounts')
  @UseGuards(...AdsGuards)
  @RequirePermissions('ads.connect')
  adAccounts(@CurrentUser() user: AuthUser) {
    return this.service.listAdAccounts(user);
  }

  @Post('ad-account')
  @UseGuards(...AdsGuards)
  @RequirePermissions('ads.connect')
  selectAdAccount(@CurrentUser() user: AuthUser, @Body() dto: SelectAdAccountDto) {
    return this.service.selectAdAccount(user, dto);
  }

  @Post('sync')
  @UseGuards(...AdsGuards)
  @RequirePermissions('ads.sync')
  sync(@CurrentUser() user: AuthUser, @Body() dto: SyncFacebookAdsDto) {
    return this.service.sync(user, dto);
  }

  @Get('sync-jobs')
  @UseGuards(...AdsGuards)
  @RequirePermissions('ads.read')
  syncJobs(@CurrentUser() user: AuthUser) {
    return this.adsSyncQueue.listJobs(user);
  }

  @Get('sync-jobs/:jobId')
  @UseGuards(...AdsGuards)
  @RequirePermissions('ads.read')
  syncJob(@CurrentUser() user: AuthUser, @Param('jobId') jobId: string) {
    return this.adsSyncQueue.getJob(user, jobId);
  }

  @Get('campaigns')
  @UseGuards(...AdsGuards)
  @RequirePermissions('ads.read')
  campaigns(@CurrentUser() user: AuthUser, @Query() query: FacebookCampaignsQueryDto) {
    return this.service.getCampaigns(user, query);
  }

  /** Live list từ Meta Graph (không cần sync snapshot). */
  @Get('campaigns/live')
  @UseGuards(...AdsGuards)
  @RequirePermissions('ads.read')
  liveCampaigns(@CurrentUser() user: AuthUser) {
    return this.service.listLiveCampaigns(user);
  }

  /** Phase 1: tạo campaign PAUSED (shell) theo tên + objective — chưa tạo ad set/ad. */
  @Post('campaigns')
  @UseGuards(...AdsGuards)
  @RequirePermissions('ads.manage')
  createCampaign(@CurrentUser() user: AuthUser, @Body() dto: CreateFacebookCampaignDto) {
    return this.service.createCampaign(user, dto);
  }

  @Get('sync-logs')
  @UseGuards(...AdsGuards)
  @RequirePermissions('ads.read')
  syncLogs(@CurrentUser() user: AuthUser) {
    return this.service.listSyncLogs(user);
  }

  @Delete('disconnect')
  @UseGuards(...AdsGuards)
  @RequirePermissions('ads.connect')
  disconnect(@CurrentUser() user: AuthUser) {
    return this.service.disconnect(user);
  }
}
