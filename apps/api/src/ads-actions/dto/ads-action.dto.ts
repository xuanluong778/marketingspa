import { IsArray, IsBoolean, IsNumber, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class ApproveAdsActionDto {
  @IsOptional()
  _unused?: never;
}

export class ProposeAdsActionDto {
  @IsOptional()
  @IsString()
  campaignId?: string;

  @IsOptional()
  @IsString()
  draftId?: string;

  @IsOptional()
  @IsString()
  recommendationId?: string;

  @IsString()
  platform!: string;

  @IsString()
  actionType!: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsObject()
  beforeState!: Record<string, unknown>;

  @IsObject()
  afterState!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  evidence?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  budgetLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  proposedBudget?: number;

  @IsString()
  @MinLength(8)
  idempotencyKey!: string;

  @IsOptional()
  @IsBoolean()
  aiGenerated?: boolean;

  @IsOptional()
  @IsBoolean()
  submitForApproval?: boolean;
}

export class RejectAdsActionDto {
  @IsString()
  @MinLength(1)
  rejectionReason!: string;
}
