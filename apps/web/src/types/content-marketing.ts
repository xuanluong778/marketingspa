export type ContentStudioTab = 'ad' | 'personal' | 'advanced';

export type ContentTone =
  | 'bold'
  | 'edgy'
  | 'friendly'
  | 'humorous'
  | 'educational'
  | 'philosophical'
  | 'realistic'
  | 'storytelling'
  | 'trending'
  | 'expert'
  | 'empathetic'
  | 'direct_sale';

export type AdContentType =
  'inbox' | 'lead' | 'sales' | 'remarketing' | 'promo' | 'case_study' | 'video_script' | 'hook_3s';

export type PersonalPostType =
  | 'knowledge_sharing'
  | 'humor'
  | 'philosophy'
  | 'touching'
  | 'motivational'
  | 'personal_story'
  | 'realistic_view'
  | 'personal_trend'
  | 'failure_lesson'
  | 'success_experience'
  | 'community_engagement';

export type PersonalTone =
  | 'approachable'
  | 'humorous'
  | 'playful'
  | 'deep'
  | 'philosophical'
  | 'touching'
  | 'inspiring'
  | 'bold'
  | 'realistic'
  | 'everyday'
  | 'positive'
  | 'sincere'
  | 'mild_edgy'
  | 'storytelling'
  | 'bold_may_tao';

export type PersonalPostGoal =
  | 'engagement'
  | 'knowledge'
  | 'inspiration'
  | 'humor'
  | 'touching_story'
  | 'personal_view'
  | 'trend'
  | 'personal_branding';

export type PostLength = 'short' | 'medium' | 'long';

export type PersonalRewriteMode =
  | 'funnier'
  | 'deeper'
  | 'more_emotional'
  | 'more_motivational'
  | 'shorter'
  | 'longer'
  | 'hooks_5'
  | 'openers_5'
  | 'ab_3';

export type BrandArticleGenre =
  | 'edgy_motivation'
  | 'love_advice'
  | 'life_lesson'
  | 'parent_advice'
  | 'friend_advice'
  | 'women_beauty'
  | 'marriage_family'
  | 'success_failure'
  | 'spa_profession'
  | 'spa_owner_brand'
  | 'intimate_story';

export type BrandPronoun =
  'auto' | 'may_tao' | 'anh_em' | 'chi_em' | 'parent_child' | 'ban_toi' | 'experienced_youth';

export type BrandVoiceIntensity = 'gentle_deep' | 'frank' | 'edgy' | 'strong' | 'very_strong';

/** Mode trong tab Xây dựng thương hiệu */
export type PersonalCreationMode = 'topic' | 'opinion';

/** Quan điểm với sự việc */
export type OpinionStance = 'agree' | 'disagree' | 'neutral' | 'multi' | 'custom';

/** Góc nhìn bài viết */
export type OpinionAngle =
  'life' | 'ethics' | 'community' | 'business' | 'celebrity' | 'personal_lesson';

/** Xưng hô cho Góc nhìn & Chính kiến */
export type OpinionPronoun = 'toi_cac_ban' | 'minh_moi_nguoi' | 'anh_em' | 'co_chu_anh_chi';

/** Mức độ giọng */
export type OpinionIntensity =
  'gentle' | 'deep' | 'frank' | 'emotional' | 'motivational' | 'strong';

/** Độ dài bài opinion */
export type OpinionLength = '1min' | '3min' | '5min' | 'facebook';

export interface PersonalFormState {
  /** topic = luồng chủ đề hiện có; opinion = Góc nhìn & Chính kiến */
  creationMode: PersonalCreationMode;
  /** Nhóm chủ đề lớn (config brand-topic-themes) */
  topicGroupId: string;
  topicGroupLabel: string;
  /** Batch chủ đề nhỏ đang hiển thị (5–8) */
  suggestedTopics: string[];
  /** Chủ đề nhỏ đã chọn (chip / nhập tay) — giữ khi đã chọn tiêu đề */
  selectedSubtopic: string;
  /** Chủ đề/tiêu đề bài viết dùng khi generate (sau khi chọn tiêu đề = selectedTitle) */
  postTopic: string;
  /** true = người dùng đang nhập chủ đề riêng */
  useCustomTopic: boolean;
  /** Tiêu đề AI đã tạo */
  generatedTitles: string[];
  /** Tiêu đề đang chọn */
  selectedTitle: string;
  /** Số tiêu đề muốn tạo: 5 | 10 | 20 */
  titleCount: 5 | 10 | 20;
  /** Đang gọi API tạo tiêu đề (draft luôn reset false khi load) */
  isGeneratingTitles: boolean;
  targetAudience: string;
  postGoal: PersonalPostGoal;
  personalPostType: PersonalPostType;
  personalTone: PersonalTone;
  brandArticleGenre: BrandArticleGenre;
  brandPronoun: BrandPronoun;
  brandVoiceIntensity: BrandVoiceIntensity;
  postLength: PostLength;
  personalAngle: string;
  storyIdea: string;
  videoUrl: string;
  transcript: string;
  /** --- Góc nhìn & Chính kiến --- */
  opinionSourceUrl: string;
  opinionSourceText: string;
  opinionSummary: string;
  opinionDebateIssue: string;
  opinionStance: OpinionStance;
  opinionStanceCustom: string;
  opinionAngle: OpinionAngle;
  opinionPronoun: OpinionPronoun;
  opinionIntensity: OpinionIntensity;
  opinionLength: OpinionLength;
  /** Chính kiến / luận điểm của người viết */
  opinionThesis: string;
  /** Dữ kiện đã xác nhận (từ analyze hoặc chỉnh tay) */
  opinionConfirmedFacts: string[];
  /** Thông tin chưa xác minh */
  opinionUnverifiedClaims: string[];
  /** Cụm từ người dùng thường nói (mỗi dòng / mỗi phần tử) */
  opinionCommonPhrases: string;
  /** Ẩn tên nhân vật */
  opinionHideNames: boolean;
  /** Voice profile fields */
  opinionAvoidWords: string;
  opinionOpeningPhrases: string;
  opinionClosingPhrases: string;
  opinionSampleParagraph: string;
  /** Nhóm chủ đề lớn (config opinion-topic-themes) */
  opinionThemeId: string;
  /** Chủ đề con đã chọn */
  opinionSubtopic: string;
  /** Góc nhìn nhanh (id từ config) */
  opinionQuickAngleId: string;
  /** Góc nhìn gợi ý từ phân tích (3–5) */
  opinionSuggestedAngles: string[];
  /** Góc nhìn gợi ý đã chọn */
  opinionPickedSuggestedAngle: string;
  /** Batch chủ đề con random 5–8 (nhóm đời sống) */
  opinionSuggestedSubtopics: string[];
  /** Tiêu đề / góc nhìn AI gợi ý (5–10) */
  opinionGeneratedTitles: string[];
  /** Tiêu đề đang chọn */
  opinionSelectedTitle: string;
  /** Số tiêu đề muốn tạo */
  opinionTitleCount: 5 | 10;
  /** Đang tạo tiêu đề */
  opinionIsGeneratingTitles: boolean;
  /** Đang nhập câu chuyện riêng */
  opinionUseCustomStory: boolean;
}

