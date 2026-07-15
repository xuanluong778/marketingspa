/**
 * Chuẩn hóa bài viết AI — tránh "wall of text", dễ đọc trên UI & copy.
 */
import { ADVANCED_16_STEPS } from './advanced-article-config';

export function normalizeArticleWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
}

const SECTION_BREAK_PATTERNS: RegExp[] = [
  /\.\s+(?=##\s)/g,
  /\s+(##\s+[A-ZÀ-ỴĐ])/g,
  /\.\s+(?=Giá tham khảo|Giá thị trường|Giá trị|So sánh giá)/gi,
  /\.\s+(?=Ưu đãi|Combo|Quà tặng|🎁)/gi,
  /\.\s+(?=Cam kết|Chứng nhận|Bảo hành)/gi,
  /\.\s+(?=Câu chuyện|Chị |Anh |Khách hàng)/gi,
  /\.\s+(?=Lý do|Đừng bỏ lỡ|Còn chờ|Hành động|Inbox|Đặt lịch|Comment|Gọi ngay)/gi,
  /\.\s+(?=Lợi ích|Bạn sẽ|Bạn có thể)/gi,
  /\.\s+(?=Giải pháp|Liệu trình|Dịch vụ)/gi,
  /\.\s+(?=Vấn đề|Nguyên nhân|Nhiều người|Bạn có biết)/gi,
  /\.\s+(?=⏰|Lưu ý:|\*Lưu ý)/gi,
];

function splitLongParagraph(paragraph: string, maxLen = 280): string[] {
  const trimmed = paragraph.trim();
  if (trimmed.length <= maxLen || trimmed.startsWith('##') || trimmed.startsWith('-')) {
    return [trimmed];
  }

  const parts = trimmed.split(/(?<!\d)\.\s+(?=[A-ZÀ-ỴĐ"(-])/);
  if (parts.length <= 1) return [trimmed];

  const chunks: string[] = [];
  let buf = '';
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part == null) continue;
    let seg = part.trim();
    if (!seg) continue;
    if (i < parts.length - 1 && !seg.endsWith('.')) seg += '.';
    const candidate = buf ? `${buf} ${seg}` : seg;
    if (candidate.length > maxLen && buf) {
      chunks.push(buf);
      buf = seg;
    } else {
      buf = candidate;
    }
  }
  if (buf) chunks.push(buf);
  return chunks.length ? chunks : [trimmed];
}

export function formatArticleForReadability(text: string): string {
  if (!text?.trim()) return text ?? '';

  let t = text.trim();

  // Đã có cấu trúc tốt
  const doubleBreaks = (t.match(/\n\n/g) || []).length;
  if (doubleBreaks >= 4 && t.includes('##')) {
    return normalizeArticleWhitespace(t);
  }

  // Tiêu đề markdown
  t = t.replace(/\s*(#{1,3}\s+)/g, '\n\n$1');

  // Bullet
  t = t.replace(/\s+([-•]\s+)/g, '\n$1');

  for (const re of SECTION_BREAK_PATTERNS) {
    t = t.replace(re, (match) => {
      if (match.startsWith('.')) return '.\n\n' + match.slice(2).trimStart();
      return '\n\n' + match.trimStart();
    });
  }

  const paragraphs = t.split(/\n\n+/).flatMap((p) => splitLongParagraph(p));
  t = paragraphs.filter(Boolean).join('\n\n');

  // Đảm bảo bullet mỗi dòng
  t = t.replace(/\n([-•]\s)/g, '\n$1');

  return normalizeArticleWhitespace(t);
}

export function ensureStructuredSections(raw: string, fallbackSections?: string[]): string {
  const formatted = formatArticleForReadability(raw);
  if ((formatted.match(/\n\n/g) || []).length >= 2) return formatted;
  if (fallbackSections?.length) {
    return fallbackSections.filter(Boolean).join('\n\n');
  }
  return formatted;
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#{1,3}\s+/gm, '')
    .trim();
}

/** Bài đăng Facebook — văn liền mạch, không tiêu đề/bullet */
export function formatArticleForFacebookPost(text: string): string {
  if (!text?.trim()) return text ?? '';

  let t = stripInlineMarkdown(text);

  // Bỏ dòng tiêu đề markdown
  t = t.replace(/^#{1,3}\s+.*$/gm, '');

  // Bỏ nhãn 16 bước nếu AI lỡ ghi ra
  for (const label of ADVANCED_16_STEPS) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(`^\\s*${escaped}\\s*:?\\s*$`, 'gim'), '');
    t = t.replace(new RegExp(`^\\s*##?\\s*${escaped}\\s*:?\\s*$`, 'gim'), '');
  }

  const blocks = t.split(/\n\n+/);
  const paragraphs = blocks
    .map((block) => {
      const lines = block
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      if (!lines.length) return '';

      if (lines.every((l) => /^[-•*]\s/.test(l))) {
        const sentences = lines.map((l) => {
          let s = stripInlineMarkdown(l.replace(/^[-•*]\s*/, ''));
          if (s && !/[.!?…]$/.test(s)) s += '.';
          return s;
        });
        return sentences.join(' ');
      }

      return lines.map((l) => stripInlineMarkdown(l.replace(/^[-•*]\s*/, ''))).join(' ');
    })
    .filter(Boolean);

  return normalizeArticleWhitespace(paragraphs.join('\n\n'));
}
