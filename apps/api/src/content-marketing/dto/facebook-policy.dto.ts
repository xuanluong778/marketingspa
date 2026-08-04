import { IsInt, IsIn, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

const SPECIAL_AD_CATEGORIES = [
  'NONE',
  'CREDIT',
  'EMPLOYMENT',
  'HOUSING',
  'SOCIAL_ISSUES_ELECTIONS_POLITICS',
] as const;

const URL_KINDS = [
  'website',
  'facebook_post',
  'facebook_video',
  'facebook_reel',
  'landing_page',
  'unknown',
] as const;

export class FacebookPolicyCheckDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  headline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  primaryText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  cta?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  productService?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  audience?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  country?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(13)
  @Max(65)
  ageMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(13)
  @Max(65)
  ageMax?: number;

  @IsOptional()
  @IsIn([...SPECIAL_AD_CATEGORIES])
  specialAdCategory?: (typeof SPECIAL_AD_CATEGORIES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  brandName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  contentToRewrite?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  imageOcrText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50000)
  transcript?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30000)
  landingPageText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  landingUrl?: string;

  /** Ignored — organizationId comes from JWT/TenantGuard only. */
  @IsOptional()
  @IsString()
  organizationId?: string;
}

export class FacebookPolicyRewriteDto extends FacebookPolicyCheckDto {}

export class FacebookPolicyImportUrlDto {
  @IsString()
  @MinLength(8)
  @MaxLength(2000)
  url!: string;

  @IsOptional()
  @IsIn([...URL_KINDS])
  urlKind?: (typeof URL_KINDS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  fanpageId?: string;
}

export class FacebookPolicyAnalyzeMediaDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  caption?: string;

  @IsOptional()
  @IsIn(['image', 'video', 'transcript'])
  mediaType?: 'image' | 'video' | 'transcript';

  @IsOptional()
  @IsString()
  @MaxLength(50000)
  transcript?: string;
}
