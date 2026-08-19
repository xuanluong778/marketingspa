import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { LeadPipelineStatus } from '@marketingspa/database';
import { LeadsService } from './leads.service';
import { FunnelAnalyticsService } from './funnel-analytics.service';
import { CustomerJourneyService } from '../crm/customer-journey.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  CreateLeadDto,
  UpdateLeadDto,
  UpdateLeadStatusDto,
  AssignLeadDto,
  LeadQueryDto,
  StaleLeadQueryDto,
  LeadKanbanQueryDto,
  LeadKanbanColumnQueryDto,
  BulkLeadActionDto,
  CreateLeadSavedViewDto,
  UpdateLeadSavedViewDto,
} from './dto/lead.dto';
import { FunnelQueryDto, FunnelAnalyticsQueryDto } from './dto/funnel.dto';

@Controller('leads')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class LeadsController {
  constructor(
    private readonly service: LeadsService,
    private readonly funnelAnalyticsService: FunnelAnalyticsService,
    private readonly customerJourney: CustomerJourneyService,
  ) {}

  @Get()
  @RequirePermissions('lead.read')
  findAll(@CurrentUser() user: AuthUser, @Query() query: LeadQueryDto) {
    return this.service.findAll(user.organizationId, query);
  }

  @Get('kanban')
  @RequirePermissions('lead.read')
  kanban(@CurrentUser() user: AuthUser, @Query() query: LeadKanbanQueryDto) {
    return this.service.getKanban(user.organizationId, query);
  }

  @Get('kanban/:status')
  @RequirePermissions('lead.read')
  kanbanColumn(
    @CurrentUser() user: AuthUser,
    @Param('status') status: LeadPipelineStatus,
    @Query() query: LeadKanbanColumnQueryDto,
  ) {
    return this.service.getKanbanColumn(user.organizationId, status, query);
  }

  @Get('alerts/stale')
  @RequirePermissions('lead.read')
  staleAlerts(@CurrentUser() user: AuthUser, @Query() query: StaleLeadQueryDto) {
    return this.service.findStaleLeads(user.organizationId, query.minutes ?? 10);
  }

  @Get('funnel/stats')
  @RequirePermissions('lead.read')
  funnelStats(@CurrentUser() user: AuthUser, @Query() query: FunnelQueryDto) {
    return this.service.getFunnelStats(user.organizationId, query);
  }

  @Get('funnel/analytics')
  @RequirePermissions('lead.read')
  funnelAnalytics(@CurrentUser() user: AuthUser, @Query() query: FunnelAnalyticsQueryDto) {
    return this.funnelAnalyticsService.getAnalytics(user.organizationId, query);
  }

  @Get(':id/journey')
  @RequirePermissions('lead.read')
  leadJourney(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customerJourney.getLeadJourney(user.organizationId, id);
  }

  @Get('saved-views')
  @RequirePermissions('lead.read')
  listSavedViews(@CurrentUser() user: AuthUser) {
    return this.service.listSavedViews(user.organizationId, user.id);
  }

  @Post('saved-views')
  @RequirePermissions('lead.write')
  createSavedView(@CurrentUser() user: AuthUser, @Body() dto: CreateLeadSavedViewDto) {
    return this.service.createSavedView(user.organizationId, user.id, dto);
  }

  @Patch('saved-views/:id')
  @RequirePermissions('lead.write')
  updateSavedView(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateLeadSavedViewDto,
  ) {
    return this.service.updateSavedView(user.organizationId, user.id, id, dto);
  }

  @Delete('saved-views/:id')
  @RequirePermissions('lead.write')
  deleteSavedView(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deleteSavedView(user.organizationId, user.id, id);
  }

  @Post('bulk')
  @RequirePermissions('lead.write')
  bulk(@CurrentUser() user: AuthUser, @Body() dto: BulkLeadActionDto) {
    return this.service.bulkAction(user.organizationId, dto, user.id);
  }

  @Get(':id')
  @RequirePermissions('lead.read')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions('lead.write')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLeadDto) {
    return this.service.create(user.organizationId, dto, user.id);
  }

  @Patch(':id')
  @RequirePermissions('lead.write')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateLeadDto) {
    return this.service.update(user.organizationId, id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('lead.write')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateLeadStatusDto,
  ) {
    return this.service.updateStatus(user.organizationId, id, dto, user.id);
  }

  @Patch(':id/assign')
  @RequirePermissions('lead.write')
  assign(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssignLeadDto) {
    return this.service.assign(user.organizationId, id, dto, user.id);
  }

  @Post(':id/convert-customer')
  @RequirePermissions('lead.write')
  convertCustomer(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.convertToCustomer(user.organizationId, id, user.id);
  }

  @Get(':id/activity')
  @RequirePermissions('lead.read')
  activity(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.listActivity(user.organizationId, id);
  }

  @Post(':id/notes')
  @RequirePermissions('lead.write')
  addNote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { content: string },
  ) {
    return this.service.addNote(user.organizationId, id, body.content, user.id);
  }

  @Delete(':id')
  @RequirePermissions('lead.write')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.organizationId, id);
  }
}
