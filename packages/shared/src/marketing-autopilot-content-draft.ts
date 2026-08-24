import { z } from 'zod';

export const AUTOPILOT_CONTENT_FORMATS = [
  'short_video',
  'carousel',
  'landing_page',
  'email',
  'chatbot',
  'facebook_post',
] as const;

export type AutopilotContentFormat = (typeof AUTOPILOT_CONTENT_FORMATS)[number];

export const autopilotShortVideoSchema = z.object({
  hook3s: z.string().min(1).max(400),
  scenes: z
    .array(
      z.object({
        shot: z.string().min(1).max(400),
        dialogue: z.string().min(1).max(800),
        overlay: z.string().max(200).optional(),
      }),
    )
    .min(2)
    .max(8),
  closingCta: z.string().min(1).max(300),
});

export const autopilotCarouselSchema = z.object({
  slides: z
    .array(
      z.object({
        title: z.string().min(1).max(120),
        body: z.string().min(1).max(600),
      }),
    )
    .min(4)
    .max(10),
});

export const autopilotContentIdeaSchema = z.object({
  index: z.number().int().min(1).max(10),
  title: z.string().min(1).max(200),
  hook: z.string().min(1).max(400),
  customerInsight: z.string().min(1).max(600),
  angle: z.string().min(1).max(400),
  fullContent: z.string().min(40).max(12000),
  offer: z.string().min(1).max(400),
  cta: z.string().min(1).max(200),
  channel: z.string().min(1).max(80),
  format: z.enum(AUTOPILOT_CONTENT_FORMATS),
  formatLabel: z.string().min(1).max(80),
  shortVideo: autopilotShortVideoSchema.optional(),
  carousel: autopilotCarouselSchema.optional(),
  safetyNotes: z.array(z.string().max(200)).max(4).optional(),
});

export type AutopilotContentIdea = z.infer<typeof autopilotContentIdeaSchema>;

export const autopilotContentDraftBundleSchema = z.object({
  version: z.literal('v1'),
  generatedAt: z.string(),
  productName: z.string(),
  targetArea: z.string(),
  primaryGoal: z.string(),
  customerProfile: z.string(),
  valueProposition: z.string(),
  draftOnly: z.literal(true),
  ideas: z.array(autopilotContentIdeaSchema).min(5).max(8),
});

export type AutopilotContentDraftBundle = z.infer<typeof autopilotContentDraftBundleSchema>;

export type AutopilotContentDraftInput = {
  productName: string;
  productPrice?: number;
  customerProfile: string;
  targetArea: string;
  primaryGoal: string;
  valueProps?: string[];
  valueProposition?: string;
  painPoints?: string[];
  icpProfiles?: Array<{ name?: string; description?: string }>;
};

const GENERIC_PATTERNS =
  /^(angle theo|short video|carousel|landpage|email sequence|content studio|facebook ads|reel|bài viết)$/i;

export function isGenericAutopilotContentLine(text: string): boolean {
  const t = text.trim();
  if (!t || t.length < 8) return true;
  if (GENERIC_PATTERNS.test(t)) return true;
  if (/^angle theo (lợi ích|nỗi đau)/i.test(t)) return true;
  if (/^themes?\s*\/\s*formats?\s*\/\s*channels?$/i.test(t)) return true;
  return false;
}

function firstPainClause(pain: string): string {
  const first = pain.split('.')[0]?.trim();
  return first && first.length > 0 ? first : pain.trim();
}

function isRegulatedBeauty(input: AutopilotContentDraftInput): boolean {
  const blob = `${input.productName} ${input.customerProfile} ${input.primaryGoal}`.toLowerCase();
  return /nám|tàn nhang|melasma|trị mụn|mụn|laser|tiêm|filler|botox|y tế|phòng khám|điều trị|thẩm mỹ/i.test(
    blob,
  );
}

function beautySafetyNotes(): string[] {
  return [
    'Không cam kết “hết nám 100%” hay kết quả chắc chắn — hiệu quả tùy cơ địa và mức độ nám.',
    'Khuyến khích khách thăm khám / tư vấn trực tiếp trước khi điều trị.',
    'Tránh thay thế tư vấn y khoa; dùng ngôn ngữ “có thể hỗ trợ”, “tham khảo chuyên viên”.',
  ];
}

