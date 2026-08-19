import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MessageChannel, MessagingCampaignKind, MessagingCampaignStatus } from '@marketingspa/database';

export class ZaloCampaignQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsEnum(MessagingCampaignStatus)
  status?: MessagingCampaignStatus;

  @IsOptional()
  @IsEnum(MessagingCampaignKind)
  campaignType?: MessagingCampaignKind;
}

export class CreateZaloCampaignDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsEnum(MessagingCampaignKind)
  campaignType!: MessagingCampaignKind;

  @IsString()
  channelConnectionId!: string;

  @IsOptional()
  @IsString()
  zbsConnectionId?: string;

  @IsOptional()
  @IsString()
  messageTemplateId?: string;

  @IsOptional()
  @IsObject()
  segmentConfig?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;

  @IsOptional()
  @IsString()
  timezone?: string;
}

export class UpdateZaloCampaignDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsEnum(MessagingCampaignKind)
  campaignType?: MessagingCampaignKind;

  @IsOptional()
  @IsString()
  channelConnectionId?: string;

  @IsOptional()
  @IsString()
  zbsConnectionId?: string | null;

  @IsOptional()
  @IsString()
  messageTemplateId?: string | null;

  @IsOptional()
  @IsObject()
  segmentConfig?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;

  @IsOptional()
  @IsString()
  timezone?: string;
}

export class ConnectZaloZbsDto {
  @IsString()
  appId!: string;

  @IsString()
  secretKey!: string;

  @IsString()
  accessToken!: string;

  @IsString()
  accountRef!: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  oaConnectionId?: string;
}

export class SyncZbsTemplatesDto {
  @IsString()
  connectionId!: string;
}

export class PreviewZaloAudienceDto {
  @IsOptional()
  @IsString()
  channelConnectionId?: string;

  @IsOptional()
  @IsEnum(MessagingCampaignKind)
  campaignType?: MessagingCampaignKind;

  @IsOptional()
  @IsObject()
  segmentConfig?: Record<string, unknown>;
}

export class PreviewZaloCampaignDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sampleIdentityIds?: string[];
}

export class ScheduleZaloCampaignDto {
  @IsString()
  scheduledAt!: string;
}

export class TestZaloZbsSendDto {
  @IsString()
  connectionId!: string;

  @IsString()
  templateId!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsObject()
  templateData?: Record<string, string>;
}

export class StartZaloOAuthDto {
  @IsOptional()
  @IsString()
  returnPath?: string;
}
