import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
  ADVANCED_ARTICLE_GOALS,
  ADVANCED_CTA_TYPES,
  ADVANCED_DEMOGRAPHICS,
  ADVANCED_SUGGEST_FIELDS,
  ADVANCED_WRITING_STYLES,
} from '../advanced-article-config';
import {
  BRAND_ARTICLE_GENRES,
  BRAND_PRONOUNS,
  BRAND_VOICE_INTENSITIES,
} from '../brand-post-config';

export const CONTENT_TONES = [
  'bold',
  'edgy',
  'friendly',
  'humorous',
  'educational',
  'philosophical',
  'realistic',
  'storytelling',
  'trending',
  'expert',
  'empathetic',
  'direct_sale',
] as const;

export const AD_CONTENT_TYPES = [
  'inbox',
  'lead',
  'sales',
  'remarketing',
  'promo',
  'case_study',
  'video_script',
  'hook_3s',
] as const;

export const AD_OBJECTIVES = [
  'messages',
  'engagement',
  'lead_form',
  'landing_conversion',
  'direct_sales',
  'remarketing',
  'brand_awareness',
] as const;

export const PLATFORMS = ['facebook', 'tiktok', 'zalo'] as const;

export const PERSONAL_POST_TYPES = [
  'knowledge_sharing',
  'humor',
  'philosophy',
  'touching',
  'motivational',
  'personal_story',
  'realistic_view',
  'personal_trend',
  'failure_lesson',
  'success_experience',
  'community_engagement',
] as const;

export const PERSONAL_TONES = [
  'approachable',
  'humorous',
  'playful',
  'deep',
  'philosophical',
  'touching',
  'inspiring',
  'bold',
  'realistic',
  'everyday',
  'positive',
  'sincere',
  'mild_edgy',
  'storytelling',
  'bold_may_tao',
] as const;

export const PERSONAL_POST_GOALS = [
  'engagement',
  'knowledge',
  'inspiration',
  'humor',
  'touching_story',
  'personal_view',
  'trend',
  'personal_branding',
] as const;

export const POST_LENGTHS = ['short', 'medium', 'long'] as const;

export const PERSONAL_REWRITE_MODES = [
  'funnier',
  'deeper',
  'more_emotional',
  'more_motivational',
  'shorter',
  'longer',
  'hooks_5',
  'openers_5',
  'ab_3',
] as const;

export const REWRITE_MODES = [
  'stronger',
  'safer',
  'shorter',
  'longer',
  'funnier',
  'hooks_5',
  'cta_5',
  'ab_3',
] as const;

export class GenerateContentDto {
  @IsIn(['ad', 'personal'])
  mode!: 'ad' | 'personal';

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  productService!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  targetAudience?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  painPoints?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  benefits?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  offer?: string;

  @IsOptional()
  @IsIn(AD_OBJECTIVES)
  adObjective?: (typeof AD_OBJECTIVES)[number];

  @IsOptional()
  @IsIn(PLATFORMS)
  platform?: (typeof PLATFORMS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  cta?: string;

  @IsOptional()
  @IsIn(CONTENT_TONES)
  tone?: (typeof CONTENT_TONES)[number];

  @IsOptional()
  @IsIn(AD_CONTENT_TYPES)
  adContentType?: (typeof AD_CONTENT_TYPES)[number];

  @IsOptional()
  @IsIn(PERSONAL_POST_TYPES)
  personalPostType?: (typeof PERSONAL_POST_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  videoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  transcript?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  postTopic?: string;

  @IsOptional()
  @IsIn(PERSONAL_POST_GOALS)
  postGoal?: (typeof PERSONAL_POST_GOALS)[number];

  @IsOptional()
  @IsIn(PERSONAL_TONES)
  personalTone?: (typeof PERSONAL_TONES)[number];

  @IsOptional()
  @IsIn(POST_LENGTHS)
  postLength?: (typeof POST_LENGTHS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  personalAngle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  storyIdea?: string;

  @IsOptional()
  @IsIn(BRAND_ARTICLE_GENRES)
  brandArticleGenre?: (typeof BRAND_ARTICLE_GENRES)[number];

  @IsOptional()
  @IsIn(BRAND_PRONOUNS)
  brandPronoun?: (typeof BRAND_PRONOUNS)[number];

  @IsOptional()
  @IsIn(BRAND_VOICE_INTENSITIES)
  brandVoiceIntensity?: (typeof BRAND_VOICE_INTENSITIES)[number];
}

export class AnalyzeVideoDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  videoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  transcript?: string;
}

export class CheckPolicyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  content!: string;

  @IsOptional()
  @IsIn(PLATFORMS)
  platform?: (typeof PLATFORMS)[number];
}

export class ScoreContentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  content!: string;