function inferPainPoints(input: AutopilotContentDraftInput): string[] {
  if (input.painPoints?.length) {
    return input.painPoints.filter((p) => p.trim()).slice(0, 6);
  }
  const blob = `${input.productName} ${input.customerProfile} ${input.primaryGoal}`.toLowerCase();
  if (/nám|tàn nhang|đốm nâu|melasma|pigment/.test(blob)) {
    return [
      'Nám sẫm khiến da không đều màu, phải che makeup dày mới tự tin ra ngoài',
      'Lo điều trị không an toàn hoặc nám quay lại sau khi ngưng kem',
      'Ngại gặp gỡ, chụp ảnh vì vùng nám lộ rõ dưới ánh sáng',
      'Đã thử kem online / tip mạng nhưng nám không cải thiện bền',
      'Muốn lộ trình rõ ràng, theo dõi tiến triển thay vì “thử vận may”',
    ];
  }
  if (/giảm cân|slim|eo|béo/.test(blob)) {
    return [
      'Mặc đồ không vừa, mất tự tin khi chụp ảnh toàn thân',
      'Lo giảm cân nhanh nhưng dễ tăng lại',
      'Không có thời gian tập luyện đều đặn',
    ];
  }
  return [
    `Khách ${input.targetArea} chưa tìm được giải pháp phù hợp cho "${input.productName}"`,
    `Băn khoăn chi phí / thời gian so với lợi ích thực tế`,
    `Cần đơn vị uy tín, quy trình rõ ràng thay vì quảng cáo chung chung`,
    `Muốn được tư vấn cụ thể trước khi quyết định`,
  ];
}

function formatVnd(amount?: number): string {
  if (amount == null || !(amount > 0)) return '';
  return `${Math.round(amount).toLocaleString('vi-VN')}đ`;
}

function valuePropLine(input: AutopilotContentDraftInput): string {
  const vp =
    input.valueProposition?.trim() ||
    (input.valueProps?.filter(Boolean).join(' · ') ?? '') ||
    `Giải pháp ${input.productName} tại ${input.targetArea}`;
  return vp;
}

function icpLine(input: AutopilotContentDraftInput): string {
  const icp = input.customerProfile.trim() || 'Khách hàng mục tiêu';
  const profiles = (input.icpProfiles ?? [])
    .map((p) => p.description?.trim() || p.name?.trim())
    .filter(Boolean)
    .slice(0, 2);
  return profiles.length ? `${icp} (${profiles.join('; ')})` : icp;
}

function buildShortVideoIdea(
  input: AutopilotContentDraftInput,
  pain: string,
  idx: number,
): AutopilotContentIdea {
  const product = input.productName.trim();
  const area = input.targetArea.trim();
  const hook3s = `"${firstPainClause(pain)}?" — Bạn không cần che nám mãi nếu hiểu đúng nguyên nhân.`;
  const scenes = [
    {
      shot: 'Close-up vùng má có nám dưới ánh sáng tự nhiên (che một phần khuôn mặt nếu cần)',
      dialogue: `Mình từng nghĩ nám là do thiếu kem dưỡng. Thực tế, nám cần lộ trình đúng — không phải kem “trị nhanh”.`,
      overlay: 'Nám không = thiếu kem',
    },
    {
      shot: 'Cận tay chuyên viên giải thích trên mô hình / bảng so sánh nám nông – sâu',
      dialogue: `${product} tại ${area} được thiết kế cho người bận rộn: thăm khám → phác đồ rõ → theo dõi tiến triển, không hứa hẹn mơ hồ.`,
      overlay: 'Lộ trình rõ · Theo dõi tiến triển',
    },
    {
      shot: 'Khách hàng thật (che mặt nếu cần) + text testimonial ngắn',
      dialogue: `Sau buổi tư vấn, mình hiểu mình thuộc nhóm nám nào và cần kiên trì bao lâu — cảm giác yên tâm hơn nhiều.`,
      overlay: 'Tư vấn trước · Không cam kết 100%',
    },
  ];
  const closingCta = `Inbox "${product.slice(0, 12)}" để đặt lịch tư vấn miễn phí tại ${area}.`;
  const fullContent = [
    '**Short Video (30–45s) — Facebook Reels / TikTok**',
    '',
    '**Hook 3 giây**',
    hook3s,
    '',
    '**Cảnh quay → Lời thoại → Text overlay**',
    ...scenes.map(
      (s, i) =>
        `${i + 1}. **Cảnh:** ${s.shot}\n   **Lời thoại:** ${s.dialogue}\n   **Text overlay:** ${s.overlay ?? '—'}`,
    ),
    '',
    '**CTA cuối**',
    closingCta,
  ].join('\n');

  return {
    index: idx,
    title: `Reels: Vì sao nám khó hết nếu chỉ dùng kem? (${product})`,
    hook: hook3s,
    customerInsight: pain,
    angle: 'Giáo dục ngắn: phân biệt nám nông/sâu + lộ trình thăm khám có theo dõi',
    fullContent,
    offer: input.productPrice
      ? `Tư vấn miễn phí + báo giá minh bạch từ ${formatVnd(input.productPrice)} (tùy mức độ nám)`
      : 'Tư vấn miễn phí + báo giá minh bạch sau thăm khám',
    cta: closingCta,
    channel: 'Facebook Reels / TikTok',
    format: 'short_video',
    formatLabel: 'Short Video · Reels/TikTok 30–45s',
    shortVideo: { hook3s, scenes, closingCta },
    safetyNotes: isRegulatedBeauty(input) ? beautySafetyNotes() : undefined,
  };
}

