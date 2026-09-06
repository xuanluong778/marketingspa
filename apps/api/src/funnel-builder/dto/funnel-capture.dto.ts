import { Allow, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class SubmitFunnelPublicLeadDto {
  @Allow()
  @IsObject()
  answers!: Record<string, string | boolean | string[] | number | null>;

  @IsOptional()
  @Allow()
  @IsObject()
  attribution?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  formId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  landingPage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  referrer?: string;
}

export class BindFunnelChatbotDto {
  @IsOptional()
  @IsUUID()
  botId?: string;
}
