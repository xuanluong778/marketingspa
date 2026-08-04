import type {
  AdObjective,
  AdPostKind,
  AdvancedFormState,
  ContentFormState,
  ContentHistoryItem,
  ContentStudioTab,
  PersonalFormState,
} from '@/types/content-marketing';
import {
  AD_OBJECTIVE_OPTIONS,
  emptyAdProductDetails,
  emptyAdServiceDetails,
} from '@/types/content-marketing';
import { withLegacyIndustryFallback } from '@/lib/content-industry';

export function normalizeAdObjective(raw?: string): AdObjective | '' {
  if (!raw?.trim()) return '';
  const v = raw.trim();
  const found = AD_OBJECTIVE_OPTIONS.find((o) => o.value === v);
  if (found) return found.value;
  const lower = v.toLowerCase();
  if (/inbox|tin nhắn|nhắn|kéo inbox/i.test(lower)) return 'messages';
  if (/tương tác|comment|like|share/i.test(lower)) return 'engagement';
  if (/lead|form|sđt|số điện thoại/i.test(lower)) return 'lead_form';
  if (/landing|chuyển đổi/i.test(lower)) return 'landing_conversion';
  if (/bán hàng|chốt|sales/i.test(lower)) return 'direct_sales';
  if (/remarketing|bám|quay lại/i.test(lower)) return 'remarketing';
  if (/nhận diện|thương hiệu|brand/i.test(lower)) return 'brand_awareness';
  return '';
}

function normalizeContentFormState(state: ContentFormState): ContentFormState {
  const adObjective = normalizeAdObjective(state.adObjective as string);
  const opt = AD_OBJECTIVE_OPTIONS.find((o) => o.value === adObjective);
  const adPostKind: AdPostKind =
    state.adPostKind === 'service' || state.adPostKind === 'product'
      ? state.adPostKind
      : 'product';
  return {
    ...state,
    adPostKind,
    brandName: state.brandName ?? '',
    productDetails: { ...emptyAdProductDetails(), ...(state.productDetails ?? {}) },
    serviceDetails: { ...emptyAdServiceDetails(), ...(state.serviceDetails ?? {}) },
    adObjective,
    adContentType: opt?.defaultContentType ?? state.adContentType,
  };
}

export const defaultContentFormState: ContentFormState = {
  adPostKind: 'product',
  brandName: '',
  productService: '',
  targetAudience: '',
  painPoints: '',
  benefits: '',
  offer: '',
  adObjective: '',
  platform: 'facebook',
  cta: '',
  tone: 'friendly',
  adContentType: 'sales',
  personalPostType: 'personal_story',
  videoUrl: '',
  transcript: '',
  industryId: '',
  industryName: '',
  customIndustry: '',
  productDetails: emptyAdProductDetails(),
  serviceDetails: emptyAdServiceDetails(),
};

export const sampleAdFormState: ContentFormState = {
  adPostKind: 'product',
  brandName: 'Spa Demo',
  productService: 'Liệu trình trẻ hóa da chuyên sâu',
  targetAudience: 'Nữ 28–45, quan tâm da lão hóa',
  painPoints: 'Da xỉn màu, lỗ chân lông to, makeup không ăn',
  benefits: 'Da sáng hơn, makeup mịn, thư giãn sau liệu trình',
  offer: 'Giảm 30%',
  adObjective: 'messages',
  platform: 'facebook',
  cta: 'Inbox "TƯ VẤN" để nhận tư vấn miễn phí',
  tone: 'empathetic',
  adContentType: 'inbox',
  personalPostType: 'personal_story',
  videoUrl: '',
  transcript: '',
  industryId: '',
  industryName: 'Spa / Làm đẹp',
  customIndustry: '',
  productDetails: {
    ...emptyAdProductDetails(),
    name: 'Liệu trình trẻ hóa da chuyên sâu',
    category: 'Chăm sóc da',
    features: 'Công nghệ RF + serum phục hồi',
    benefits: 'Da sáng hơn, makeup mịn, thư giãn',
    differentiators: 'Liệu trình cá nhân hóa theo loại da',
    price: 'Từ 1.290.000đ',
    warranty: 'Theo dõi sau liệu trình 7 ngày',
    proof: 'Hơn 500 khách đã trải nghiệm',
    offer: 'Giảm 30%',
  },
  serviceDetails: emptyAdServiceDetails(),
};