function buildCarouselIdea(
  input: AutopilotContentDraftInput,
  pain: string,
  idx: number,
  topic = 'vấn đề',
): AutopilotContentIdea {
  const product = input.productName.trim();
  const area = input.targetArea.trim();
  const vp = valuePropLine(input);
  const slides = [
    {
      title: `5 dấu hiệu bạn nên xem lại giải pháp ${product}`,
      body: `• ${firstPainClause(pain)}\n• Đã thử nhiều cách nhưng chưa ổn định\n• Cần quy trình rõ thay vì lời hứa chung chung\n• Muốn được tư vấn trước khi quyết định\n• Ở ${area}, cần đơn vị uy tín, theo dõi sau dịch vụ`,
    },
    {
      title: 'Vì sao “mua theo cảm giác” thường tốn thời gian?',
      body: `Mỗi ${topic} có nguyên nhân khác nhau. Tư vấn trước giúp bạn hiểu lộ trình và kỳ vọng thực tế.`,
    },
    {
      title: `${product} khác ở điểm nào?`,
      body: `${vp}. Quy trình: thăm khám → phác đồ cá nhân → theo dõi tại ${area}.`,
    },
    {
      title: 'Ai nên đặt lịch tư vấn trước?',
      body: `Phù hợp ${icpLine(input)}. Đặc biệt nếu đã thử nhiều cách mà chưa hài lòng.`,
    },
    {
      title: 'Ưu đãi & bước tiếp theo',
      body: `Inbox "TƯ VẤN" để đặt lịch tại ${area}. Không cam kết kết quả tuyệt đối — hiệu quả tùy cơ địa.`,
    },
  ];
  const fullContent = [
    '**Carousel (5 slides) — Facebook / Instagram**',
    '',
    ...slides.map((s, i) => `**Slide ${i + 1}: ${s.title}**\n${s.body}`),
  ].join('\n\n');

  return {
    index: idx,
    title: `Carousel: Checklist trước khi chọn ${product}`,
    hook: slides[0]!.title,
    customerInsight: pain,
    angle: 'Checklist giáo dục → chuyển sang tư vấn có kiểm soát kỳ vọng',
    fullContent,
    offer: 'Checklist chuẩn bị trước thăm khám + ưu đãi buổi tư vấn (nếu có)',
    cta: `Inbox "TƯ VẤN" · Đặt lịch ${area}`,
    channel: 'Facebook / Instagram',
    format: 'carousel',
    formatLabel: 'Carousel · Facebook/Instagram 5 slide',
    carousel: { slides },
    safetyNotes: isRegulatedBeauty(input) ? beautySafetyNotes() : undefined,
  };
}

