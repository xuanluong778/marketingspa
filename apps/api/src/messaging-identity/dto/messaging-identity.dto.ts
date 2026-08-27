import { IsArray, IsBoolean, IsEnum, IsIn, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import {
  LeadPipelineStatus,
  MessageChannel,
  MessagingConsentStatus,
  MessagingFollowStatus,
} from '@marketingspa/database';
import type { MessagingCampaignType } from '@marketingspa/shared';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class LinkIdentityDto {
  @IsOptional()
  @IsString()
  customerId?: string;
  @IsOptional()
  @IsString()
  leadId?: string;
}

export class MergeIdentitiesDto {
  @IsUUID()
  primaryIdentityId!: string;

  @IsArray()
  @IsUUID('4', { each: true })
  secondaryIdentityIds!: string[];
}

export class MessagingIdentityQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn(['automation', 'broadcast', 'transactional', 'template'])
  campaignType?: MessagingCampaignType;

  @IsOptional()
  @IsEnum(MessageChannel)
  channel?: MessageChannel;

  @IsOptional()
  @IsUUID()
  connectionId?: string;

  @IsOptional()
  @IsEnum(MessagingConsentStatus)
  consentStatus?: MessagingConsentStatus;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsEnum(MessagingFollowStatus)
  followStatus?: MessagingFollowStatus;

  @IsOptional()
  @IsUUID()
  stageId?: string;

  @IsOptional()
  @IsBoolean()
  hasAppointment?: boolean;

  @IsOptional()
  @IsBoolean()
  hasOrder?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  inactiveDays?: number;

  @IsOptional()
  @IsBoolean()
  includeMerged?: boolean;

  @IsOptional()
  @IsString()
  integrationScopeKey?: string;

  @IsOptional()
  @IsString()
  lastInboundFrom?: string;

  @IsOptional()
  @IsString()
  lastInboundTo?: string;

  @IsOptional()
  @IsUUID()
  leadId?: string;

  @IsOptional()
  @IsIn(['customer', 'lead', 'unlinked'])
  linkedType?: 'customer' | 'lead' | 'unlinked';

  @IsOptional()
  @IsEnum(LeadPipelineStatus)
  pipelineStatus?: LeadPipelineStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsUUID()
  templateId?: string;
}

export class UpsertMessagingIdentityDto {
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsEnum(MessageChannel)
  channel!: MessageChannel;

  @IsOptional()
  @IsString()
  channelAccountRef?: string;

  @IsOptional()
  @IsUUID()
  chatbotConversationId?: string;

  @IsOptional()
  @IsEnum(MessagingConsentStatus)
  consentStatus?: MessagingConsentStatus;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  externalConversationId?: string;

  @IsString()
  externalUserId!: string;

  @IsOptional()
  @IsEnum(MessagingFollowStatus)
  followStatus?: MessagingFollowStatus;

  @IsOptional()
  @IsUUID()
  integrationId?: string;

  @IsOptional()
  @IsBoolean()
  isBlocked?: boolean;

  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  optedOut?: boolean;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  phoneVerified?: boolean;
}
