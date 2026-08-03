import { IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
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

export const PERSONAL_CREATION_MODES = ['topic', 'opinion'] as const;

export const OPINION_STANCES = [
  'agree',
  'disagree',
  'neutral',
  'multi',
  'custom',
] as const;

export const OPINION_ANGLES = [
  'life',
  'ethics',
  'community',
  'business',
  'celebrity',
  'personal_lesson',
] as const;

export const OPINION_PRONOUNS = [
  'toi_cac_ban',
  'minh_moi_nguoi',
  'anh_em',
  'co_chu_anh_chi',
] as const;

export const OPINION_INTENSITIES = [
  'gentle',
  'deep',
  'frank',
  'emotional',
  'motivational',
  'strong',
] as const;

export const OPINION_LENGTHS = ['1min', '3min', '5min', 'facebook'] as const;

export const PERSONAL_TITLE_COUNTS = [5, 10, 20] as const;

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

  /** topic = chủ đề thương hiệu; opinion = góc nhìn & chính kiến */
  @IsOptional()
  @IsIn(PERSONAL_CREATION_MODES)
  creationMode?: (typeof PERSONAL_CREATION_MODES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  topicGroupId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  topicGroupLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  industryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  industryName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  customIndustry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  opinionSourceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  opinionSourceText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  opinionSummary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  opinionDebateIssue?: string;

  @IsOptional()
  @IsIn(OPINION_STANCES)
  opinionStance?: (typeof OPINION_STANCES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  opinionStanceCustom?: string;

  @IsOptional()
  @IsIn(OPINION_ANGLES)
  opinionAngle?: (typeof OPINION_ANGLES)[number];

  @IsOptional()
  @IsIn(OPINION_PRONOUNS)
  opinionPronoun?: (typeof OPINION_PRONOUNS)[number];

  @IsOptional()
  @IsIn(OPINION_INTENSITIES)
  opinionIntensity?: (typeof OPINION_INTENSITIES)[number];

  @IsOptional()
  @IsIn(OPINION_LENGTHS)
  opinionLength?: (typeof OPINION_LENGTHS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  opinionThesis?: string;
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
  @MaxLength(120)
  topicGroupId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  topicGroupLabel?: string;

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

export class SuggestPersonalTitlesDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  topicGroupId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  topicGroupLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  subtopicId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  subtopicLabel!: string;

  @IsIn(PERSONAL_TITLE_COUNTS)
  count!: (typeof PERSONAL_TITLE_COUNTS)[number];

  @IsOptional()
  @IsIn(PERSONAL_TONES)
  tone?: (typeof PERSONAL_TONES)[number];

  @IsOptional()
  @IsIn(BRAND_PRONOUNS)
  pronoun?: (typeof BRAND_PRONOUNS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  audience?: string;

  @IsOptional()
  @IsIn(PERSONAL_POST_GOALS)
  goal?: (typeof PERSONAL_POST_GOALS)[number];
}

export class AnalyzeOpinionStoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  sourceText?: string;
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

export class IndustrySuggestionsDto {
  @IsOptional()
  @IsString()
  industryId?: string;
  @IsOptional()
  @IsString()
  industryName?: string;
  @IsOptional()
  @IsString()
  customIndustry?: string;
  @IsOptional()
  @IsString()
  q?: string;
}

export class OpinionAnalyzeDto {
  @IsOptional()
  @IsString()
  story?: string;
  @IsOptional()
  @IsString()
  transcript?: string;
  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  fanpageId?: string;
  @IsOptional()
  @IsString()
  sourceText?: string;
  @IsOptional()
  @IsString()
  sourceUrl?: string;
  @IsOptional()
  @IsString()
  urlKind?: string;
}

export class OpinionGenerateDto {
  @IsOptional()
  @IsString()
  topic?: string;
  @IsOptional()
  @IsString()
  stance?: string;
  @IsOptional()
  @IsString()
  angle?: string;
  @IsOptional()
  @IsString()
  pronoun?: string;
  @IsOptional()
  @IsString()
  intensity?: string;
  @IsOptional()
  @IsString()
  length?: string;
  @IsOptional()
  @IsString()
  story?: string;

  @IsOptional()
  @IsArray()
  avoidWords?: any[];
  @IsOptional()
  @IsArray()
  closingPhrases?: any[];
  @IsOptional()
  @IsArray()
  commonPhrases?: any[];
  @IsOptional()
  @IsArray()
  confirmedFacts?: any[];
  @IsOptional()
  @IsBoolean()
  hideNames?: boolean;
  @IsOptional()
  @IsArray()
  openingPhrases?: any[];
  @IsOptional()
  @IsArray()
  preferredWords?: any[];
  @IsOptional()
  @IsString()
  quickAngleLabel?: string;
  @IsOptional()
  @IsString()
  sampleParagraph?: string;
  @IsOptional()
  @IsString()
  selectedAngle?: string;
  @IsOptional()
  @IsString()
  sourceSummary?: string;
  @IsOptional()
  @IsString()
  subtopic?: string;
  @IsOptional()
  @IsString()
  themeId?: string;
  @IsOptional()
  @IsArray()
  unverifiedClaims?: any[];
  @IsOptional()
  @IsString()
  userViewpoint?: string;
}

export class OpinionRewriteDto {
  @IsOptional()
  @IsString()
  content?: string;
  @IsOptional()
  @IsString()
  mode?: string;

  @IsOptional()
  @IsString()
  facebookPost?: string;
  @IsOptional()
  @IsString()
  rewriteMode?: string;
  @IsOptional()
  @IsString()
  videoHook?: string;
  @IsOptional()
  @IsString()
  videoScript?: string;
}

export class OpinionScoreNaturalnessDto {
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  contentType?: string;
}

export class OpinionSuggestFieldDto {
  @IsOptional()
  @IsString()
  field?: string;
  @IsOptional()
  @IsString()
  context?: string;

  @IsOptional()
  @IsString()
  currentDebateIssue?: string;
  @IsOptional()
  @IsString()
  currentSummary?: string;
  @IsOptional()
  @IsString()
  currentValue?: string;
  @IsOptional()
  @IsString()
  sourceText?: string;
  @IsOptional()
  @IsString()
  subtopic?: string;
  @IsOptional()
  @IsString()
  themeLabel?: string;
}

export class TeleprompterScriptRewriteDto {
  @IsOptional()
  @IsString()
  script?: string;
  @IsOptional()
  @IsString()
  mode?: string;

  @IsOptional()
  @IsString()
  title?: string;
}

export class UpsertOpinionVoiceProfileDto {
  @IsOptional()
  @IsString()
  name?: string;
  @IsOptional()
  @IsString()
  style?: string;
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  avoidWords?: any[];
  @IsOptional()
  @IsArray()
  closingPhrases?: any[];
  @IsOptional()
  @IsArray()
  openingPhrases?: any[];
  @IsOptional()
  @IsArray()
  preferredWords?: any[];
  @IsOptional()
  @IsString()
  pronoun?: string;
  @IsOptional()
  @IsString()
  sampleParagraph?: string;
  @IsOptional()
  @IsString()
  scope?: string;
}

export class UpsertTeleprompterSourceDto {
  @IsOptional()
  @IsString()
  title?: string;
  @IsOptional()
  @IsString()
  content?: string;
  @IsOptional()
  @IsString()
  sourceType?: string;
  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  clientContentId?: string;
  @IsOptional()
  @IsString()
  editedScript?: string;
  @IsOptional()
  @IsString()
  estimatedDuration?: string;
  @IsOptional()
  @IsString()
  facebookPost?: string;
  @IsOptional()
  @IsString()
  id?: string;
  @IsOptional()
  @IsString()
  originalScript?: string;
  @IsOptional()
  @IsString()
  sourceContentId?: string;
  @IsOptional()
  @IsString()
  sourceRoute?: string;
  @IsOptional()
  @IsString()
  sourceTitle?: string;
  @IsOptional()
  @IsString()
  videoHook?: string;
}

export const OpinionRewriteMode = ['soften','sharpen','shorten','expand','neutral'] as const;
export type OpinionRewriteMode = (typeof OpinionRewriteMode)[number];
export const TeleprompterScriptRewriteMode = ['shorten','expand','clarify','pace'] as const;
export type TeleprompterScriptRewriteMode = (typeof TeleprompterScriptRewriteMode)[number];