export const defaultPersonalFormState: PersonalFormState = {
  creationMode: 'topic',
  topicGroupId: '',
  topicGroupLabel: '',
  suggestedTopics: [],
  selectedSubtopic: '',
  postTopic: '',
  useCustomTopic: false,
  generatedTitles: [],
  selectedTitle: '',
  titleCount: 5,
  isGeneratingTitles: false,
  targetAudience: '',
  postGoal: 'personal_branding',
  personalPostType: 'personal_story',
  personalTone: 'mild_edgy',
  brandArticleGenre: 'life_lesson',
  brandPronoun: 'auto',
  brandVoiceIntensity: 'edgy',
  postLength: 'medium',
  personalAngle: '',
  storyIdea: '',
  videoUrl: '',
  transcript: '',
  opinionSourceUrl: '',
  opinionSourceText: '',
  opinionSummary: '',
  opinionDebateIssue: '',
  opinionStance: 'multi',
  opinionStanceCustom: '',
  opinionAngle: 'life',
  opinionPronoun: 'toi_cac_ban',
  opinionIntensity: 'frank',
  opinionLength: 'facebook',
  opinionThesis: '',
  opinionConfirmedFacts: [],
  opinionUnverifiedClaims: [],
  opinionCommonPhrases: '',
  opinionHideNames: false,
  opinionAvoidWords: '',
  opinionOpeningPhrases: '',
  opinionClosingPhrases: '',
  opinionSampleParagraph: '',
  opinionThemeId: 'clip_life_comment',
  opinionSubtopic: '',
  opinionQuickAngleId: '',
  opinionSuggestedAngles: [],
  opinionPickedSuggestedAngle: '',
  opinionSuggestedSubtopics: [],
  opinionGeneratedTitles: [],
  opinionSelectedTitle: '',
  opinionTitleCount: 10 as 5 | 10,
  opinionIsGeneratingTitles: false,
  opinionUseCustomStory: false,
};

export const samplePersonalFormState: PersonalFormState = {
  ...defaultPersonalFormState,
  creationMode: 'topic',
  topicGroupId: 'failure_lessons',
  topicGroupLabel: 'Bài học từ thất bại',
  suggestedTopics: [
    'Lần thất bại lớn nhất tôi từng trải qua',
    'Sai lầm khiến tôi mất thời gian quý nhất',
    'Khi kế hoạch đẹp đẽ sụp đổ trong một đêm',
    'Tôi từng bỏ cuộc — và vì sao tôi quay lại',
    'Thất bại dạy tôi khiêm tốn thế nào',
  ],
  selectedSubtopic: 'Lần thất bại lớn nhất tôi từng trải qua',
  postTopic: 'Lần thất bại lớn nhất tôi từng trải qua',
  useCustomTopic: false,
  targetAudience: 'Người đang tìm động lực thay đổi',
  postGoal: 'personal_branding',
  personalPostType: 'personal_story',
  personalTone: 'mild_edgy',
  brandArticleGenre: 'success_failure',
  brandPronoun: 'ban_toi',
  brandVoiceIntensity: 'edgy',
  postLength: 'medium',
  personalAngle: 'Thất bại không định nghĩa bạn — cách bạn đứng dậy mới định nghĩa',
  storyIdea:
    'Kể một lần kế hoạch thất bại cụ thể, khó khăn gặp phải, cách xử lý, bài học và thông điệp truyền động lực — không bịa số liệu',
};

export const defaultAdvancedFormState: AdvancedFormState = {
  productService: '',
  price: '',
  combo: '',
  gift: '',
  offerDeadline: '',
  salesArea: '',
  certification: '',
  caseStudy: '',
  painPoints: '',
  desires: '',
  differentiator: '',
  ctaType: 'inbox',
  writingStyle: 'expert_consultant',
  demographic: 'female_25_35',
  articleGoal: 'direct_sales',
  postLength: 'medium',
  industryId: '',
  industryName: '',
  customIndustry: '',
};

export const sampleAdvancedFormState: AdvancedFormState = {
  productService: 'Liệu trình trị nám chuyên sâu 8 buổi',
  price: '2.990.000đ',
  combo: 'Mua 8 buổi tặng 2 buổi chăm sóc da',
  gift: 'Tặng serum vitamin C mini',
  offerDeadline: '31/12/2026',
  salesArea: 'Quận 1, TP.HCM',
  certification: 'Quy trình chuẩn spa, sản phẩm có nguồn gốc rõ ràng',
  caseStudy: 'Chị Lan (35 tuổi) sau 6 buổi thấy da sáng hơn, vết nám mờ dần (tùy cơ địa)',
  painPoints: 'Da nám xỉn, makeup không che được, tự ti khi giao tiếp',
  desires: 'Da sáng đều, tự tin không cần che khuyết điểm dày',
  differentiator: 'Chuyên viên 8 năm kinh nghiệm, máy công nghệ Hàn, không gian riêng tư',
  ctaType: 'inbox',
  writingStyle: 'transformation_story',
  demographic: 'female_35_45',
  articleGoal: 'fanpage',
  postLength: 'medium',
  industryId: '',
  industryName: 'Spa / Làm đẹp',
  customIndustry: '',
};

function advancedDraftKey(userId?: string | null): string {
  return `ms_advanced_post_draft_${userId?.trim() || 'guest'}`;
}

export function saveAdvancedDraft(state: AdvancedFormState, userId?: string | null): void {
  const existing = loadAdvancedWorkspaceDraft(userId) ?? emptyAdvancedWorkspaceDraft();
  saveAdvancedWorkspaceDraft({ ...existing, form: state }, userId);
}

export function loadAdvancedDraft(userId?: string | null): AdvancedFormState | null {
  return loadAdvancedWorkspaceDraft(userId)?.form ?? null;
}

