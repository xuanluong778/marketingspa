import {
  IsOptional,
  IsString,
  IsEnum,
  IsUUID,
  IsBoolean,
  IsObject,
  IsInt,
  Min,
  MinLength,
  IsArray,
} from 'class-validator';
import { MessageChannel, AutomationTriggerType } from '@marketingspa/database';
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
}

export class CreateAutomationFlowDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(AutomationTriggerType)
  triggerType!: AutomationTriggerType;

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

export class TemplateQueryDto extends PaginationDto {}

export class LogQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(MessageChannel)
  channel?: MessageChannel;
}
