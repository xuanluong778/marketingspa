import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Objective Outcome hợp lệ (campaign + ad set). */
export const FACEBOOK_CAMPAIGN_OBJECTIVES = [
  'OUTCOME_ENGAGEMENT',
  'OUTCOME_TRAFFIC',
  'OUTCOME_LEADS',
  'OUTCOME_AWARENESS',
  'OUTCOME_SALES',
] as const;

export type FacebookCampaignObjective = (typeof FACEBOOK_CAMPAIGN_OBJECTIVES)[number];

export class SelectAdAccountDto {
  @IsString()
  adAccountId!: string;

  @IsOptional()
  @IsString()
  adAccountName?: string;
}

/** Kết nối bằng User Access Token (test) — bỏ qua OAuth. */
export class ConnectFacebookTokenDto {
  /** Dán token từ Graph API Explorer / MetaAdsMCP. */
  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(2048)
  accessToken?: string;

  /** true = dùng META_ACCESS_TOKEN trên server (.env), không gửi token từ browser. */
  @IsOptional()
  @IsBoolean()
  useEnvToken?: boolean;

  @IsOptional()
  @IsString()
  adAccountId?: string;
}

export class CreateFacebookCampaignDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsString()
  @IsIn(FACEBOOK_CAMPAIGN_OBJECTIVES)
  objective!: FacebookCampaignObjective;
}

/** Targeting tối giản cho App Review (PAUSED). */
export class CreatePausedAdTargetingDto {
  @IsOptional()
  @IsString({ each: true })
  countries?: string[];

  @IsOptional()
  @IsInt()
  @Min(13)
  @Max(65)
  ageMin?: number;

  @IsOptional()
  @IsInt()
  @Min(13)
  @Max(65)
  ageMax?: number;
}

/**
 * Tạo thật Campaign → Ad Set → Creative → Ad ở PAUSED.
 * Không ACTIVE — reviewer không cần chi tiền.
 */
export class CreatePausedAdStackDto {
  /** Idempotency key — bắt buộc để hai request không tạo trùng. */
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  idempotencyKey!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  campaignName!: string;

  @IsString()
  @IsIn(FACEBOOK_CAMPAIGN_OBJECTIVES)
  objective!: FacebookCampaignObjective;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  adSetName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  adName?: string;

  /** Ngân sách ngày (đơn vị tiền tệ major, ví dụ VND hoặc USD). */
  @IsNumber()
  @Min(1)
  dailyBudget!: number;

  /** Số chữ số thập phân minor (USD=2 → *100; VND=0 → *1). Mặc định 0. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  currencyOffset?: number;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @ValidateNested()
  @Type(() => CreatePausedAdTargetingDto)
  @IsOptional()
  targeting?: CreatePausedAdTargetingDto;

  /** Fanpage ID (bắt buộc cho object_story_spec). */
  @IsString()
  @MinLength(1)
  pageId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  primaryText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  headline?: string;

  @IsUrl({ require_tld: false })
  linkUrl!: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  imageUrl?: string;

  @IsOptional()
  @IsString()
  videoId?: string;
}

export class UpdateCampaignBudgetDto {
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  idempotencyKey!: string;

  /** Ngân sách ngày (major units). */
  @IsNumber()
  @Min(1)
  dailyBudget!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  currencyOffset?: number;
}

export class UpdateCampaignScheduleDto {
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  idempotencyKey!: string;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  /** Ad Set external id — nếu bỏ trống dùng ad set đầu tiên của campaign. */
  @IsOptional()
  @IsString()
  adSetId?: string;
}

export class SetCampaignStatusDto {
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  idempotencyKey!: string;

  @IsBoolean()
  active!: boolean;
}

export class SyncFacebookAdsDto {
  /** Bỏ trống → incremental từ lastSyncAt */
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  campaignId?: string;
}

export class FacebookCampaignsQueryDto {
  @IsDateString()
  dateFrom!: string;

  @IsDateString()
  dateTo!: string;

  @IsOptional()
  @IsString()
  adAccountId?: string;

  @IsOptional()
  @IsString()
  campaignId?: string;
}

export class FacebookLiveInsightsQueryDto {
  @IsDateString()
  dateFrom!: string;

  @IsDateString()
  dateTo!: string;

  @IsOptional()
  @IsIn(['campaign', 'adset', 'ad'])
  level?: 'campaign' | 'adset' | 'ad';

  @IsOptional()
  @IsString()
  objectId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number;

  /** true = bỏ Redis cache, gọi Meta lại. */
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  refresh?: boolean;
}