export interface OpinionStoryAnalysis {
  summary: string;
  debateIssue: string;
  suggestedAngles: string[];
  keyPoints: string[];
  source: 'ai' | 'template';
}

/** Response of POST /content-marketing/opinion/analyze */
export interface OpinionAnalyzeResult {
  sourceSummary: string;
  confirmedFacts: string[];
  unverifiedClaims: string[];
  mainControversy: string;
  suggestedAngles: string[];
  missingInformation: string[];
  warnings: string[];
  extractedText?: string;
  sourceType?: string;
  insufficientData?: boolean;
  message?: string;
  analysisSource?: 'ai' | 'template';
}

export type OpinionRewriteMode =
  | 'more_casual'
  | 'more_natural'
  | 'more_spoken'
  | 'less_preachy'
  | 'more_frank'
  | 'more_deep'
  | 'shorten'
  | 'shorten_1min'
  | 'rewrite_all';

/** Response of POST /content-marketing/opinion/generate|rewrite */
export interface OpinionGenerateResult {
  facebookPost: string;
  videoScript: string;
  videoHook: string;
  warnings: string[];
  source: 'ai' | 'template';
  rewriteMode?: OpinionRewriteMode;
  /** Metadata tách riêng — không chèn vào nội dung bài */
  meta?: {
    themeId?: string;
    subtopic?: string;
    selectedAngle?: string;
    length?: string;
  };
}

export const OPINION_REWRITE_BUTTONS: { mode: OpinionRewriteMode; label: string }[] = [
  { mode: 'more_natural', label: 'Tự nhiên hơn' },
  { mode: 'more_casual', label: 'Dân dã hơn' },
  { mode: 'more_spoken', label: 'Giống lời nói hơn' },
  { mode: 'less_preachy', label: 'Bớt giảng đạo' },
  { mode: 'more_deep', label: 'Sâu sắc hơn' },
  { mode: 'shorten', label: 'Rút ngắn' },
  { mode: 'rewrite_all', label: 'Viết lại toàn bộ' },
];

export type TeleprompterScriptRewriteMode =
  | 'to_spoken'
  | 'more_natural'
  | 'more_casual'
  | 'less_written'
  | 'less_preachy'
  | 'more_frank'
  | 'more_deep'
  | 'shorten_1min'
  | 'shorten_3min'
  | 'shorten_5min';

export interface TeleprompterScriptRewriteResult {
  script: string;
  warnings: string[];
  source: 'ai' | 'template';
  rewriteMode: TeleprompterScriptRewriteMode;
  wordCount: number;
}

export interface OpinionNaturalnessResult {
  total: number;
  criteria: {
    spokenFeel: number;
    casualTone: number;
    sentenceLength: number;
    clicheFree: number;
    repetition: number;
    naturalEmotion: number;
    cameraReadiness: number;
  };
  suggestions: string[];
  source: 'heuristic' | 'ai';
}

export interface OpinionVoiceProfile {
  pronoun: string | null;
  preferredWords: string[];
  avoidWords: string[];
  openingPhrases: string[];
  closingPhrases: string[];
  sampleParagraph: string | null;
  source: 'user' | 'organization';
}

export interface OpinionVoiceProfileResponse {
  user: OpinionVoiceProfile | null;
  organization: OpinionVoiceProfile | null;
  resolved: OpinionVoiceProfile | null;
}

export const OPINION_STANCE_OPTIONS: { value: OpinionStance; label: string }[] = [
  { value: 'agree', label: 'Đồng tình' },
  { value: 'disagree', label: 'Không đồng tình' },
  { value: 'neutral', label: 'Trung lập' },
  { value: 'multi', label: 'Nhiều chiều' },
  { value: 'custom', label: 'Nhập riêng' },
];

