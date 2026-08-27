import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import {
  AdAutomationRuleType,
  AdConnectionProvider,
  AdEmailReportSchedule,
  AdPlatform,
} from '@marketingspa/database';

export class SyncAdsDto {
  @IsString()
  dateFrom!: string;

  @IsString()
  dateTo!: string;

  @IsOptional()
  @IsEnum(AdPlatform)
  platform?: AdPlatform;
}

export class UpdateAutoModeDto {
  @IsBoolean()
  autoModeEnabled!: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyBudgetLimit?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  maxTogglesPerDay?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxBudgetChangePercent?: number;
  @IsOptional()
  @IsString()
  mcpMode?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minSpendForAction?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  ruleCooldownMinutes?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  ruleLookbackDays?: number;
}

export class EmergencyStopDto {
  @IsBoolean()
  emergencyStop!: boolean;
}

export class CreateAutomationRuleDto {
  @IsString()
  name!: string;

  @IsEnum(AdAutomationRuleType)
  ruleType!: AdAutomationRuleType;

  @IsOptional()
  @IsEnum(AdPlatform)
  platform?: AdPlatform;

  @IsOptional()
  @IsNumber()
  threshold?: number;

  @IsOptional()
  @IsNumber()
  spendThreshold?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateAutomationRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  threshold?: number;

  @IsOptional()
  @IsNumber()
  spendThreshold?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class CampaignActionDto {
  @IsUUID()
  campaignId!: string;
}

export class ConnectGoogleDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;

  @IsString()
  customerId!: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  loginCustomerId?: string;

  @IsOptional()
  @IsString()
  accountName?: string;
}

export class ConnectGmailDto {
  @IsString()
  refreshToken!: string;

  @IsEmail()
  email!: string;
}

export class UpsertEmailReportDto {
  @IsBoolean()
  enabled!: boolean;

  @IsEnum(AdEmailReportSchedule)
  schedule!: AdEmailReportSchedule;

  @IsEmail()
  recipientEmail!: string;

  @IsOptional()
  @IsBoolean()
  reportOnLoss?: boolean;

  @IsOptional()
  @IsBoolean()
  reportOnLowRoas?: boolean;

  @IsOptional()
  @IsBoolean()
  reportOnAutoPause?: boolean;
}

export class GenerateAdDraftDto {
  @IsEnum(AdPlatform)
  platform!: AdPlatform;

  @IsString()
  objective!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  budget?: number;

  @IsOptional()
  @IsString()
  product?: string;

  @IsOptional()
  @IsString()
  audience?: string;
}

export class PublishDraftDto {
  @IsUUID()
  draftId!: string;
}

export class CampaignsQueryDto {
  @IsString()
  dateFrom!: string;

  @IsString()
  dateTo!: string;

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
  platform?: string;
}

export class OAuthReturnDto {
  @IsOptional()
  @IsEnum(AdConnectionProvider)
  provider?: AdConnectionProvider;
}
