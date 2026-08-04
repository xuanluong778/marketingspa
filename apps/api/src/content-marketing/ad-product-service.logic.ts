/**
 * Product vs Service ad prompts for Content Marketing generate (mode=ad).
 * Kept separate so Advanced / Personal / facebook-policy stay untouched.
 */
import type { OpenAiService } from '../openai/openai.service';
import {
  getAdObjectiveConfig,
  normalizeAdObjective,
} from './ad-objective-config';
import {
  buildFullIndustryPromptContext,
  industryExpertIntro,
  regulatedComplianceBlock,
} from './industry-context.util';
import type { GenerateContentDto } from './dto/content-marketing.dto';

export type AdGenerateExtras = {
  content: string;
  hooks: string[];
  ctas: string[];
  source: 'ai' | 'template';
  headline?: string | null;
  shortDescription?: string | null;
  mediaSuggestions?: string[];
  adPostKind?: 'product' | 'service';
};

function resolveKind(dto: GenerateContentDto): 'product' | 'service' {
  if (dto.adPostKind === 'service' || dto.adPostKind === 'product') return dto.adPostKind;
  if (dto.service && !dto.product) return 'service';
  return 'product';
}

function productBlock(dto: GenerateContentDto): string {
  const p = dto.product;
  const name = p?.name || dto.productService;
  return `LOẠI BÀI: SẢN PHẨM
Thương hiệu/cơ sở: ${dto.brandName ?? ''}
Tên sản phẩm: ${name}
Danh mục: ${p?.category ?? ''}
Tính năng: ${p?.features ?? ''}
Lợi ích: ${p?.benefits ?? dto.benefits ?? ''}
Điểm khác biệt: ${p?.differentiators ?? ''}
Giá: ${p?.price ?? ''}
Bảo hành: ${p?.warranty ?? ''}
Bằng chứng: ${p?.proof ?? ''}
Ưu đãi: ${p?.offer ?? dto.offer ?? ''}
Khách hàng mục tiêu: ${dto.targetAudience ?? ''}
Nỗi đau (legacy): ${dto.painPoints ?? ''}`;
}

function serviceBlock(dto: GenerateContentDto): string {
  const s = dto.service;
  const name = s?.name || dto.productService;
  return `LOẠI BÀI: DỊCH VỤ
Thương hiệu/cơ sở: ${dto.brandName ?? ''}
Tên dịch vụ: ${name}
Khách hàng phù hợp: ${s?.suitableCustomers ?? dto.targetAudience ?? ''}
Vấn đề cần giải quyết: ${s?.problems ?? dto.painPoints ?? ''}
Quy trình: ${s?.process ?? ''}
Điểm nổi bật: ${s?.highlights ?? ''}
Lợi ích kỳ vọng: ${s?.expectedBenefits ?? dto.benefits ?? ''}
Thời gian: ${s?.duration ?? ''}
Địa điểm: ${s?.location ?? ''}
Chuyên gia / kỹ thuật viên: ${s?.experts ?? ''}
Bằng chứng: ${s?.proof ?? ''}
Ưu đãi: ${s?.offer ?? dto.offer ?? ''}`;
}

function templateExtras(dto: GenerateContentDto, kind: 'product' | 'service'): AdGenerateExtras {
  const name =
    (kind === 'product' ? dto.product?.name : dto.service?.name) || dto.productService;
  const brand = dto.brandName?.trim() || '';
  const offer =
    (kind === 'product' ? dto.product?.offer : dto.service?.offer) || dto.offer || '';
  const benefit =
    (kind === 'product' ? dto.product?.benefits : dto.service?.expectedBenefits) ||
    dto.benefits ||
    '';
  const cta = dto.cta || 'Inbox "TƯ VẤN" để nhận tư vấn';
  const headline = brand
    ? `${brand} — ${name}`.slice(0, 80)
    : `${name}`.slice(0, 80);
  const shortDescription = [benefit, offer].filter(Boolean).join(' · ').slice(0, 160);
  const content = [
    headline,
    '',
    kind === 'product'
      ? `Sản phẩm ${name}${brand ? ` từ ${brand}` : ''} giúp ${benefit || 'bạn đạt kết quả mong muốn'}.`
      : `Dịch vụ ${name}${brand ? ` tại ${brand}` : ''} đồng hành cùng bạn: ${benefit || 'trải nghiệm chuyên nghiệp'}.`,
    offer ? `Ưu đãi: ${offer}` : '',
    '',
    cta,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    content,
    hooks: [
      `Bạn đã thử ${name} chưa?`,
      benefit ? `${benefit} — bắt đầu hôm nay` : `Khám phá ${name}`,
      offer ? `Ưu đãi ${offer} sắp hết` : `Inbox tư vấn miễn phí`,
    ],
    ctas: [cta, 'Inbox "TƯ VẤN"', 'Đặt lịch ngay', 'Nhận ưu đãi'].slice(0, 5),
    source: 'template',
    headline,
    shortDescription: shortDescription || null,
    mediaSuggestions:
      kind === 'product'
        ? [
            'Ảnh sản phẩm trên nền sạch, góc 45°',
            'Close-up chi tiết tính năng / texture',
            'Video unboxing / demo 15–30s',
          ]
        : [
            'Ảnh không gian dịch vụ / phòng trị liệu',
            'Video quy trình ngắn 20–40s',
            'Ảnh chuyên gia / kỹ thuật viên đang thực hiện',
          ],
    adPostKind: kind,
  };
}

