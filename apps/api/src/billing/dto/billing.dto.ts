import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ActivateTrialDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  deviceFingerprint?: string;
}

export class CreatePaymentOrderDto {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  planCode!: string;
}

export class CreateCreditOrderDto {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  packageCode!: string;
}

export class AdminPaymentOrdersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  transferContent?: string;

  @IsOptional()
  @IsString()
  organizationId?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

export class AdminBillingTransactionsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  /** 'true' | 'false' */
  @IsOptional()
  @IsString()
  matched?: string;

  @IsOptional()
  @IsString()
  orderCode?: string;

  @IsOptional()
  @IsString()
  q?: string;
}

export class AdminReprocessTransactionDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class AdminManualReviewDto {
  @IsString()
  orderId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class AdminUpdateTrialSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  trialDays?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedFeaturePrefixes?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  aiDailyQuota?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  creditGrant?: number;
}
