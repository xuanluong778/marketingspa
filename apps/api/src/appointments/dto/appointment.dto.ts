import { IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { AppointmentStatus } from '@marketingspa/database';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Type } from 'class-transformer';

export class CreateAppointmentDto {
  @IsUUID()
  branchId!: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  leadId?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsDateString()
  scheduledAt!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  adCampaignId?: string;
  @IsOptional()
  @IsString()
  bedId?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  depositAmount?: number;
  @IsOptional()
  @IsString()
  depositStatus?: string;
  @IsOptional()
  @IsString()
  equipmentId?: string;
  @IsOptional()
  @IsString()
  roomId?: string;
}

export class UpdateAppointmentDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  leadId?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  bedId?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  depositAmount?: number;
  @IsOptional()
  @IsString()
  equipmentId?: string;
  @IsOptional()
  @IsString()
  roomId?: string;
}

export class UpdateAppointmentStatusDto {
  @IsEnum(AppointmentStatus)
  status!: AppointmentStatus;

  @IsOptional()
  @IsString()
  cancelledReason?: string;
  @IsOptional()
  @IsString()
  noShowReason?: string;
}

export class AppointmentQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

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
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  serviceId?: string;
}

export class CalendarQueryDto {
  @IsEnum(['day', 'week', 'month'])
  view!: 'day' | 'week' | 'month';

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsString()
  serviceId?: string;
  @IsOptional()
  @IsString()
  status?: string;
}

export class RescheduleAppointmentDto {
  @IsOptional()
  @IsString()
  scheduledAt?: string;
  @IsOptional()
  @IsString()
  startAt?: string;
  @IsOptional()
  @IsString()
  endAt?: string;
  @IsOptional()
  @IsString()
  reason?: string;
  @IsOptional()
  @IsString()
  roomId?: string;
  @IsOptional()
  @IsString()
  bedId?: string;
  @IsOptional()
  @IsString()
  equipmentId?: string;

  @IsOptional()
  @IsString()
  durationMinutes?: string;
  @IsOptional()
  @IsString()
  employeeId?: string;
  @IsOptional()
  @IsString()
  note?: string;
}
