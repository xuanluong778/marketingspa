import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class TrackClickDto {
  @IsString()
  @MinLength(4)
  @MaxLength(32)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  landingPath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fingerprint?: string;
}

export class UpsertPayoutMethodDto {
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  bankCode!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  bankName!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(32)
  accountNumber!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  accountName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  branchName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  taxName?: string;
}

export class CreatePayoutRequestDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1000)
  amountVnd!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AffiliateReasonDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class AdminPayoutDecisionDto extends AffiliateReasonDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  paidReference?: string;
}

export class AdminReverseCommissionDto extends AffiliateReasonDto {}

export class AdminSetAffiliateStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED', 'PENDING_REVIEW', 'REJECTED'])
  status!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class AdminSetRateDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  customRate!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsBoolean()
  allowRenewalCommission?: boolean;
}

export class AdminUpdateSettingsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  defaultCommissionRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(90)
  holdDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPayoutVnd?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  cookieDays?: number;

  @IsOptional()
  @IsBoolean()
  firstOrderOnlyDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  allowRenewalCommission?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  publicBaseUrl?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;
}

export class AffiliateListQueryDto {
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
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @IsOptional()
  @IsUUID()
  affiliateId?: string;
}
