import type { AdCtaSuggestion, AdInsightsSuggestion, AdObjective } from '@/types/content-marketing';
import { AD_OBJECTIVE_OPTIONS } from '@/types/content-marketing';

const OBJECTIVE_INSIGHT_TWEAKS: Record<
  AdObjective,
  { painSuffix?: string; benefitSuffix?: string }
> = {
  messages: { benefitSuffix: 'dễ inbox tư vấn nhanh, phản hồi tận tâm' },
  engagement: {
    painSuffix: 'dễ bỏ qua nội dung không gây tò mò',
    benefitSuffix: 'dễ chia sẻ, kích thích bình luận',
  },
  lead_form: { benefitSuffix: 'nhận báo giá/checklist sau khi để lại thông tin' },
  landing_conversion: { benefitSuffix: 'quy trình rõ trên landing, dễ đăng ký/mua' },
  direct_sales: { benefitSuffix: 'ưu đãi rõ, dễ chốt đơn/đặt lịch' },
  remarketing: {
    painSuffix: 'đã từng quan tâm nhưng chưa quay lại',
    benefitSuffix: 'ưu đãi quay lại, nhắc nhẹ không gây khó chịu',
  },
  brand_awareness: {
    painSuffix: 'chưa biết thương hiệu hoặc chưa tin tưởng',
    benefitSuffix: 'câu chuyện thương hiệu, uy tín lâu năm',
  },
};

/** Fallback khi API chưa có endpoint hoặc lỗi mạng */
export function suggestAdInsightsLocal(input: {
  productService: string;
  targetAudience?: string;
  adObjective?: string;
}): AdInsightsSuggestion {
  const product = input.productService.trim();
  const audience = input.targetAudience?.trim() || 'khách hàng mục tiêu';
  const lower = product.toLowerCase();

  let painPoints =
    'Khó tìm giải pháp phù hợp, lo ngại hiệu quả không như mong đợi, thiếu thời gian tìm hiểu kỹ';
  let benefits =
    'Giải pháp rõ ràng, quy trình minh bạch, cảm nhận khác biệt sau liệu trình, được tư vấn tận tâm';

  if (/da|spa|trẻ hóa|facial|skincare|mụn|lỗ chân lông/i.test(lower)) {
    painPoints =
      'Da xỉn màu, lỗ chân lông to, makeup không ăn, da lão hóa sớm do stress và thiếu chăm sóc';
    benefits =
      'Da sáng hơn, mịn màng hơn, makeup ăn nền, thư giãn toàn thân, cải thiện rõ sau liệu trình';
  } else if (/massage|thư giãn|body|gội/i.test(lower)) {
    painPoints = 'Mỏi vai gáy, căng cơ, mất ngủ, stress công việc, cơ thể luôn mệt mỏi';
    benefits = 'Thư giãn sâu, giảm đau nhức, ngủ ngon hơn, tái tạo năng lượng, cảm giác nhẹ người';
  } else if (/giảm cân|slim|eo|dáng|fit/i.test(lower)) {
    painPoints = 'Mỡ bụng tích tụ, khó giảm cân dù đã thử nhiều cách, mất tự tin về vóc dáng';
    benefits = 'Vóc dáng săn chắc hơn, giảm số đo có căn cứ, quy trình an toàn, tự tin hơn khi mặc đồ';
  } else if (/nail|mi|lash|phun xăm|làm đẹp/i.test(lower)) {
    painPoints = 'Khó giữ nét đẹp lâu, sợ hỏng tự nhiên, không biết chọn dịch vụ uy tín';
    benefits = 'Lên form chuẩn, bền màu, tự nhiên, được chăm sóc kỹ, phù hợp phong cách cá nhân';
  }

  if (audience && audience !== 'khách hàng mục tiêu') {
    painPoints = `${audience}: ${painPoints}`;
  }

  const objective = AD_OBJECTIVE_OPTIONS.find((o) => o.value === input.adObjective);
  const tweak = input.adObjective
    ? OBJECTIVE_INSIGHT_TWEAKS[input.adObjective as AdObjective]
    : undefined;
  if (tweak?.painSuffix) painPoints = `${painPoints}, ${tweak.painSuffix}`;
  if (tweak?.benefitSuffix) benefits = `${benefits}, ${tweak.benefitSuffix}`;

  return {
    painPoints,
    benefits: `${benefits} — phù hợp cho ${product}${objective ? ` (${objective.description})` : ''}`,
    source: 'template',
  };
}

