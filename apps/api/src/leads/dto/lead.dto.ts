import { IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { LeadPipelineStatus } from '@marketingspa/database';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Type } from 'class-transformer';

export class CreateLeadDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  leadSourceId?: string;

  @IsOptional()
  @IsUUID()
  funnelStageId?: string;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  estimatedValue?: number;

  @IsOptional()
  attribution?: Record<string, unknown>;
  @IsOptional()
  @IsBoolean()
  autoAssign?: boolean;
  @IsOptional()
  @IsString()
  reminderAt?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  score?: number;
  @IsOptional()
  @IsArray()
  tags?: any[];
}

export class UpdateLeadDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  leadSourceId?: string;

  @IsOptional()
  @IsUUID()
  funnelStageId?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  estimatedValue?: number;

  @IsOptional()
  @IsString()
  lostReason?: string;
}

export class UpdateLeadStatusDto {
  @IsEnum(LeadPipelineStatus)
  pipelineStatus!: LeadPipelineStatus;

  @IsOptional()
  @IsString()
  lostReason?: string;
}

export class AssignLeadDto {
  @IsUUID()
  assignedToId!: string;
}

export class LeadQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(LeadPipelineStatus)
  pipelineStatus?: LeadPipelineStatus;

  @IsOptional()
  @IsUUID()
  leadSourceId?: string;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export class StaleLeadQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minutes?: number;
}

export class BulkLeadActionDto {
  @IsArray()
  @IsUUID('4', { each: true })
  leadIds!: string[];

  @IsIn(['status', 'assign', 'tag'])
  action!: 'status' | 'assign' | 'tag';

  @IsOptional()
  @IsEnum(LeadPipelineStatus)
  pipelineStatus?: LeadPipelineStatus;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class CreateLeadSavedViewDto {
  @IsString()
  @MinLength(1)
  name!: string;
  @IsOptional()
  @IsString()
  filters?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
  @IsOptional()
  @IsString()
  tableColumns?: string;
  @IsOptional()
  @IsString()
  viewMode?: string;
}

export class LeadKanbanColumnQueryDto {
  @IsOptional()
  @IsEnum(LeadPipelineStatus)
  pipelineStatus?: LeadPipelineStatus;
  @IsOptional()
  @IsString()
  cursor?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
  @IsOptional()
  @IsString()
  search?: string;
}

export class LeadKanbanQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
  @IsOptional()
  @IsString()
  leadSourceId?: string;
  @IsOptional()
  @IsString()
  assignedToId?: string;
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
  @IsOptional()
  @IsEnum(LeadPipelineStatus)
  pipelineStatus?: LeadPipelineStatus;
}

export class UpdateLeadSavedViewDto {
  @IsOptional()
  @IsString()
  name?: string;
  @IsOptional()
  @IsString()
  filters?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
  @IsOptional()
  @IsString()
  tableColumns?: string;
  @IsOptional()
  @IsString()
  viewMode?: string;
}
