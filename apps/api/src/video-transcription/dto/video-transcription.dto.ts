import { IsBoolean, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { Type, Transform } from 'class-transformer';

function toBool(v: unknown): boolean | undefined {
  if (v === true || v === 'true' || v === '1' || v === 1) return true;
  if (v === false || v === 'false' || v === '0' || v === 0) return false;
  return undefined;
}

export class CreateVideoTranscriptionDto {
  @IsOptional()
  glossary?: string | string[];

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  ownershipConfirmed?: boolean;

  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  sourceTitle?: string;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  durationSeconds?: number;
}

export class ProbeVideoTranscriptionUrlDto {
  @IsString()
  @MinLength(8)
  url!: string;
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
