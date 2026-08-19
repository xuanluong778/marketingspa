import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  EmailAutomationAction,
  EmailAutomationStatus,
  EmailAutomationTrigger,
  EmailCampaignStatus,
  EmailContactStatus,
  EmailSuppressionReason,
} from '@marketingspa/database';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class EmailSearchQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;
}

export class AudiencePreviewQueryDto {
  @IsOptional()
  @IsUUID()
  listId?: string;
}

export class CampaignQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(EmailCampaignStatus)
  status?: EmailCampaignStatus;
}

export const CAMPAIGN_RECIPIENT_METRICS = [
  'sent',
  'delivered',
  'opened',
  'clicked',
  'bounced',
  'unsubscribed',
] as const;

export type CampaignRecipientMetric = (typeof CAMPAIGN_RECIPIENT_METRICS)[number];

export class CampaignRecipientQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(CAMPAIGN_RECIPIENT_METRICS)
  metric?: CampaignRecipientMetric;
}

export class ContactQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(EmailContactStatus)
  status?: EmailContactStatus;

  @IsOptional()
  @IsUUID()
  listId?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  crmStage?: string;
}

export class CreateEmailTemplateDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  subject!: string;

  @IsOptional()
  @IsString()
  previewText?: string;

  @IsString()
  @MinLength(1)
  htmlBody!: string;

  @IsOptional()
  @IsString()
  textBody?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateEmailTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  previewText?: string;

  @IsOptional()
  @IsString()
  htmlBody?: string;

  @IsOptional()
  @IsString()
  textBody?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateEmailContactDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  crmStage?: string;

  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  listId?: string;
}

export class UpdateEmailContactDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  crmStage?: string;

  @IsOptional()
  @IsEnum(EmailContactStatus)
  status?: EmailContactStatus;

  @IsOptional()
  @IsUUID()
  listId?: string;

  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;
}

export class CreateEmailListDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class AddListMemberDto {
  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class CreateEmailSegmentDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsObject()
  rules?: Record<string, unknown>;
}

export class CreateEmailCampaignDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @IsUUID()
  listId?: string;

  @IsOptional()
  @IsUUID()
  segmentId?: string;

  @IsOptional()
  @IsUUID()
  senderDomainId?: string;
}

export class UpdateEmailCampaignDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @IsUUID()
  listId?: string;

  @IsOptional()
  @IsUUID()
  segmentId?: string;

  @IsOptional()
  @IsUUID()
  senderDomainId?: string;
}

export class ScheduleEmailCampaignDto {
  @IsDateString()
  scheduledAt!: string;
}

export class CreateEmailSuppressionDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsEnum(EmailSuppressionReason)
  reason?: EmailSuppressionReason;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateSenderDomainDto {
  @IsString()
  @MinLength(1)
  domain!: string;

  @IsString()
  @MinLength(1)
  fromName!: string;

  @IsEmail()
  fromEmail!: string;

  @IsOptional()
  @IsEmail()
  replyTo?: string;
}

export class UpdateSenderDomainDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  fromName?: string;

  @IsOptional()
  @IsEmail()
  fromEmail?: string;

  @IsOptional()
  @IsEmail()
  replyTo?: string | null;
}

export class CreateEmailAutomationDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(EmailAutomationTrigger)
  trigger!: EmailAutomationTrigger;

  @IsOptional()
  @IsEnum(EmailAutomationStatus)
  status?: EmailAutomationStatus;

  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @IsUUID()
  listId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  delayMinutes?: number;

  @IsOptional()
  @IsString()
  recipeId?: string;

  @IsOptional()
  @IsEnum(EmailAutomationAction)
  action?: EmailAutomationAction;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  scoreDelta?: number;

  @IsOptional()
  @IsString()
  targetStage?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  waitDays?: number;
}

export class UpdateEmailAutomationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(EmailAutomationTrigger)
  trigger?: EmailAutomationTrigger;

  @IsOptional()
  @IsEnum(EmailAutomationStatus)
  status?: EmailAutomationStatus;

  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @IsUUID()
  listId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  delayMinutes?: number;

  @IsOptional()
  @IsEnum(EmailAutomationAction)
  action?: EmailAutomationAction;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  scoreDelta?: number;

  @IsOptional()
  @IsString()
  targetStage?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  waitDays?: number;
}

export class CreateEmailAutomationFromRecipeDto {
  @IsString()
  @MinLength(1)
  recipeId!: string;

  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @IsUUID()
  listId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  waitDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  scoreDelta?: number;

  @IsOptional()
  @IsString()
  targetStage?: string;

  @IsOptional()
  @IsBoolean()
  activate?: boolean;
}

export class GenerateEmailContentDto {
  @IsString()
  @MinLength(3)
  @MaxLength(800)
  prompt!: string;
}

export class SendTestEmailDto {
  @IsEmail()
  to!: string;

  @IsString()
  @MinLength(1)
  subject!: string;

  @IsString()
  @MinLength(1)
  htmlBody!: string;

  @IsOptional()
  @IsString()
  previewText?: string;
}