function personalDraftKey(userId?: string | null): string {
  return `ms_personal_post_draft_${userId?.trim() || 'guest'}`;
}

/** Form + generated content — survives F5 until “Làm mới”. */
export type PersonalWorkspaceDraft = {
  version: 2;
  form: PersonalFormState;
  content: string;
  videoScript: string;
  videoHook: string;
  originalContent: string;
  originalScript: string;
  opinionWarnings: string[];
  showCompare: boolean;
  savedContentId: string | null;
  variants: string[];
  hooks: string[];
  openers: string[];
  punchlines: string[];
  angleAlternatives: string[];
  storyAlternatives: string[];
  lastGeneratedAt?: string;
  scoreResult: unknown | null;
  naturalness: unknown | null;
  videoAnalysis: unknown | null;
  policySnapshot: unknown | null;
};

export const emptyPersonalWorkspaceDraft = (): PersonalWorkspaceDraft => ({
  version: 2,
  form: { ...defaultPersonalFormState },
  content: '',
  videoScript: '',
  videoHook: '',
  originalContent: '',
  originalScript: '',
  opinionWarnings: [],
  showCompare: false,
  savedContentId: null,
  variants: [],
  hooks: [],
  openers: [],
  punchlines: [],
  angleAlternatives: [],
  storyAlternatives: [],
  lastGeneratedAt: undefined,
  scoreResult: null,
  naturalness: null,
  videoAnalysis: null,
  policySnapshot: null,
});

function stripLegacyIndustryFields(parsed: Record<string, unknown>): Partial<PersonalFormState> {
  const next = { ...parsed };
  delete next.industryId;
  delete next.industryName;
  delete next.customIndustry;
  return next as Partial<PersonalFormState>;
}

function normalizePersonalFormFromRaw(
  parsed: Partial<PersonalFormState> & Record<string, unknown>,
): PersonalFormState {
  const rest = stripLegacyIndustryFields(parsed as Record<string, unknown>);
  return {
    ...defaultPersonalFormState,
    ...rest,
    topicGroupId: rest.topicGroupId ?? '',
    topicGroupLabel: rest.topicGroupLabel ?? '',
    suggestedTopics: Array.isArray(rest.suggestedTopics) ? rest.suggestedTopics : [],
    selectedSubtopic: rest.selectedSubtopic ?? '',
    useCustomTopic: Boolean(rest.useCustomTopic),
    postTopic: rest.postTopic ?? '',
    generatedTitles: Array.isArray(rest.generatedTitles) ? rest.generatedTitles : [],
    selectedTitle: rest.selectedTitle ?? '',
    titleCount: ([5, 10, 20] as const).includes(rest.titleCount as 5 | 10 | 20)
      ? (rest.titleCount as 5 | 10 | 20)
      : 5,
    isGeneratingTitles: false,
    creationMode: rest.creationMode === 'opinion' ? 'opinion' : 'topic',
    opinionSourceUrl: rest.opinionSourceUrl ?? '',
    opinionSourceText: rest.opinionSourceText ?? '',
    opinionSummary: rest.opinionSummary ?? '',
    opinionDebateIssue: rest.opinionDebateIssue ?? '',
    opinionStance: rest.opinionStance ?? 'multi',
    opinionStanceCustom: rest.opinionStanceCustom ?? '',
    opinionAngle: rest.opinionAngle ?? 'life',
    opinionPronoun: rest.opinionPronoun ?? 'toi_cac_ban',
    opinionIntensity: (
      ['gentle', 'deep', 'frank', 'emotional', 'motivational', 'strong'] as const
    ).includes(rest.opinionIntensity as PersonalFormState['opinionIntensity'])
      ? (rest.opinionIntensity as PersonalFormState['opinionIntensity'])
      : 'frank',
    opinionLength: (['1min', '3min', '5min', 'facebook'] as const).includes(
      rest.opinionLength as PersonalFormState['opinionLength'],
    )
      ? (rest.opinionLength as PersonalFormState['opinionLength'])
      : 'facebook',
    opinionThesis: rest.opinionThesis ?? '',
    opinionConfirmedFacts: Array.isArray(rest.opinionConfirmedFacts)
      ? rest.opinionConfirmedFacts.filter(Boolean).map(String)
      : [],
    opinionUnverifiedClaims: Array.isArray(rest.opinionUnverifiedClaims)
      ? rest.opinionUnverifiedClaims.filter(Boolean).map(String)
      : [],
    opinionCommonPhrases:
      typeof rest.opinionCommonPhrases === 'string' ? rest.opinionCommonPhrases : '',
    opinionHideNames: Boolean(rest.opinionHideNames),
    opinionAvoidWords: typeof rest.opinionAvoidWords === 'string' ? rest.opinionAvoidWords : '',
    opinionOpeningPhrases:
      typeof rest.opinionOpeningPhrases === 'string' ? rest.opinionOpeningPhrases : '',
    opinionClosingPhrases:
      typeof rest.opinionClosingPhrases === 'string' ? rest.opinionClosingPhrases : '',
    opinionSampleParagraph:
      typeof rest.opinionSampleParagraph === 'string' ? rest.opinionSampleParagraph : '',
    opinionThemeId:
      typeof rest.opinionThemeId === 'string' && rest.opinionThemeId
        ? rest.opinionThemeId
        : 'clip_life_comment',
    opinionSubtopic: typeof rest.opinionSubtopic === 'string' ? rest.opinionSubtopic : '',
    opinionQuickAngleId:
      typeof rest.opinionQuickAngleId === 'string' ? rest.opinionQuickAngleId : '',
    opinionSuggestedAngles: Array.isArray(rest.opinionSuggestedAngles)
      ? rest.opinionSuggestedAngles.filter((s): s is string => typeof s === 'string')
      : [],
    opinionPickedSuggestedAngle:
      typeof rest.opinionPickedSuggestedAngle === 'string' ? rest.opinionPickedSuggestedAngle : '',
    opinionSuggestedSubtopics: Array.isArray(rest.opinionSuggestedSubtopics)
      ? rest.opinionSuggestedSubtopics.filter((s): s is string => typeof s === 'string')
      : [],
    opinionGeneratedTitles: Array.isArray(rest.opinionGeneratedTitles)
      ? rest.opinionGeneratedTitles.filter((s): s is string => typeof s === 'string')
      : [],
    opinionSelectedTitle:
      typeof rest.opinionSelectedTitle === 'string' ? rest.opinionSelectedTitle : '',
    opinionTitleCount:
      rest.opinionTitleCount === 5 || rest.opinionTitleCount === 10 ? rest.opinionTitleCount : 10,
    opinionIsGeneratingTitles: false,
    opinionUseCustomStory: Boolean(rest.opinionUseCustomStory),
  };
}

