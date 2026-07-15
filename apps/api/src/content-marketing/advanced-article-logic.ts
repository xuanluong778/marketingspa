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
  };
}

function defaultCta(dto: Pick<GenerateAdvancedArticleDto, 'productService' | 'ctaType'>): string {
  const p = dto.productService;
  switch (dto.ctaType) {
    case 'comment':
      return `Comment "SPA" hoặc "TƯ VẤN" để được tư vấn miễn phí về ${p}.`;
    case 'inbox':
      return `Inbox ngay — nhắn "ĐẶT LỊCH" để nhận ưu đãi ${p} (có hạn).`;
    case 'hotline':
      return `Gọi hotline hoặc nhắn Zalo để đặt lịch ${p} — tư vấn miễn phí.`;
    case 'booking':
      return `Đặt lịch ngay — slot ưu đãi ${p} có hạn, inbox hoặc gọi để giữ chỗ.`;
    default:
      return `Liên hệ ngay để trải nghiệm ${p}.`;
  }
}

function buildAnalysisFromForm(dto: GenerateAdvancedArticleDto): AdvancedStepAnalysis[] {
  return ADVANCED_16_STEPS.map((label, i) => {
    const step = i + 1;
    let summary = 'Đã tích hợp trong bài viết.';
    if (step === 1) summary = dto.painPoints.slice(0, 120);
    if (step === 3) summary = `${dto.productService} — giải pháp spa phù hợp.`;
    if (step === 10) summary = [dto.combo, dto.gift].filter(Boolean).join('; ') || 'Ưu đãi theo chương trình.';
    if (step === 11) summary = dto.certification || 'Cam kết dịch vụ chuẩn spa.';
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
  const hook = `Bạn có đang ${dto.painPoints.split(/[.,;]/)[0]?.toLowerCase() ?? 'mệt mỏi với làn da'} — và cần một giải pháp spa thực sự phù hợp?`;
  const cta = defaultCta(dto);
  const title = `${dto.productService}${dto.price ? ` — chỉ từ ${dto.price}` : ''} | Ưu đãi có hạn`;

  const body = [
    dto.painPoints,
    dto.desires ? `Bạn mong muốn ${dto.desires.charAt(0).toLowerCase()}${dto.desires.slice(1)}.` : '',
    `Nhiều người thử nhiều cách nhưng chưa hiệu quả bền vững — thường do thiếu quy trình chuẩn, sản phẩm phù hợp cơ địa, hoặc chăm sóc không đều đặn.`,
    `${dto.productService} là giải pháp spa phù hợp${dto.differentiator ? `: ${dto.differentiator}` : ' — quy trình chuẩn, chuyên viên có kinh nghiệm, không gian riêng tư.'}`,
    `Khi trải nghiệm liệu trình, bạn có thể cảm nhận da sáng hơn, tự tin hơn (kết quả có thể khác nhau tùy cơ địa). Gói dịch vụ gọn, phù hợp người bận rộn.`,
    dto.price
      ? `Hiện spa đang có ưu đãi ${dto.price}. So với tự thử nhiều sản phẩm, liệu trình spa có thể tối ưu chi phí hơn tùy nhu cầu.`
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
    `Lưu ý: Kết quả có thể khác nhau tùy cơ địa, tình trạng da/cơ thể và liệu trình. Vui lòng tham khảo chuyên viên trước khi quyết định.`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return polishAdvancedResult({
    title,
    hook,
    final_article: body,
    cta,
    hashtags: ['#spa', '#lamdep', '#chamsocda', '#uudai', '#datlich'],
    analysis_16_steps: buildAnalysisFromForm(dto),
    suggested_images: [
      'Before/after da (có consent khách)',
      'Không gian phòng trị liệu',
      'Chuyên viên đang tư vấn',
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
  const fallbackCta = defaultCta({
    productService: dto.productService ?? 'dịch vụ spa',
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

  const prompt = `Tối ưu CTA cuối bài spa. Loại CTA: ${CTA_TYPE_HINTS[dto.ctaType]}.
Mục tiêu: ${dto.articleGoal ?? 'bán hàng'}.
Sản phẩm: ${dto.productService ?? ''}.

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
  const fallback = [
    `${dto.productService ?? 'Dịch vụ spa'} — ưu đãi có hạn`,
    `Giải pháp spa cho ${DEMOGRAPHIC_LABELS[dto.demographic ?? 'female_25_35']?.split(':')[0] ?? 'bạn'}`,
    `Đừng bỏ lỡ liệu trình ${dto.productService ?? 'spa'} này`,
    `Spa ${dto.productService ?? ''}: Trải nghiệm khác biệt`,
    `Ưu đãi ${dto.productService ?? 'spa'} — đặt lịch ngay`,
  ];

  if (!openai?.isConfigured()) {
    return { titles: fallback, source: 'template' };
  }

  const prompt = `Tạo 5 tiêu đề hấp dẫn cho bài bán hàng spa.
Sản phẩm: ${dto.productService ?? ''}
Nhân khẩu học: ${dto.demographic ? DEMOGRAPHIC_LABELS[dto.demographic] : ''}
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