export const OPINION_ANGLE_OPTIONS: { value: OpinionAngle; label: string }[] = [
  { value: 'life', label: 'Cuộc sống' },
  { value: 'ethics', label: 'Đạo đức' },
  { value: 'community', label: 'Trách nhiệm cộng đồng' },
  { value: 'business', label: 'Kinh doanh' },
  { value: 'celebrity', label: 'Người nổi tiếng' },
  { value: 'personal_lesson', label: 'Bài học cá nhân' },
];

export const OPINION_PRONOUN_OPTIONS: { value: OpinionPronoun; label: string }[] = [
  { value: 'toi_cac_ban', label: 'Tôi – các bạn' },
  { value: 'minh_moi_nguoi', label: 'Mình – mọi người' },
  { value: 'anh_em', label: 'Anh em' },
  { value: 'co_chu_anh_chi', label: 'Cô chú, anh chị' },
];

export const OPINION_INTENSITY_OPTIONS: { value: OpinionIntensity; label: string }[] = [
  { value: 'gentle', label: 'Nhẹ nhàng' },
  { value: 'deep', label: 'Sâu sắc' },
  { value: 'frank', label: 'Thẳng thắn' },
  { value: 'emotional', label: 'Xúc động' },
  { value: 'motivational', label: 'Truyền động lực' },
];

export const OPINION_LENGTH_OPTIONS: { value: OpinionLength; label: string; hint: string }[] = [
  { value: '1min', label: '1 phút', hint: '~120–180 từ' },
  { value: '3min', label: '3 phút', hint: '~350–500 từ' },
  { value: '5min', label: '5 phút', hint: '~600–800 từ' },
  { value: 'facebook', label: 'Bài Facebook', hint: 'Dài vừa, sẵn sàng đăng' },
];

export type Platform = 'facebook' | 'tiktok' | 'zalo';

export type RewriteMode =
  'stronger' | 'safer' | 'shorter' | 'longer' | 'funnier' | 'hooks_5' | 'cta_5' | 'ab_3';

export type AdObjective =
  | 'messages'
  | 'engagement'
  | 'lead_form'
  | 'landing_conversion'
  | 'direct_sales'
  | 'remarketing'
  | 'brand_awareness';

export type AdPostKind = 'product' | 'service';

export interface AdProductDetails {
  name: string;
  category: string;
  features: string;
  benefits: string;
  differentiators: string;
  price: string;
  warranty: string;
  proof: string;
  offer: string;
}

export interface AdServiceDetails {
  name: string;
  suitableCustomers: string;
  problems: string;
  process: string;
  highlights: string;
  expectedBenefits: string;
  duration: string;
  location: string;
  experts: string;
  proof: string;
  offer: string;
}

export const emptyAdProductDetails = (): AdProductDetails => ({
  name: '',
  category: '',
  features: '',
  benefits: '',
  differentiators: '',
  price: '',
  warranty: '',
  proof: '',
  offer: '',
});

export const emptyAdServiceDetails = (): AdServiceDetails => ({
  name: '',
  suitableCustomers: '',
  problems: '',
  process: '',
  highlights: '',
  expectedBenefits: '',
  duration: '',
  location: '',
  experts: '',
  proof: '',
  offer: '',
});

export const AD_POST_KIND_OPTIONS: { value: AdPostKind; label: string }[] = [
  { value: 'product', label: 'Bài viết sản phẩm' },
  { value: 'service', label: 'Bài viết dịch vụ' },
];

export interface ContentFormState {
  /** product = Bài viết sản phẩm; service = Bài viết dịch vụ. Default product for new drafts. */
  adPostKind: AdPostKind;
  /** Tên thương hiệu / cơ sở — draft + autofill từ organization.name */
  brandName: string;
  productService: string;
  targetAudience: string;
  painPoints: string;
  benefits: string;
  offer: string;
  adObjective: AdObjective | '';
  platform: Platform;
  cta: string;
  tone: ContentTone;
  adContentType: AdContentType;
  personalPostType: PersonalPostType;
  videoUrl: string;
  transcript: string;
  industryId: string;
  industryName: string;
  customIndustry: string;
  /** Chi tiết sản phẩm — chỉ gửi khi adPostKind=product */
  productDetails: AdProductDetails;
  /** Chi tiết dịch vụ — chỉ gửi khi adPostKind=service */
  serviceDetails: AdServiceDetails;
}

export interface PolicyFlag {
  phrase: string;
  reason: string;
  suggestion: string;
}

export interface PolicyCheckResult {
  safetyScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  flaggedPhrases: PolicyFlag[];
  saferVersion: string;
  disclaimer: string;
  isRegulatedIndustry?: boolean;
  regulatedWarning?: string | null;
  requiresModerationAck?: boolean;
}

export interface ContentScoreCriteria {
  hook: number;
  insight: number;
  benefits: number;
  proof: number;
  cta: number;
  readability: number;
  platformFit: number;
  policySafety: number;
}

export interface ContentScoreResult {
  total: number;
  criteria: ContentScoreCriteria;
  strengths: string[];
  improvements: string[];
  adsReadiness: 'low' | 'medium' | 'high';
}

export interface PersonalScoreCriteria {
  hook: number;
  emotion: number;
  relatability: number;
  personalAngle: number;
  engagement: number;
  naturalness: number;
}

