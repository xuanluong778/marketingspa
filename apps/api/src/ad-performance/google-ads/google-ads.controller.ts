import { Body, Controller, Delete, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { GoogleAdsService } from './google-ads.service';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { SelectGoogleAccountsDto, SelectGoogleCustomerDto, SyncGoogleAdsDto } from './dto/google-ads.dto';

@Controller('ad-performance/google')
export class GoogleAdsController {
  constructor(private readonly service: GoogleAdsService) {}

  @Get('oauth/start')
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @RequirePermissions('ads.connect')
  oauthStart(@CurrentUser() user: AuthUser, @Query('returnTo') returnTo?: string) {
    return this.service.getOAuthStartUrl(user, returnTo);
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
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @RequirePermissions('ads.read')
  status(@CurrentUser() user: AuthUser) {
    return this.service.getStatus(user);
  }

  @Get('customers')
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @RequirePermissions('ads.connect')
  customers(@CurrentUser() user: AuthUser) {
    return this.service.listCustomers(user);
  }

  @Get('accounts')
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @RequirePermissions('ads.read')
  accounts(@CurrentUser() user: AuthUser) {
    return this.service.listLinkedAccounts(user);
  }

  @Post('customer')
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @RequirePermissions('ads.connect')
  selectCustomer(@CurrentUser() user: AuthUser, @Body() dto: SelectGoogleCustomerDto) {
    return this.service.selectCustomer(user, dto);
  }

  @Post('accounts')
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @RequirePermissions('ads.connect')
  selectAccounts(@CurrentUser() user: AuthUser, @Body() dto: SelectGoogleAccountsDto) {
    return this.service.selectAccounts(user, dto);
  }

  @Post('sync')
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @RequirePermissions('ads.sync')
  sync(@CurrentUser() user: AuthUser, @Body() dto: SyncGoogleAdsDto) {
    return this.service.sync(user, dto);
  }

  @Get('sync-jobs/:jobId')
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @RequirePermissions('ads.read')
  syncJob(@CurrentUser() user: AuthUser, @Param('jobId') jobId: string) {
    return this.service.getSyncJob(user, jobId);
  }

  @Delete('disconnect')
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @RequirePermissions('ads.connect')
  disconnect(@CurrentUser() user: AuthUser) {
    return this.service.disconnect(user);
  }
}
