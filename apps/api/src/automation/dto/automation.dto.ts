import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import {
  MessageChannel,
  AutomationTriggerType,
  MessageTemplateApprovalStatus,
  MessagingCampaignKind,
} from '@marketingspa/database';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateMessageTemplateDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(MessageChannel)
  channel!: MessageChannel;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(MessageTemplateApprovalStatus)
  approvalStatus?: MessageTemplateApprovalStatus;
  @IsOptional()
  @IsEnum(MessagingCampaignKind)
  campaignKind?: MessagingCampaignKind;
  @IsOptional()
  @IsArray()
  contentBlocks?: any[];
  @IsOptional()
  @IsString()
  ctaLabel?: string;
  @IsOptional()
  @IsString()
  ctaUrl?: string;
  @IsOptional()
  @IsString()
  mediaUrl?: string;
  @IsOptional()
  @IsString()
  providerMode?: string;
  @IsOptional()
  @IsString()
  providerTemplateId?: string;
  @IsOptional()
  variableFallbacks?: Record<string, unknown>;
}

export class UpdateMessageTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(MessageChannel)
  channel?: MessageChannel;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  contentBlocks?: any[];
  @IsOptional()
  variableFallbacks?: Record<string, unknown>;
}

export class CreateAutomationFlowDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(AutomationTriggerType)
  triggerType!: AutomationTriggerType;

  /** FunnelRecommendation.id — bắt buộc cho flow mới (Prompt 9) */
  @IsOptional()
  @IsUUID()
  funnelId?: string;

  @IsOptional()
  @IsUUID()
  messageTemplateId?: string;

  @IsOptional()
  @IsEnum(MessageChannel)
  channel?: MessageChannel;

  @IsOptional()
  @IsInt()
  @Min(0)
  delayMinutes?: number;

  @IsOptional()
  @IsObject()
  triggerConfig?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  actions?: any[];
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  cooldownMinutes?: number;
  @IsOptional()
  @IsBoolean()
  isPaused?: boolean;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxSendsPerDay?: number;
  @IsOptional()
  @IsString()
  quietHoursEnd?: string;
  @IsOptional()
  @IsString()
  quietHoursStart?: string;
}

export class UpdateAutomationFlowDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(AutomationTriggerType)
  triggerType?: AutomationTriggerType;

  @IsOptional()
  @IsUUID()
  funnelId?: string;

  @IsOptional()
  @IsUUID()
  messageTemplateId?: string;

  @IsOptional()
  @IsEnum(MessageChannel)
  channel?: MessageChannel;

  @IsOptional()
  @IsInt()
  @Min(0)
  delayMinutes?: number;

  @IsOptional()
  @IsObject()
  triggerConfig?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  actions?: any[];
}

export class SimulateAutomationDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  leadId?: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, string>;
}

export class TemplateQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(MessageChannel)
  channel?: MessageChannel;
}

export class PreviewMessageTemplateDto {
  @IsOptional()
  @IsObject()
  context?: Record<string, string>;
}

export class LogQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(MessageChannel)
  channel?: MessageChannel;
}
