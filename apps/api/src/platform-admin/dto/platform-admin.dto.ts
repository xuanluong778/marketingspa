import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class AdminAuditQueryDto {
  @IsOptional()
  @IsString()
  action?: string;
  @IsOptional()
  @IsString()
  entityId?: string;
  @IsOptional()
  @IsString()
  entityType?: string;
  @IsOptional()
  @IsString()
  from?: string;
  @IsOptional()
  @IsString()
  organizationId?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pageSize?: number;
  @IsOptional()
  @IsString()
  q?: string;
  @IsOptional()
  @IsString()
  to?: string;
  @IsOptional()
  @IsString()
  userId?: string;
}

export class AdminExtendSubscriptionDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  days?: number;
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
  @IsOptional()
  @IsString()
  reason?: string;
}

export class AdminGiftTimeDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  amount?: number;
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
  @IsOptional()
  @IsString()
  reason?: string;
  @IsOptional()
  @IsString()
  unit?: string;
}

export class AdminJobsQueryDto {
  @IsOptional()
  @IsString()
  organizationId?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pageSize?: number;
  @IsOptional()
  @IsString()
  type?: string;
}

export class AdminListQueryDto {
  @IsOptional()
  @IsString()
  organizationId?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pageSize?: number;
  @IsOptional()
  @IsString()
  q?: string;
  @IsOptional()
  @IsString()
  status?: string;
}

export class AdminReasonDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class AdminSetActiveDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
  @IsOptional()
  @IsString()
  reason?: string;
}

export class AdminSoftDeleteUserDto {
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
  @IsOptional()
  @IsString()
  reason?: string;
}

export class AdminUsageQueryDto {
  @IsOptional()
  @IsString()
  organizationId?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pageSize?: number;
  @IsOptional()
  @IsString()
  q?: string;
}

