export const BOLD_MAY_TAO_TONE = 'bold_may_tao' as const;

export const MAY_TAO_INSPIRATION_CTAS = [
  'Đứng dậy đi.',
  'Làm ngay hôm nay.',
  'Đừng để sự lười biếng chôn sống cuộc đời mày.',
  'Mày nghĩ sao?',
  'Ai cần nghe điều này thì gửi cho họ.',
];

export const BOLD_MAY_TAO_TONE_LABEL = 'Gai góc mạnh / Mày - Tao truyền cảm hứng';

export const BOLD_MAY_TAO_TONE_DESCRIPTION =
  'Phong cách xưng mày-tao, mạnh, thẳng, truyền động lực như lời khuyên của một người bạn thân.';

export const BOLD_MAY_TAO_PROMPT_BLOCK = `
VĂN PHONG BỔ SUNG — gai góc mạnh (nếu chọn xưng mày-tao):
- Xưng hô "mày - tao" khi phù hợp, KHÔNG lạm dụng "Mày à," làm mở đầu
- Gai góc, thẳng, truyền động lực — ngôn từ đời, có lực, không văn mẫu
- KHÔNG bài bán hàng; KHÔNG CTA mua hàng

CẤU TRÚC: Hook đa dạng → vấn đề thật → sự thật khó nghe → lời khuyên cụ thể → CTA tương tác nhẹ

TUYỆT ĐỐI KHÔNG: xúc phạm cá nhân quá đà; chửi thề tục; nội dung bán hàng
`.trim();

export function isBoldMayTaoTone(tone?: string): boolean {
  return tone === BOLD_MAY_TAO_TONE;
}

export function getPersonalTonePromptBlock(tone?: string): string {
  if (isBoldMayTaoTone(tone)) return BOLD_MAY_TAO_PROMPT_BLOCK;
  return '';
}
