import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateVideoTranscriptionDto {
  @IsOptional()
  @IsArray()
  glossary?: any[];
  @IsOptional()
  @IsString()
  language?: string;
  @IsOptional()
  @IsBoolean()
  ownershipConfirmed?: boolean;
  @IsOptional()
  @IsString()
  sourceUrl?: string;
}

export class PatchVideoTranscriptionTextDto {
  @IsOptional()
  @IsString()
  cleanedTranscript?: string;
}

export class RetryVideoTranscriptionChunkDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  chunkIndex?: number;
}