function buildLandingIdea(
  input: AutopilotContentDraftInput,
  pain: string,
  idx: number,
): AutopilotContentIdea {
  const product = input.productName.trim();
  const area = input.targetArea.trim();
  const goal = input.primaryGoal.trim();
  const vp = valuePropLine(input);
  const melasma = /nám|tàn nhang|melasma|đốm nâu/i.test(product);
  const hero = melasma
    ? `${product} tại ${area} — Lộ trình rõ ràng cho làn da nám, không hứa hẹn mơ hồ`
    : `${product} tại ${area} — ${goal}, quy trình rõ ràng`;
  const sub = melasma
    ? `Dành cho ${icpLine(input)}. ${goal}. Hiểu rõ mức độ nám trước khi điều trị — hiệu quả tùy cơ địa.`
    : `Dành cho ${icpLine(input)}. ${goal}. Tư vấn trước, báo giá minh bạch.`;
  const steps = melasma
    ? [
        '1. Thăm khám & soi da — xác định nám nông/sâu',
        '2. Phác đồ cá nhân — giải thích kỳ vọng thực tế',
        '3. Theo dõi tiến triển — điều chỉnh khi cần',
      ]
    : [
        '1. Tư vấn & làm rõ nhu cầu',
        '2. Phác đồ / báo giá minh bạch',
        '3. Theo dõi sau dịch vụ',
      ];
  const faq = melasma
    ? '• Một liệu trình bao lâu? — Tùy mức độ nám, thường vài tuần đến vài tháng.\n• Có cam kết hết hẳn không? — Không. Chúng tôi tập trung cải thiện có kiểm soát và theo dõi.'
    : '• Thời gian thực hiện? — Tùy gói và tình trạng cá nhân.\n• Cam kết kết quả? — Không cam kết tuyệt đối; hiệu quả phụ thuộc cơ địa và phối hợp của khách.';
  const fullContent = [
    '**Landing Page — Hero & body copy**',
    '',
    '**Hero headline**',
    hero,
    '',
    '**Subhead**',
    sub,
    '',
    '**Pain (vấn đề khách đang gặp)**',
    pain,
    '',
    '**Giải pháp**',
    vp,
    '',
    '**Quy trình 3 bước**',
    ...steps,
    '',
    '**Offer**',
    input.productPrice
      ? `Đặt lịch tư vấn miễn phí · Báo giá minh bạch từ ${formatVnd(input.productPrice)}`
      : 'Đặt lịch tư vấn miễn phí · Báo giá sau thăm khám',
    '',
    '**CTA button**',
    `Đặt lịch tư vấn tại ${area}`,
    '',
    '**FAQ ngắn**',
    faq,
  ].join('\n');

  return {
    index: idx,
    title: `Landing: Đặt lịch tư vấn ${product} (${area})`,
    hook: hero,
    customerInsight: pain,
    angle: 'Conversion landing: pain → quy trình → CTA đặt lịch',
    fullContent,
    offer: input.productPrice
      ? `Tư vấn miễn phí · Gói từ ${formatVnd(input.productPrice)}`
      : 'Tư vấn miễn phí · Báo giá minh bạch',
    cta: `Đặt lịch tư vấn tại ${area}`,
    channel: 'Landing Page / Funnel',
    format: 'landing_page',
    formatLabel: 'Landing Page · Lead capture + booking',
    safetyNotes: isRegulatedBeauty(input) ? beautySafetyNotes() : undefined,
  };
}

