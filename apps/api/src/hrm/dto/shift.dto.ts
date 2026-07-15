import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { ShiftAssignmentSource } from '@marketingspa/database';
import { Type } from 'class-transformer';

export class CreateWorkShiftPolicyDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  /** e.g. { startTime: "08:00", endTime: "17:00", graceMinutes: 5, breakMinutes: 60 } */
  @IsObject()
  payload!: Record<string, unknown>;
}

export class CreateWorkShiftPolicyVersionDto {
  @IsObject()
  payload!: Record<string, unknown>;
}

export class UpdateWorkShiftPolicyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ShiftAssignmentQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export class CreateShiftAssignmentDto {
  @IsUUID()
  branchId!: string;

  @IsUUID()
  employeeId!: string;

  @IsOptional()
  @IsUUID()
  policyId?: string;

  @IsDateString()
  workDate!: string;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  @IsOptional()
  source?: ShiftAssignmentSource;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateShiftAssignmentDto {
  @IsOptional()
  @IsUUID()
  policyId?: string;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
