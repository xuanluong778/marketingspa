import { ArrayNotEmpty, IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
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

  @IsOptional()
  @IsString()
  customIndustry?: string;
  @IsOptional()
  @IsString()
  industryId?: string;
  @IsOptional()
  @IsString()
  industryName?: string;
}

export class UpdateAutoPostDto extends SaveAutoPostDraftDto {
  @IsUUID()
  declare id: string;
}

export class PublishAutoPostDto {
  @IsUUID()
  postId!: string;

  @IsOptional()
  @IsArray()
  fanpageIds?: any[];
}

export class ScheduleAutoPostDto {
  @IsUUID()
  postId!: string;

  @IsDateString()
  scheduledAt!: string;

  @IsOptional()
  @IsArray()
  fanpageIds?: any[];
}

export class AutoPostListQueryDto {
  @IsOptional()
  @IsEnum(AutoPostStatus)
  status?: AutoPostStatus;

  @IsOptional()
  @IsString()
  customIndustry?: string;
  @IsOptional()
  @IsString()
  industryId?: string;
}

export class SelectAutoPostPageDto {
  @IsUUID()
  fanpageId!: string;
}

/** Chọn Fanpage sau OAuth — chỉ lưu Page user chủ động chọn (Facebook Page ID). */
export class SelectOAuthPagesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  pageIds!: string[];

  /** Legacy: chọn 1 page */
  @IsOptional()
  @IsString()
  pageId?: string;
}
