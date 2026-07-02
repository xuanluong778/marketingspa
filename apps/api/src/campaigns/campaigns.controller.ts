import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import type { AuthUser } from '../common/interfaces/auth-user.interface';

@Controller('campaigns')
@UseGuards(JwtAuthGuard, TenantGuard)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.campaignsService.findAll(user.organizationId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.campaignsService.findOne(user.organizationId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCampaignDto) {
    return this.campaignsService.create(user.organizationId, dto);
  }

  @Post(':id/send')
  send(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.campaignsService.enqueueSend(user.organizationId, id);
  }
}
