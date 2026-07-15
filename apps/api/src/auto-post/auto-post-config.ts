import { AutoPostType } from '@marketingspa/database';

export const AUTO_POST_TYPE_LABELS: Record<AutoPostType, string> = {
  SPA_SALES: 'Bài bán hàng spa',
  BRAND_BUILDING: 'Bài xây dựng thương hiệu',
  CUSTOMER_FEEDBACK: 'Bài feedback khách hàng',
  PROMOTION: 'Bài khuyến mãi',
  BEAUTY_KNOWLEDGE: 'Bài kiến thức làm đẹp',
  OLD_CUSTOMER_CARE: 'Bài chăm sóc khách cũ',
  OPENING_EVENT: 'Bài khai trương/sự kiện',
  INBOX_BOOKING: 'Bài kéo inbox/đặt lịch',
};

/** Classic Facebook Login scopes (chỉ dùng khi KHÔNG có META_LOGIN_CONFIG_ID). */
export const AUTO_POST_META_SCOPES = [
  'pages_show_list',
  'pages_manage_metadata',
  'pages_read_engagement',
  'pages_manage_posts',
];

/**
 * App Meta kiểu Business (Facebook Login for Business) phải dùng config_id
 * thay vì scope=... — nếu truyền pages_* qua scope sẽ bị "Invalid Scopes".
 */
export function resolveMetaLoginConfigId(
  getEnv: (key: string) => string | undefined,
): string | undefined {
  const raw =
    getEnv('META_LOGIN_CONFIG_ID')?.trim() ||
    getEnv('FACEBOOK_LOGIN_CONFIG_ID')?.trim() ||
    getEnv('FACEBOOK_CONFIG_ID')?.trim();
  return raw || undefined;
}

export function resolveMetaAppId(getEnv: (key: string) => string | undefined): string | undefined {
  return getEnv('META_APP_ID')?.trim() || getEnv('FACEBOOK_APP_ID')?.trim() || undefined;
}

export function resolveMetaAppSecret(
  getEnv: (key: string) => string | undefined,
): string | undefined {
  return getEnv('META_APP_SECRET')?.trim() || getEnv('FACEBOOK_APP_SECRET')?.trim() || undefined;
}

export function resolveAutoPostMetaScopes(
  getEnv: (key: string) => string | undefined,
): string[] {
  const fromEnv = getEnv('META_AUTO_POST_SCOPES')?.trim() || getEnv('FACEBOOK_OAUTH_SCOPES')?.trim();
  if (fromEnv) {
    return fromEnv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return AUTO_POST_META_SCOPES;
}

export function buildAutoPostPrompt(input: {
  postType: AutoPostType;
  topic: string;
  spaService?: string;
  targetAudience?: string;
  tone?: string;
  promotion?: string;
  linkUrl?: string;
  hashtags?: string;
  cta?: string;
}): string {
  const typeLabel = AUTO_POST_TYPE_LABELS[input.postType] ?? input.postType;
  return `Bạn là copywriter chuyên ngành spa/làm đẹp tại Việt Nam. Viết bài đăng Facebook Fanpage.

LOẠI BÀI: ${typeLabel}
CHỦ ĐỀ: ${input.topic}
DỊCH VỤ SPA: ${input.spaService?.trim() || 'spa làm đẹp/chăm sóc da'}
ĐỐI TƯỢNG: ${input.targetAudience?.trim() || 'phụ nữ quan tâm làm đẹp'}
GIỌNG VĂN: ${input.tone?.trim() || 'thân thiện, tự nhiên, gần gũi'}
ƯU ĐÃI: ${input.promotion?.trim() || 'không có ưu đãi cụ thể'}
LINK: ${input.linkUrl?.trim() || 'không có'}
HASHTAG GỢI Ý: ${input.hashtags?.trim() || 'tự chọn phù hợp'}
CTA GỢI Ý: ${input.cta?.trim() || 'inbox hoặc đặt lịch'}

YÊU CẦU:
- Hook mạnh ở 2 dòng đầu, cuốn hút scroll dừng lại
- Nội dung tự nhiên, không sáo rỗng, không lố marketing
- Phù hợp ngành spa, có lợi ích rõ cho khách
- CTA rõ ràng ở cuối bài
- Hashtag 3-8 cái ở cuối (dòng riêng)
- Không bịa cam kết "100%", "triệt để", "vĩnh viễn", "y chang", "giống hệt"
- Tránh từ vi phạm chính sách Facebook Ads: "chữa khỏi", "thay thế bác sĩ", "không tác dụng phụ", "cam kết kết quả"
- Không dùng markdown heading (# ##)
- Viết bằng tiếng Việt, văn liền mạch sẵn copy-paste lên Facebook

Trả về JSON:
{
  "caption": "nội dung bài đăng đầy đủ gồm hook + thân bài + CTA + hashtag",
  "hashtags": ["#tag1", "#tag2"],
  "cta": "câu CTA chính"
}`;
}

export function buildAutoPostRewritePrompt(
  mode: 'rewrite' | 'shorten' | 'stronger_cta',
  caption: string,
  cta?: string,
): string {
  const action =
    mode === 'rewrite'
      ? 'Viết lại bài giữ ý chính, làm mới cách diễn đạt'
      : mode === 'shorten'
        ? 'Rút gọn bài còn khoảng 60-70% độ dài, giữ hook và CTA'
        : 'Làm CTA mạnh hơn, thuyết phục hơn nhưng không vi phạm chính sách Facebook';

  return `${action}. Ngành spa. Không markdown heading. Trả JSON: {"caption":"...","hashtags":["..."],"cta":"..."}

Bài hiện tại:
${caption}

CTA hiện tại: ${cta ?? 'chưa có'}`;
}
