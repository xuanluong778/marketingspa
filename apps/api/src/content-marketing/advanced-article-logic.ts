import type { OpenAiService } from '../openai/openai.service';
import type {
  GenerateAdvancedArticleDto,
  GenerateAdvancedTitlesDto,
  OptimizeAdvancedCtaDto,
  RewriteAdvancedArticleDto,
} from './dto/content-marketing.dto';
import {
  ADVANCED_16_STEPS,
  ADVANCED_LENGTH_HINT,
  ARTICLE_GOAL_LABELS,
  buildAdvancedArticlePrompt,
  CTA_TYPE_HINTS,
  DEMOGRAPHIC_LABELS,
  WRITING_STYLE_PROMPTS,
} from './advanced-article-config';
import { formatArticleForFacebookPost, formatArticleForReadability } from './advanced-article-format.util';
import {
  regulatedComplianceBlock,
  resolveIndustryContext,
} from './industry-context.util';

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

function parseJson<T>(raw: string): T {
  return JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim()) as T;
}

function dtoToPromptParams(dto: GenerateAdvancedArticleDto) {
  const industry = resolveIndustryContext(dto);
  return {
    style: WRITING_STYLE_PROMPTS[dto.writingStyle],
    demographic: DEMOGRAPHIC_LABELS[dto.demographic],
    goal: ARTICLE_GOAL_LABELS[dto.articleGoal],
    product_name: dto.productService,
    price: dto.price ?? '',
    combo: dto.combo ?? '',
    bonus: dto.gift ?? '',
    deadline: dto.offerDeadline ?? '',
    sales_area: dto.salesArea ?? '',
    certification: dto.certification ?? '',
    pain_points: dto.painPoints,
    desired_result: dto.desires ?? '',
    unique_selling_point: dto.differentiator ?? '',
    customer_story: dto.caseStudy ?? '',
    cta_type: CTA_TYPE_HINTS[dto.ctaType],
    length: ADVANCED_LENGTH_HINT[dto.postLength] ?? dto.postLength,
    industryLabel: industry.label,
    isSpaBeauty: industry.isSpaBeauty,
    regulatedNote: regulatedComplianceBlock(industry),
  };
}

function defaultCta(dto: Pick<GenerateAdvancedArticleDto, 'productService' | 'ctaType'>): string {
  const p = dto.productService;
  switch (dto.ctaType) {
    case 'comment':
      return `Comment "TƯ VẤN" để được tư vấn miễn phí về ${p}.`;
    case 'inbox':
      return `Inbox ngay — nhắn để nhận ưu đãi ${p} (có hạn).`;
    case 'hotline':
      return `Gọi hotline hoặc nhắn Zalo để đặt lịch ${p} — tư vấn miễn phí.`;
    case 'booking':
      return `Đặt lịch ngay — slot ưu đãi ${p} có hạn, inbox hoặc gọi để giữ chỗ.`;
    default:
      return `Liên hệ ngay để trải nghiệm ${p}.`;
  }
}

function buildAnalysisFromForm(dto: GenerateAdvancedArticleDto): AdvancedStepAnalysis[] {
  const industry = resolveIndustryContext(dto);
  const solutionWord = industry.isSpaBeauty ? 'giải pháp spa phù hợp' : `giải pháp ngành ${industry.label}`;
  return ADVANCED_16_STEPS.map((label, i) => {
    const step = i + 1;
    let summary = 'Đã tích hợp trong bài viết.';
    if (step === 1) summary = dto.painPoints.slice(0, 120);
    if (step === 3) summary = `${dto.productService} — ${solutionWord}.`;
    if (step === 10) summary = [dto.combo, dto.gift].filter(Boolean).join('; ') || 'Ưu đãi theo chương trình.';
    if (step === 11) summary = dto.certification || `Cam kết dịch vụ chuẩn ngành ${industry.label}.`;
    if (step === 13) summary = dto.caseStudy?.slice(0, 120) || 'Case study minh họa (nếu có).';
    if (step === 16) summary = defaultCta(dto);
    return { step, label, summary };
  });
}

function polishAdvancedResult(result: AdvancedArticleResult): AdvancedArticleResult {
  const websiteRaw = formatArticleForReadability(result.variants.website);
  const mainRaw = formatArticleForReadability(result.final_article);
  const fbRaw = formatArticleForReadability(result.variants.facebook);

  return {
    ...result,
    final_article: formatArticleForFacebookPost(mainRaw),
    variants: {
      facebook: formatArticleForFacebookPost(fbRaw || mainRaw),
      website: websiteRaw,
      ads: formatArticleForReadability(result.variants.ads),
    },
  };
}

