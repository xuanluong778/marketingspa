import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
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

  @IsString()
  startTime!: string;

  @IsString()
  endTime!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  breakMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  earlyLeaveGraceMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lateGraceMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  otAfterMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  otBeforeMinutes?: number;
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

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  breakMinutes?: number;

  @IsOptional()
  @IsBoolean()
  crossesMidnight?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  earlyLeaveGraceMinutes?: number;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lateGraceMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  otAfterMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  otBeforeMinutes?: number;

  @IsOptional()
  @IsString()
  startTime?: string;
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

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  policyId?: string;
}

export class CreateShiftAssignmentDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsUUID()
  employeeId!: string;

  @IsUUID()
  policyId!: string;

  @IsDateString()
  workDate!: string;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  source?: ShiftAssignmentSource;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsBoolean()
  forceOverwrite?: boolean;
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

export class BulkShiftAssignmentDto {
  @IsOptional()
  @IsBoolean()
  forceOverwrite?: boolean;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  employeeIds?: string[];

  @IsDateString()
  fromDate!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsUUID()
  policyId!: string;

  @IsDateString()
  toDate!: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  @Type(() => Number)
  weekdays?: number[];
}

export class ShiftCalendarQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;
}
