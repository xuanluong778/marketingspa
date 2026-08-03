import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRagKbDto {
  @IsOptional()
  @IsString()
  description?: string;
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
  @IsOptional()
  @IsString()
  name?: string;
}

export class UpdateRagKbDto {
  @IsOptional()
  @IsString()
  description?: string;
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
  @IsOptional()
  @IsString()
  name?: string;
}

export class ImportRagKbTextDto {
  @IsOptional()
  @IsString()
  content?: string;
  @IsOptional()
  @IsString()
  title?: string;
}

export class ImportRagKbUrlDto {
  @IsOptional()
  @IsString()
  title?: string;
  @IsOptional()
  @IsString()
  url?: string;
}

export class RagKbSearchDto {
  @IsOptional()
  @IsString()
  knowledgeBaseId?: string;
  @IsOptional()
  @IsString()
  query?: string;
}

