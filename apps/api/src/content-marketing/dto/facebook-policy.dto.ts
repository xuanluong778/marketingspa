import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class FacebookPolicyAnalyzeMediaDto {
  @IsOptional()
  @IsString()
  caption?: string;
  @IsOptional()
  @IsString()
  mediaType?: string;
  @IsOptional()
  @IsString()
  transcript?: string;
}

export class FacebookPolicyCheckDto {
  @IsOptional()
  @IsString()
  imageOcrText?: string;
  @IsOptional()
  @IsString()
  landingPageText?: string;
  @IsOptional()
  @IsString()
  landingUrl?: string;
  @IsOptional()
  @IsString()
  transcript?: string;
}

export class FacebookPolicyImportUrlDto {
  @IsOptional()
  @IsString()
  fanpageId?: string;
  @IsOptional()
  @IsString()
  url?: string;
  @IsOptional()
  @IsString()
  urlKind?: string;
}

export class FacebookPolicyRewriteDto {
  @IsOptional()
  @IsString()
  contentToRewrite?: string;
  @IsOptional()
  @IsString()
  primaryText?: string;
}

