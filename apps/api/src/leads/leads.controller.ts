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
import { LeadsService } from './leads.service';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  CreateLeadDto,
  UpdateLeadDto,
  UpdateLeadStatusDto,
  AssignLeadDto,
  LeadQueryDto,
  StaleLeadQueryDto,
} from './dto/lead.dto';
import { FunnelQueryDto } from './dto/funnel.dto';

@Controller('leads')
@UseGuards(JwtAuthGuard, TenantGuard)
export class LeadsController {
  constructor(private readonly service: LeadsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: LeadQueryDto) {
    return this.service.findAll(user.organizationId, query);
  }

  @Get('alerts/stale')
  staleAlerts(@CurrentUser() user: AuthUser, @Query() query: StaleLeadQueryDto) {
    return this.service.findStaleLeads(user.organizationId, query.minutes ?? 10);
  }

  @Get('funnel/stats')
  funnelStats(@CurrentUser() user: AuthUser, @Query() query: FunnelQueryDto) {
    return this.service.getFunnelStats(user.organizationId, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user.organizationId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLeadDto) {
    return this.service.create(user.organizationId, dto, user.id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateLeadDto) {
    return this.service.update(user.organizationId, id, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateLeadStatusDto,
  ) {
    return this.service.updateStatus(user.organizationId, id, dto, user.id);
  }

  @Patch(':id/assign')
  assign(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssignLeadDto) {
    return this.service.assign(user.organizationId, id, dto, user.id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.organizationId, id);
  }
}