export function savePersonalWorkspaceDraft(
  draft: Omit<PersonalWorkspaceDraft, 'version'> & { version?: 2 },
  userId?: string | null,
  options?: { force?: boolean },
): void {
  if (typeof window === 'undefined') return;
  let nextDraft = draft;
  try {
    // Guard: never wipe a non-empty saved article with an empty payload (hydrate/generate races).
    // Still allow form / metadata updates by merging the previous content fields.
    if (!options?.force && !(draft.content || '').trim()) {
      const raw = localStorage.getItem(personalDraftKey(userId));
      if (raw) {
        const existing = JSON.parse(raw) as Partial<PersonalWorkspaceDraft>;
        if (typeof existing.content === 'string' && existing.content.trim()) {
          nextDraft = {
            ...draft,
            content: existing.content,
            videoScript:
              typeof existing.videoScript === 'string' ? existing.videoScript : draft.videoScript,
            videoHook: typeof existing.videoHook === 'string' ? existing.videoHook : draft.videoHook,
            scoreResult: draft.scoreResult ?? existing.scoreResult ?? null,
            videoAnalysis: draft.videoAnalysis ?? existing.videoAnalysis ?? null,
            policySnapshot: draft.policySnapshot ?? existing.policySnapshot ?? null,
            lastGeneratedAt: draft.lastGeneratedAt ?? existing.lastGeneratedAt,
            savedContentId: draft.savedContentId ?? existing.savedContentId ?? null,
          };
        }
      }
    }
  } catch {
    /* continue save */
  }
  const payload: PersonalWorkspaceDraft = {
    ...emptyPersonalWorkspaceDraft(),
    ...nextDraft,
    version: 2,
    form: {
      ...nextDraft.form,
      isGeneratingTitles: false,
      opinionIsGeneratingTitles: false,
    },
  };
  try {
    localStorage.setItem(personalDraftKey(userId), JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function loadPersonalWorkspaceDraft(userId?: string | null): PersonalWorkspaceDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(personalDraftKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && parsed.version === 2 && parsed.form && typeof parsed.form === 'object') {
      const form = normalizePersonalFormFromRaw(parsed.form as Partial<PersonalFormState>);
      return {
        ...emptyPersonalWorkspaceDraft(),
        version: 2,
        form,
        content: typeof parsed.content === 'string' ? parsed.content : '',
        videoScript: typeof parsed.videoScript === 'string' ? parsed.videoScript : '',
        videoHook: typeof parsed.videoHook === 'string' ? parsed.videoHook : '',
        originalContent: typeof parsed.originalContent === 'string' ? parsed.originalContent : '',
        originalScript: typeof parsed.originalScript === 'string' ? parsed.originalScript : '',
        opinionWarnings: Array.isArray(parsed.opinionWarnings)
          ? parsed.opinionWarnings.filter((s): s is string => typeof s === 'string')
          : [],
        showCompare: Boolean(parsed.showCompare),
        savedContentId: typeof parsed.savedContentId === 'string' ? parsed.savedContentId : null,
        variants: Array.isArray(parsed.variants)
          ? parsed.variants.filter((s): s is string => typeof s === 'string')
          : [],
        hooks: Array.isArray(parsed.hooks)
          ? parsed.hooks.filter((s): s is string => typeof s === 'string')
          : [],
        openers: Array.isArray(parsed.openers)
          ? parsed.openers.filter((s): s is string => typeof s === 'string')
          : [],
        punchlines: Array.isArray(parsed.punchlines)
          ? parsed.punchlines.filter((s): s is string => typeof s === 'string')
          : [],
        angleAlternatives: Array.isArray(parsed.angleAlternatives)
          ? parsed.angleAlternatives.filter((s): s is string => typeof s === 'string')
          : [],
        storyAlternatives: Array.isArray(parsed.storyAlternatives)
          ? parsed.storyAlternatives.filter((s): s is string => typeof s === 'string')
          : [],
        lastGeneratedAt:
          typeof parsed.lastGeneratedAt === 'string' ? parsed.lastGeneratedAt : undefined,
        scoreResult: parsed.scoreResult ?? null,
        naturalness: parsed.naturalness ?? null,
        videoAnalysis: parsed.videoAnalysis ?? null,
        policySnapshot: parsed.policySnapshot ?? null,
      };
    }
    // Legacy: form-only JSON
    return {
      ...emptyPersonalWorkspaceDraft(),
      form: normalizePersonalFormFromRaw(parsed as Partial<PersonalFormState>),
    };
  } catch {
    return null;
  }
}

/** @deprecated Prefer savePersonalWorkspaceDraft — kept for callers that only patch form. */
export function savePersonalDraft(state: PersonalFormState, userId?: string | null): void {
  const existing = loadPersonalWorkspaceDraft(userId) ?? emptyPersonalWorkspaceDraft();
  savePersonalWorkspaceDraft({ ...existing, form: state }, userId);
}

export function clearPersonalDraft(userId?: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(personalDraftKey(userId));
  } catch {
    /* ignore */
  }
}

