import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { PlatformAdminGuard } from '../common/guards/platform-admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClientIp } from '../common/decorators/client-ip.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AffiliateAdminService } from './affiliate-admin.service';
import {
  AdminPayoutDecisionDto,
  AdminReverseCommissionDto,
  AdminSetAffiliateStatusDto,
  AdminSetRateDto,
  AdminUpdateSettingsDto,
  AffiliateListQueryDto,
  AffiliateReasonDto,
} from './dto/affiliate.dto';

@Controller('admin/affiliate')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class AffiliateAdminController {
  constructor(private readonly admin: AffiliateAdminService) {}

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Get('partners')
  partners(@Query() query: AffiliateListQueryDto) {
    return this.admin.listPartners(query);
  }

  @Patch('partners/:id/status')
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminSetAffiliateStatusDto,
    @ClientIp() ip?: string,
  ) {
    return this.admin.setStatus(user, id, dto, ip);
  }

  @Patch('partners/:id/rate')
  setRate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminSetRateDto,
    @ClientIp() ip?: string,
  ) {
    return this.admin.setRate(user, id, dto, ip);
  }

  @Get('referrals')
  referrals(@Query() query: AffiliateListQueryDto) {
    return this.admin.listReferrals(query);
  }

  @Get('commissions')
  commissions(@Query() query: AffiliateListQueryDto) {
    return this.admin.listCommissions(query);
  }

  @Post('commissions/:id/approve')
  approveCommission(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AffiliateReasonDto,
    @ClientIp() ip?: string,
  ) {
    return this.admin.approveCommission(user, id, dto, ip);
  }

  @Post('commissions/:id/reverse')
  reverseCommission(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminReverseCommissionDto,
    @ClientIp() ip?: string,
  ) {
    return this.admin.reverseCommission(user, id, dto, ip);
  }

  @Get('payouts')
  payouts(@Query() query: AffiliateListQueryDto) {
    return this.admin.listPayouts(query);
  }

  @Post('payouts/:id/approve')
  approvePayout(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AffiliateReasonDto,
    @ClientIp() ip?: string,
  ) {
    return this.admin.approvePayout(user, id, dto, ip);
  }

  @Post('payouts/:id/reject')
  rejectPayout(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AffiliateReasonDto,
    @ClientIp() ip?: string,
  ) {
    return this.admin.rejectPayout(user, id, dto, ip);
  }

  @Post('payouts/:id/mark-paid')
  markPaid(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdminPayoutDecisionDto,
    @ClientIp() ip?: string,
  ) {
    return this.admin.markPayoutPaid(user, id, dto, ip);
  }

  @Get('fraud')
  fraud(@Query() query: AffiliateListQueryDto) {
    return this.admin.listFraud(query);
  }

  @Get('settings')
  settings() {
    return this.admin.getSettings();
  }

  @Patch('settings')
  updateSettings(
    @CurrentUser() user: AuthUser,
    @Body() dto: AdminUpdateSettingsDto,
    @ClientIp() ip?: string,
  ) {
    return this.admin.updateSettings(user, dto, ip);
  }

  @Get('audit-logs')
  audit(@Query() query: AffiliateListQueryDto) {
    return this.admin.listAudit(query);
  }
}
