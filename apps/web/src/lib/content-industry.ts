export const SPA_BEAUTY_FALLBACK = {
  id: 'cind0000-0000-4000-8000-00000000000a',
  slug: 'spa-beauty',
  name: 'Spa / Làm đẹp',
} as const;

export type IndustrySelectionLike = {
  industryId?: string | null;
  industryName?: string | null;
  customIndustry?: string | null;
};

export type IndustrySuggestionBundle = {
  industry: string;
  industryId?: string | null;
  slug?: string;
  isCustom: boolean;
  isRegulated: boolean;
  regulatedWarning: string | null;
  topics: string[];
  postTypes: Array<{ value: string; label: string }>;
  tones: string[];
  audiences: string[];
  ctas: string[];
  hashtags: string[];
  productIdeas: string[];
  source: 'catalog' | 'ai' | 'fallback';
};

const REGULATED_RE =
  /sức khỏe|suc khoe|phụ khoa|phu khoa|giảm cân|giam can|bảo hiểm|bao hiem|nha khoa/i;

export function normalizeIndustrySearchVi(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim();
}

export function displayIndustryLabel(input?: IndustrySelectionLike | null): string {
  if (!input) return '—';
  return input.customIndustry?.trim() || input.industryName?.trim() || '—';
}

export function isRegulatedIndustry(input?: IndustrySelectionLike | null): boolean {
  const label = displayIndustryLabel(input);
  if (label === '—') return false;
  return REGULATED_RE.test(label);
}

export function regulatedIndustryWarning(input?: IndustrySelectionLike | null): string | null {
  if (!isRegulatedIndustry(input)) return null;
  const label = displayIndustryLabel(input);
  return `Ngành "${label}" cần kiểm duyệt trước khi đăng: không cam kết chữa khỏi, kết quả chắc chắn hoặc nội dung gây hiểu nhầm.`;
}

export function withLegacyIndustryFallback<T extends IndustrySelectionLike>(item: T): T {
  if (item.industryId || item.customIndustry || item.industryName) return item;
  return {
    ...item,
    industryId: SPA_BEAUTY_FALLBACK.id,
    industryName: SPA_BEAUTY_FALLBACK.name,
    customIndustry: null,
  };
}

export function toSelectOptions(values: string[]): { value: string; label: string }[] {
  return values.filter(Boolean).map((v) => ({ value: v, label: v }));
}

/**
 * Chỉ dùng gợi ý theo ngành — KHÔNG merge danh sách Spa/ngành khác.
 * Khi chưa có data: trả mảng rỗng (UI hiện placeholder / Khác nhập tay).
 */
export function industryOnlySelectOptions(ideas: string[] | undefined | null): {
  value: string;
  label: string;
}[] {
  return toSelectOptions(ideas ?? []);
}

/** @deprecated Không dùng merge cross-industry — dễ lẫn Spa vào ngành khác. */
export function mergeSelectOptions(
  dynamic: string[],
  fallback: { value: string; label: string }[],
): { value: string; label: string }[] {
  return industryOnlySelectOptions(dynamic.length ? dynamic : fallback.map((f) => f.value));
}

export function defaultHashtagsForIndustry(input?: IndustrySelectionLike | null): string {
  const label = displayIndustryLabel(input);
  if (label === '—' || /spa|làm đẹp|lam dep/i.test(label)) {
    return '#spa #lamdep #chamsocda';
  }
  const tag = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-zA-Z0-9]+/g, '');
  return `#${tag || 'Content'} #BanHang #ThuongHieu`;
}
