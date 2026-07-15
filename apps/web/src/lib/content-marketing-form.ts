import type {
  AdObjective,
  AdvancedFormState,
  ContentFormState,
  ContentHistoryItem,
  ContentStudioTab,
  PersonalFormState,
} from '@/types/content-marketing';
import { AD_OBJECTIVE_OPTIONS } from '@/types/content-marketing';

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
};

export const sampleAdFormState: ContentFormState = {
  productService: 'Liệu trình trẻ hóa da chuyên sâu',
  targetAudience: 'Nữ 28–45, quan tâm da lão hóa',
  painPoints: 'Da xỉn màu, lỗ chân lông to, makeup không ăn',
  benefits: 'Da sáng hơn, makeup mịn, thư giãn sau liệu trình',
  offer: 'Giảm 30%',
  adObjective: 'messages',
  platform: 'facebook',
  cta: 'Inbox "SPA" để nhận tư vấn miễn phí',
  tone: 'empathetic',
  adContentType: 'inbox',
  personalPostType: 'personal_story',
  videoUrl: '',
  transcript: '',
};

export const defaultPersonalFormState: PersonalFormState = {
  postTopic: '',
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
};

export const samplePersonalFormState: PersonalFormState = {
  postTopic: 'Phụ nữ yêu bản thân không phải ích kỷ',
  targetAudience: 'Phụ nữ 25–45, bận rộn, hay hy sinh cho gia đình',
  postGoal: 'personal_branding',
  personalPostType: 'personal_story',
  personalTone: 'mild_edgy',
  brandArticleGenre: 'women_beauty',
  brandPronoun: 'chi_em',
  brandVoiceIntensity: 'edgy',
  postLength: 'medium',
  personalAngle: 'Làm đẹp là tự trọng — không phải chạy theo chuẩn mực ai đó vẽ ra',
  storyIdea:
    'Một khách hàng kể: cô ấy đi spa lần đầu sau 5 năm làm mẹ — không vì da xấu, mà vì quên mất mình là ai',
  videoUrl: '',
  transcript: '',
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

export function savePersonalDraft(state: PersonalFormState, userId?: string | null): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(personalDraftKey(userId), JSON.stringify(state));
}

export function loadPersonalDraft(userId?: string | null): PersonalFormState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(personalDraftKey(userId));
    if (!raw) return null;
    return { ...defaultPersonalFormState, ...JSON.parse(raw) };
  } catch {
    return null;
  }
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
      .map((item) => ({
        id: item.id,
        tab:
          item.tab === 'personal'
            ? 'personal'
            : item.tab === 'advanced'
              ? 'advanced'
              : 'ad',
        title: (item.title ?? '').trim() || 'Không có tiêu đề',
        content: item.content ?? '',
        contentScore: Number.isFinite(item.contentScore) ? item.contentScore : 0,
        policyScore: Number.isFinite(item.policyScore) ? item.policyScore : 0,
        variantCount: Number.isFinite(item.variantCount) ? item.variantCount : 0,
        adsReadiness: item.adsReadiness ?? 'low',
        createdAt: item.createdAt ?? '',
      }));
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

export function deleteContentHistoryItem(id: string, userId?: string | null): void {
  if (typeof window === 'undefined') return;
  const prev = loadContentHistory(userId);
  const next = prev.filter((item) => item.id !== id);
  localStorage.setItem(historyKey(userId), JSON.stringify(next));
}

export function createHistoryId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
