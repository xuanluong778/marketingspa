import { z } from 'zod';
import { FUNNEL_TEMPLATE_SLUGS } from './funnel-templates';

export const funnelBriefAnalysisSchema = z.object({
  industry: z.string().min(1).max(120),
  service: z.string().min(1).max(160),
  goal: z.string().min(1).max(240),
  targetAudience: z.string().min(1).max(400),
  painPoints: z.array(z.string().min(1).max(200)).min(1).max(8),
  offer: z.string().min(1).max(240),
  leadMagnet: z.string().min(1).max(240),
  channels: z.array(z.string().min(1).max(64)).min(1).max(10),
  budgetHint: z.string().max(120).nullable().optional(),
  regionHint: z.string().max(120).nullable().optional(),
  confidence: z.number().min(0).max(100).optional(),
});

export const funnelJourneyStepSchema = z.object({
  step: z.number().int().min(1).max(20),
  label: z.string().min(1).max(120),
  description: z.string().max(300).optional(),
});

export const funnelRecommendationOptionSchema = z.object({
  /** Must be one of Funnel Template Engine slugs — never free-form */
  templateSlug: z.enum(FUNNEL_TEMPLATE_SLUGS),
  funnelName: z.string().min(1).max(160),
  strategy: z.string().min(1).max(600),
  fitReason: z.string().min(1).max(600),
  offer: z.string().min(1).max(240),
  customerJourney: z.array(funnelJourneyStepSchema).min(2).max(12),
  channels: z.array(z.string().min(1).max(64)).min(1).max(10),
  cta: z.string().min(1).max(160),
  /** 0–100 fit score */
  fitScore: z.number().min(0).max(100),
});

export const funnelGeneratorResultSchema = z.object({
  schemaVersion: z.literal('funnel-generator.v1'),
  prompt: z.string().min(1).max(2000),
  analysis: funnelBriefAnalysisSchema,
  recommendations: z.array(funnelRecommendationOptionSchema).min(3).max(5),
  /** Preview only — never auto-applied */
  mode: z.literal('preview'),
  disclaimers: z.array(z.string()).max(5).default([
    'Chỉ đề xuất preview — chưa apply/deploy pipeline hoặc automation.',
  ]),
});

export type FunnelBriefAnalysis = z.infer<typeof funnelBriefAnalysisSchema>;
export type FunnelRecommendationOption = z.infer<typeof funnelRecommendationOptionSchema>;
export type FunnelGeneratorResult = z.infer<typeof funnelGeneratorResultSchema>;

export function parseFunnelGeneratorResult(raw: unknown): FunnelGeneratorResult {
  return funnelGeneratorResultSchema.parse(raw);
}

function fallbackSlugsForPrompt(prompt: string): Array<(typeof FUNNEL_TEMPLATE_SLUGS)[number]> {
  const lower = prompt.toLowerCase();
  const hit = FUNNEL_TEMPLATE_SLUGS.filter((slug) => lower.includes(slug));
  if (
    lower.includes('reactivat') ||
    lower.includes('retarget') ||
    lower.includes('chăm sóc') ||
    lower.includes('khách cũ') ||
    lower.includes('win-back') ||
    lower.includes('winback')
  ) {
    return uniqSlugs([...hit, 'reactivation', 'retargeting', 'referral', 'voucher', 'consultation']);
  }
  if (
    lower.includes('flash-sale') ||
    lower.includes('bán hàng') ||
    lower.includes('bán voucher') ||
    lower.includes('flash sale')
  ) {
    return uniqSlugs([...hit, 'flash-sale', 'voucher', 'referral', 'consultation', 'booking']);
  }
  if (lower.includes('booking') || lower.includes('đặt lịch') || lower.includes('consultation')) {
    return uniqSlugs([...hit, 'booking', 'consultation', 'quiz', 'voucher', 'giveaway']);
  }
  return uniqSlugs([...hit, 'voucher', 'quiz', 'giveaway', 'consultation', 'booking']);
}

