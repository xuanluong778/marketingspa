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
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { MessagingCampaignService } from './messaging-campaign.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  CreateMessagingCampaignDto,
  MessagingCampaignQueryDto,
  PreviewEligibilityDto,
  ScheduleMessagingCampaignDto,
  TestSendMessagingCampaignDto,
  UpdateMessagingCampaignDto,
} from './dto/messaging-campaign.dto';

@Controller('automation/messaging-campaigns')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class MessagingCampaignController {
  constructor(private readonly service: MessagingCampaignService) {}

  @Get()
  @RequirePermissions('automation.view')
  list(@CurrentUser() user: AuthUser, @Query() query: MessagingCampaignQueryDto) {
    return this.service.list(user.organizationId, query);
  }

  @Post()
  @RequirePermissions('automation.campaign.create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateMessagingCampaignDto) {
    return this.service.create(user.organizationId, dto, user.id);
  }

  @Get(':id/dashboard')
  @RequirePermissions('automation.view')
  dashboard(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getDashboard(user.organizationId, id);
  }

  @Get(':id/export')
  @RequirePermissions('automation.view')
  async export(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('format') format: string | undefined,
    @Query('reveal') reveal: string | undefined,
    @Res() res: Response,
  ) {
    const file = await this.service.exportRecipients(user.organizationId, id, {
      format,
      userId: user.id,
      userRole: user.role,
      permissions: user.permissions,
      reveal: reveal === '1' || reveal === 'true',
    });
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.content);
  }

  @Get(':id')
  @RequirePermissions('automation.view')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user.organizationId, id);
  }

  @Patch(':id')
  @RequirePermissions('automation.campaign.create')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateMessagingCampaignDto,
  ) {
    return this.service.update(user.organizationId, id, dto, user.id);
  }

  @Post(':id/preview-segment')
  @RequirePermissions('automation.view')
  previewSegment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.previewSegment(user.organizationId, id);
  }

  @Post(':id/preview-eligibility')
  @RequirePermissions('automation.view')
  previewEligibility(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PreviewEligibilityDto,
  ) {
    return this.service.previewEligibility(user.organizationId, id, dto);
  }

  @Post(':id/test-send')
  @RequirePermissions('automation.campaign.send')
  testSend(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: TestSendMessagingCampaignDto,
  ) {
    return this.service.testSend(user.organizationId, id, dto, user.id);
  }

  @Post(':id/schedule')
  @RequirePermissions('automation.campaign.approve')
  schedule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ScheduleMessagingCampaignDto,
  ) {
    return this.service.schedule(user.organizationId, id, dto, user.id);
  }

  @Post(':id/start')
  @RequirePermissions('automation.campaign.send')
  start(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.start(user.organizationId, id, user.id);
  }

  @Post(':id/pause')
  @RequirePermissions('automation.campaign.pause')
  pause(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.pause(user.organizationId, id, user.id);
  }

  @Post(':id/resume')
  @RequirePermissions('automation.campaign.pause')
  resume(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.resume(user.organizationId, id, user.id);
  }

  @Post(':id/cancel')
  @RequirePermissions('automation.campaign.pause')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancel(user.organizationId, id, user.id);
  }

  @Post(':id/duplicate')
  @RequirePermissions('automation.campaign.create')
  duplicate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.duplicate(user.organizationId, id, user.id);
  }

  @Delete(':id')
  @RequirePermissions('automation.campaign.create')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.organizationId, id, user.id);
  }
}
