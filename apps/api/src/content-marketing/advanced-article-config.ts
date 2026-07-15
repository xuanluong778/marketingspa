export const ADVANCED_WRITING_STYLES = [
  'expert_consultant',
  'emotional_warm',
  'pain_direct',
  'luxury',
  'transformation_story',
  'promo_strong',
  'mom_family',
  'busy_office',
] as const;

export const ADVANCED_DEMOGRAPHICS = [
  'female_18_25',
  'female_25_35',
  'female_35_45',
  'female_45_plus',
  'male_25_40',
  'premium',
  'office_worker',
] as const;

export const ADVANCED_ARTICLE_GOALS = [
  'direct_sales',
  'inbox',
  'booking',
  'facebook_ads',
  'fanpage',
  'website_blog',
  'livestream',
] as const;

export const ADVANCED_CTA_TYPES = ['comment', 'inbox', 'hotline', 'booking'] as const;

export const ADVANCED_SUGGEST_FIELDS = [
  'painPoints',
  'desires',
  'differentiator',
  'certification',
  'caseStudy',
] as const;

export type AdvancedSuggestField = (typeof ADVANCED_SUGGEST_FIELDS)[number];

export const ADVANCED_SUGGEST_FIELD_LABELS: Record<AdvancedSuggestField, string> = {
  painPoints: 'Nỗi đau khách hàng',
  desires: 'Mong muốn khách hàng',
  differentiator: 'Điểm khác biệt của spa',
  certification: 'Cam kết / chứng nhận',
  caseStudy: 'Câu chuyện khách hàng / case study',
};

export const ADVANCED_LENGTH_HINT: Record<string, string> = {
  short: '500–700 từ',
  medium: '900–1200 từ',
  long: '1500–2000 từ',
};

export const ADVANCED_16_STEPS = [
  'Vấn đề khách hàng đang gặp',
  'Nguyên nhân tạo ra vấn đề',
  'Giải pháp phù hợp',
  'Tính năng/dịch vụ/công nghệ/quy trình',
  'Lợi ích trực tiếp',
  'Lợi ích gián tiếp',
  'Giá thông thường trên thị trường',
  'Giá trị thật khách nhận được',
  'So sánh giá với giá trị',
  'Quà tặng/ưu đãi',
  'Cam kết/chứng nhận/bảo hành',
  'Lý do nên mua ngay',
  'Câu chuyện khách hàng/case study',
  'Combo/gói dịch vụ',
  'Giới hạn thời gian/số lượng',
  'Kêu gọi hành động',
] as const;

export const WRITING_STYLE_PROMPTS: Record<(typeof ADVANCED_WRITING_STYLES)[number], string> = {
  expert_consultant: 'Giọng chuyên gia tư vấn spa — uy tín, rõ ràng, có lý do logic',
  emotional_warm: 'Giọng cảm xúc gần gũi — đồng cảm, chân thành, như bạn bè chia sẻ',
  pain_direct: 'Đánh thẳng nỗi đau — mở đầu chạm vấn đề, không vòng vo',
  luxury: 'Sang trọng cao cấp — tinh tế, premium, trải nghiệm riêng tư',
  transformation_story: 'Kể chuyện chuyển đổi — before/after cảm xúc, hành trình khách hàng',
  promo_strong: 'Khuyến mãi mạnh — nhấn ưu đãi, giá trị, khan hiếm',
  mom_family: 'Mẹ bỉm / gia đình — bận rộn, cần giải pháp nhanh, an toàn',
  busy_office: 'Công sở bận rộn — tiết kiệm thời gian, hiệu quả, đặt lịch dễ',
};

export const DEMOGRAPHIC_LABELS: Record<(typeof ADVANCED_DEMOGRAPHICS)[number], string> = {
  female_18_25: 'Nữ 18–25: làm đẹp, tự tin, giá hợp lý',
  female_25_35: 'Nữ 25–35: bận rộn, mẹ bỉm, sau sinh, thiếu thời gian',
  female_35_45: 'Nữ 35–45: chống lão hóa, nám, da yếu, giữ dáng',
  female_45_plus: 'Nữ 45+: trẻ hóa, sức khỏe, vẻ ngoài sang trọng',
  male_25_40: 'Nam 25–40: chăm sóc da, body, thư giãn, ngoại hình',
  premium: 'Khách cao cấp: trải nghiệm riêng tư, dịch vụ premium',
  office_worker: 'Khách văn phòng: nhanh, tiện, hiệu quả, đặt lịch dễ',
};

export const CTA_TYPE_HINTS: Record<(typeof ADVANCED_CTA_TYPES)[number], string> = {
  comment: 'Kêu gọi comment bài viết (VD: Comment "SPA" để nhận tư vấn)',
  inbox: 'Kêu gọi inbox/nhắn tin Facebook/Zalo',
  hotline: 'Kêu gọi gọi hotline hoặc nhắn SĐT',
  booking: 'Kêu gọi đặt lịch trực tiếp',
};

export const ARTICLE_GOAL_LABELS: Record<(typeof ADVANCED_ARTICLE_GOALS)[number], string> = {
  direct_sales: 'Bán hàng trực tiếp',
  inbox: 'Kéo inbox',
  booking: 'Kéo đặt lịch',
  facebook_ads: 'Chạy quảng cáo Facebook',
  fanpage: 'Đăng fanpage',
  website_blog: 'Đăng website/blog',
  livestream: 'Kịch bản livestream',
};

