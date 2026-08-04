import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { LeadAssignmentMode, LeadPipelineStatus } from '@marketingspa/database';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { PipelineService } from './pipeline.service';
import { LeadAssignmentService } from './lead-assignment.service';
import { Customer360Service } from './customer-360.service';
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

class UpsertStageDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsEnum(LeadPipelineStatus)
  code?: LeadPipelineStatus;

  @IsOptional()
  position?: number;

  @IsOptional()
  @IsString()
  color?: string;

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
  @IsUUID()
  branchId?: string;

  @IsEnum(LeadAssignmentMode)
  mode!: LeadAssignmentMode;

  @IsOptional()
  @IsArray()
  employeeIds?: string[];

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
@UseGuards(JwtAuthGuard, TenantGuard)
export class CrmController {
  constructor(
    private readonly pipeline: PipelineService,
    private readonly assignment: LeadAssignmentService,
    private readonly customer360: Customer360Service,
  ) {}

  @Get('pipeline')
  async getPipeline(@CurrentUser() user: AuthUser) {
    return this.pipeline.ensureDefaultPipeline(user.organizationId);
  }

  @Post('pipeline/stages')
  upsertStage(@CurrentUser() user: AuthUser, @Body() dto: UpsertStageDto) {
    return this.pipeline.upsertStage(user.organizationId, dto);
  }

  @Patch('pipeline/stages/:id/deactivate')
  deactivateStage(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pipeline.deactivateStage(user.organizationId, id);
  }

  @Get('assignment-rules')
  listRules(@CurrentUser() user: AuthUser) {
    return this.assignment.listRules(user.organizationId);
  }

  @Post('assignment-rules')
  upsertRule(@CurrentUser() user: AuthUser, @Body() dto: UpsertAssignmentRuleDto) {
    return this.assignment.upsertRule(user.organizationId, dto);
  }

  @Post('leads/:id/claim')
  claim(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ClaimLeadDto,
  ) {
    return this.assignment.claimLead(user.organizationId, id, dto.employeeId);
  }

  @Get('customers/:id/360')
  customer360View(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customer360.get360(user.organizationId, id);
  }

  @Get('customers/:id/duplicates')
  duplicates(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customer360.findDuplicates(user.organizationId, id);
  }

  @Post('customers/merge')
  merge(@CurrentUser() user: AuthUser, @Body() dto: MergeCustomersDto) {
    return this.customer360.mergeCustomers(
      user.organizationId,
      dto.primaryId,
      dto.secondaryId,
      user.id,
    );
  }
}
