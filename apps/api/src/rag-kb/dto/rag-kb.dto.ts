import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRagKbDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  /** Project/Bot sở hữu KB — chống lẫn brand trong cùng org */
  @IsOptional()
  @IsString()
  botId?: string;
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
  @IsOptional()
  @IsString()
  botId?: string | null;
}

export class ImportRagKbTextDto {
  @IsString()
  @MinLength(1)
  content!: string;

  @IsString()
  @MinLength(1)
  title!: string;
}

export class ImportRagKbUrlDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsString()
  @MinLength(1)
  url!: string;
}

export class RagKbSearchDto {
  @IsOptional()
  @IsString()
  knowledgeBaseId?: string;

  @IsString()
  @MinLength(1)
  query!: string;
}