function buildEmailIdea(
  input: AutopilotContentDraftInput,
  pain: string,
  idx: number,
): AutopilotContentIdea {
  const product = input.productName.trim();
  const area = input.targetArea.trim();
  const melasma = /nám|tàn nhang|melasma|đốm nâu/i.test(product);
  const subject = melasma
    ? 'Bạn không cần che nám mãi — bắt đầu từ bước này'
    : `${product} tại ${area} — bước tiếp theo dành cho bạn`;
  const preheader = melasma
    ? 'Checklist 3 phút trước khi chọn phương án trị nám'
    : 'Checklist ngắn trước khi quyết định';
  const checklist = melasma
    ? [
        '• Nám xuất hiện bao lâu? (>6 tháng thường cần lộ trình dài hơn)',
        '• Đã thử kem/ tip mạng chưa? Cải thiện có bền không?',
        '• Da có dễ kích ứng khi đổi sản phẩm không?',
      ]
    : [
        '• Bạn đã thử giải pháp nào trước đây?',
        '• Mục tiêu ưu tiên của bạn là gì?',
        '• Thời gian và ngân sách dự kiến?',
      ];
  const fullContent = [
    '**Email nurture (sau khi để lại lead)**',
    '',
    `**Subject:** ${subject}`,
    `**Preheader:** ${preheader}`,
    '',
    'Xin chào {{ten_khach}},',
    '',
    `Cảm ơn bạn quan tâm ${product} tại ${area}. Nhiều khách chia sẻ với chúng tôi: "${firstPainClause(pain)}."`,
    '',
    'Trước khi quyết định, bạn có thể tự kiểm tra nhanh:',
    ...checklist,
    '',
    `${valuePropLine(input)}`,
    '',
    '**CTA:** [Đặt lịch tư vấn 15 phút — Miễn phí]',
    '',
    'Lưu ý: Kết quả phụ thuộc cơ địa; chúng tôi không cam kết kết quả tuyệt đối.',
    '',
    'Trân trọng,',
    '{{ten_thuong_hieu}} · ${area}',
  ].join('\n');

  return {
    index: idx,
    title: melasma
      ? 'Email: Checklist trước khi chọn phương án trị nám'
      : `Email: Checklist trước khi chọn ${product}`,
    hook: subject,
    customerInsight: pain,
    angle: 'Nurture sau lead — giáo dục + CTA đặt lịch nhẹ',
    fullContent,
    offer: 'Tư vấn 15 phút miễn phí + checklist PDF',
    cta: 'Đặt lịch tư vấn 15 phút — Miễn phí',
    channel: 'Email',
    format: 'email',
    formatLabel: 'Email · Nurture + đặt lịch tư vấn',
    safetyNotes: isRegulatedBeauty(input) ? beautySafetyNotes() : undefined,
  };
}

function buildChatbotIdea(
  input: AutopilotContentDraftInput,
  pain: string,
  idx: number,
): AutopilotContentIdea {
  const product = input.productName.trim();
  const area = input.targetArea.trim();
  const melasma = /nám|tàn nhang|melasma|đốm nâu/i.test(product);
  const q1 = melasma
    ? 'Bot: Nám của bạn xuất hiện khoảng bao lâu rồi?\n• < 6 tháng\n• 6–24 tháng\n• > 2 năm'
    : `Bot: Bạn quan tâm ${product} từ khi nào?\n• Mới tìm hiểu\n• 1–3 tháng\n• > 3 tháng`;
  const q3 = melasma
    ? 'Bot: Bạn muốn ưu tiên: giảm thâm nám / đều màu da / tư vấn lộ trình dài hạn?'
    : `Bot: Mục tiêu ưu tiên của bạn? (ví dụ: ${input.primaryGoal})`;
  const reply = melasma
    ? `Cảm ơn bạn! Với tình trạng bạn mô tả, ${product} thường bắt đầu bằng buổi thăm khám để xác định nám nông/sâu. Hiệu quả tùy cơ địa — chúng mình sẽ giải thích rõ kỳ vọng trước khi bạn quyết định.`
    : `Cảm ơn bạn! ${product} tại ${area} bắt đầu bằng buổi tư vấn để làm rõ nhu cầu và báo giá. Chúng mình không cam kết kết quả tuyệt đối — sẽ giải thích rõ trước khi bạn quyết định.`;
  const fullContent = [
    '**Chatbot / Messenger / Zalo — kịch bản hội thoại**',
    '',
    '**Mở đầu**',
    `Chào bạn! Bạn đang quan tâm ${product} tại ${area} phải không? Mình hỗ trợ tư vấn nhanh trước khi đặt lịch nhé.`,
    '',
    '**Hỏi 1 — Mức độ quan tâm**',
    q1,
    '',
    '**Hỏi 2 — Khu vực**',
    `Bot: Bạn ở khu vực nào tại ${area}? (Quận/huyện) — để xếp lịch thuận tiện.`,
    '',
    '**Hỏi 3 — Mục tiêu**',
    q3,
    '',
    '**Phản hồi gợi ý**',
    reply,
    '',
    '**CTA**',
    `[Đặt lịch tư vấn miễn phí tại ${area}] · [Gọi hotline] · [Xem bảng giá tham khảo]`,
  ].join('\n');

  return {
    index: idx,
    title: melasma ? 'Chatbot: Tư vấn nám & đặt lịch tự động' : `Chatbot: Tư vấn ${product} & đặt lịch`,
    hook: `Tư vấn ${product} — 3 câu hỏi, 2 phút`,
    customerInsight: pain,
    angle: 'Qualify lead nhanh → đặt lịch, không hứa kết quả tuyệt đối',
    fullContent,
    offer: 'Tư vấn miễn phí + nhắc lịch qua Zalo/Messenger',
    cta: `Đặt lịch tư vấn miễn phí tại ${area}`,
    channel: 'Messenger / Zalo Chatbot',
    format: 'chatbot',
    formatLabel: 'Chatbot · Messenger/Zalo FAQ + booking',
    safetyNotes: isRegulatedBeauty(input) ? beautySafetyNotes() : undefined,
  };
}