export function loadPersonalDraft(userId?: string | null): PersonalFormState | null {
  return loadPersonalWorkspaceDraft(userId)?.form ?? null;
}

function historyKey(userId?: string | null): string {
  return `ms_content_studio_history_${userId?.trim() || 'guest'}`;
}

function draftKey(userId?: string | null, tab?: ContentStudioTab): string {
  return `ms_content_studio_draft_${userId?.trim() || 'guest'}_${tab ?? 'ad'}`;
}

export function saveContentDraft(
  state: ContentFormState,
  userId?: string | null,
  tab: ContentStudioTab = 'ad',
): void {
  if (typeof window === 'undefined') return;
  if (tab === 'ad') {
    const existing = loadAdWorkspaceDraft(userId) ?? emptyAdWorkspaceDraft();
    saveAdWorkspaceDraft({ ...existing, form: state }, userId);
    return;
  }
  localStorage.setItem(draftKey(userId, tab), JSON.stringify(state));
}

export function loadContentDraft(
  userId?: string | null,
  tab: ContentStudioTab = 'ad',
): ContentFormState | null {
  if (typeof window === 'undefined') return null;
  if (tab === 'ad') {
    return loadAdWorkspaceDraft(userId)?.form ?? null;
  }
  try {
    const raw = localStorage.getItem(draftKey(userId, tab));
    if (!raw) return null;
    return normalizeContentFormState({ ...defaultContentFormState, ...JSON.parse(raw) });
  } catch {
    return null;
  }
}

/** Ad tab: form + generated content — survives F5 until “Làm mới”. */
export type AdWorkspaceDraft = {
  /** Storage format version (2 = legacy workspace, 3 = product/service + schemaVersion). */
  version: 2 | 3;
  /** Explicit schema for migrations; new drafts use 3. */
  schemaVersion: number;
  form: ContentFormState;
  content: string;
  variants: string[];
  hooks: string[];
  ctas: string[];
  headline?: string;
  shortDescription?: string;
  mediaSuggestions?: string[];
  lastGeneratedAt?: string;
  scoreResult: unknown | null;
  policy: unknown | null;
  videoAnalysis: unknown | null;
};

export const AD_WORKSPACE_SCHEMA_VERSION = 3;

export const emptyAdWorkspaceDraft = (): AdWorkspaceDraft => ({
  version: 3,
  schemaVersion: AD_WORKSPACE_SCHEMA_VERSION,
  form: { ...defaultContentFormState },
  content: '',
  variants: [],
  hooks: [],
  ctas: [],
  headline: undefined,
  shortDescription: undefined,
  mediaSuggestions: undefined,
  lastGeneratedAt: undefined,
  scoreResult: null,
  policy: null,
  videoAnalysis: null,
});

function adWorkspaceKey(userId?: string | null): string {
  return `ms_ad_post_workspace_${userId?.trim() || 'guest'}`;
}

function migrateAdFormFromLegacy(raw: Partial<ContentFormState>): ContentFormState {
  const base = normalizeContentFormState({
    ...defaultContentFormState,
    ...raw,
    // Old drafts have no adPostKind — keep as product only for NEW empty; existing keep product default
    adPostKind:
      raw.adPostKind === 'service' || raw.adPostKind === 'product' ? raw.adPostKind : 'product',
    brandName: raw.brandName ?? '',
    productDetails: { ...emptyAdProductDetails(), ...(raw.productDetails ?? {}) },
    serviceDetails: { ...emptyAdServiceDetails(), ...(raw.serviceDetails ?? {}) },
  });
  // Seed product name from legacy productService if empty
  if (!base.productDetails.name.trim() && base.productService.trim()) {
    base.productDetails = { ...base.productDetails, name: base.productService };
  }
  return base;
}

