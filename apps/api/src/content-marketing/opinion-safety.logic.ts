/**
 * Safety helpers for opinion posts about scandals / real people.
 */
export type OpinionSafetyScan = {
  warnings: string[];
  riskLevel: 'low' | 'medium' | 'high';
  anonymizedSummary?: string;
};

const ATTACK_PATTERNS =
  /\b(đồ|thằng|con|lũ)\s+(khốn|óc|ngu|biến thái|đĩ)|phải chết|nên đi tù|hủy diệt|tẩy chay hết|súc vật|đáng bị đánh/giu;

const HARD_ACCUSATION =
  /\b(chắc chắn|rõ ràng là|đã chứng minh|thủ phạm là|tội phạm|lừa đảo chắc|gian lận chắc)\b/giu;

const HEDGE_HINTS = [
  'theo thông tin đang được chia sẻ',
  'nếu thông tin này chính xác',
  'hiện chưa đủ dữ kiện để kết luận',
];

/** Extract likely person-name tokens from Vietnamese text (heuristic). */
export function extractLikelyNames(text: string): string[] {
  const names = new Set<string>();
  const patterns = [
    /(?:anh|chị|ông|bà|cô|chú)\s+([A-ZÀ-Ỹ][\p{L}']+(?:\s+[A-ZÀ-Ỹ][\p{L}']+){0,3})/gu,
    /\b([A-ZÀ-Ỹ][\p{L}']+(?:\s+[A-ZÀ-Ỹ][\p{L}']+){1,3})\b/gu,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const n = (m[1] || '').trim();
      if (n.length >= 2 && n.length <= 40 && !/^(Theo|Nếu|Hiện|Ngày|Tại)$/i.test(n)) {
        names.add(n);
      }
    }
  }
  return [...names].slice(0, 8);
}

export function anonymizeNames(text: string, names: string[]): string {
  let out = text;
  const sorted = [...names].sort((a, b) => b.length - a.length);
  sorted.forEach((name, i) => {
    const label = i === 0 ? 'nhân vật A' : i === 1 ? 'nhân vật B' : `nhân vật ${String.fromCharCode(65 + i)}`;
    const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
    out = out.replace(re, label);
  });
  return out;
}

export function scanOpinionSafety(input: {
  facebookPost?: string;
  videoScript?: string;
  unverifiedClaims?: string[];
  confirmedFacts?: string[];
  userViewpoint?: string;
  hideNames?: boolean;
}): OpinionSafetyScan {
  const blob = [input.facebookPost, input.videoScript, input.userViewpoint]
    .filter(Boolean)
    .join('\n');
  const warnings: string[] = [];

  if (ATTACK_PATTERNS.test(blob)) {
    warnings.push(
      'Phát hiện ngôn từ có nguy cơ công kích / miệt thị cá nhân — hãy viết lại ôn hòa hơn.',
    );
  }
  if (HARD_ACCUSATION.test(blob) && (input.unverifiedClaims?.length || 0) > 0) {
    warnings.push(
      'Bài có nguy cơ biến cáo buộc thành sự thật. Nên dùng: “theo thông tin đang được chia sẻ”, “nếu thông tin này chính xác”, “hiện chưa đủ dữ kiện để kết luận”.',
    );
  }
  if ((input.unverifiedClaims?.length || 0) > 0) {
    const hasHedge = HEDGE_HINTS.some((h) => blob.toLowerCase().includes(h));
    if (!hasHedge) {
      warnings.push(
        'Có thông tin chưa xác minh — nên nêu rõ đây là thông tin đang được chia sẻ, chưa đủ dữ kiện để kết luận.',
      );
    }
  }
  if (/vu khống|bôi nhọ|phá hoại danh dự/i.test(blob)) {
    warnings.push('Cảnh báo: nội dung có thể liên quan vu khống / công kích danh dự.');
  }

  let riskLevel: OpinionSafetyScan['riskLevel'] = 'low';
  if (warnings.length >= 2) riskLevel = 'high';
  else if (warnings.length === 1) riskLevel = 'medium';

  return { warnings, riskLevel };
}

export const SAFETY_PROMPT_BLOCK = `AN TOÀN NỘI DUNG (scandal / tranh chấp / người thật):
- Không biến cáo buộc thành sự thật.
- Dùng cách nói: “theo thông tin đang được chia sẻ”, “nếu thông tin này chính xác”, “hiện chưa đủ dữ kiện để kết luận”.
- Không xúc phạm, miệt thị, kích động tấn công cá nhân.
- Không bịa lời nói, hành vi hoặc động cơ.
- Phân biệt rõ dữ kiện đã xác nhận và quan điểm cá nhân.
- Nếu bật ẩn tên: chỉ gọi “nhân vật A/B”, không nêu tên thật.`;
