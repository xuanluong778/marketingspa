export type FunnelSimpleGoal = 'lead' | 'booking' | 'sales' | 'reactivate';

export const FUNNEL_SIMPLE_GOALS: Array<{
  id: FunnelSimpleGoal;
  label: string;
  description: string;
  apiGoal: string;
  prompt: string;
  slugs: string[];
}> = [
  {
    id: 'lead',
    label: 'Thu Lead',
    description: 'Thu khách mới qua form, voucher hoặc mini game.',
    apiGoal: 'Thu lead mới',
    prompt:
      'Tạo phễu thu lead mới cho spa. Ưu tiên template voucher, giveaway, quiz. Form công khai lấy SĐT, chatbot hỏi nhu cầu, chuyển sale liên hệ nhanh.',
    slugs: ['voucher', 'giveaway', 'quiz', 'content'],
  },
  {
    id: 'booking',
    label: 'Đặt lịch',
    description: 'Đưa khách đặt lịch tư vấn / trải nghiệm rồi đến spa.',
    apiGoal: 'Đặt lịch tư vấn / booking',
    prompt:
      'Tạo phễu đặt lịch cho spa. Ưu tiên template booking, consultation. Form đặt lịch, nhắc xác nhận, giảm no-show, sale follow-up.',
    slugs: ['booking', 'consultation', 'quiz'],
  },
  {
    id: 'sales',
    label: 'Bán hàng',
    description: 'Chốt voucher, flash sale hoặc gói dịch vụ.',
    apiGoal: 'Bán voucher / gói ưu đãi',
    prompt:
      'Tạo phễu bán hàng cho spa. Ưu tiên template flash-sale, voucher, referral. Offer rõ ràng, CTA mua / giữ chỗ, follow-up chốt đơn.',
    slugs: ['flash-sale', 'voucher', 'referral'],
  },
  {
    id: 'reactivate',
    label: 'Chăm sóc lại khách',
    description: 'Đánh thức khách cũ, lead ngủ hoặc người đã xem chưa chốt.',
    apiGoal: 'Reactivation khách cũ',
    prompt:
      'Tạo phễu chăm sóc lại khách cũ / lead ngủ đông. Ưu tiên template reactivation, retargeting, referral. Offer win-back, nhắc đặt lịch lại.',
    slugs: ['reactivation', 'retargeting', 'referral'],
  },
];

export const FUNNEL_TEMPLATE_SIMPLE_NAME: Record<string, string> = {
  voucher: 'Ưu đãi / voucher',
  giveaway: 'Mini game',
  quiz: 'Quiz chọn dịch vụ',
  consultation: 'Tư vấn 1-1',
  booking: 'Đặt lịch',
  content: 'Content nuôi dưỡng',
  'flash-sale': 'Flash sale',
  retargeting: 'Nhắc khách đã xem',
  referral: 'Giới thiệu bạn',
  reactivation: 'Đánh thức khách cũ',
};

export function getFunnelSimpleGoal(id: string | null | undefined) {
  return FUNNEL_SIMPLE_GOALS.find((g) => g.id === id) ?? null;
}

export function pickFunnelTemplateSlug(
  recommendations: Array<{ templateSlug: string; fitScore: number }>,
  preferredSlug?: string | null,
  goalSlugs: string[] = [],
): string | null {
  if (!recommendations.length) return null;
  if (preferredSlug && recommendations.some((r) => r.templateSlug === preferredSlug)) {
    return preferredSlug;
  }
  const rankedGoal = recommendations
    .filter((r) => goalSlugs.includes(r.templateSlug))
    .sort((a, b) => b.fitScore - a.fitScore);
  if (rankedGoal[0]) return rankedGoal[0].templateSlug;
  return [...recommendations].sort((a, b) => b.fitScore - a.fitScore)[0]?.templateSlug ?? null;
}
