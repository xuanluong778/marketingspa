import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
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
  @IsString()
  @MinLength(1)
  cleanedTranscript!: string;
}

export class RetryVideoTranscriptionChunkDto {
  @Type(() => Number)
  @IsNumber()
  chunkIndex!: number;
}
