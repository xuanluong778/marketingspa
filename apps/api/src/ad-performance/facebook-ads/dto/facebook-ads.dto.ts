import { IsDateString, IsOptional, IsString } from 'class-validator';

export class SelectAdAccountDto {
  @IsString()
  adAccountId!: string;

  @IsOptional()
  @IsString()
  adAccountName?: string;
}

export class SyncFacebookAdsDto {
  @IsDateString()
  dateFrom!: string;

  @IsDateString()
  dateTo!: string;

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
