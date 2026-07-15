import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
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
  @IsString()
  refreshToken!: string;

  @IsString()
  customerId!: string;

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
}

export class OAuthReturnDto {
  @IsOptional()
  @IsEnum(AdConnectionProvider)
  provider?: AdConnectionProvider;
}
