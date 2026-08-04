import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClientIp } from '../common/decorators/client-ip.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AffiliateService } from './affiliate.service';
import {
  CreatePayoutRequestDto,
  TrackClickDto,
  UpsertPayoutMethodDto,
} from './dto/affiliate.dto';

@Controller('affiliate')
export class AffiliateController {
  constructor(private readonly affiliate: AffiliateService) {}

  /** Public click tracking — no auth */
  @Post('track')
  track(@Body() dto: TrackClickDto, @Req() req: Request, @ClientIp() ip?: string) {
    return this.affiliate.trackClick(dto, {
      ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, TenantGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.affiliate.overview(user);
  }

  @Get('referrals')
  @UseGuards(JwtAuthGuard, TenantGuard)
  referrals(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.affiliate.listReferrals(
      user,
      Math.max(1, Number(page) || 1),
      Math.min(100, Math.max(1, Number(pageSize) || 20)),
    );
  }

  @Get('commissions')
  @UseGuards(JwtAuthGuard, TenantGuard)
  commissions(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
  ) {
    return this.affiliate.listCommissions(
      user,
      Math.max(1, Number(page) || 1),
      Math.min(100, Math.max(1, Number(pageSize) || 20)),
      status,
    );
  }

  @Post('payout-method')
  @UseGuards(JwtAuthGuard, TenantGuard)
  payoutMethod(@CurrentUser() user: AuthUser, @Body() dto: UpsertPayoutMethodDto) {
    return this.affiliate.upsertPayoutMethod(user, dto);
  }

  @Post('payouts')
  @UseGuards(JwtAuthGuard, TenantGuard)
  createPayout(@CurrentUser() user: AuthUser, @Body() dto: CreatePayoutRequestDto) {
    return this.affiliate.createPayoutRequest(user, dto);
  }

  @Get('payouts')
  @UseGuards(JwtAuthGuard, TenantGuard)
  listPayouts(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.affiliate.listPayouts(
      user,
      Math.max(1, Number(page) || 1),
      Math.min(100, Math.max(1, Number(pageSize) || 20)),
    );
  }
}
