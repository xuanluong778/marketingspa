import { IsOptional, IsString, IsEnum, IsUUID, IsDateString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AdPlatform, AdCampaignStatus } from '@marketingspa/database';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateAdAccountDto {
  @IsEnum(AdPlatform)
  platform!: AdPlatform;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  externalId?: string;

  @IsOptional()
  @IsString()
  currency?: string;
}

export class CreateAdCampaignDto {
  @IsUUID()
  adAccountId!: string;

  @IsString()
  name!: string;

  @IsEnum(AdPlatform)
  platform!: AdPlatform;

  @IsOptional()
  @Type(() => Number)
  budget?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateAdDailyStatDto {
  @IsUUID()
  adCampaignId!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  impressions?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  clicks?: number;

  @Type(() => Number)
  spend!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  leads?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  conversions?: number;
}

export class AdCampaignQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(AdCampaignStatus)
  status?: AdCampaignStatus;

  @IsOptional()
  @IsEnum(AdPlatform)
  platform?: AdPlatform;
}

export class MarketingReportQueryDto {
  @IsOptional()
  @IsUUID()
  adCampaignId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