export interface PersonalScoreResult {
  total: number;
  criteria: PersonalScoreCriteria;
  strengths: string[];
  improvements: string[];
  interactionReadiness: 'low' | 'medium' | 'high';
  naturalnessNotes: string[];
}

export interface GeneratePersonalResult {
  content: string;
  hooks: string[];
  openers: string[];
  punchlines: string[];
  source: 'ai' | 'template';
  score: PersonalScoreResult;
}

export interface AdInsightsSuggestion {
  painPoints: string;
  benefits: string;
  source: 'ai' | 'template';
}

export interface PersonalIdeasSuggestion {
  personalAngle: string;
  storyIdea: string;
  angleAlternatives: string[];
  storyAlternatives: string[];
  source: 'ai' | 'template';
}

export interface PersonalTitlesSuggestion {
  titles: string[];
  source: 'ai' | 'template';
}

export type FacebookPolicySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type FacebookPolicyOverallStatus =
  'PASS_CANDIDATE' | 'REVIEW_REQUIRED' | 'HIGH_RISK' | 'PROHIBITED' | 'INSUFFICIENT_DATA';
export type SpecialAdCategory =
  'NONE' | 'CREDIT' | 'EMPLOYMENT' | 'HOUSING' | 'SOCIAL_ISSUES_ELECTIONS_POLITICS';

export interface FacebookPolicyMeta {
  policyCode: string;
  policyVersion: string;
  sourceUrl: string;
  reviewedAt: string;
  label: string;
}

export interface FacebookPolicyFinding {
  id: string;
  field: string;
  excerpt: string;
  policyGroup: string;
  policyCode: string;
  severity: FacebookPolicySeverity;
  reason: string;
  remediation: string;
  suggestedReplacement?: string;
  signalCount: number;
  signals: string[];
  source: 'rule' | 'ai' | 'hybrid';
  dismissedByAi?: boolean;
}

export interface FacebookPolicyCheckResult {
  riskScore: number;
  confidence: number;
  overallStatus: FacebookPolicyOverallStatus;
  findings: FacebookPolicyFinding[];
  rewrittenContent: string | null;
  policyMeta: FacebookPolicyMeta;
  layers: {
    ruleFindingCount: number;
    aiReviewed: boolean;
    aiSource: 'ai' | 'skipped' | 'fallback';
    falsePositivesDismissed: number;
  };
  organizationId: string | null;
  requiresRecheck: boolean;
  summary: string;
}

export interface FacebookPolicyRewriteResult {
  rewrittenContent: string;
  preserved: {
    brandName: boolean;
    product: boolean;
    price: boolean;
    phone: boolean;
    address: boolean;
    offer: boolean;
  };
  changes: string[];
  requiresRecheck: true;
  policyMeta: FacebookPolicyMeta;
  organizationId: string | null;
  source: 'ai' | 'template';
  preliminaryRiskScore: number;
  preliminaryStatus: FacebookPolicyOverallStatus;
}

export interface FacebookPolicyCheckPayload {
  headline?: string;
  primaryText?: string;
  description?: string;
  cta?: string;
  productService?: string;
  audience?: string;
  country?: string;
  ageMin?: number;
  ageMax?: number;
  specialAdCategory?: SpecialAdCategory;
  brandName?: string;
  contentToRewrite?: string;
  imageOcrText?: string;
  transcript?: string;
  landingPageText?: string;
  landingUrl?: string;
}

export type FacebookPolicyUrlKind =
  'website' | 'facebook_post' | 'facebook_video' | 'facebook_reel' | 'landing_page' | 'unknown';

export interface FacebookPolicyImportResult {
  sourceType: FacebookPolicyUrlKind;
  url: string;
  finalUrl?: string;
  editable: true;
  headline?: string;
  primaryText?: string;
  description?: string;
  permalink?: string;
  thumbnailUrl?: string;
  pageId?: string;
  pageName?: string;
  warnings: string[];
  insufficientData: boolean;
  statusHint?: 'INSUFFICIENT_DATA' | 'OK' | 'PERMISSION_REQUIRED';
  message?: string;
  landing?: {
    productHints: string[];
    priceHints: string[];
    ctaHints: string[];
    hasSensitiveForm: boolean;
    phishingSignals: string[];
  };
}

export interface FacebookPolicyMediaAnalysis {
  mediaType: 'image' | 'video' | 'transcript';
  ocrText: string;
  transcript: string;
  caption: string;
  visualNotes: string[];
  regions: Array<{
    label: string;
    box?: { x: number; y: number; w: number; h: number };
    startSec?: number;
    endSec?: number;
  }>;
  findings: FacebookPolicyFinding[];
  insufficientData: boolean;
  statusHint: 'OK' | 'INSUFFICIENT_DATA';
  message?: string;
  warnings: string[];
}

export interface VideoAnalysisResult {
  topic: string;
  insights: string[];
  hook: string;
  angle: string;
  contentIdeas: string[];
  suggestedCta: string;
  source: 'ai' | 'heuristic';
}

export interface GenerateContentResult {
  content: string;
  hooks: string[];
  ctas: string[];
  source: 'ai' | 'template';
  policy: PolicyCheckResult;
  score: ContentScoreResult;
  /** Headline ngắn cho ads (mới — optional backward compatible) */
  headline?: string | null;
  /** Mô tả ngắn / primary text phụ */
  shortDescription?: string | null;
  /** Gợi ý hình ảnh / video */
  mediaSuggestions?: string[];
  adPostKind?: AdPostKind;
}

