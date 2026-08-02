/**
 * Opinion topic themes — shared prompt hints for generate/rewrite (API).
 * Keep in sync with apps/web/src/lib/opinion-topic-themes.ts (ids + voice).
 */

export const OPINION_CLIP_LIFE_THEME_ID = 'clip_life_comment';

export const OPINION_LIFE_STORY_THEME_IDS = [
  'raise_children',
  'parents_filial',
  'sibling_bond',
  'couple_family',
  'overcome_adversity',
  'fate_choice',
  'human_kindness',
  'gratitude',
  'forgive_let_go',
  'faith_hope',
  'money_feelings',
  'success_failure',
  'old_age_loneliness',
  'friendship_loyalty',
  'social_conduct',
] as const;

/** Gợi ý nhịp câu — học phong cách, KHÔNG copy cứng vào bài, KHÔNG thành nhãn mục. */
export const CLIP_LIFE_STYLE_HINTS = [
  'Mấy hôm nay tôi thấy một đoạn video…',
  'Nói thật, xem xong tôi cứ nghĩ mãi…',
  'Tôi không biết mọi người thấy sao…',
  'Điều tôi quan tâm không phải ai thắng ai thua…',
  'Nhưng ngẫm lại thì…',
  'Còn mọi người nghĩ thế nào?',
];

/** Mạch ẨN — AI tự triển khai, tuyệt đối không ghi thành tiêu đề trong bài. */
export const CLIP_LIFE_STRUCTURE = `MẠCH ẨN (không hiện tiêu đề / nhãn mục trong bài):
Mở thẳng vào clip → kể ngắn sự việc → điều đáng suy nghĩ → chính kiến → nhìn thêm phía còn lại → lời khuyên thực tế → suy nghĩ/câu hỏi cuối.`;

export const CLIP_LIFE_VOICE_BLOCK = `VĂN PHONG CLIP ĐỜI SỐNG (bắt buộc):
- Viết MỘT BÀI NÓI / BÀI ĐĂNG liền mạch — người dùng đọc thẳng Teleprompter được.
- CẤM nhãn mục / dàn ý: “Tình huống”, “Góc nhìn”, “Vấn đề”, “Phân tích”, “Bài học”, “Kết luận”, “Chủ đề đang bàn”.
- Giống lời nói thật: câu ngắn, đời thường; cho phép “nói thật”, “tôi nghĩ”, “nhưng ngẫm lại”, “thực ra”, “đôi khi”.
- Không lặp máy móc “theo quan điểm của tôi” / “tôi nhận ra rằng”.
- Không bản tin, nghị luận, giảng đạo, sáo ngữ AI.
- Không khẳng định thông tin chưa xác minh; không bịa lời / động cơ nhân vật.`;

export const LIFE_STORY_STYLE_HINTS = [
  'Nói thật, chuyện này khiến tôi phải nghĩ…',
  'Tôi nghĩ…',
  'Nhưng ngẫm lại…',
  'Có một điều…',
  'Thực ra…',
  'Còn mọi người thì sao?',
];

export const LIFE_STORY_STRUCTURE = `MẠCH ẨN (không hiện tiêu đề / nhãn mục trong bài):
Mở câu chuyện → tình huống đời thường → điều đáng suy nghĩ → chính kiến cá nhân → nhìn thêm phía cha mẹ và con cái (hoặc các phía liên quan) → lời khuyên thực tế → thông điệp cuối → câu hỏi tương tác.`;

export const LIFE_STORY_VOICE_BLOCK = `VĂN PHONG ĐỜI SỐNG (bắt buộc):
- Viết MỘT BÀI NÓI liền mạch, tâm sự + lời khuyên nhẹ — sẵn sàng Teleprompter.
- CẤM nhãn: “Tình huống tôi muốn bàn”, “Góc nhìn”, “Vấn đề đáng nói”, “Bài học cuộc sống”, “Kết luận”.
- Câu ngắn, dân dã; chuyển ý tự nhiên, không gạch đầu dòng liệt kê.
- Không lặp máy móc “theo quan điểm của tôi” / “tôi nhận ra rằng”.
- CẤM nghị luận, diễn văn, giảng đạo, sáo ngữ AI.
- CẤM bịa trải nghiệm cá nhân nếu user chưa cung cấp.
- Không phán tuyệt đối; nhìn nhiều phía.`;

export function isClipLifeTheme(themeId?: string | null): boolean {
  return themeId === OPINION_CLIP_LIFE_THEME_ID;
}

export function isLifeStoryTheme(themeId?: string | null): boolean {
  if (!themeId) return false;
  return (OPINION_LIFE_STORY_THEME_IDS as readonly string[]).includes(themeId);
}
