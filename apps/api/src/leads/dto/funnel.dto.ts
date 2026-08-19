import { IsIn, IsOptional, IsString, IsUUID, IsDateString } from 'class-validator';
import type { FunnelTouchModel } from '@marketingspa/shared';

export class FunnelQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  leadSourceId?: string;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  adCampaignId?: string;

  @IsOptional()
  @IsUUID()
  funnelRecommendationId?: string;
}

export class FunnelAnalyticsQueryDto extends FunnelQueryDto {
  @IsOptional()
  @IsIn(['first', 'last'])
  touchModel?: FunnelTouchModel;

  @IsOptional()
  @IsString()
  utmSource?: string;

  @IsOptional()
  @IsString()
  utmMedium?: string;

  @IsOptional()
  @IsString()
  utmCampaign?: string;

  @IsOptional()
  @IsString()
  adId?: string;

  @IsOptional()
  @IsString()
  adSetId?: string;

  @IsOptional()
  @IsString()
  fbclid?: string;

  @IsOptional()
  @IsString()
  gclid?: string;

  @IsOptional()
  @IsString()
  landingPage?: string;

  @IsOptional()
  @IsString()
  referrer?: string;

  @IsOptional()
  @IsIn(['campaign', 'ad', 'utmSource', 'landingPage'])
  groupBy?: 'campaign' | 'ad' | 'utmSource' | 'landingPage';
}
