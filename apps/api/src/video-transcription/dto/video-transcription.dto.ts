import { IsBoolean, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { Type, Transform } from 'class-transformer';

/**
 * Strict form-data boolean.
 * NOTE: With ValidationPipe.enableImplicitConversion, Boolean("false") becomes true.
 * Always coerce via this helper — never rely on design:type Boolean alone.
 */
export function parseStrictBool(v: unknown, defaultValue = false): boolean {
  if (v === true || v === 1 || v === '1') return true;
  if (v === false || v === 0 || v === '0') return false;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === 'yes' || s === 'on') return true;
    if (s === 'false' || s === 'no' || s === 'off' || s === '') return false;
  }
  return defaultValue;
}

export class CreateVideoTranscriptionDto {
  @IsOptional()
  glossary?: string | string[];

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @Transform(({ value }) => parseStrictBool(value, false))
  @IsBoolean()
  ownershipConfirmed?: boolean;

  /**
   * Lưu video tạm để tải xuống (YouTube/Facebook/TikTok).
   * Mặc định false — chỉ tải audio-only cho STT.
   * Form-data must send "true" | "false" (string).
   */
  @IsOptional()
  @Transform(({ value }) => parseStrictBool(value, false))
  @IsBoolean()
  keepVideo?: boolean;

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
