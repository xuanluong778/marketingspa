import { IsOptional, IsString, IsEnum, IsUUID, IsInt, IsDateString, Min } from 'class-validator';
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
}

export class UpdateAppointmentStatusDto {
  @IsEnum(AppointmentStatus)
  status!: AppointmentStatus;
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
}