export interface ContentHistoryItem {
  id: string;
  tab: ContentStudioTab;
  title: string;
  content: string;
  contentScore: number;
  policyScore: number;
  variantCount: number;
  adsReadiness: string;
  createdAt: string;
  industryId?: string | null;
  industryName?: string | null;
  customIndustry?: string | null;
  /** Facebook / Meta policy check snapshot (client-persisted). */
  policyCheckId?: string;
  policyStatus?: FacebookPolicyOverallStatus;
  riskScore?: number;
  policyVersion?: string;
  checkedAt?: string;
  checkedContentHash?: string;
  checkedMediaHash?: string;
  checkedLandingPageHash?: string;
  specialAdCategory?: SpecialAdCategory;
  needsSpecialAdCategory?: boolean;
  cta?: string;
  landingUrl?: string;
  /** Kịch bản camera (opinion mode) */
  videoScript?: string;
  videoHook?: string;
}

export type AdvancedWritingStyle =
  | 'expert_consultant'
  | 'emotional_warm'
  | 'pain_direct'
  | 'luxury'
  | 'transformation_story'
  | 'promo_strong'
  | 'mom_family'
  | 'busy_office';

export type AdvancedDemographic =
  | 'female_18_25'
  | 'female_25_35'
  | 'female_35_45'
  | 'female_45_plus'
  | 'male_25_40'
  | 'premium'
  | 'office_worker';

export type AdvancedArticleGoal =
  'direct_sales' | 'inbox' | 'booking' | 'facebook_ads' | 'fanpage' | 'website_blog' | 'livestream';

export type AdvancedCtaType = 'comment' | 'inbox' | 'hotline' | 'booking';

export type AdvancedSuggestField =
  'painPoints' | 'desires' | 'differentiator' | 'certification' | 'caseStudy';

export interface AdvancedFieldSuggestion {
  options: string[];
  source: 'ai' | 'template';
}

export interface AdvancedFormState {
  productService: string;
  price: string;
  combo: string;
  gift: string;
  offerDeadline: string;
  salesArea: string;
  certification: string;
  caseStudy: string;
  painPoints: string;
  desires: string;
  differentiator: string;
  ctaType: AdvancedCtaType;
  writingStyle: AdvancedWritingStyle;
  demographic: AdvancedDemographic;
  articleGoal: AdvancedArticleGoal;
  postLength: PostLength;
  industryId: string;
  industryName: string;
  customIndustry: string;
}

export interface AdvancedStepAnalysis {
  step: number;
  label: string;
  summary: string;
}

export interface AdvancedArticleResult {
  title: string;
  hook: string;
  final_article: string;
  cta: string;
  hashtags: string[];
  analysis_16_steps: AdvancedStepAnalysis[];
  suggested_images: string[];
  suggested_ads_angle: string;
  variants: {
    facebook: string;
    website: string;
    ads: string;
  };
  source: 'ai' | 'template';
}

export const ADVANCED_WRITING_STYLE_OPTIONS: { value: AdvancedWritingStyle; label: string }[] = [
  { value: 'expert_consultant', label: 'Chuyên gia tư vấn' },
  { value: 'emotional_warm', label: 'Cảm xúc gần gũi' },
  { value: 'pain_direct', label: 'Đánh thẳng nỗi đau' },
  { value: 'luxury', label: 'Sang trọng cao cấp' },
  { value: 'transformation_story', label: 'Kể chuyện chuyển đổi' },
  { value: 'promo_strong', label: 'Khuyến mãi mạnh' },
  { value: 'mom_family', label: 'Mẹ bỉm / gia đình' },
  { value: 'busy_office', label: 'Công sở bận rộn' },
];

export const ADVANCED_DEMOGRAPHIC_OPTIONS: { value: AdvancedDemographic; label: string }[] = [
  { value: 'female_18_25', label: 'Nữ 18–25: làm đẹp, tự tin, giá hợp lý' },
  { value: 'female_25_35', label: 'Nữ 25–35: bận rộn, mẹ bỉm, sau sinh' },
  { value: 'female_35_45', label: 'Nữ 35–45: chống lão hóa, nám, giữ dáng' },
  { value: 'female_45_plus', label: 'Nữ 45+: trẻ hóa, sức khỏe, sang trọng' },
  { value: 'male_25_40', label: 'Nam 25–40: chăm sóc da, body, thư giãn' },
  { value: 'premium', label: 'Khách cao cấp: trải nghiệm premium' },
  { value: 'office_worker', label: 'Khách văn phòng: nhanh, tiện, đặt lịch dễ' },
];

export const ADVANCED_ARTICLE_GOAL_OPTIONS: { value: AdvancedArticleGoal; label: string }[] = [
  { value: 'direct_sales', label: 'Bán hàng trực tiếp' },
  { value: 'inbox', label: 'Kéo inbox' },
  { value: 'booking', label: 'Kéo đặt lịch' },
  { value: 'facebook_ads', label: 'Chạy quảng cáo Facebook' },
  { value: 'fanpage', label: 'Đăng fanpage' },
  { value: 'website_blog', label: 'Đăng website / blog' },
  { value: 'livestream', label: 'Kịch bản livestream' },
];

export const ADVANCED_CTA_OPTIONS: { value: AdvancedCtaType; label: string }[] = [
  { value: 'comment', label: 'Comment bài viết' },
  { value: 'inbox', label: 'Inbox / nhắn tin' },
  { value: 'hotline', label: 'Gọi hotline' },
  { value: 'booking', label: 'Đặt lịch' },
];