export function saveAdWorkspaceDraft(
  draft: Omit<AdWorkspaceDraft, 'version' | 'schemaVersion'> & {
    version?: 2 | 3;
    schemaVersion?: number;
  },
  userId?: string | null,
  options?: { force?: boolean },
): void {
  if (typeof window === 'undefined') return;
  let nextDraft = draft;
  try {
    if (!options?.force && !(draft.content || '').trim()) {
      const raw = localStorage.getItem(adWorkspaceKey(userId));
      if (raw) {
        const existing = JSON.parse(raw) as Partial<AdWorkspaceDraft>;
        if (typeof existing.content === 'string' && existing.content.trim()) {
          nextDraft = {
            ...draft,
            content: existing.content,
            scoreResult: draft.scoreResult ?? existing.scoreResult ?? null,
            policy: draft.policy ?? existing.policy ?? null,
            videoAnalysis: draft.videoAnalysis ?? existing.videoAnalysis ?? null,
            lastGeneratedAt: draft.lastGeneratedAt ?? existing.lastGeneratedAt,
            variants: draft.variants?.length ? draft.variants : existing.variants ?? [],
            hooks: draft.hooks?.length ? draft.hooks : existing.hooks ?? [],
            ctas: draft.ctas?.length ? draft.ctas : existing.ctas ?? [],
            headline: draft.headline ?? existing.headline,
            shortDescription: draft.shortDescription ?? existing.shortDescription,
            mediaSuggestions: draft.mediaSuggestions?.length
              ? draft.mediaSuggestions
              : existing.mediaSuggestions,
          };
        }
      }
    }
  } catch {
    /* continue */
  }
  const payload: AdWorkspaceDraft = {
    ...emptyAdWorkspaceDraft(),
    ...nextDraft,
    version: 3,
    schemaVersion: AD_WORKSPACE_SCHEMA_VERSION,
    form: migrateAdFormFromLegacy({ ...defaultContentFormState, ...nextDraft.form }),
  };
  try {
    localStorage.setItem(adWorkspaceKey(userId), JSON.stringify(payload));
    localStorage.setItem(draftKey(userId, 'ad'), JSON.stringify(payload.form));
  } catch {
    /* quota */
  }
}

export function loadAdWorkspaceDraft(userId?: string | null): AdWorkspaceDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(adWorkspaceKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const ver = parsed?.version;
      if (parsed && (ver === 2 || ver === 3) && parsed.form && typeof parsed.form === 'object') {
        return {
          ...emptyAdWorkspaceDraft(),
          version: 3,
          schemaVersion:
            typeof parsed.schemaVersion === 'number'
              ? parsed.schemaVersion
              : AD_WORKSPACE_SCHEMA_VERSION,
          form: migrateAdFormFromLegacy(parsed.form as ContentFormState),
          content: typeof parsed.content === 'string' ? parsed.content : '',
          variants: Array.isArray(parsed.variants)
            ? parsed.variants.filter((s): s is string => typeof s === 'string')
            : [],
          hooks: Array.isArray(parsed.hooks)
            ? parsed.hooks.filter((s): s is string => typeof s === 'string')
            : [],
          ctas: Array.isArray(parsed.ctas)
            ? parsed.ctas.filter((s): s is string => typeof s === 'string')
            : [],
          headline: typeof parsed.headline === 'string' ? parsed.headline : undefined,
          shortDescription:
            typeof parsed.shortDescription === 'string' ? parsed.shortDescription : undefined,
          mediaSuggestions: Array.isArray(parsed.mediaSuggestions)
            ? parsed.mediaSuggestions.filter((s): s is string => typeof s === 'string')
            : undefined,
          lastGeneratedAt:
            typeof parsed.lastGeneratedAt === 'string' ? parsed.lastGeneratedAt : undefined,
          scoreResult: parsed.scoreResult ?? null,
          policy: parsed.policy ?? null,
          videoAnalysis: parsed.videoAnalysis ?? null,
        };
      }
    }
    const formOnly = localStorage.getItem(draftKey(userId, 'ad'));
    if (!formOnly) return null;
    return {
      ...emptyAdWorkspaceDraft(),
      form: migrateAdFormFromLegacy({
        ...defaultContentFormState,
        ...JSON.parse(formOnly),
      }),
    };
  } catch {
    return null;
  }
}

export function clearAdWorkspaceDraft(userId?: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(adWorkspaceKey(userId));
    localStorage.removeItem(draftKey(userId, 'ad'));
  } catch {
    /* ignore */
  }
}