export const ADVANCED_JSON_OUTPUT_SCHEMA = `Trả kết quả JSON (không markdown, không giải thích thêm):
{
  "title": "...",
  "hook": "...",
  "final_article": "...",
  "cta": "...",
  "hashtags": ["..."],
  "analysis_16_steps": [{"step": 1, "label": "...", "summary": "..."}],
  "suggested_images": ["..."],
  "suggested_ads_angle": "...",
  "variants": {"facebook": "...", "website": "...", "ads": "..."}
}`;

export const ADVANCED_COMPLIANCE_RULES = `Quy tắc bắt buộc:
- Không bịa số liệu, chứng nhận, bác sĩ, giấy phép, kết quả khách hàng nếu người dùng không cung cấp.
- Không cam kết chữa khỏi bệnh.
- Không cam kết kết quả tuyệt đối.
- Với dịch vụ giảm béo, trị nám, trị mụn, trẻ hóa, phải dùng ngôn ngữ an toàn: "tùy cơ địa", "tùy tình trạng", "theo liệu trình tư vấn".
- Viết tự nhiên, cảm xúc, có tính chuyển đổi cao.
- Mở bài phải đánh trúng nỗi đau.
- Cuối bài phải có CTA mạnh.
- Tích hợp 16 bước MƯỢT vào final_article — KHÔNG liệt kê số 1-16 trong bài.

Quy tắc trình bày final_article & variants.facebook (BẮT BUỘC — đăng Facebook):
- Viết LIỀN MẠCH dạng văn xuôi — TUYỆT ĐỐI KHÔNG dùng tiêu đề ##, ###, không ghi tên 16 bước trong bài.
- Chỉ xuống dòng \\n\\n giữa các đoạn (2–4 câu/đoạn), không bullet -, không danh sách.
- Không in đậm ** — viết plain text sẵn sàng copy-paste lên Facebook.
- Hook để riêng field "hook" — KHÔNG lặp hook ở đầu final_article.
- Cuối bài tích hợp CTA mạnh vào đoạn cuối (field cta vẫn tách riêng).
- Dòng lưu ý compliance ở cuối: "Lưu ý: ..." (không dùng markdown).

Quy tắc variants.website (bài blog):
- Có thể dùng ## tiêu đề phụ, bullet, **in đậm** cho giá/deadline.
- variants.ads: copy ngắn, súc tích, không tiêu đề dài.`;

/** Prompt chuẩn copywriting spa — dùng cho generate & rewrite */
export function buildAdvancedArticlePrompt(params: {
  style: string;
  demographic: string;
  goal: string;
  product_name: string;
  price: string;
  combo: string;
  bonus: string;
  deadline: string;
  pain_points: string;
  desired_result: string;
  unique_selling_point: string;
  customer_story: string;
  cta_type: string;
  length: string;
  sales_area?: string;
  certification?: string;
  rewriteNote?: string;
}): string {
  const steps = ADVANCED_16_STEPS.map((s, i) => `${i + 1}. ${s}.`).join('\n');

  return `Bạn là chuyên gia copywriting bán hàng cho ngành spa, thẩm mỹ, làm đẹp và chăm sóc sức khỏe. Hãy viết một bài bán hàng chuyên nghiệp dựa trên thông tin người dùng cung cấp.

Bài viết phải bám theo cấu trúc 16 bước:

${steps}

Yêu cầu:

* Phong cách viết: ${params.style}
* Nhân khẩu học: ${params.demographic}
* Mục tiêu bài viết: ${params.goal}
* Dịch vụ/sản phẩm: ${params.product_name}
* Giá bán: ${params.price || '(chưa cung cấp — không bịa giá)'}
* Ưu đãi/combo: ${params.combo || '(chưa cung cấp)'}
* Quà tặng: ${params.bonus || '(chưa cung cấp)'}
* Thời hạn ưu đãi: ${params.deadline || '(chưa cung cấp)'}
* Khu vực: ${params.sales_area || '(chưa cung cấp)'}
* Nỗi đau khách hàng: ${params.pain_points}
* Mong muốn khách hàng: ${params.desired_result || '(chưa cung cấp)'}
* Điểm khác biệt: ${params.unique_selling_point || '(chưa cung cấp)'}
* Cam kết/chứng nhận: ${params.certification || '(chưa cung cấp — không bịa)'}
* Câu chuyện khách hàng: ${params.customer_story || '(chưa cung cấp — không bịa case study)'}
* CTA mong muốn: ${params.cta_type}
* Độ dài: ${params.length}

${ADVANCED_COMPLIANCE_RULES}

- final_article đủ độ dài theo yêu cầu.
- variants.facebook: bài đăng fanpage; variants.website: bài blog/website; variants.ads: copy quảng cáo ngắn, súc tích.
- analysis_16_steps: đúng 16 mục, mỗi mục tóm tắt nội dung bước đó đã cover trong bài.
${params.rewriteNote ? `\n${params.rewriteNote}` : ''}

${ADVANCED_JSON_OUTPUT_SCHEMA}`;
}
