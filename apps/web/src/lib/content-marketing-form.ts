import type {
  AdObjective,
  AdvancedFormState,
  ContentFormState,
  ContentHistoryItem,
  ContentStudioTab,
  PersonalFormState,
} from '@/types/content-marketing';
import { AD_OBJECTIVE_OPTIONS } from '@/types/content-marketing';
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
  return {
    ...state,
    adObjective,
    adContentType: opt?.defaultContentType ?? state.adContentType,
  };
}

export const defaultContentFormState: ContentFormState = {
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
};

export const sampleAdFormState: ContentFormState = {
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
  if (typeof window === 'undefined') return;
  localStorage.setItem(advancedDraftKey(userId), JSON.stringify(state));
}

export function loadAdvancedDraft(userId?: string | null): AdvancedFormState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(advancedDraftKey(userId));
    if (!raw) return null;
    return { ...defaultAdvancedFormState, ...JSON.parse(raw) };
  } catch {
    return null;
  }
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
  try {
    // Guard: never wipe a non-empty saved article with an empty payload (hydrate/generate races)
    if (!options?.force && !(draft.content || '').trim()) {
      const raw = localStorage.getItem(personalDraftKey(userId));
      if (raw) {
        const existing = JSON.parse(raw) as { content?: string };
        if (typeof existing.content === 'string' && existing.content.trim()) {
          return;
        }
      }
    }
  } catch {
    /* continue save */
  }
  const payload: PersonalWorkspaceDraft = {
    ...emptyPersonalWorkspaceDraft(),
    ...draft,
    version: 2,
    form: {
      ...draft.form,
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
  localStorage.setItem(draftKey(userId, tab), JSON.stringify(state));
}

export function loadContentDraft(
  userId?: string | null,
  tab: ContentStudioTab = 'ad',
): ContentFormState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(draftKey(userId, tab));
    if (!raw) return null;
    return normalizeContentFormState({ ...defaultContentFormState, ...JSON.parse(raw) });
  } catch {
    return null;
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
