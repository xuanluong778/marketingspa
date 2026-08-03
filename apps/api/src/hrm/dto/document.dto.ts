import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { HrmDocumentType } from '@marketingspa/database';

export class CreateEmployeeDocumentDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsEnum(HrmDocumentType)
  type!: HrmDocumentType;

  @IsString()
  @MinLength(1)
  fileUrl!: string;

  @IsOptional()
  @IsString()
  fileKey?: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sizeBytes?: number;

  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UploadEmployeeDocumentMetaDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsEnum(HrmDocumentType)
  type!: HrmDocumentType;

  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
