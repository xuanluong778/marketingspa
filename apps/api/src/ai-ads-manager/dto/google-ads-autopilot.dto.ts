import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';
import { GoogleAdsAutopilotMode } from '@marketingspa/database';

export class UpsertGoogleAdsAutopilotConfigDto {
  @IsString()
  customerId!: string;

  @IsOptional()
  @IsString()
  loginCustomerId?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsEnum(GoogleAdsAutopilotMode)
  mode?: GoogleAdsAutopilotMode;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDailyBudget?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxMonthlyBudget?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  maxBudgetIncreasePct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  maxBudgetDecreasePct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  targetCpa?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  targetCpl?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  targetRoas?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stopLossDailySpend?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minSpendForAction?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minClicksForAction?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minConversionsForAction?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(168)
  gracePeriodHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  maxActionsPerDay?: number;

  @IsOptional()
  @IsBoolean()
  emergencyStop?: boolean;

  @IsOptional()
  @IsBoolean()
  writeWhitelistEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1440)
  cooldownMinutes?: number;

  @IsOptional()
  @IsBoolean()
  allowAutoPause?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minRoas?: number;
}

export class GoogleAdsAutopilotCustomerQueryDto {
  @IsString()
  customerId!: string;
}

export class ApproveAutopilotProposalDto {
  @IsOptional()
  @IsString()
  note?: string;
}

export class RejectAutopilotProposalDto {
  @IsString()
  reason!: string;
}
