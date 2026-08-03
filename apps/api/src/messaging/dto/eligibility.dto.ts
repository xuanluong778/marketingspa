import { IsEnum, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { MessageChannel } from '@marketingspa/database';
import type { MessagingCampaignType, MessagingProviderMode } from '@marketingspa/shared';

export class CheckMessagingEligibilityDto {
  @IsOptional()
  @IsString()
  accountRef?: string;

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
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  externalUserId?: string;

  @IsOptional()
  @IsUUID()
  flowId?: string;

  @IsOptional()
  @IsUUID()
  identityId?: string;

  @IsOptional()
  @IsUUID()
  leadId?: string;

  @IsOptional()
  @IsIn(['MESSENGER_STANDARD', 'MESSENGER_UTILITY', 'ZALO_OA_CONSULT', 'ZALO_OA_BROADCAST', 'ZBS_TEMPLATE'])
  providerModeHint?: MessagingProviderMode;

  @IsOptional()
  @IsUUID()
  templateId?: string;
}
