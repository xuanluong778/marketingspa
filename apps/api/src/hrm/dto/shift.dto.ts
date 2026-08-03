import { IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
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

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  breakMinutes?: number;
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
  @IsString()
  assignments?: string;
  @IsOptional()
  @IsBoolean()
  forceOverwrite?: boolean;

  @IsOptional()
  @IsString()
  branchId?: string;
  @IsOptional()
  @IsString()
  departmentId?: string;
  @IsOptional()
  @IsString()
  employeeIds?: string;
  @IsOptional()
  @IsString()
  fromDate?: string;
  @IsOptional()
  @IsString()
  note?: string;
  @IsOptional()
  @IsString()
  policyId?: string;
  @IsOptional()
  @IsString()
  toDate?: string;
  @IsOptional()
  @IsString()
  weekdays?: string;
}

export class ShiftCalendarQueryDto {
  @IsOptional()
  @IsString()
  from?: string;
  @IsOptional()
  @IsString()
  to?: string;
  @IsOptional()
  @IsString()
  branchId?: string;
  @IsOptional()
  @IsString()
  departmentId?: string;
  @IsOptional()
  @IsString()
  employeeId?: string;
}
