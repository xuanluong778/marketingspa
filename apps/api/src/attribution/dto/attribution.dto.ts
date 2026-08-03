import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class AttributionDashboardQueryDto {
  @IsOptional()
  @IsString()
  adCampaignId?: string;
  @IsOptional()
  @IsString()
  adId?: string;
  @IsOptional()
  @IsString()
  branchId?: string;
  @IsOptional()
  @IsString()
  channel?: string;
  @IsOptional()
  @IsString()
  customerType?: string;
  @IsOptional()
  @IsString()
  employeeId?: string;
  @IsOptional()
  @IsString()
  from?: string;
  @IsOptional()
  @IsBoolean()
  groupByAd?: boolean;
  @IsOptional()
  @IsString()
  serviceId?: string;
  @IsOptional()
  @IsString()
  to?: string;
  @IsOptional()
  @IsString()
  utmSource?: string;
}

export class AttributionInputDto {
  @IsOptional()
  @IsString()
  adCampaignId?: string;
  @IsOptional()
  @IsString()
  adId?: string;
  @IsOptional()
  @IsString()
  adSetId?: string;
  @IsOptional()
  @IsString()
  channel?: string;
  @IsOptional()
  @IsString()
  externalAdId?: string;
  @IsOptional()
  @IsString()
  externalAdSetId?: string;
  @IsOptional()
  @IsString()
  externalCampaignId?: string;
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
  @IsString()
  utmCampaign?: string;
  @IsOptional()
  @IsString()
  utmContent?: string;
  @IsOptional()
  @IsString()
  utmMedium?: string;
  @IsOptional()
  @IsString()
  utmSource?: string;
  @IsOptional()
  @IsString()
  utmTerm?: string;
}