export function templateGenerateAdvanced(dto: GenerateAdvancedArticleDto): AdvancedArticleResult {
  const industry = resolveIndustryContext(dto);
  const painFirst =
    dto.painPoints.split(/[.,;]/)[0]?.toLowerCase() ?? `chưa hài lòng với lựa chọn hiện tại trong ngành ${industry.label}`;
  const hook = `Bạn có đang ${painFirst} — và cần một giải pháp thực sự phù hợp cho ${industry.label}?`;
  const cta = defaultCta(dto);
  const title = `${dto.productService}${dto.price ? ` — chỉ từ ${dto.price}` : ''} | Ưu đãi có hạn`;

  const body = [
    dto.painPoints,
    dto.desires ? `Bạn mong muốn ${dto.desires.charAt(0).toLowerCase()}${dto.desires.slice(1)}.` : '',
    `Nhiều người thử nhiều cách nhưng chưa hiệu quả bền vững — thường do thiếu quy trình chuẩn hoặc chưa chọn đúng giải pháp ngành ${industry.label}.`,
    `${dto.productService} là giải pháp phù hợp${dto.differentiator ? `: ${dto.differentiator}` : ` — rõ ràng, minh bạch, đúng nhu cầu ngành ${industry.label}.`}`,
    `Khi trải nghiệm, bạn có thể cảm nhận sự khác biệt (kết quả có thể khác nhau tùy tình trạng). Gói dịch vụ gọn, phù hợp người bận rộn.`,
    dto.price
      ? `Hiện đang có ưu đãi ${dto.price}. So với tự thử nhiều hướng, giải pháp chuyên nghiệp có thể tối ưu chi phí hơn tùy nhu cầu.`
      : '',
    dto.combo || dto.gift
      ? [
          dto.combo ? `Ưu đãi: ${dto.combo}.` : '',
          dto.gift ? `Quà tặng kèm: ${dto.gift}.` : '',
          dto.offerDeadline ? `Chương trình kết thúc ${dto.offerDeadline} — số suất có hạn.` : '',
        ]
          .filter(Boolean)
          .join(' ')
      : '',
    dto.certification ? `${dto.certification}` : '',
    dto.caseStudy ? `${dto.caseStudy}` : '',
    `${cta}`,
    industry.isRegulated
      ? `Lưu ý: Nội dung mang tính tham khảo. Không cam kết chữa khỏi hay kết quả chắc chắn. Vui lòng tham khảo chuyên gia trước khi quyết định.`
      : `Lưu ý: Kết quả có thể khác nhau tùy tình trạng và nhu cầu. Vui lòng tham khảo tư vấn trước khi quyết định.`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const tagBase = industry.label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-zA-Z0-9]+/g, '');
  const hashtags = industry.isSpaBeauty
    ? ['#spa', '#lamdep', '#chamsocda', '#uudai', '#datlich']
    : [`#${tagBase || 'Content'}`, '#UuDai', '#TuVan', '#BanHang'];

  return polishAdvancedResult({
    title,
    hook,
    final_article: body,
    cta,
    hashtags,
    analysis_16_steps: buildAnalysisFromForm(dto),
    suggested_images: [
      `Ảnh sản phẩm/dịch vụ ngành ${industry.label}`,
      'Không gian / đội ngũ',
      'Khách hàng trải nghiệm (có consent)',
      'Poster ưu đãi có deadline',
    ],
    suggested_ads_angle: `Pain → Solution → Offer: ${dto.painPoints.slice(0, 60)} → ${dto.productService}`,
    variants: {
      facebook: body,
      website: body,
      ads: `${hook}\n\n${dto.productService}. ${dto.combo ?? dto.gift ?? 'Ưu đãi có hạn.'}\n\n${cta}`,
    },
    source: 'template',
  });
}

export async function generateAdvancedArticle(
  dto: GenerateAdvancedArticleDto,
  openai?: OpenAiService,
): Promise<AdvancedArticleResult> {
  if (!openai?.isConfigured()) {
    return templateGenerateAdvanced(dto);
  }

  const prompt = buildAdvancedArticlePrompt(dtoToPromptParams(dto));

  try {
    const raw = await openai.chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 3500,
      temperature: 0.72,
    });
    const parsed = parseJson<AdvancedArticleResult>(raw);
    const fallback = templateGenerateAdvanced(dto);
    return polishAdvancedResult({
      title: parsed.title || fallback.title,
      hook: parsed.hook || fallback.hook,
      final_article: parsed.final_article || fallback.final_article,
      cta: parsed.cta || fallback.cta,
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.slice(0, 10) : fallback.hashtags,
      analysis_16_steps:
        Array.isArray(parsed.analysis_16_steps) && parsed.analysis_16_steps.length >= 8
          ? parsed.analysis_16_steps.slice(0, 16)
          : fallback.analysis_16_steps,
      suggested_images: Array.isArray(parsed.suggested_images)
        ? parsed.suggested_images.slice(0, 6)
        : fallback.suggested_images,
      suggested_ads_angle: parsed.suggested_ads_angle || fallback.suggested_ads_angle,
      variants: {
        facebook: parsed.variants?.facebook || parsed.final_article || fallback.final_article,
        website: parsed.variants?.website || fallback.variants.website,
        ads: parsed.variants?.ads || fallback.variants.ads,
      },
      source: 'ai',
    });
  } catch {
    return templateGenerateAdvanced(dto);
  }
}