function buildGenericShortVideo(
  input: AutopilotContentDraftInput,
  pain: string,
  idx: number,
): AutopilotContentIdea {
  const product = input.productName.trim();
  const area = input.targetArea.trim();
  const hook3s = `${firstPainClause(pain)}? Có cách tiếp cận rõ ràng hơn cho ${product}.`;
  const scenes = [
    {
      shot: 'Toàn cảnh cơ sở / không gian dịch vụ tại khu vực',
      dialogue: `Tại ${area}, nhiều khách gặp "${firstPainClause(pain).toLowerCase()}". ${product} tập trung ${input.primaryGoal.toLowerCase()}.`,
      overlay: product,
    },
    {
      shot: 'Chuyên viên tư vấn 1–1',
      dialogue: valuePropLine(input),
      overlay: 'Tư vấn rõ · Báo giá minh bạch',
    },
  ];
  const closingCta = `Inbox để đặt lịch tại ${area}.`;
  return {
    index: idx,
    title: `Reels: ${product} — ${input.primaryGoal}`,
    hook: hook3s,
    customerInsight: pain,
    angle: `Giới thiệu ${product} gắn pain point thực tế`,
    fullContent: [
      '**Short Video**',
      `Hook 3s: ${hook3s}`,
      ...scenes.map(
        (s, i) =>
          `${i + 1}. Cảnh: ${s.shot}\n   Thoại: ${s.dialogue}\n   Overlay: ${s.overlay ?? ''}`,
      ),
      `CTA: ${closingCta}`,
    ].join('\n\n'),
    offer: input.productPrice ? `Từ ${formatVnd(input.productPrice)}` : 'Tư vấn miễn phí',
    cta: closingCta,
    channel: 'Facebook Reels',
    format: 'short_video',
    formatLabel: 'Short Video · Reels/TikTok 30–45s',
    shortVideo: { hook3s, scenes, closingCta },
  };
}

