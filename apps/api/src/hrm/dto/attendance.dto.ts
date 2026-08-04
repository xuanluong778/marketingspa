import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import {
  AttendanceDayStatus,
  AttendanceMethod,
  AttendancePunchType,
} from '@marketingspa/database';
import { Type } from 'class-transformer';

export class AttendancePunchDto {
  /** Optional — server falls back to actor.employeeId */
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  /** Optional — server falls back to employee's branchId */
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsEnum(AttendancePunchType)
  type!: AttendancePunchType;

  @IsEnum(AttendanceMethod)
  method!: AttendanceMethod;

  @IsOptional()
  @IsDateString()
  punchedAt?: string;

  /** Raw QR token (hashed server-side) */
  @IsOptional()
  @IsString()
  qrToken?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsNumber()
  accuracyM?: number;

  @IsOptional()
  @IsString()
  kioskDeviceId?: string;
}

export class AttendanceDaysQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  month?: number;

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
  @IsEnum(AttendanceDayStatus)
  status?: AttendanceDayStatus;
}

export class CreateAttendanceAdjustmentDto {
  @IsUUID()
  employeeId!: string;

  @IsDateString()
  workDate!: string;

  @IsString()
  field!: string;

  @IsOptional()
  @IsString()
  oldValue?: string;

  @IsString()
  newValue!: string;

  @IsString()
  reason!: string;
}

export class TimesheetPeriodQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  month?: number;
}

export class CreateTimesheetPeriodDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @Type(() => Number)
  @IsInt()
  year!: number;

  @Type(() => Number)
  @IsInt()
  month!: number;
}

export class UnlockTimesheetPeriodDto {
  @IsString()
  reason!: string;
}

export class CreateAttendanceQrTokenDto {
  @IsUUID()
  branchId!: string;

  @IsString()
  label!: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class AttendanceExportQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsEnum(AttendanceDayStatus)
  status?: AttendanceDayStatus;

  @IsOptional()
  @IsString()
  format?: string;
}

export class CorrectAttendanceDayDto {
  @IsOptional()
  @IsString()
  checkInAt?: string;

  @IsOptional()
  @IsString()
  checkOutAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  workedMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lateMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  earlyLeaveMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  otMinutes?: number;

  @IsOptional()
  @IsEnum(AttendanceDayStatus)
  status?: AttendanceDayStatus;

  @IsString()
  @MinLength(1)
  reason!: string;
}
