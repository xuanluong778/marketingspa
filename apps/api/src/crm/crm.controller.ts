import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { FunnelStageCategory, LeadAssignmentMode } from '@marketingspa/database';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { PipelineService } from './pipeline.service';
import { LeadAssignmentService } from './lead-assignment.service';
import { Customer360Service } from './customer-360.service';
import { CustomerJourneyService } from './customer-journey.service';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

class UpsertStageDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @IsUUID()
  pipelineId?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsEnum(FunnelStageCategory)
  category?: FunnelStageCategory;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  position?: number;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  probability?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  slaMinutes?: number | null;

  @IsOptional()
  @IsBoolean()
  isWon?: boolean;

  @IsOptional()
  @IsBoolean()
  isLost?: boolean;

  /** @deprecated use isLost */
  @IsOptional()
  @IsBoolean()
  isLostStage?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class UpsertAssignmentRuleDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  leadSourceId?: string;

  @IsOptional()
  @IsUUID()
  adCampaignId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  minScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  maxScore?: number;

  @IsEnum(LeadAssignmentMode)
  mode!: LeadAssignmentMode;

  @IsOptional()
  @IsArray()
  employeeIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  reassignOnSla?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyManager?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class MergeCustomersDto {
  @IsUUID()
  primaryId!: string;

  @IsUUID()
  secondaryId!: string;
}

class ClaimLeadDto {
  @IsUUID()
  employeeId!: string;
}

@Controller('crm')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class CrmController {
  constructor(
    private readonly pipeline: PipelineService,
    private readonly assignment: LeadAssignmentService,
    private readonly customer360: Customer360Service,
    private readonly customerJourney: CustomerJourneyService,
  ) {}

  @Get('pipeline')
  @RequirePermissions('lead.read')
  async getPipeline(@CurrentUser() user: AuthUser) {
    return this.pipeline.ensureDefaultPipeline(user.organizationId);
  }

  @Get('pipelines')
  @RequirePermissions('lead.read')
  listPipelines(@CurrentUser() user: AuthUser) {
    return this.pipeline.listPipelines(user.organizationId);
  }

  @Post('pipeline/stages')
  @RequirePermissions('lead.write')
  upsertStage(@CurrentUser() user: AuthUser, @Body() dto: UpsertStageDto) {
    return this.pipeline.upsertStage(user.organizationId, dto);
  }

  @Patch('pipeline/stages/:id/deactivate')
  @RequirePermissions('lead.write')
  deactivateStage(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pipeline.deactivateStage(user.organizationId, id);
  }

  @Get('assignment-rules')
  @RequirePermissions('lead.read')
  listRules(@CurrentUser() user: AuthUser) {
    return this.assignment.listRules(user.organizationId);
  }

  @Post('assignment-rules')
  @RequirePermissions('lead.write')
  upsertRule(@CurrentUser() user: AuthUser, @Body() dto: UpsertAssignmentRuleDto) {
    return this.assignment.upsertRule(user.organizationId, dto);
  }

  @Delete('assignment-rules/:id')
  @RequirePermissions('lead.write')
  deleteRule(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.assignment.deleteRule(user.organizationId, id);
  }

  @Post('leads/:id/claim')
  @RequirePermissions('lead.write')
  claim(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ClaimLeadDto,
  ) {
    return this.assignment.claimLead(user.organizationId, id, dto.employeeId);
  }

  @Get('customers/:id/360')
  @RequirePermissions('customer.read')
  customer360View(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customer360.get360(user.organizationId, id);
  }

  @Get('customers/:id/duplicates')
  @RequirePermissions('customer.read')
  duplicates(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customer360.findDuplicates(user.organizationId, id);
  }

  @Post('customers/merge')
  @RequirePermissions('customer.write')
  merge(@CurrentUser() user: AuthUser, @Body() dto: MergeCustomersDto) {
    return this.customer360.mergeCustomers(
      user.organizationId,
      dto.primaryId,
      dto.secondaryId,
      user.id,
    );
  }

  @Get('leads/:leadId/journey')
  @RequirePermissions('lead.read')
  leadJourney(@CurrentUser() user: AuthUser, @Param('leadId') leadId: string) {
    return this.customerJourney.getLeadJourney(user.organizationId, leadId);
  }
}