export function suggestAdCtaLocal(input: {
  productService: string;
  offer?: string;
  adContentType?: string;
  platform?: string;
  adObjective?: string;
}): AdCtaSuggestion {
  const product = input.productService.trim();
  const offer = input.offer?.trim();
  const objective = AD_OBJECTIVE_OPTIONS.find((o) => o.value === input.adObjective);

  if (objective) {
    const alts: Record<AdObjective, string[]> = {
      messages: [
        `Inbox "TƯ VẤN" để được tư vấn ${product} miễn phí`,
        'Nhắn tin ngay — phản hồi trong 5 phút',
        'Inbox để nhận lộ trình phù hợp',
      ],
      engagement: [
        'Tag người bạn nghĩ cần đọc bài này',
        'Thả tim nếu bạn đồng ý',
        'Share để bạn bè cùng thảo luận',
      ],
      lead_form: [
        'Comment "OK" để nhận báo giá chi tiết',
        'Inbox "BÁO GIÁ" để nhận bảng giá',
        'Để lại SĐT — gọi tư vấn trong ngày',
      ],
      landing_conversion: [
        'Click link bio để xem landing',
        'Truy cập trang đăng ký — slot có hạn',
        'Xem quy trình đầy đủ trên landing page',
      ],
      direct_sales: [
        offer ? `Đặt lịch ngay — ${offer}` : `Đặt lịch ${product} hôm nay`,
        'Comment "ĐẶT LỊCH" để được nhắn lịch',
        'Nhắn tin để nhận ưu đãi tháng này',
      ],
      remarketing: [
        'Bạn còn ưu đãi chưa dùng — inbox để kích hoạt',
        'Inbox "QUAY LẠI" nhận quà',
        'Đừng bỏ lỡ — nhắn tin trước khi hết hạn',
      ],
      brand_awareness: [
        'Theo dõi để xem thêm câu chuyện thương hiệu',
        'Tìm hiểu thêm về hành trình của chúng tôi',
        'Xem thêm trên trang — không bán hàng ngay',
      ],
    };
    return {
      cta: objective.defaultCta,
      alternatives: alts[objective.value].slice(0, 4),
      source: 'template',
    };
  }

  const type = input.adContentType ?? 'sales';

  if (type === 'inbox') {
    return {
      cta: `Inbox "TƯ VẤN" để được tư vấn ${product} miễn phí`,
      alternatives: [
        'Nhắn tin ngay — phản hồi trong 5 phút',
        'Inbox để nhận lộ trình phù hợp',
        'Comment "INBOX" để được nhắn riêng',
      ],
      source: 'template',
    };
  }
  if (type === 'lead') {
    return {
      cta: 'Comment "OK" để nhận báo giá chi tiết',
      alternatives: [
        'Inbox "BÁO GIÁ" để nhận bảng giá',
        'Để lại SĐT — gọi tư vấn trong ngày',
        'Inbox để nhận checklist tư vấn miễn phí',
      ],
      source: 'template',
    };
  }
  if (type === 'promo' && offer) {
    return {
      cta: `Inbox ngay — ${offer}`,
      alternatives: [
        'Comment "ƯU ĐÃI" để giữ suất',
        'Nhắn tin trước khi hết slot',
        `Đặt lịch hôm nay — ${offer}`,
      ],
      source: 'template',
    };
  }

  return {
    cta: offer ? `Đặt lịch ngay — ${offer}` : `Inbox "SPA" để tư vấn ${product}`,
    alternatives: [
      'Comment "ĐẶT LỊCH" để được nhắn lịch',
      'Nhắn tin để nhận ưu đãi tháng này',
      input.platform === 'tiktok' ? 'Follow + comment để xem thêm' : 'Inbox ngay để giữ suất',
    ],
    source: 'template',
  };
}
