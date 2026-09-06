import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { MARKETING_AUTOPILOT_DRAFT_TYPES } from '@marketingspa/shared';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  PROJECT_DATE_PRESETS,
  PROJECT_QUICK_FILTERS,
  PROJECT_SORT_OPTIONS,
} from '../marketing-autopilot-project-list.util';

const DRAFT_TYPE_VALUES = [...MARKETING_AUTOPILOT_DRAFT_TYPES];

export class CreateMarketingAutopilotProjectDto {
  @IsOptional()
  @IsString()
  projectName?: string;

  @IsString()
  @IsNotEmpty()
  productName!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  productPrice!: number;

  @IsString()
  @IsNotEmpty()
  customerProfile!: string;

  @IsString()
  @IsNotEmpty()
  targetArea!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  monthlyBudget!: number;

  @IsString()
  @IsNotEmpty()
  primaryGoal!: string;

  /** Optional client key to prevent duplicate creates on double-submit. */
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class MarketingAutopilotProjectQueryDto extends PaginationDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  includeArchived?: boolean;

  /** Search project name or product (case-insensitive). */
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn([...PROJECT_DATE_PRESETS])
  datePreset?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  goal?: string;

  @IsOptional()
  @IsString()
  product?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  budgetMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  budgetMax?: number;

  @IsOptional()
  @IsIn([...PROJECT_QUICK_FILTERS])
  quickFilter?: string;

  @IsOptional()
  @IsIn([...PROJECT_SORT_OPTIONS])
  sort?: string;
}

export class UpdateMarketingAutopilotProjectDto {
  @IsOptional()
  @IsString()
  projectName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  productName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  productPrice?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  customerProfile?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  targetArea?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyBudget?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  primaryGoal?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  goals?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  channels?: string[];
}

export class MarketingAutopilotProjectParamsDto {
  @IsUUID()
  id!: string;
}

export class MarketingAutopilotConfirmDraftDto {
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  /**
   * Optional filter — if omitted, creates drafts for all nextBestActions (legacy).
   * Transforms drop null/undefined (JSON converts undefined → null) before IsIn.
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null) return undefined;
    if (!Array.isArray(value)) return value;
    const cleaned = value
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim());
    return cleaned.length ? Array.from(new Set(cleaned)) : undefined;
  })
  @IsArray()
  @IsIn(DRAFT_TYPE_VALUES, {
    each: true,
    message: `draftTypes phải là một trong: ${DRAFT_TYPE_VALUES.join(', ')}`,
  })
  draftTypes?: string[];
}

/** Regenerate content draft (optional single idea index 1–5). */
export class MarketingAutopilotRegenerateContentDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  ideaIndex?: number;
}

/** Additive autofill request — does not change create-project contract. */
export class AutofillMarketingAutopilotDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  goals?: string[];

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsIn(['ai', 'segment', 'manual'])
  customerMode?: 'ai' | 'segment' | 'manual';

  @IsOptional()
  @IsString()
  segmentId?: string;
}

const AUTOPILOT_MODE_VALUES = ['RECOMMEND_ONLY', 'APPROVAL_AUTOPILOT', 'FULL_AUTOPILOT'] as const;

export class UpdateMarketingAutopilotGuardrailDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxDailyAdSpend?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxCampaignBudget?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  maxBudgetIncreasePercent?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedChannels?: string[];

  @IsOptional()
  @IsBoolean()
  allowGoogleAdsPublish?: boolean;

  @IsOptional()
  @IsBoolean()
  allowEmailSend?: boolean;

  @IsOptional()
  @IsBoolean()
  allowZaloSend?: boolean;

  @IsOptional()
  @IsBoolean()
  allowAutomationActivation?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stopLossCpl?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stopLossCpa?: number | null;

  @IsOptional()
  @IsIn(AUTOPILOT_MODE_VALUES)
  autopilotMode?: (typeof AUTOPILOT_MODE_VALUES)[number];

  @IsOptional()
  @IsBoolean()
  fullAutopilotEnabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  cooldownMinutes?: number;
}

export class MarketingAutopilotEmergencyStopDto {
  @IsBoolean()
  emergencyStop!: boolean;
}
