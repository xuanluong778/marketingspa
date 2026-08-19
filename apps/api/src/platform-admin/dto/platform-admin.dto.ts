import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength, ValidateIf } from 'class-validator';
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
  /** Bắt buộc khi tặng thời hạn. Có thể 0/omit nếu chỉ tặng AI Credit. */
  @ValidateIf(
    (o: AdminGiftTimeDto) => !o.permanent && !(Number(o.creditAmount) > 0 && !(Number(o.amount) >= 1)),
  )
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  amount?: number;
  @IsString()
  @MinLength(1)
  idempotencyKey!: string;
  @IsOptional()
  @IsString()
  reason?: string;
  @ValidateIf((o: AdminGiftTimeDto) => o.permanent || Number(o.amount) >= 1 || !(Number(o.creditAmount) > 0))
  @IsIn(['days', 'months', 'years'])
  unit?: 'days' | 'months' | 'years';
  @IsOptional()
  @IsBoolean()
  permanent?: boolean;
  /** Số AI Credit tặng kèm (0 = chỉ tặng thời hạn). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  creditAmount?: number;
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

export class AdminCreditAdjustDto {
  /** Dương = cộng, âm = trừ. Không được = 0. */
  @Type(() => Number)
  @IsNumber()
  delta!: number;
  @IsString()
  @MinLength(3)
  reason!: string;
  @IsString()
  @MinLength(8)
  idempotencyKey!: string;
}

