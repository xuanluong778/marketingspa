import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CheckMessagingEligibilityDto {
  @IsOptional()
  @IsString()
  accountRef?: string;
  @IsOptional()
  @IsString()
  campaignType?: string;
  @IsOptional()
  @IsString()
  channel?: string;
  @IsOptional()
  @IsString()
  connectionId?: string;
  @IsOptional()
  @IsString()
  customerId?: string;
  @IsOptional()
  @IsString()
  externalUserId?: string;
  @IsOptional()
  @IsString()
  flowId?: string;
  @IsOptional()
  @IsString()
  identityId?: string;
  @IsOptional()
  @IsString()
  leadId?: string;
  @IsOptional()
  @IsString()
  providerModeHint?: string;
  @IsOptional()
  @IsString()
  templateId?: string;
}