export const ADVANCED_LENGTH_OPTIONS: { value: PostLength; label: string; hint: string }[] = [
  { value: 'short', label: 'Ngắn', hint: '500–700 từ' },
  { value: 'medium', label: 'Trung bình', hint: '900–1200 từ' },
  { value: 'long', label: 'Dài', hint: '1500–2000 từ' },
];

export const TONE_OPTIONS: { value: ContentTone; label: string }[] = [
  { value: 'bold', label: 'Mạnh mẽ' },
  { value: 'edgy', label: 'Gai góc' },
  { value: 'friendly', label: 'Thân thiện' },
  { value: 'humorous', label: 'Hài hước' },
  { value: 'educational', label: 'Giáo dục' },
  { value: 'philosophical', label: 'Triết lý' },
  { value: 'realistic', label: 'Góc nhìn thực tế' },
  { value: 'storytelling', label: 'Storytelling' },
  { value: 'trending', label: 'Hot trend' },
  { value: 'expert', label: 'Chuyên gia' },
  { value: 'empathetic', label: 'Đồng cảm' },
  { value: 'direct_sale', label: 'Chốt sale trực diện' },
];

export const AD_TYPE_OPTIONS: { value: AdContentType; label: string }[] = [
  { value: 'inbox', label: 'Kéo inbox' },
  { value: 'lead', label: 'Lấy lead' },
  { value: 'sales', label: 'Bán hàng' },
  { value: 'remarketing', label: 'Remarketing' },
  { value: 'promo', label: 'Ưu đãi' },
  { value: 'case_study', label: 'Case study' },
  { value: 'video_script', label: 'Video script' },
  { value: 'hook_3s', label: 'Hook 3 giây' },
];

export const BRAND_ARTICLE_GENRE_OPTIONS: { value: BrandArticleGenre; label: string }[] = [
  { value: 'edgy_motivation', label: 'Truyền động lực gai góc' },
  { value: 'love_advice', label: 'Lời khuyên tình yêu' },
  { value: 'life_lesson', label: 'Bài học cuộc sống' },
  { value: 'parent_advice', label: 'Bố mẹ khuyên con' },
  { value: 'friend_advice', label: 'Bạn bè khuyên nhau' },
  { value: 'women_beauty', label: 'Phụ nữ & nhan sắc' },
  { value: 'marriage_family', label: 'Hôn nhân gia đình' },
  { value: 'success_failure', label: 'Thành công / thất bại' },
  { value: 'spa_profession', label: 'Chuyện nghề' },
  { value: 'spa_owner_brand', label: 'Thương hiệu chủ doanh nghiệp' },
  { value: 'intimate_story', label: 'Câu chuyện thân mật tế nhị' },
];

export const BRAND_PRONOUN_OPTIONS: { value: BrandPronoun; label: string }[] = [
  { value: 'auto', label: 'AI tự chọn phù hợp' },
  { value: 'may_tao', label: 'Mày / Tao' },
  { value: 'anh_em', label: 'Anh / Em' },
  { value: 'chi_em', label: 'Chị / Em' },
  { value: 'parent_child', label: 'Bố mẹ / Con' },
  { value: 'ban_toi', label: 'Bạn / Tôi' },
  { value: 'experienced_youth', label: 'Người từng trải / Người trẻ' },
];

export const BRAND_VOICE_INTENSITY_OPTIONS: {
  value: BrandVoiceIntensity;
  label: string;
  description?: string;
}[] = [
  { value: 'gentle_deep', label: 'Nhẹ nhưng sâu sắc', description: 'Chậm rãi, có chiều sâu' },
  { value: 'frank', label: 'Thẳng thắn', description: 'Nói thật, không vòng vo' },
  { value: 'edgy', label: 'Gai góc', description: 'Có lực, chạm nỗi đau' },
  { value: 'strong', label: 'Rất mạnh', description: 'Đánh thức, không toxic' },
  {
    value: 'very_strong',
    label: 'Cực gắt (không tục)',
    description: 'Thẳng đến mức khó chịu — văn minh',
  },
];

export const PERSONAL_TYPE_OPTIONS: { value: PersonalPostType; label: string }[] = [
  { value: 'knowledge_sharing', label: 'Chia sẻ kiến thức' },
  { value: 'humor', label: 'Bài hài hước / vui nhộn' },
  { value: 'philosophy', label: 'Bài triết lý' },
  { value: 'touching', label: 'Bài cảm động' },
  { value: 'motivational', label: 'Bài truyền động lực' },
  { value: 'personal_story', label: 'Bài kể chuyện cá nhân' },
  { value: 'realistic_view', label: 'Bài góc nhìn thực tế' },
  { value: 'personal_trend', label: 'Bài hot trend (góc nhìn cá nhân)' },
  { value: 'failure_lesson', label: 'Bài học từ thất bại' },
  { value: 'success_experience', label: 'Chia sẻ kinh nghiệm thành công' },
  { value: 'community_engagement', label: 'Bài tạo tương tác cộng đồng' },
];

