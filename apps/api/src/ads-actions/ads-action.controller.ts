import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AdsActionService } from './ads-action.service';
import { ApproveAdsActionDto, ProposeAdsActionDto, RejectAdsActionDto } from './dto/ads-action.dto';

@Controller('ads-actions')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class AdsActionController {
  constructor(private readonly service: AdsActionService) {}

  @Get()
  @RequirePermissions('ads.read')
  list(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list(user, status, limit ? Number(limit) : 40);
  }

  @Get(':id')
  @RequirePermissions('ads.read')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Post('propose')
  @RequirePermissions('ads.analyze')
  propose(@CurrentUser() user: AuthUser, @Body() dto: ProposeAdsActionDto) {
    return this.service.propose(user, dto);
  }

  @Post(':id/submit')
  @RequirePermissions('ads.analyze')
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.submitForApproval(user, id);
  }

  @Post(':id/approve')
  @RequirePermissions('ads.manage')
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() _dto: ApproveAdsActionDto,
  ) {
    return this.service.approve(user, id);
  }

  @Post(':id/reject')
  @RequirePermissions('ads.manage')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RejectAdsActionDto) {
    return this.service.reject(user, id, dto.rejectionReason);
  }
}
