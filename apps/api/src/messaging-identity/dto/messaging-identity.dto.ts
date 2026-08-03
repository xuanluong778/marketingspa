import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class LinkIdentityDto {
  @IsOptional()
  @IsString()
  customerId?: string;
  @IsOptional()
  @IsString()
  leadId?: string;
}

export class MergeIdentitiesDto {
  @IsOptional()
  @IsString()
  primaryIdentityId?: string;
  @IsOptional()
  @IsArray()
  secondaryIdentityIds?: any[];
}

export class MessagingIdentityQueryDto {
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
  consentStatus?: string;
  @IsOptional()
  @IsString()
  customerId?: string;
  @IsOptional()
  @IsString()
  followStatus?: string;
  @IsOptional()
  @IsString()
  funnelStageId?: string;
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
  @IsString()
  leadId?: string;
  @IsOptional()
  @IsString()
  linkedType?: string;
  @IsOptional()
  @IsString()
  pipelineStatus?: string;
  @IsOptional()
  @IsString()
  search?: string;
  @IsOptional()
  @IsString()
  tag?: string;
  @IsOptional()
  @IsString()
  templateId?: string;
}

export class UpsertMessagingIdentityDto {
  @IsOptional()
  @IsString()
  avatarUrl?: string;
  @IsOptional()
  @IsString()
  channel?: string;
  @IsOptional()
  @IsString()
  channelAccountRef?: string;
  @IsOptional()
  @IsString()
  chatbotConversationId?: string;
  @IsOptional()
  @IsString()
  consentStatus?: string;
  @IsOptional()
  @IsString()
  displayName?: string;
  @IsOptional()
  @IsString()
  externalConversationId?: string;
  @IsOptional()
  @IsString()
  externalUserId?: string;
  @IsOptional()
  @IsString()
  followStatus?: string;
  @IsOptional()
  @IsString()
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