export const PERSONAL_TONE_OPTIONS: {
  value: PersonalTone;
  label: string;
  description?: string;
}[] = [
  { value: 'approachable', label: 'Gần gũi' },
  { value: 'humorous', label: 'Hài hước' },
  { value: 'playful', label: 'Vui nhộn' },
  { value: 'deep', label: 'Sâu sắc' },
  { value: 'philosophical', label: 'Triết lý' },
  { value: 'touching', label: 'Cảm động' },
  { value: 'inspiring', label: 'Truyền cảm hứng' },
  { value: 'bold', label: 'Mạnh mẽ' },
  { value: 'realistic', label: 'Thực tế' },
  { value: 'everyday', label: 'Đời thường' },
  { value: 'positive', label: 'Tích cực' },
  { value: 'sincere', label: 'Chân thành' },
  { value: 'mild_edgy', label: 'Gai góc vừa phải' },
  { value: 'storytelling', label: 'Kể chuyện cuốn hút' },
  {
    value: 'bold_may_tao',
    label: 'Gai góc mạnh',
    description:
      'Phong cách xưng mày-tao, mạnh, thẳng, truyền động lực như lời khuyên của một người bạn thân.',
  },
];

export const MAY_TAO_INSPIRATION_CTAS = [
  'Đứng dậy đi.',
  'Làm ngay hôm nay.',
  'Đừng để sự lười biếng chôn sống cuộc đời mày.',
  'Mày nghĩ sao?',
  'Ai cần nghe điều này thì gửi cho họ.',
] as const;

export const PERSONAL_GOAL_OPTIONS: { value: PersonalPostGoal; label: string }[] = [
  { value: 'engagement', label: 'Tăng tương tác' },
  { value: 'knowledge', label: 'Chia sẻ kiến thức' },
  { value: 'inspiration', label: 'Truyền cảm hứng' },
  { value: 'humor', label: 'Tạo tiếng cười' },
  { value: 'touching_story', label: 'Kể câu chuyện cảm động' },
  { value: 'personal_view', label: 'Nêu góc nhìn cá nhân' },
  { value: 'trend', label: 'Bắt trend' },
  { value: 'personal_branding', label: 'Xây dựng uy tín cá nhân' },
];

export const POST_LENGTH_OPTIONS: { value: PostLength; label: string }[] = [
  { value: 'short', label: 'Ngắn (150–300 từ)' },
  { value: 'medium', label: 'Vừa (300–600 từ)' },
  { value: 'long', label: 'Dài (600+ từ)' },
];

export const SOFT_INTERACTION_CTAS = [
  'Bạn thấy đúng không?',
  'Bạn đã từng gặp chuyện này chưa?',
  'Nếu thấy hay hãy lưu lại.',
  'Bạn nghĩ sao về góc nhìn này?',
  'Comment quan điểm của bạn nhé.',
] as const;

export const PLATFORM_OPTIONS: { value: Platform; label: string }[] = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'zalo', label: 'Zalo' },
];

/** Giá trị select "Khác" — hiện ô nhập tay */
export const FORM_CUSTOM_VALUE = '__custom__';

export const PRODUCT_SERVICE_OPTIONS: { value: string; label: string }[] = [
  { value: 'Liệu trình trẻ hóa da chuyên sâu', label: 'Liệu trình trẻ hóa da chuyên sâu' },
  { value: 'Gội đầu dưỡng sinh', label: 'Gội đầu dưỡng sinh' },
  { value: 'Massage body thư giãn', label: 'Massage body thư giãn' },
  { value: 'Chăm sóc da mụn / da nhạy cảm', label: 'Chăm sóc da mụn / da nhạy cảm' },
  { value: 'Tắm trắng / body treatment', label: 'Tắm trắng / body treatment' },
  { value: 'Giảm mỡ / slimming', label: 'Giảm mỡ / slimming' },
  { value: 'Triệt lông / laser thẩm mỹ', label: 'Triệt lông / laser thẩm mỹ' },
  { value: 'Phun mày / phun môi', label: 'Phun mày / phun môi' },
  { value: 'Nail / mi / lash', label: 'Nail / mi / lash' },
  { value: 'Gói combo spa VIP', label: 'Gói combo spa VIP' },
  { value: 'Liệu trình detox / xông hơi', label: 'Liệu trình detox / xông hơi' },
];

export const TARGET_AUDIENCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'Nữ 25–40, làm văn phòng', label: 'Nữ 25–40, làm văn phòng' },
  { value: 'Nữ 28–45, quan tâm da lão hóa', label: 'Nữ 28–45, quan tâm da lão hóa' },
  { value: 'Nam/nữ 30–50, stress cao, mỏi cơ', label: 'Nam/nữ 30–50, stress cao, mỏi cơ' },
  { value: 'Cô dâu / chuẩn bị đám cưới', label: 'Cô dâu / chuẩn bị đám cưới' },
  {
    value: 'Mẹ bỉm, ít thời gian chăm sóc bản thân',
    label: 'Mẹ bỉm, ít thời gian chăm sóc bản thân',
  },
  { value: 'Sinh viên / người mới đi làm', label: 'Sinh viên / người mới đi làm' },
  { value: 'Khách hàng cao cấp (VIP)', label: 'Khách hàng cao cấp (VIP)' },
  { value: 'Kinh doanh online / freelancer', label: 'Kinh doanh online / freelancer' },
  { value: 'Nam giới quan tâm grooming', label: 'Nam giới quan tâm grooming' },
];