/** Ensure inactive product/service side is empty before generate/save payload. */
export function normalizeAdFormExclusive(form: ContentFormState): ContentFormState {
  const kind: AdPostKind = form.adPostKind === 'service' ? 'service' : 'product';
  if (kind === 'product') {
    return { ...form, adPostKind: 'product', serviceDetails: emptyAdServiceDetails() };
  }
  return { ...form, adPostKind: 'service', productDetails: emptyAdProductDetails() };
}

export function assertAdFormExclusive(form: ContentFormState): string | null {
  const normalized = normalizeAdFormExclusive(form);
  const hasProductBits = Object.values(normalized.productDetails).some((v) => String(v).trim());
  const hasServiceBits = Object.values(normalized.serviceDetails).some((v) => String(v).trim());
  if (normalized.adPostKind === 'product' && !hasProductBits && !normalized.productService.trim()) {
    return 'Vui lòng nhập tên sản phẩm.';
  }
  if (normalized.adPostKind === 'service' && !hasServiceBits && !normalized.productService.trim()) {
    return 'Vui lòng nhập tên dịch vụ.';
  }
  return null;
}

/** Build API payload: never send both product and service details. */
export function buildAdGeneratePayload(form: ContentFormState, mode: ContentStudioTab) {
  const exclusive = normalizeAdFormExclusive(form);
  const kind: AdPostKind = exclusive.adPostKind === 'service' ? 'service' : 'product';
  const name =
    kind === 'product'
      ? exclusive.productDetails.name.trim() || exclusive.productService.trim()
      : exclusive.serviceDetails.name.trim() || exclusive.productService.trim();

  const base = {
    mode,
    adPostKind: kind,
    brandName: exclusive.brandName.trim() || undefined,
    productService: name || exclusive.productService,
    targetAudience:
      kind === 'service'
        ? exclusive.serviceDetails.suitableCustomers || exclusive.targetAudience || undefined
        : exclusive.targetAudience || undefined,
    painPoints:
      kind === 'service'
        ? exclusive.serviceDetails.problems || exclusive.painPoints || undefined
        : exclusive.painPoints || undefined,
    benefits:
      kind === 'product'
        ? exclusive.productDetails.benefits || exclusive.benefits || undefined
        : exclusive.serviceDetails.expectedBenefits || exclusive.benefits || undefined,
    offer:
      kind === 'product'
        ? exclusive.productDetails.offer || exclusive.offer || undefined
        : exclusive.serviceDetails.offer || exclusive.offer || undefined,
    adObjective: exclusive.adObjective || undefined,
    platform: exclusive.platform,
    cta: exclusive.cta || undefined,
    tone: exclusive.tone,
    adContentType: exclusive.adContentType,
    personalPostType: exclusive.personalPostType,
    videoUrl: exclusive.videoUrl || undefined,
    transcript: exclusive.transcript || undefined,
    industryId: exclusive.industryId || undefined,
    industryName: exclusive.industryName || undefined,
    customIndustry: exclusive.customIndustry || undefined,
  };

  if (kind === 'product') {
    return {
      ...base,
      product: {
        name: exclusive.productDetails.name || name,
        category: exclusive.productDetails.category || undefined,
        features: exclusive.productDetails.features || undefined,
        benefits: exclusive.productDetails.benefits || exclusive.benefits || undefined,
        differentiators: exclusive.productDetails.differentiators || undefined,
        price: exclusive.productDetails.price || undefined,
        warranty: exclusive.productDetails.warranty || undefined,
        proof: exclusive.productDetails.proof || undefined,
        offer: exclusive.productDetails.offer || exclusive.offer || undefined,
      },
    };
  }

  return {
    ...base,
    service: {
      name: exclusive.serviceDetails.name || name,
      suitableCustomers:
        exclusive.serviceDetails.suitableCustomers || exclusive.targetAudience || undefined,
      problems: exclusive.serviceDetails.problems || exclusive.painPoints || undefined,
      process: exclusive.serviceDetails.process || undefined,
      highlights: exclusive.serviceDetails.highlights || undefined,
      expectedBenefits:
        exclusive.serviceDetails.expectedBenefits || exclusive.benefits || undefined,
      duration: exclusive.serviceDetails.duration || undefined,
      location: exclusive.serviceDetails.location || undefined,
      experts: exclusive.serviceDetails.experts || undefined,
      proof: exclusive.serviceDetails.proof || undefined,
      offer: exclusive.serviceDetails.offer || exclusive.offer || undefined,
    },
  };
}

/** Advanced tab: form + result — survives F5 until “Làm mới”. */
export type AdvancedWorkspaceDraft = {
  version: 2;
  form: AdvancedFormState;
  result: unknown | null;
  variantTab: string;
  titleOptions: string[];
};

export const emptyAdvancedWorkspaceDraft = (): AdvancedWorkspaceDraft => ({
  version: 2,
  form: { ...defaultAdvancedFormState },
  result: null,
  variantTab: 'main',
  titleOptions: [],
});

