import { IsOptional, IsString, IsUrl, MinLength, ValidateIf } from 'class-validator';

export class CreateZaloConnectionDto {
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

  @IsOptional()
  @IsString()
  refreshToken?: string;

  @IsOptional()
  @IsString()
  accessTokenExpiresAt?: string;

  @IsOptional()
  @IsString()
  refreshTokenExpiresAt?: string;
}

export class SendZaloMessageDto {
  @IsString()
  @MinLength(1)
  userId!: string;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  imageUrl?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  fileUrl?: string;

  @ValidateIf((o: SendZaloMessageDto) => !o.text && !o.imageUrl && !o.fileUrl)
  @IsString({ message: 'Cần text, imageUrl hoặc fileUrl' })
  _content?: string;
}
