import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
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
}