export function saveAdvancedWorkspaceDraft(
  draft: Omit<AdvancedWorkspaceDraft, 'version'> & { version?: 2 },
  userId?: string | null,
  options?: { force?: boolean },
): void {
  if (typeof window === 'undefined') return;
  let nextDraft = draft;
  try {
    const hasResult =
      nextDraft.result &&
      typeof nextDraft.result === 'object' &&
      typeof (nextDraft.result as { final_article?: string }).final_article === 'string' &&
      Boolean((nextDraft.result as { final_article?: string }).final_article?.trim());
    if (!options?.force && !hasResult) {
      const raw = localStorage.getItem(advancedDraftKey(userId));
      if (raw) {
        const existing = JSON.parse(raw) as Partial<AdvancedWorkspaceDraft>;
        if (
          existing.result &&
          typeof existing.result === 'object' &&
          typeof (existing.result as { final_article?: string }).final_article === 'string' &&
          (existing.result as { final_article?: string }).final_article?.trim()
        ) {
          nextDraft = {
            ...draft,
            result: existing.result,
            variantTab: draft.variantTab || existing.variantTab || 'main',
            titleOptions: draft.titleOptions?.length
              ? draft.titleOptions
              : existing.titleOptions ?? [],
          };
        }
      }
    }
  } catch {
    /* continue */
  }
  const payload: AdvancedWorkspaceDraft = {
    ...emptyAdvancedWorkspaceDraft(),
    ...nextDraft,
    version: 2,
    form: { ...defaultAdvancedFormState, ...nextDraft.form },
  };
  try {
    localStorage.setItem(advancedDraftKey(userId), JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function loadAdvancedWorkspaceDraft(userId?: string | null): AdvancedWorkspaceDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(advancedDraftKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && parsed.version === 2 && parsed.form && typeof parsed.form === 'object') {
      return {
        ...emptyAdvancedWorkspaceDraft(),
        version: 2,
        form: { ...defaultAdvancedFormState, ...(parsed.form as AdvancedFormState) },
        result: parsed.result ?? null,
        variantTab: typeof parsed.variantTab === 'string' ? parsed.variantTab : 'main',
        titleOptions: Array.isArray(parsed.titleOptions)
          ? parsed.titleOptions.filter((s): s is string => typeof s === 'string')
          : [],
      };
    }
    // Legacy form-only
    return {
      ...emptyAdvancedWorkspaceDraft(),
      form: { ...defaultAdvancedFormState, ...(parsed as unknown as AdvancedFormState) },
    };
  } catch {
    return null;
  }
}

export function clearAdvancedWorkspaceDraft(userId?: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(advancedDraftKey(userId));
  } catch {
    /* ignore */
  }
}

export function loadContentHistory(userId?: string | null): ContentHistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(historyKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ContentHistoryItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.id === 'string' && typeof item.content === 'string')
      .map((item) =>
        withLegacyIndustryFallback({
          id: item.id,
          tab: item.tab === 'personal' ? 'personal' : item.tab === 'advanced' ? 'advanced' : 'ad',
          title: (item.title ?? '').trim() || 'Không có tiêu đề',
          content: item.content ?? '',
          contentScore: Number.isFinite(item.contentScore) ? item.contentScore : 0,
          policyScore: Number.isFinite(item.policyScore) ? item.policyScore : 0,
          variantCount: Number.isFinite(item.variantCount) ? item.variantCount : 0,
          adsReadiness: item.adsReadiness ?? 'low',
          createdAt: item.createdAt ?? '',
          industryId: item.industryId ?? null,
          industryName: item.industryName ?? null,
          customIndustry: item.customIndustry ?? null,
          policyCheckId: item.policyCheckId,
          policyStatus: item.policyStatus,
          riskScore: item.riskScore,
          policyVersion: item.policyVersion,
          checkedAt: item.checkedAt,
          checkedContentHash: item.checkedContentHash,
          checkedMediaHash: item.checkedMediaHash,
          checkedLandingPageHash: item.checkedLandingPageHash,
          specialAdCategory: item.specialAdCategory,
          needsSpecialAdCategory: item.needsSpecialAdCategory,
          cta: item.cta,
          landingUrl: item.landingUrl,
          videoScript: typeof item.videoScript === 'string' ? item.videoScript : undefined,
          videoHook: typeof item.videoHook === 'string' ? item.videoHook : undefined,
        }),
      );
  } catch {
    return [];
  }
}

export function saveContentHistoryItem(item: ContentHistoryItem, userId?: string | null): void {
  if (typeof window === 'undefined') return;
  const prev = loadContentHistory(userId);
  const next = [item, ...prev].slice(0, 50);
  localStorage.setItem(historyKey(userId), JSON.stringify(next));
}

export function upsertContentHistoryItem(item: ContentHistoryItem, userId?: string | null): void {
  if (typeof window === 'undefined') return;
  const prev = loadContentHistory(userId).filter((x) => x.id !== item.id);
  const next = [item, ...prev].slice(0, 50);
  localStorage.setItem(historyKey(userId), JSON.stringify(next));
}

export function deleteContentHistoryItem(id: string, userId?: string | null): void {
  if (typeof window === 'undefined') return;
  const prev = loadContentHistory(userId);
  const next = prev.filter((item) => item.id !== id);
  localStorage.setItem(historyKey(userId), JSON.stringify(next));
}

export function createHistoryId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
