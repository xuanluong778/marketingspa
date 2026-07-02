import {
  IsOptional,
  IsString,
  IsEmail,
  IsEnum,
  IsUUID,
  IsDateString,
  MinLength,
  IsNumber,
  IsInt,
  Min,
} from 'class-validator';
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