  @IsOptional()
  @IsIn(PLATFORMS)
  platform?: (typeof PLATFORMS)[number];

  @IsOptional()
  @IsIn(['ad', 'personal'])
  mode?: 'ad' | 'personal';

  @IsOptional()
  @IsIn(AD_OBJECTIVES)
  adObjective?: (typeof AD_OBJECTIVES)[number];
}

export class RewriteContentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  content!: string;

  @IsString()
  mode!: string;

  @IsOptional()
  @IsIn(['ad', 'personal'])
  studioMode?: 'ad' | 'personal';

  @IsOptional()
  @IsIn(PLATFORMS)
  platform?: (typeof PLATFORMS)[number];

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsIn(PERSONAL_TONES)
  personalTone?: (typeof PERSONAL_TONES)[number];
}

export class GenerateAdvancedArticleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  productService!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  price?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  combo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  gift?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  offerDeadline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  salesArea?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  certification?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  caseStudy?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  painPoints!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  desires?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  differentiator?: string;

  @IsIn(ADVANCED_CTA_TYPES)
  ctaType!: (typeof ADVANCED_CTA_TYPES)[number];

  @IsIn(ADVANCED_WRITING_STYLES)
  writingStyle!: (typeof ADVANCED_WRITING_STYLES)[number];

  @IsIn(ADVANCED_DEMOGRAPHICS)
  demographic!: (typeof ADVANCED_DEMOGRAPHICS)[number];

  @IsIn(ADVANCED_ARTICLE_GOALS)
  articleGoal!: (typeof ADVANCED_ARTICLE_GOALS)[number];

  @IsIn(POST_LENGTHS)
  postLength!: (typeof POST_LENGTHS)[number];
}

export class OptimizeAdvancedCtaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(15000)
  finalArticle!: string;

  @IsIn(ADVANCED_CTA_TYPES)
  ctaType!: (typeof ADVANCED_CTA_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  productService?: string;

  @IsOptional()
  @IsIn(ADVANCED_ARTICLE_GOALS)
  articleGoal?: (typeof ADVANCED_ARTICLE_GOALS)[number];
}

export class GenerateAdvancedTitlesDto {
  @IsString()
  @MinLength(1)
  @MaxLength(15000)
  finalArticle!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  productService?: string;

  @IsOptional()
  @IsIn(ADVANCED_DEMOGRAPHICS)
  demographic?: (typeof ADVANCED_DEMOGRAPHICS)[number];
}

export class RewriteAdvancedArticleDto extends GenerateAdvancedArticleDto {
  @IsOptional()
  @IsString()
  @MaxLength(15000)
  previousArticle?: string;
}

export class SuggestAdInsightsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  productService!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  targetAudience?: string;

  @IsOptional()
  @IsIn(PLATFORMS)
  platform?: (typeof PLATFORMS)[number];

  @IsOptional()
  @IsIn(AD_OBJECTIVES)
  adObjective?: (typeof AD_OBJECTIVES)[number];
}

export class SuggestAdCtaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  productService!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  targetAudience?: string;

  @IsOptional()
  @IsIn(PLATFORMS)
  platform?: (typeof PLATFORMS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  offer?: string;

  @IsOptional()
  @IsIn(AD_OBJECTIVES)
  adObjective?: (typeof AD_OBJECTIVES)[number];

  @IsOptional()
  @IsIn(AD_CONTENT_TYPES)
  adContentType?: (typeof AD_CONTENT_TYPES)[number];
}

export class SuggestPersonalIdeasDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  postTopic!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  targetAudience?: string;

  @IsOptional()
  @IsIn(PERSONAL_POST_GOALS)
  postGoal?: (typeof PERSONAL_POST_GOALS)[number];

  @IsOptional()
  @IsIn(PERSONAL_POST_TYPES)
  personalPostType?: (typeof PERSONAL_POST_TYPES)[number];

  @IsOptional()
  @IsIn(PERSONAL_TONES)
  personalTone?: (typeof PERSONAL_TONES)[number];
}

export class SuggestAdvancedFieldDto {
  @IsIn(ADVANCED_SUGGEST_FIELDS)
  field!: (typeof ADVANCED_SUGGEST_FIELDS)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  productService!: string;

  @IsOptional()
  @IsIn(ADVANCED_DEMOGRAPHICS)
  demographic?: (typeof ADVANCED_DEMOGRAPHICS)[number];

  @IsOptional()
  @IsIn(ADVANCED_ARTICLE_GOALS)
  articleGoal?: (typeof ADVANCED_ARTICLE_GOALS)[number];

  @IsOptional()
  @IsIn(ADVANCED_WRITING_STYLES)
  writingStyle?: (typeof ADVANCED_WRITING_STYLES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  painPoints?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  currentValue?: string;
}
