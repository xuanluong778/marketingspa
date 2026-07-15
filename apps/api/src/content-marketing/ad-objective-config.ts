export const AD_OBJECTIVES = [
  'messages',
  'engagement',
  'lead_form',
  'landing_conversion',
  'direct_sales',
  'remarketing',
  'brand_awareness',
] as const;

export type AdObjective = (typeof AD_OBJECTIVES)[number];

export interface AdObjectiveConfig {
  value: AdObjective;
  label: string;
  description: string;
  defaultContentType: string;
  generateHint: string;
  ctaPattern: RegExp;
  hookPattern: RegExp;
  proofPattern: RegExp;
  defaultCta: string;
  defaultHooks: string[];
  ctaWeight: number;
}

export const AD_OBJECTIVE_CONFIGS: AdObjectiveConfig[] = [
  {
    value: 'messages',
    label: 'Quảng cáo tin nhắn',
    description: 'Kéo khách inbox',
    defaultContentType: 'inbox',
    generateHint: 'Ưu tiên kéo inbox/Messenger, CTA nhắn tin ngắn gọn, hook gợi mở tò mò',
    ctaPattern: /inbox|nhắn tin|messenger|tin nhắn|nhắn ngay/i,
    hookPattern: /[!?]|bạn có|biết chưa|tại sao|đừng bỏ/i,
    proofPattern: /review|khách hàng|phản hồi/i,
    defaultCta: 'Inbox "TƯ VẤN" để được tư vấn miễn phí',
    defaultHooks: [
      'Bạn có đang gặp vấn đề này không?',
      'Inbox ngay nếu bạn liên quan 3 giây đầu',
      'Đừng bỏ lỡ — nhắn tin để biết thêm',
    ],
    ctaWeight: 1.25,
  },
  {
    value: 'engagement',
    label: 'Quảng cáo tương tác',
    description: 'Tăng like/comment/share',
    defaultContentType: 'hook_3s',
    generateHint: 'Kích thích comment/chia sẻ, đặt câu hỏi, hook gây tranh luận nhẹ',
    ctaPattern: /comment|bình luận|chia sẻ|share|tag|thả tim|like/i,
    hookPattern: /[!?]|thử|ai đồng ý|bạn nghĩ|đoán xem/i,
    proofPattern: /nhiều người|viral|tương tác/i,
    defaultCta: 'Comment ý kiến của bạn — bạn đồng ý không?',
    defaultHooks: [
      '90% mọi người làm sai bước này — bạn thì sao?',
      'Chỉ 1 câu hỏi: bạn chọn A hay B?',
      'Ai từng gặp chuyện này giơ tay (comment nhé)',
    ],
    ctaWeight: 1.15,
  },
  {
    value: 'lead_form',
    label: 'Quảng cáo lead form',
    description: 'Lấy SĐT/thông tin khách',
    defaultContentType: 'lead',
    generateHint: 'CTA điền form/để lại SĐT, nêu lợi ích khi để lại thông tin',
    ctaPattern: /đăng ký|form|để lại|số điện thoại|điền|lead|thông tin/i,
    hookPattern: /miễn phí|checklist|báo giá|tư vấn/i,
    proofPattern: /%|đã đăng ký|khách hàng/i,
    defaultCta: 'Để lại SĐT — tư vấn miễn phí trong ngày',
    defaultHooks: [
      'Nhận báo giá chi tiết chỉ với 1 bước đăng ký',
      'Form 30 giây — nhận lộ trình phù hợp',
      'Đăng ký ngay để nhận checklist miễn phí',
    ],
    ctaWeight: 1.2,
  },
  {
    value: 'landing_conversion',
    label: 'Quảng cáo chuyển đổi landing page',
    description: 'Kéo vào landing đăng ký/mua',
    defaultContentType: 'lead',
    generateHint: 'CTA click link/landing page, nêu rõ bước tiếp theo sau khi click',
    ctaPattern: /click|link|landing|trang|đăng ký|xem ngay|truy cập/i,
    hookPattern: /bước|hướng dẫn|xem ngay|khám phá/i,
    proofPattern: /case|kết quả|đã thử/i,
    defaultCta: 'Click link bio / landing để đăng ký nhận ưu đãi',
    defaultHooks: [
      'Xem chi tiết trên landing — slot có hạn',
      '3 bước trên landing page này thay đổi cách bạn...',
      'Click để xem quy trình đầy đủ',
    ],
    ctaWeight: 1.2,
  },
  {
    value: 'direct_sales',
    label: 'Quảng cáo bán hàng trực tiếp',
    description: 'Viết content chốt đơn',
    defaultContentType: 'sales',
    generateHint: 'CTA mua/đặt lịch rõ, nhấn ưu đãi có hạn, social proof',
    ctaPattern: /mua|đặt lịch|chốt|đặt hàng|thanh toán|order/i,
    hookPattern: /giảm|ưu đãi|chỉ còn|hôm nay/i,
    proofPattern: /%|review|đã mua|khách hàng|bán chạy/i,
    defaultCta: 'Đặt lịch ngay — ưu đãi có hạn',
    defaultHooks: [
      'Chỉ còn vài suất trong tuần này',
      'Giảm ngay hôm nay — đừng để hết slot',
      'Lý do khách chốt đơn ngay sau buổi tư vấn',
    ],
    ctaWeight: 1.25,
  },
  {
    value: 'remarketing',
    label: 'Quảng cáo remarketing',
    description: 'Bám đuổi khách đã tương tác',
    defaultContentType: 'remarketing',
    generateHint: 'Nhắc khách đã từng xem/inbox, ưu đãi quay lại, tạo FOMO nhẹ',
    ctaPattern: /quay lại|nhắc|ưu đãi|đừng bỏ lỡ|còn|dành cho bạn/i,
    hookPattern: /bạn đã|nhớ|lần trước|quay lại/i,
    proofPattern: /đã từng|khách cũ|quay lại/i,
    defaultCta: 'Quay lại hôm nay — inbox "QUAY LẠI" nhận quà',
    defaultHooks: [
      'Bạn đã từng inbox — ưu đãi vẫn còn cho bạn',
      'Nhắc nhẹ: deal dành riêng khách đã quan tâm',
      'Đừng để ưu đãi hết hạn — quay lại ngay',
    ],
    ctaWeight: 1.15,
  },
  {
    value: 'brand_awareness',
    label: 'Quảng cáo nhận diện thương hiệu',
    description: 'Tăng độ nhận biết thương hiệu',
    defaultContentType: 'case_study',
    generateHint: 'Kể câu chuyện thương hiệu, CTA mềm (follow/tìm hiểu), ít chốt sale',
    ctaPattern: /follow|theo dõi|tìm hiểu|xem thêm|nhận biết|thương hiệu/i,
    hookPattern: /câu chuyện|hành trình|vì sao|thương hiệu/i,
    proofPattern: /năm|kinh nghiệm|hành trình|sứ mệnh/i,
    defaultCta: 'Follow để xem thêm hành trình thương hiệu',
    defaultHooks: [
      'Ít ai biết câu chuyện đằng sau thương hiệu này',
      'Chúng tôi bắt đầu từ một điều rất giản đơn...',
      'Không phải ads — đây là lý do chúng tôi làm spa',
    ],
    ctaWeight: 0.85,
  },
];

export function getAdObjectiveConfig(objective?: string): AdObjectiveConfig | undefined {
  if (!objective) return undefined;
  return AD_OBJECTIVE_CONFIGS.find((c) => c.value === objective);
}

export function normalizeAdObjective(raw?: string): AdObjective | undefined {
  if (!raw?.trim()) return undefined;
  const v = raw.trim();
  if ((AD_OBJECTIVES as readonly string[]).includes(v)) return v as AdObjective;
  const lower = v.toLowerCase();
  if (/inbox|tin nhắn|nhắn/i.test(lower)) return 'messages';
  if (/tương tác|comment|like|share/i.test(lower)) return 'engagement';
  if (/lead|form|sđt|số điện thoại/i.test(lower)) return 'lead_form';
  if (/landing|chuyển đổi/i.test(lower)) return 'landing_conversion';
  if (/bán hàng|chốt|sales/i.test(lower)) return 'direct_sales';
  if (/remarketing|bám|quay lại/i.test(lower)) return 'remarketing';
  if (/nhận diện|thương hiệu|brand/i.test(lower)) return 'brand_awareness';
  return undefined;
}
