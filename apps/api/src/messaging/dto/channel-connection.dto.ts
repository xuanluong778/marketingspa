import { IsBoolean, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ConnectMessengerChannelDto {
  @IsString()
  @MinLength(1)
  pageId!: string;

  @IsString()
  @MinLength(10)
  pageAccessToken!: string;

  @IsOptional()
  @IsString()
  pageName?: string;

  @IsOptional()
  @IsBoolean()
  subscribeWebhook?: boolean;
}

export class ConnectZaloChannelDto {
  @IsString()
  @MinLength(1)
  oaId!: string;

  @IsString()
  @MinLength(10)
  accessToken!: string;

  @IsOptional()
  @IsString()
  oaName?: string;

  @IsOptional()
  @IsString()
  webhookSecret?: string;
}

export class ConnectZbsChannelDto {
  @IsString()
  appId!: string;

  @IsString()
  secretKey!: string;

  @IsString()
  accessToken!: string;

  @IsString()
  accountRef!: string;

  @IsOptional()
  @IsString()
  displayName?: string;
}

export class PauseChannelDto {
  @IsOptional()
  @IsBoolean()
  isPaused?: boolean;
}

export class ReconnectChannelDto {
  @IsObject()
  credentials!: Record<string, string>;
}
