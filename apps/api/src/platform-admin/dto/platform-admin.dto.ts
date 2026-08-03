import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
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
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  days!: number;
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
  @IsOptional()
  @IsString()
  reason?: string;
}

export class AdminGiftTimeDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount!: number;
  @IsString()
  @MinLength(1)
  idempotencyKey!: string;
  @IsOptional()
  @IsString()
  reason?: string;
  @IsIn(['days', 'months', 'years'])
  unit!: 'days' | 'months' | 'years';
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

