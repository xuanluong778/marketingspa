import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { MarketingService } from './marketing.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  CreateLeadSourceDto,
  UpdateLeadSourceDto,
  LeadSourceQueryDto,
} from './dto/lead-source.dto';
import {
  CreateAdAccountDto,
  CreateAdCampaignDto,
  CreateAdDailyStatDto,
  AdCampaignQueryDto,
  MarketingReportQueryDto,
} from './dto/ad-campaign.dto';

@Controller('marketing')
@UseGuards(JwtAuthGuard, TenantGuard)
export class MarketingController {
  constructor(private readonly service: MarketingService) {}

  @Get('lead-sources')
  listLeadSources(@CurrentUser() user: AuthUser, @Query() query: LeadSourceQueryDto) {
    return this.service.listLeadSources(user.organizationId, query);
  }

  @Post('lead-sources')
  createLeadSource(@CurrentUser() user: AuthUser, @Body() dto: CreateLeadSourceDto) {
    return this.service.createLeadSource(user.organizationId, dto);
  }

  @Patch('lead-sources/:id')
  updateLeadSource(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateLeadSourceDto,
  ) {
    return this.service.updateLeadSource(user.organizationId, id, dto);
  }

  @Get('ad-accounts')
  listAdAccounts(@CurrentUser() user: AuthUser) {
    return this.service.listAdAccounts(user.organizationId);
  }

  @Post('ad-accounts')
  createAdAccount(@CurrentUser() user: AuthUser, @Body() dto: CreateAdAccountDto) {
    return this.service.createAdAccount(user.organizationId, dto);
  }

  @Get('ad-campaigns')
  listAdCampaigns(@CurrentUser() user: AuthUser, @Query() query: AdCampaignQueryDto) {
    return this.service.listAdCampaigns(user.organizationId, query);
  }

  @Post('ad-campaigns')
  createAdCampaign(@CurrentUser() user: AuthUser, @Body() dto: CreateAdCampaignDto) {
    return this.service.createAdCampaign(user.organizationId, dto);
  }

  @Post('ad-daily-stats')
  createAdDailyStat(@CurrentUser() user: AuthUser, @Body() dto: CreateAdDailyStatDto) {
    return this.service.createAdDailyStat(user.organizationId, dto);
  }

  @Get('reports')
  reports(@CurrentUser() user: AuthUser, @Query() query: MarketingReportQueryDto) {
    return this.service.getCampaignReports(user.organizationId, query);
  }
}