export async function generateProductOrServiceAdContent(
  dto: GenerateContentDto,
  openai?: OpenAiService,
): Promise<AdGenerateExtras> {
  const kind = resolveKind(dto);
  if (!openai?.isConfigured()) {
    return templateExtras(dto, kind);
  }

  const tone = dto.tone ?? 'friendly';
  const objective =
    getAdObjectiveConfig(dto.adObjective) ??
    getAdObjectiveConfig(normalizeAdObjective(dto.adObjective));
  const type = dto.adContentType ?? objective?.defaultContentType ?? 'sales';
  const subjectName =
    (kind === 'product' ? dto.product?.name : dto.service?.name) || dto.productService;

  const { ctx: industry, block: industryBlock } = buildFullIndustryPromptContext({
    industry: dto,
    productService: subjectName,
    targetAudience:
      kind === 'service'
        ? dto.service?.suitableCustomers ?? dto.targetAudience
        : dto.targetAudience,
    goal: objective ? `${objective.label} — ${objective.description}` : dto.adObjective,
    tone,
    platform: dto.platform,
    length: dto.postLength,
    cta: dto.cta ?? objective?.defaultCta,
    keywords: [
      dto.painPoints,
      dto.benefits,
      dto.offer,
      kind === 'product' ? dto.product?.features : dto.service?.highlights,
    ]
      .filter(Boolean)
      .join(' | '),
    brandInfo: dto.brandName || subjectName,
  });

  const detailBlock = kind === 'product' ? productBlock(dto) : serviceBlock(dto);
  const prompt = `${industryExpertIntro(industry)}
Viết content quảng cáo bán hàng tiếng Việt.
mode=ad, loại_bài=${kind}, loại_content=${type}, giọng=${tone}, nền tảng=${dto.platform ?? 'facebook'}.

${industryBlock}

${detailBlock}

${objective ? `Hướng dẫn theo mục tiêu: ${objective.generateHint}` : ''}
${dto.transcript ? `Tham khảo transcript: ${dto.transcript.slice(0, 2000)}` : ''}
CTA ưu tiên: ${dto.cta ?? objective?.defaultCta ?? ''}

${regulatedComplianceBlock(industry)}

Trả JSON (không markdown):
{
  "content":"bài viết đầy đủ",
  "hooks":["h1","h2","h3","h4","h5"],
  "ctas":["c1","c2","c3","c4","c5"],
  "headline":"tiêu đề ngắn ≤80 ký tự",
  "shortDescription":"mô tả ngắn ≤160 ký tự",
  "mediaSuggestions":["gợi ý ảnh/video 1","2","3"]
}
Thuật ngữ phải đúng ngành "${industry.label}".
${industry.isSpaBeauty ? '' : 'CẤM dùng từ spa/liệu trình da trừ khi có trong dữ liệu user.'}`;

  try {
    const raw = await openai.chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 1400,
      temperature: 0.7,
    });
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as Partial<AdGenerateExtras>;
    const fallback = templateExtras(dto, kind);
    return {
      content: parsed.content || fallback.content,
      hooks: Array.isArray(parsed.hooks) ? parsed.hooks.slice(0, 5) : fallback.hooks,
      ctas: Array.isArray(parsed.ctas) ? parsed.ctas.slice(0, 5) : fallback.ctas,
      source: 'ai',
      headline: parsed.headline ?? fallback.headline,
      shortDescription: parsed.shortDescription ?? fallback.shortDescription,
      mediaSuggestions: Array.isArray(parsed.mediaSuggestions)
        ? parsed.mediaSuggestions.slice(0, 6)
        : fallback.mediaSuggestions,
      adPostKind: kind,
    };
  } catch {
    return templateExtras(dto, kind);
  }
}

/** Reject payloads that include both product and service objects. */
export function assertExclusiveProductService(dto: GenerateContentDto): void {
  const hasProduct = Boolean(dto.product && Object.keys(dto.product).length);
  const hasService = Boolean(dto.service && Object.keys(dto.service).length);
  if (hasProduct && hasService) {
    throw new Error(
      'INVALID_AD_PAYLOAD: Không gửi đồng thời product và service — chọn một loại bài quảng cáo.',
    );
  }
  if (dto.adPostKind === 'product' && hasService) {
    throw new Error('INVALID_AD_PAYLOAD: adPostKind=product nhưng có object service.');
  }
  if (dto.adPostKind === 'service' && hasProduct) {
    throw new Error('INVALID_AD_PAYLOAD: adPostKind=service nhưng có object product.');
  }
}
