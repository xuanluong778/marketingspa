import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateMessagingOrgPolicyDto {
  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  quietHoursStart?: string | null;

  @IsOptional()
  @IsString()
  quietHoursEnd?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  maxMessagesPerRecipientPerDay?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  campaignCooldownMinutes?: number;

  @IsOptional()
  @IsObject()
  channelRateLimits?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  excludeRecentlyManualMessaged?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  manualMessageLookbackMinutes?: number;

  @IsOptional()
  @IsBoolean()
  stopOnReply?: boolean;

  @IsOptional()
  @IsBoolean()
  stopOnOptOut?: boolean;

  @IsOptional()
  @IsBoolean()
  createTaskOnReply?: boolean;

  @IsOptional()
  @IsBoolean()
  assignEmployeeOnReply?: boolean;

  @IsOptional()
  @IsBoolean()
  handoverToChatbotOnReply?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  optOutKeywords?: string[];
}
