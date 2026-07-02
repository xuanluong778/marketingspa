import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  ChatbotBotStatus,
  ChatbotChannelType,
  ChatbotSourceType,
} from '@marketingspa/database';

export class CreateChatbotBotDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  botName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  websiteUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  businessName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  hotline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  mainServices?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  consultationTone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  greeting?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  allowedDomains?: string;

  @IsOptional()
  @IsEnum(ChatbotBotStatus)
  status?: ChatbotBotStatus;
}

export class UpdateChatbotBotDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  botName?: string;

  @IsOptional()
  @IsString()
  websiteUrl?: string;

  @IsOptional()
  @IsString()
  businessName?: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsString()
  hotline?: string;

  @IsOptional()
  @IsString()
  mainServices?: string;

  @IsOptional()
  @IsString()
  consultationTone?: string;

  @IsOptional()
  @IsString()
  greeting?: string;

  @IsOptional()
  @IsString()
  allowedDomains?: string;

  @IsOptional()
  @IsEnum(ChatbotBotStatus)
  status?: ChatbotBotStatus;
}

export class CreateKnowledgeSourceDto {
  @IsUUID()
  botId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @IsEnum(ChatbotSourceType)
  sourceType!: ChatbotSourceType;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;
}

export class CreateChannelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsEnum(ChatbotChannelType)
  channelType!: ChatbotChannelType;

  @IsOptional()
  @IsUUID()
  botId?: string;
}

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  model?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  temperature?: number;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsOptional()
  @IsString()
  greeting?: string;

  @IsOptional()
  @IsString()
  fallbackReply?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyLimit?: number;
}

export class PublicMessageDto {
  @IsUUID()
  botId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sessionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pageUrl?: string;
}

export class PublicLeadDto {
  @IsUUID()
  botId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sessionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsString()
  @MinLength(6)
  @MaxLength(32)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  need?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pageUrl?: string;
}

export class ConnectFacebookPageDto {
  @IsUUID()
  botId!: string;

  @IsString()
  pageId!: string;

  @IsString()
  pageName!: string;

  @IsString()
  pageAccessToken!: string;

  @IsOptional()
  @IsBoolean()
  aiEnabled?: boolean;
}