export const PERSONAL_POST_TOPIC_OPTIONS: { value: string; label: string }[] = [
  {
    value: 'Học cách chấp nhận bản thân sau tuổi 30',
    label: 'Học cách chấp nhận bản thân sau tuổi 30',
  },
  {
    value: 'Bài học về sự kiên nhẫn trong công việc',
    label: 'Bài học về sự kiên nhẫn trong công việc',
  },
  { value: 'Góc nhìn về thành công và thất bại', label: 'Góc nhìn về thành công và thất bại' },
  {
    value: 'Chăm sóc bản thân giữa guồng quay bận rộn',
    label: 'Chăm sóc bản thân giữa guồng quay bận rộn',
  },
  { value: 'Hành trình khởi nghiệp / làm chủ spa', label: 'Hành trình khởi nghiệp / làm chủ spa' },
  { value: 'Kinh nghiệm làm nghề spa / làm đẹp', label: 'Kinh nghiệm làm nghề spa / làm đẹp' },
  { value: 'Động lực cho ngày mới', label: 'Động lực cho ngày mới' },
  { value: 'Triết lý sống đơn giản, ít so sánh', label: 'Triết lý sống đơn giản, ít so sánh' },
  {
    value: 'Thay đổi thói quen nhỏ tạo khác biệt lớn',
    label: 'Thay đổi thói quen nhỏ tạo khác biệt lớn',
  },
  {
    value: 'Góc nhìn về làm đẹp tự nhiên, không vội',
    label: 'Góc nhìn về làm đẹp tự nhiên, không vội',
  },
  { value: 'Cân bằng công việc và cuộc sống', label: 'Cân bằng công việc và cuộc sống' },
  {
    value: 'Chia sẻ kinh nghiệm chăm sóc khách hàng',
    label: 'Chia sẻ kinh nghiệm chăm sóc khách hàng',
  },
];

export const PERSONAL_READER_AUDIENCE_OPTIONS: { value: string; label: string }[] = [
  {
    value: 'Người trẻ làm văn phòng, đang tìm định hướng',
    label: 'Người trẻ làm văn phòng, đang tìm định hướng',
  },
  {
    value: 'Chủ spa / chủ salon đang xây thương hiệu',
    label: 'Chủ spa / chủ salon đang xây thương hiệu',
  },
  { value: 'Nhân viên ngành làm đẹp / spa', label: 'Nhân viên ngành làm đẹp / spa' },
  {
    value: 'Phụ nữ 25–40, quan tâm chăm sóc bản thân',
    label: 'Phụ nữ 25–40, quan tâm chăm sóc bản thân',
  },
  { value: 'Mẹ bỉm / người bận rộn ít thời gian', label: 'Mẹ bỉm / người bận rộn ít thời gian' },
  { value: 'Gen Z / sinh viên', label: 'Gen Z / sinh viên' },
  { value: 'Người đang khởi nghiệp hoặc đổi nghề', label: 'Người đang khởi nghiệp hoặc đổi nghề' },
  {
    value: 'Người thích đọc câu chuyện cảm hứng đời thường',
    label: 'Người thích đọc câu chuyện cảm hứng đời thường',
  },
  { value: 'Đồng nghiệp trong ngành wellness', label: 'Đồng nghiệp trong ngành wellness' },
  {
    value: 'Cộng đồng khách quen / người theo dõi local',
    label: 'Cộng đồng khách quen / người theo dõi local',
  },
];

export const OFFER_PERCENT_OPTIONS: { value: string; label: string }[] = [
  10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
].map((p) => ({
  value: `Giảm ${p}%`,
  label: `Giảm ${p}%`,
}));

export const AD_OBJECTIVE_OPTIONS: {
  value: AdObjective;
  label: string;
  description: string;
  defaultContentType: AdContentType;
  defaultCta: string;
}[] = [
  {
    value: 'messages',
    label: 'Quảng cáo tin nhắn',
    description: 'Kéo khách inbox',
    defaultContentType: 'inbox',
    defaultCta: 'Inbox "TƯ VẤN" để được tư vấn miễn phí',
  },
  {
    value: 'engagement',
    label: 'Quảng cáo tương tác',
    description: 'Tăng like/comment/share',
    defaultContentType: 'hook_3s',
    defaultCta: 'Comment ý kiến của bạn — bạn đồng ý không?',
  },
  {
    value: 'lead_form',
    label: 'Quảng cáo lead form',
    description: 'Lấy số điện thoại/thông tin khách',
    defaultContentType: 'lead',
    defaultCta: 'Để lại SĐT — tư vấn miễn phí trong ngày',
  },
  {
    value: 'landing_conversion',
    label: 'Quảng cáo chuyển đổi landing page',
    description: 'Kéo khách vào landing page để đăng ký/mua hàng',
    defaultContentType: 'lead',
    defaultCta: 'Click link bio / landing để đăng ký nhận ưu đãi',
  },
  {
    value: 'direct_sales',
    label: 'Quảng cáo bán hàng trực tiếp',
    description: 'Viết content chốt đơn',
    defaultContentType: 'sales',
    defaultCta: 'Đặt lịch ngay — ưu đãi có hạn',
  },
  {
    value: 'remarketing',
    label: 'Quảng cáo remarketing',
    description: 'Bám đuổi khách đã tương tác',
    defaultContentType: 'remarketing',
    defaultCta: 'Quay lại hôm nay — inbox "QUAY LẠI" nhận quà',
  },
  {
    value: 'brand_awareness',
    label: 'Quảng cáo nhận diện thương hiệu',
    description: 'Tăng độ nhận biết thương hiệu',
    defaultContentType: 'case_study',
    defaultCta: 'Follow để xem thêm hành trình thương hiệu',
  },
];

export interface AdCtaSuggestion {
  cta: string;
  alternatives: string[];
  source: 'ai' | 'template';
}
