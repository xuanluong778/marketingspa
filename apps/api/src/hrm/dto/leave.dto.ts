import { IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { LeaveRequestStatus, LeaveType } from '@marketingspa/database';
import { Type } from 'class-transformer';

export class LeaveRequestQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsEnum(LeaveRequestStatus)
  status?: LeaveRequestStatus;

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

export class CreateLeaveRequestDto {
  @IsUUID()
  employeeId!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsEnum(LeaveType)
  leaveType!: LeaveType;

  @IsDateString()
  fromDate!: string;

  @IsDateString()
  toDate!: string;

  @IsNumber()
  days!: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  dayPart?: string;
}

export class LeaveDecisionDto {
  @IsOptional()
  @IsString()
  decisionNote?: string;
}

export class OvertimeRequestQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsEnum(LeaveRequestStatus)
  status?: LeaveRequestStatus;

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

export class CreateOvertimeRequestDto {
  @IsUUID()
  employeeId!: string;

  @IsUUID()
  branchId!: string;

  @IsDateString()
  workDate!: string;

  @IsInt()
  @Min(1)
  minutes!: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  breakMinutes?: number;
  @IsOptional()
  @IsString()
  endAt?: string;
  @IsOptional()
  @IsString()
  startAt?: string;
}

export class LeaveBalanceQueryDto {
  @IsOptional()
  @IsString()
  employeeId?: string;
  @IsOptional()
  @IsString()
  year?: string;
}

export class LeaveCancelDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class LeaveRejectDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  decisionNote?: string;
}