/** Generate ≥5 grounded content ideas — never generic theme/format lists. */
export function generateAutopilotContentIdeas(
  input: AutopilotContentDraftInput,
  opts?: { variantSeed?: number },
): AutopilotContentDraftBundle {
  const pains = inferPainPoints(input);
  const offset =
    opts?.variantSeed != null && pains.length > 0
      ? Math.abs(Math.floor(opts.variantSeed)) % pains.length
      : 0;
  const rotated = [...pains.slice(offset), ...pains.slice(0, offset)];
  const regulated = isRegulatedBeauty(input);
  const useMelasmaPack = /nám|tàn nhang|melasma|đốm nâu/i.test(
    `${input.productName} ${input.customerProfile}`,
  );
  const topic = useMelasmaPack ? 'nám' : input.productName.trim();

  const builders = useMelasmaPack
    ? [
        () => buildShortVideoIdea(input, rotated[0]!, 1),
        () => buildCarouselIdea(input, rotated[1] ?? rotated[0]!, 2, topic),
        () => buildLandingIdea(input, rotated[2] ?? rotated[0]!, 3),
        () => buildEmailIdea(input, rotated[3] ?? rotated[0]!, 4),
        () => buildChatbotIdea(input, rotated[4] ?? rotated[0]!, 5),
      ]
    : [
        () => buildGenericShortVideo(input, rotated[0]!, 1),
        () => buildCarouselIdea(input, rotated[1] ?? rotated[0]!, 2, topic),
        () => buildLandingIdea(input, rotated[2] ?? rotated[0]!, 3),
        () => buildEmailIdea(input, rotated[3] ?? rotated[0]!, 4),
        () => buildChatbotIdea(input, rotated[4] ?? rotated[0]!, 5),
      ];

  const ideas = builders.map((b) => b());

  for (const idea of ideas) {
    if (isGenericAutopilotContentLine(idea.title) || isGenericAutopilotContentLine(idea.hook)) {
      throw new Error(`Generic content idea blocked: ${idea.title}`);
    }
    if (regulated && !idea.safetyNotes?.length) {
      idea.safetyNotes = beautySafetyNotes();
    }
  }

  return autopilotContentDraftBundleSchema.parse({
    version: 'v1',
    generatedAt: new Date().toISOString(),
    productName: input.productName.trim(),
    targetArea: input.targetArea.trim(),
    primaryGoal: input.primaryGoal.trim(),
    customerProfile: input.customerProfile.trim(),
    valueProposition: valuePropLine(input),
    draftOnly: true,
    ideas,
  });
}

export function formatAutopilotContentIdeaMarkdown(idea: AutopilotContentIdea): string {
  const lines = [
    `# ${idea.index}. ${idea.title}`,
    '',
    `**Hook:** ${idea.hook}`,
    `**Insight / nỗi đau:** ${idea.customerInsight}`,
    `**Góc triển khai:** ${idea.angle}`,
    `**Kênh:** ${idea.channel} · **Format:** ${idea.formatLabel}`,
    '',
    idea.fullContent,
    '',
    `**Offer:** ${idea.offer}`,
    `**CTA:** ${idea.cta}`,
  ];
  if (idea.safetyNotes?.length) {
    lines.push('', '**Lưu ý an toàn:**', ...idea.safetyNotes.map((n) => `- ${n}`));
  }
  return lines.join('\n');
}

export function formatAutopilotContentBundleScript(bundle: AutopilotContentDraftBundle): string {
  const header = [
    `# Autopilot Content Draft — ${bundle.productName}`,
    '',
    `**Mục tiêu:** ${bundle.primaryGoal}`,
    `**ICP:** ${bundle.customerProfile}`,
    `**Khu vực:** ${bundle.targetArea}`,
    `**Value proposition:** ${bundle.valueProposition}`,
    '',
    '---',
    '',
    '⚠️ **DRAFT ONLY** — Không tự publish Facebook / không chạy Ads live.',
    '',
    '---',
    '',
  ];
  const body = bundle.ideas.map((idea) => formatAutopilotContentIdeaMarkdown(idea)).join('\n\n---\n\n');
  const footer = [
    '',
    '---',
    '',
    '<!-- AUTOPILOT_CONTENT_BUNDLE_JSON',
    JSON.stringify(bundle),
    '-->',
  ];
  return header.join('\n') + body + footer.join('\n');
}

export function parseAutopilotContentBundleFromScript(script: string): AutopilotContentDraftBundle | null {
  const match = script.match(/<!-- AUTOPILOT_CONTENT_BUNDLE_JSON\s*([\s\S]*?)\s*-->/);
  if (!match?.[1]) return null;
  try {
    const raw = JSON.parse(match[1].trim());
    const parsed = autopilotContentDraftBundleSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function assertAutopilotContentBundleQuality(bundle: AutopilotContentDraftBundle): boolean {
  if (bundle.ideas.length < 5) return false;
  for (const idea of bundle.ideas) {
    if (idea.fullContent.length < 80) return false;
    if (isGenericAutopilotContentLine(idea.title)) return false;
    if (/^##\s*(Themes|Formats|Channels)/im.test(idea.fullContent)) return false;
    if (idea.format === 'short_video' && !idea.shortVideo?.scenes?.length) return false;
    if (idea.format === 'carousel' && !idea.carousel?.slides?.length) return false;
  }
  return true;
}
