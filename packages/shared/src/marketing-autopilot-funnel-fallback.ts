/**
 * Minimum Funnel fallbacks for Marketing Autopilot on baselines without Funnel Builder.
 * DRAFT-ONLY JSON — not a live Funnel module.
 */

export const AUTOPILOT_FUNNEL_TEMPLATE_SLUGS = [
  'consultation',
  'voucher',
  'quiz',
  'giveaway',
  'booking',
] as const;

export type FunnelTemplateSlug = (typeof AUTOPILOT_FUNNEL_TEMPLATE_SLUGS)[number];

export type FunnelBriefAnalysis = {
  industry: string;
  service: string;
  goal: string;
  targetAudience: string;
  painPoints: string[];
  offer: string;
  leadMagnet: string;
  channels: string[];
  budgetHint: string | null;
  regionHint: string | null;
  confidence: number;
};

export type FunnelRecommendationOption = {
  templateSlug: FunnelTemplateSlug;
  funnelName: string;
  strategy: string;
  fitReason: string;
  offer: string;
  customerJourney: Array<{ step: number; label: string; description?: string }>;
  channels: string[];
  cta: string;
  fitScore: number;
};

export type FunnelGeneratorResult = {
  schemaVersion: 'funnel-generator.v1';
  prompt: string;
  analysis: FunnelBriefAnalysis;
  recommendations: FunnelRecommendationOption[];
};

export type FunnelCompleteSpec = {
  schemaVersion: 'funnel-complete.v1';
  templateSlug: FunnelTemplateSlug;
  mode: 'draft';
  name: string;
  offer: string;
  cta: string;
  analysis?: FunnelBriefAnalysis;
  option?: FunnelRecommendationOption;
  disclaimers: string[];
};

function inferService(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes('phun môi')) return 'Phun môi thẩm mỹ';
  if (lower.includes('nail')) return 'Nail / làm móng';
  if (lower.includes('massage')) return 'Massage / spa';
  return 'Dịch vụ spa/beauty';
}

/** Heuristic fallback when Funnel Builder is not on this baseline. */
export function buildFallbackFunnelRecommendations(prompt: string): FunnelGeneratorResult {
  const service = inferService(prompt);
  const analysis: FunnelBriefAnalysis = {
    industry: 'spa / thẩm mỹ',
    service,
    goal: 'Thu hút khách tiềm năng và chuyển thành lịch hẹn / mua dịch vụ',
    targetAudience: 'Nữ 22–45, quan tâm làm đẹp, đang tìm địa chỉ uy tín gần khu vực',
    painPoints: [
      'Sợ làm hỏng / không tự nhiên',
      'Không biết chọn cơ sở nào uy tín',
      'Ngần ngại giá và thời gian phục hồi',
    ],
    offer: `Ưu đãi trải nghiệm ${service} lần đầu`,
    leadMagnet: 'Checklist chọn địa chỉ + voucher trải nghiệm',
    channels: ['Facebook Ads', 'TikTok', 'Zalo OA', 'Fanpage'],
    budgetHint: null,
    regionHint: null,
    confidence: 55,
  };

  const recommendations: FunnelRecommendationOption[] = [
    {
      templateSlug: 'consultation',
      funnelName: `Tư vấn 1-1 — ${service}`,
      strategy: 'Thu lead form nhu cầu → gọi tư vấn nhanh → đề xuất liệu trình.',
      fitReason: 'Dịch vụ thẩm mỹ cần tư vấn trước khi book.',
      offer: 'Tư vấn miễn phí + đánh giá tình trạng',
      customerJourney: [
        { step: 1, label: 'Điền form' },
        { step: 2, label: 'Được gọi tư vấn' },
        { step: 3, label: 'Đặt lịch đến spa' },
        { step: 4, label: 'Chốt liệu trình' },
      ],
      channels: ['Zalo', 'Phone', 'Fanpage'],
      cta: 'Đăng ký tư vấn miễn phí',
      fitScore: 82,
    },
    {
      templateSlug: 'voucher',
      funnelName: `Voucher trải nghiệm — ${service}`,
      strategy: 'Dùng voucher giảm giá lần đầu để giảm rào cản thử dịch vụ.',
      fitReason: 'Phù hợp khi cần thu lead mới bằng ưu đãi.',
      offer: analysis.offer,
      customerJourney: [
        { step: 1, label: 'Thấy ads ưu đãi' },
        { step: 2, label: 'Nhận voucher' },
        { step: 3, label: 'Tư vấn ngắn' },
        { step: 4, label: 'Đặt lịch' },
      ],
      channels: ['Facebook Ads', 'Zalo'],
      cta: 'Nhận voucher trải nghiệm ngay',
      fitScore: 74,
    },
  ];

  return {
    schemaVersion: 'funnel-generator.v1',
    prompt,
    analysis,
    recommendations,
  };
}

export function buildFallbackFunnelComplete(opts: {
  templateSlug: FunnelTemplateSlug | string;
  option?: FunnelRecommendationOption;
  analysis?: FunnelBriefAnalysis;
}): FunnelCompleteSpec {
  const slug = (
    AUTOPILOT_FUNNEL_TEMPLATE_SLUGS.includes(opts.templateSlug as FunnelTemplateSlug)
      ? opts.templateSlug
      : 'consultation'
  ) as FunnelTemplateSlug;
  const option = opts.option;
  return {
    schemaVersion: 'funnel-complete.v1',
    templateSlug: slug,
    mode: 'draft',
    name: option?.funnelName ?? `Autopilot Funnel — ${slug}`,
    offer: option?.offer ?? opts.analysis?.offer ?? 'Ưu đãi trải nghiệm',
    cta: option?.cta ?? 'Đăng ký tư vấn',
    analysis: opts.analysis,
    option,
    disclaimers: [
      'Funnel draft do Marketing Autopilot tạo trên baseline chưa có Funnel Builder.',
      'Không publish/live. Chỉ lưu completeSpec để chỉnh sửa sau.',
    ],
  };
}
