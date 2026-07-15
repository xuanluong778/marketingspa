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
import {
  AttendanceMethod,
  AttendancePunchType,
} from '@marketingspa/database';
import { Type } from 'class-transformer';

export class AttendancePunchDto {
  @IsUUID()
  employeeId!: string;

  @IsUUID()
  branchId!: string;

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
