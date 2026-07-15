import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { AutoPostStatus, AutoPostType } from '@marketingspa/database';

export class GenerateAutoPostDto {
  @IsEnum(AutoPostType)
  postType!: AutoPostType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  topic!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  spaService?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  targetAudience?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  tone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  promotion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  linkUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  hashtags?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  cta?: string;
}

export class RewriteAutoPostDto {
  @IsEnum(['rewrite', 'shorten', 'stronger_cta'] as const)
  mode!: 'rewrite' | 'shorten' | 'stronger_cta';

  @IsString()
  @IsNotEmpty()
  caption!: string;

  @IsOptional()
  @IsString()
  cta?: string;
}

export class SaveAutoPostDraftDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsEnum(AutoPostType)
  postType!: AutoPostType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  topic!: string;

  @IsString()
  @IsNotEmpty()
  caption!: string;

  @IsOptional()
  @IsUUID()
  fanpageId?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  linkUrl?: string;

  @IsOptional()
  @IsString()
  hashtags?: string;

  @IsOptional()
  @IsString()
  cta?: string;

  @IsOptional()
  @IsString()
  spaService?: string;

  @IsOptional()
  @IsString()
  targetAudience?: string;

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsString()
  promotion?: string;
}

export class UpdateAutoPostDto extends SaveAutoPostDraftDto {
  @IsUUID()
  declare id: string;
}

export class PublishAutoPostDto {
  @IsUUID()
  postId!: string;
}

export class ScheduleAutoPostDto {
  @IsUUID()
  postId!: string;

  @IsDateString()
  scheduledAt!: string;
}

export class AutoPostListQueryDto {
  @IsOptional()
  @IsEnum(AutoPostStatus)
  status?: AutoPostStatus;
}

export class SelectAutoPostPageDto {
  @IsUUID()
  fanpageId!: string;
}
