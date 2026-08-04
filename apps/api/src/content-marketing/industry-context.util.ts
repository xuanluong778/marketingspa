import {
  SPA_BEAUTY_INDUSTRY_ID,
  SPA_BEAUTY_INDUSTRY_NAME,
} from './content-industry.constants';

export {
  SPA_BEAUTY_INDUSTRY_ID,
  SPA_BEAUTY_INDUSTRY_NAME,
  SPA_BEAUTY_SLUG,
} from './content-industry.constants';

export type IndustryFields = {
  industryId?: string | null;
  industryName?: string | null;
  customIndustry?: string | null;
};

export type IndustryContext = {
  label: string;
  isSpaBeauty: boolean;
  isCustom: boolean;
  isRegulated: boolean;
  regulatedKind: 'health' | 'gynecology' | 'weight_loss' | 'insurance' | null;
  slugHint: string;
};

const REGULATED_PATTERNS: Array<{
  kind: NonNullable<IndustryContext['regulatedKind']>;
  re: RegExp;
}> = [
  { kind: 'gynecology', re: /phụ khoa|phu khoa|sản phụ|phụ sản/i },
  { kind: 'weight_loss', re: /giảm cân|giam can|giảm béo|detox giảm/i },
  { kind: 'insurance', re: /bảo hiểm|bao hiem|insurance/i },
  { kind: 'health', re: /sức khỏe|suc khoe|y tế|yte|healthcare|health\b|nha khoa|phòng khám/i },
];

/** Nhãn ngành cho prompt AI — ưu tiên custom → name → Spa/Làm đẹp (compat). */
export function resolveIndustryContext(input?: IndustryFields): IndustryContext {
  const custom = input?.customIndustry?.trim() || '';
  const name = input?.industryName?.trim() || '';
  const label = custom || name || SPA_BEAUTY_INDUSTRY_NAME;
  const isCustom = Boolean(custom);
  const isSpaBeauty =
    !isCustom &&
    (input?.industryId === SPA_BEAUTY_INDUSTRY_ID ||
      label === SPA_BEAUTY_INDUSTRY_NAME ||
      /^spa\s*\/\s*làm\s*đẹp$/i.test(label) ||
      /^spa\/làm đẹp$/i.test(label));

  let regulatedKind: IndustryContext['regulatedKind'] = null;
  for (const p of REGULATED_PATTERNS) {
    if (p.re.test(label)) {
      regulatedKind = p.kind;
      break;
    }
  }

  return {
    label,
    isSpaBeauty,
    isCustom,
    isRegulated: regulatedKind != null,
    regulatedKind,
    slugHint: slugifyIndustry(label),
  };
}

export function slugifyIndustry(label: string): string {
  return (
    label
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'custom'
  );
}

export function industryExpertIntro(ctx: IndustryContext | string, isSpaBeautyFlag?: boolean): string {
  const isSpa =
    typeof ctx === 'string' ? Boolean(isSpaBeautyFlag) : ctx.isSpaBeauty;
  const label = typeof ctx === 'string' ? ctx : ctx.label;
  if (isSpa) {
    return 'Bạn là chuyên gia content marketing spa/wellness / làm đẹp tại Việt Nam.';
  }
  return `Bạn là chuyên gia content marketing ngành "${label}" tại Việt Nam. Tuyệt đối KHÔNG dùng thuật ngữ spa, liệu trình thẩm mỹ, chăm sóc da, hoặc ngữ cảnh làm đẹp trừ khi ngành đúng là Spa/Làm đẹp.`;
}

/** Block gắn thương hiệu — chỉ spa khi ngành spa; ngành khác dùng cầu nối trung tính. */
export function industryBrandBridge(ctx: IndustryContext): string {
  if (ctx.isSpaBeauty) {
    return 'Một spa tử tế không chỉ làm da khách đẹp hơn — mà làm họ tin lại vào chính mình. Chăm sóc bản thân không phải phù phiếm, đó là lòng tự trọng.';
  }
  return `Thương hiệu ngành "${ctx.label}" nên hiện diện tự nhiên qua giá trị thật, câu chuyện khách hàng và chuyên môn — không nhồi quảng cáo lộ liễu, không mượn ngữ cảnh spa/làm đẹp.`;
}

export function regulatedComplianceBlock(ctx: IndustryContext): string {
  if (!ctx.isRegulated) {
    return 'Tuân thủ chính sách nền tảng: tránh cam kết tuyệt đối, tránh nội dung gây hiểu nhầm.';
  }
  const kindLabel =
    ctx.regulatedKind === 'insurance'
      ? 'bảo hiểm'
      : ctx.regulatedKind === 'gynecology'
        ? 'phụ khoa'
        : ctx.regulatedKind === 'weight_loss'
          ? 'giảm cân'
          : 'sức khỏe';
  return `NGÀNH NHẠY CẢM (${kindLabel}): CẤM cam kết chữa khỏi, kết quả chắc chắn 100%, "đảm bảo hiệu quả", thay thế tư vấn y tế/chuyên gia. Dùng ngôn ngữ thận trọng: "có thể hỗ trợ", "tùy cơ địa", "tham khảo chuyên gia". Thêm disclaimer ngắn khi phù hợp.`;
}

/** Ghép ngữ cảnh đầy đủ cho mọi prompt generate. */
export function buildFullIndustryPromptContext(input: {
  industry?: IndustryFields;
  productService?: string;
  targetAudience?: string;
  goal?: string;
  tone?: string;
  pronoun?: string;
  platform?: string;
  length?: string;
  cta?: string;
  keywords?: string;
  brandInfo?: string;
}): { ctx: IndustryContext; block: string } {
  const ctx = resolveIndustryContext(input.industry);
  const lines = [
    `Ngành nghề: ${ctx.label}${ctx.isCustom ? ' (ngành tùy chỉnh — tự suy luận thuật ngữ phù hợp)' : ''}`,
    `Sản phẩm/dịch vụ: ${input.productService?.trim() || '(chưa cung cấp)'}`,
    `Khách hàng mục tiêu: ${input.targetAudience?.trim() || '(AI suy luận hợp lý theo ngành)'}`,
    `Mục tiêu bài viết: ${input.goal?.trim() || '(tăng nhận diện / chuyển đổi)'}`,
    `Giọng văn: ${input.tone?.trim() || '(phù hợp ngành)'}`,
    `Cách xưng hô: ${input.pronoun?.trim() || '(AI tự chọn phù hợp)'}`,
    `Nền tảng đăng: ${input.platform?.trim() || 'facebook'}`,
    `Độ dài: ${input.length?.trim() || 'vừa'}`,
    `CTA mong muốn: ${input.cta?.trim() || '(AI đề xuất CTA phù hợp ngành)'}`,
    `Từ khóa / thương hiệu: ${[input.keywords, input.brandInfo].filter(Boolean).join(' | ') || '(không bắt buộc)'}`,
    regulatedComplianceBlock(ctx),
    ctx.isSpaBeauty
      ? 'Được phép dùng thuật ngữ spa/làm đẹp khi hợp ngữ cảnh.'
      : 'CẤM chèn spa, liệu trình da, chăm sóc da, thẩm mỹ viện trừ khi user nêu rõ trong sản phẩm.',
  ];
  return { ctx, block: lines.join('\n') };
}

export function containsSpaLeakage(text: string, ctx: IndustryContext): boolean {
  if (ctx.isSpaBeauty) return false;
  return /\bspa\b|liệu trình\s*(da|trẻ hóa)|chăm sóc da|#spa\b|#lamdep\b|thẩm mỹ viện|facial|skincare/i.test(
    text,
  );
}