function uniqSlugs(slugs: Array<(typeof FUNNEL_TEMPLATE_SLUGS)[number]>) {
  return [...new Set(slugs)].slice(0, 5);
}

/** Heuristic fallback when OpenAI unavailable — still constrained to template slugs */
export function buildFallbackFunnelRecommendations(
  prompt: string,
): FunnelGeneratorResult {
  const lower = prompt.toLowerCase();
  const service =
    lower.includes('phun môi')
      ? 'Phun môi thẩm mỹ'
      : lower.includes('nail')
        ? 'Nail / làm móng'
        : lower.includes('massage')
          ? 'Massage / spa'
          : 'Dịch vụ spa/beauty';

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

  const baseJourney = (labels: string[]) =>
    labels.map((label, i) => ({
      step: i + 1,
      label,
      description: undefined as string | undefined,
    }));

  const bySlug: Partial<Record<(typeof FUNNEL_TEMPLATE_SLUGS)[number], Omit<FunnelRecommendationOption, 'fitScore'>>> = {
    voucher: {
      templateSlug: 'voucher',
      funnelName: `Voucher trải nghiệm — ${service}`,
      strategy: 'Dùng voucher giảm giá lần đầu để giảm rào cản thử dịch vụ, sau đó nurture tới đặt lịch.',
      fitReason: 'Phù hợp khi cần thu lead mới bằng ưu đãi.',
      offer: analysis.offer,
      customerJourney: baseJourney(['Thấy ads ưu đãi', 'Nhận voucher', 'Tư vấn ngắn', 'Đặt lịch', 'Đến spa / mua']),
      channels: ['Facebook Ads', 'Zalo'],
      cta: 'Nhận voucher trải nghiệm ngay',
    },
    quiz: {
      templateSlug: 'quiz',
      funnelName: `Quiz chọn phong cách — ${service}`,
      strategy: 'Quiz phân loại nhu cầu → kết quả cá nhân hóa + CTA đặt lịch tư vấn.',
      fitReason: 'Giúp giáo dục khách và tăng chất lượng lead.',
      offer: 'Bài quiz + gợi ý liệu trình phù hợp',
      customerJourney: baseJourney(['Làm quiz', 'Xem kết quả', 'Nhận tư vấn', 'Đặt lịch']),
      channels: ['TikTok', 'Facebook', 'Landing'],
      cta: 'Làm quiz 1 phút — nhận gợi ý',
    },
    consultation: {
      templateSlug: 'consultation',
      funnelName: `Tư vấn 1-1 — ${service}`,
      strategy: 'Thu lead form nhu cầu → gọi tư vấn nhanh → đề xuất liệu trình.',
      fitReason: 'Dịch vụ thẩm mỹ cần tư vấn trước khi book.',
      offer: 'Tư vấn miễn phí + đánh giá tình trạng',
      customerJourney: baseJourney(['Điền form', 'Được gọi tư vấn', 'Đặt lịch đến spa', 'Chốt liệu trình']),
      channels: ['Zalo', 'Phone', 'Fanpage'],
      cta: 'Đăng ký tư vấn miễn phí',
    },
    giveaway: {
      templateSlug: 'giveaway',
      funnelName: `Mini game săn quà — ${service}`,
      strategy: 'Viral mini game để tăng reach, thu lead hàng loạt rồi nurture sang book.',
      fitReason: 'Phù hợp khi cần volume lead nhanh từ social.',
      offer: 'Quay số / scratch nhận liệu trình trải nghiệm',
      customerJourney: baseJourney(['Chơi mini game', 'Để lại SĐT', 'Nhận quà / ưu đãi', 'Book lịch']),
      channels: ['TikTok', 'Facebook', 'Instagram'],
      cta: 'Chơi ngay — nhận ưu đãi',
    },
    booking: {
      templateSlug: 'booking',
      funnelName: `Phễu đặt lịch chuẩn — ${service}`,
      strategy: 'Tối ưu hành trình book → confirm → visit để giảm no-show.',
      fitReason: 'Khi đã có traffic, cần vận hành lịch hẹn.',
      offer: 'Giữ chỗ ưu tiên trong tuần',
      customerJourney: baseJourney(['Lead mới', 'Liên hệ', 'Đặt lịch', 'Xác nhận', 'Đến spa']),
      channels: ['Zalo OA', 'SMS', 'Phone'],
      cta: 'Đặt lịch trong 30 giây',
    },
    content: {
      templateSlug: 'content',
      funnelName: `Content nurture — ${service}`,
      strategy: 'Nội dung nuôi dưỡng rồi CTA chuyển đổi.',
      fitReason: 'Phù hợp khi cần lead ấm trước khi bán.',
      offer: 'Series kiến thức + ưu đãi độc giả',
      customerJourney: baseJourney(['Đọc nội dung', 'Để lại SĐT', 'Nurture', 'Đặt lịch']),
      channels: ['SEO', 'Fanpage', 'Zalo'],
      cta: 'Nhận cẩm nang miễn phí',
    },
    'flash-sale': {
      templateSlug: 'flash-sale',
      funnelName: `Flash sale — ${service}`,
      strategy: 'Deal có hạn → giữ chỗ / thanh toán nhanh.',
      fitReason: 'Phù hợp mục tiêu bán hàng ngắn hạn.',
      offer: 'Giá flash trong khung giờ vàng',
      customerJourney: baseJourney(['Thấy deal', 'Giữ chỗ', 'Thanh toán / đến spa']),
      channels: ['Facebook Ads', 'Zalo'],
      cta: 'Giữ chỗ flash sale',
    },
    retargeting: {
      templateSlug: 'retargeting',
      funnelName: `Nhắc khách đã xem — ${service}`,
      strategy: 'Offer cá nhân hóa cho khách đã tương tác chưa chốt.',
      fitReason: 'Phù hợp chăm sóc lại audience ấm.',
      offer: 'Ưu đãi dành riêng người đã quan tâm',
      customerJourney: baseJourney(['Nhìn ads nhắc', 'Nhận offer', 'Đặt lịch lại', 'Mua']),
      channels: ['Facebook Ads', 'Zalo'],
      cta: 'Nhận ưu đãi dành riêng',
    },
    referral: {
      templateSlug: 'referral',
      funnelName: `Giới thiệu bạn — ${service}`,
      strategy: 'Khách cũ mời bạn → thưởng khi bạn book/mua.',
      fitReason: 'Tăng trưởng từ khách hiện có.',
      offer: 'Thưởng khi giới thiệu bạn đặt lịch',
      customerJourney: baseJourney(['Gửi link', 'Bạn điền form', 'Bạn đặt lịch', 'Thưởng']),
      channels: ['Zalo', 'Messenger'],
      cta: 'Mời bạn — nhận thưởng',
    },
    reactivation: {
      templateSlug: 'reactivation',
      funnelName: `Đánh thức khách cũ — ${service}`,
      strategy: 'Offer win-back + chuỗi chăm sóc khách/lead ngủ đông.',
      fitReason: 'Phù hợp mục tiêu chăm sóc lại khách.',
      offer: 'Ưu đãi quay lại sau thời gian vắng',
      customerJourney: baseJourney(['Nhận offer win-back', 'Phản hồi', 'Đặt lịch lại', 'Mua lại']),
      channels: ['Zalo OA', 'SMS'],
      cta: 'Nhận ưu đãi quay lại',
    },
  };

  const recommendations: FunnelRecommendationOption[] = fallbackSlugsForPrompt(prompt).map(
    (slug, i) => ({
      ...(bySlug[slug] as Omit<FunnelRecommendationOption, 'fitScore'>),
      fitScore: 92 - i * 4,
    }),
  );

  return parseFunnelGeneratorResult({
    schemaVersion: 'funnel-generator.v1',
    prompt,
    analysis,
    recommendations,
    mode: 'preview',
    disclaimers: [
      'Chỉ đề xuất preview — chưa apply/deploy pipeline hoặc automation.',
      'Chọn một phương án rồi mới clone/apply template trong Funnel Template Engine.',
    ],
  });
}
