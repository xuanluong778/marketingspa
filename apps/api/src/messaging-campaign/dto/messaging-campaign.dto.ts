import { Type } from 'class-transformer';
import {
  IsBoolean,
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
import {
  MessageChannel,
  MessagingCampaignKind,
  MessagingCampaignStatus,
} from '@marketingspa/database';

export class CreateMessagingCampaignDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsEnum(MessageChannel)
  channel!: MessageChannel;

  @IsEnum(MessagingCampaignKind)
  campaignType!: MessagingCampaignKind;

  @IsOptional()
  @IsString()
  channelConnectionId?: string;

  @IsOptional()
  @IsString()
  integrationId?: string;

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

export class UpdateMessagingCampaignDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsEnum(MessageChannel)
  channel?: MessageChannel;

  @IsOptional()
  @IsEnum(MessagingCampaignKind)
  campaignType?: MessagingCampaignKind;

  @IsOptional()
  @IsString()
  channelConnectionId?: string | null;

  @IsOptional()
  @IsString()
  integrationId?: string | null;

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

export class MessagingCampaignQueryDto {
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
  @IsEnum(MessageChannel)
  channel?: MessageChannel;

  @IsOptional()
  @IsString()
  search?: string;
}

export class PreviewEligibilityDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  limit?: number;

  @IsOptional()
  @IsString({ each: true })
  identityIds?: string[];
}

export class ScheduleMessagingCampaignDto {
  @IsString()
  scheduledAt!: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}

export class TestSendMessagingCampaignDto {
  @IsOptional()
  @IsString()
  identityId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  leadId?: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, string>;
}
