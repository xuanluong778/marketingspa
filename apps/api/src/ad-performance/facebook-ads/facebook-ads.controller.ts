import { Body, Controller, Delete, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { FacebookAdsService } from './facebook-ads.service';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import {
  FacebookCampaignsQueryDto,
  SelectAdAccountDto,
  SyncFacebookAdsDto,
} from './dto/facebook-ads.dto';

@Controller('ad-performance/facebook')
export class FacebookAdsController {
  constructor(private readonly service: FacebookAdsService) {}

  @Get('oauth/start')
  @UseGuards(JwtAuthGuard, TenantGuard)
  oauthStart(@CurrentUser() user: AuthUser) {
    return this.service.getOAuthStartUrl(user);
  }

  @Get('oauth/callback')
  async oauthCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const { redirectUrl } = await this.service.handleOAuthCallback(code, state, error);
    return res.redirect(redirectUrl);
  }

  @Get('status')
  @UseGuards(JwtAuthGuard, TenantGuard)
  status(@CurrentUser() user: AuthUser) {
    return this.service.getStatus(user.id);
  }

  @Get('ad-accounts')
  @UseGuards(JwtAuthGuard, TenantGuard)
  adAccounts(@CurrentUser() user: AuthUser) {
    return this.service.listAdAccounts(user.id);
  }

  @Post('ad-account')
  @UseGuards(JwtAuthGuard, TenantGuard)
  selectAdAccount(@CurrentUser() user: AuthUser, @Body() dto: SelectAdAccountDto) {
    return this.service.selectAdAccount(user.id, dto);
  }

  @Post('sync')
  @UseGuards(JwtAuthGuard, TenantGuard)
  sync(@CurrentUser() user: AuthUser, @Body() dto: SyncFacebookAdsDto) {
    return this.service.sync(user.id, dto);
  }

  @Get('campaigns')
  @UseGuards(JwtAuthGuard, TenantGuard)
  campaigns(@CurrentUser() user: AuthUser, @Query() query: FacebookCampaignsQueryDto) {
    return this.service.getCampaigns(user.id, query);
  }

  @Get('sync-logs')
  @UseGuards(JwtAuthGuard, TenantGuard)
  syncLogs(@CurrentUser() user: AuthUser) {
    return this.service.listSyncLogs(user.id);
  }

  @Delete('disconnect')
  @UseGuards(JwtAuthGuard, TenantGuard)
  disconnect(@CurrentUser() user: AuthUser) {
    return this.service.disconnect(user.id);
  }
}
