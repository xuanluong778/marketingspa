import {
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { MessageChannel } from '@marketingspa/database';

export class CreateCampaignDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(MessageChannel)
  channel!: MessageChannel;

  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  @IsArray()
  @IsUUID('4', { each: true })
  contactIds!: string[];
}