export async function rewriteAdvancedArticle(
  dto: RewriteAdvancedArticleDto,
  openai?: OpenAiService,
): Promise<AdvancedArticleResult> {
  if (!openai?.isConfigured()) {
    return templateGenerateAdvanced(dto);
  }

  const prompt = buildAdvancedArticlePrompt({
    ...dtoToPromptParams(dto),
    rewriteNote: dto.previousArticle
      ? `Viết LẠI phiên bản mới — cùng thông tin, diễn đạt khác, tránh lặp y nguyên bài cũ:\n${dto.previousArticle.slice(0, 3000)}`
      : undefined,
  });

  try {
    const raw = await openai.chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 3500,
      temperature: 0.78,
    });
    const parsed = parseJson<AdvancedArticleResult>(raw);
    const fallback = templateGenerateAdvanced(dto);
    return polishAdvancedResult({
      ...fallback,
      ...parsed,
      variants: parsed.variants ?? fallback.variants,
      source: 'ai',
    });
  } catch {
    return templateGenerateAdvanced(dto);
  }
}

export async function optimizeAdvancedCta(
  dto: OptimizeAdvancedCtaDto,
  openai?: OpenAiService,
): Promise<{ cta: string; alternatives: string[]; updated_article: string; source: 'ai' | 'template' }> {
  const industry = resolveIndustryContext(dto);
  const product = dto.productService ?? `dịch vụ ${industry.label}`;
  const fallbackCta = defaultCta({
    productService: product,
    ctaType: dto.ctaType,
  });

  if (!openai?.isConfigured()) {
    const updated = formatArticleForFacebookPost(
      formatArticleForReadability(`${dto.finalArticle}\n\n${fallbackCta}`),
    );
    return {
      cta: fallbackCta,
      alternatives: [fallbackCta, `${fallbackCta} (Ưu đãi có hạn)`],
      updated_article: updated,
      source: 'template',
    };
  }

  const prompt = `Tối ưu CTA cuối bài ngành "${industry.label}". Loại CTA: ${CTA_TYPE_HINTS[dto.ctaType]}.
Mục tiêu: ${dto.articleGoal ?? 'bán hàng'}.
Sản phẩm: ${product}.
${regulatedComplianceBlock(industry)}
${industry.isSpaBeauty ? '' : 'CẤM CTA spa/liệu trình da.'}

Bài hiện tại:
${dto.finalArticle.slice(0, 4000)}

Trả JSON: {"cta":"...","alternatives":["a1","a2","a3"],"updated_article":"...full bài với CTA mới tích hợp ở đoạn cuối — văn liền mạch, KHÔNG tiêu đề ##, xuống dòng \\n\\n giữa đoạn"}`;

  try {
    const raw = await openai.chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 2000,
      temperature: 0.65,
    });
    const parsed = parseJson<{ cta: string; alternatives: string[]; updated_article: string }>(raw);
    return {
      cta: parsed.cta || fallbackCta,
      alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives.slice(0, 5) : [],
      updated_article: formatArticleForFacebookPost(
        formatArticleForReadability(parsed.updated_article || dto.finalArticle),
      ),
      source: 'ai',
    };
  } catch {
    return {
      cta: fallbackCta,
      alternatives: [],
      updated_article: formatArticleForFacebookPost(formatArticleForReadability(dto.finalArticle)),
      source: 'template',
    };
  }
}

export async function generateAdvancedTitles(
  dto: GenerateAdvancedTitlesDto,
  openai?: OpenAiService,
): Promise<{ titles: string[]; source: 'ai' | 'template' }> {
  const industry = resolveIndustryContext(dto);
  const product = dto.productService ?? `Dịch vụ ${industry.label}`;
  const fallback = [
    `${product} — ưu đãi có hạn`,
    `Giải pháp ${industry.label} cho ${DEMOGRAPHIC_LABELS[dto.demographic ?? 'female_25_35']?.split(':')[0] ?? 'bạn'}`,
    `Đừng bỏ lỡ ${product}`,
    `${industry.label}: ${product} — trải nghiệm khác biệt`,
    `Ưu đãi ${product} — liên hệ ngay`,
  ];

  if (!openai?.isConfigured()) {
    return { titles: fallback, source: 'template' };
  }

  const prompt = `Tạo 5 tiêu đề hấp dẫn cho bài bán hàng ngành "${industry.label}".
Sản phẩm: ${product}
Nhân khẩu học: ${dto.demographic ? DEMOGRAPHIC_LABELS[dto.demographic] : ''}
${industry.isSpaBeauty ? '' : 'CẤM từ spa/làm đẹp trong tiêu đề.'}
Bài: ${dto.finalArticle.slice(0, 1500)}

Trả JSON: {"titles":["t1","t2","t3","t4","t5"]}`;

  try {
    const raw = await openai.chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 400,
      temperature: 0.8,
    });
    const parsed = parseJson<{ titles: string[] }>(raw);
    return {
      titles: Array.isArray(parsed.titles) ? parsed.titles.slice(0, 5) : fallback,
      source: 'ai',
    };
  } catch {
    return { titles: fallback, source: 'template' };
  }
}
