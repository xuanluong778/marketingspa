/**
 * Công cụ chỉnh sửa kịch bản Teleprompter (client-side).
 */
import type { TeleprompterScriptRewriteMode } from '@/types/content-marketing';

export function countScriptWords(script: string): number {
  return script
    .replace(/\*\*/g, '')
    .replace(/\//g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean).length;
}

export function stripScriptNoise(text: string): string {
  let out = text;
  const patterns: RegExp[] = [
    /^\s*#{1,6}\s+/gm,
    /^\s*[-*•]\s+/gm,
    /^\s*\d+[.)]\s+/gm,
    /^\s*Tình huống[^:\n]*:\s*/gim,
    /^\s*Góc nhìn\s*:\s*/gim,
    /^\s*Vấn đề[^:\n]*:\s*/gim,
    /^\s*Bài học[^:\n]*:\s*/gim,
    /^\s*Kết luận\s*:\s*/gim,
    /^\s*Phân tích\s*:\s*/gim,
    /^\s*Chủ đề[^:\n]*:\s*/gim,
    /^\s*Hook\s*:\s*/gim,
    /^\s*CTA\s*:\s*/gim,
    /^\s*Meta\s*:\s*/gim,
    /Tình huống tôi muốn bàn:\s*/gi,
    /Góc nhìn:\s*/gi,
    /Kết luận:\s*/gi,
    /\[.*?\]/g,
  ];
  for (const re of patterns) out = out.replace(re, '');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

/** Chia đoạn tự động theo câu / đoạn văn. */
export function autoSplitParagraphs(text: string): string {
  const clean = stripScriptNoise(text);
  const parts = clean
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.join('\n\n');
}

/** Thêm dấu / sau dấu câu để ngắt hơi. */
export function addBreathMarks(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .split(/\n\n+/)
    .map((block) =>
      block
        .replace(/\s+/g, ' ')
        .replace(/([,.?!…])\s*/g, '$1 / ')
        .replace(/\s*\/\s*\/+/g, ' / ')
        .replace(/\s+\/\s*$/g, '')
        .trim(),
    )
    .filter(Boolean)
    .join('\n\n');
}

/** Bọc từ được chọn bằng ** để nhấn khi đọc. */
export function wrapEmphasis(text: string, selectionStart: number, selectionEnd: number): string {
  if (selectionStart === selectionEnd) return text;
  const before = text.slice(0, selectionStart);
  const selected = text.slice(selectionStart, selectionEnd);
  const after = text.slice(selectionEnd);
  const inner = selected.replace(/^\*\*|\*\*$/g, '');
  return `${before}**${inner}**${after}`;
}

export function findReplaceAll(text: string, find: string, replace: string): string {
  if (!find) return text;
  return text.split(find).join(replace);
}

/** Hash đơn giản để so sánh thay đổi kịch bản vs lần check policy. */
export function scriptContentHash(script: string): string {
  const norm = script.replace(/\s+/g, ' ').trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < norm.length; i++) {
    h = (Math.imul(31, h) + norm.charCodeAt(i)) | 0;
  }
  return String(h);
}

/** Parse dòng kịch bản — hỗ trợ **nhấn** khi render. */
export type ScriptSegment = { text: string; emphasis?: boolean };

export function parseScriptLine(line: string): ScriptSegment[] {
  const parts: ScriptSegment[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) {
      parts.push({ text: line.slice(last, m.index) });
    }
    parts.push({ text: m[1]!, emphasis: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) {
    parts.push({ text: line.slice(last) });
  }
  if (parts.length === 0) parts.push({ text: line });
  return parts;
}

export const TELEPROMPTER_AI_BUTTONS: {
  mode: TeleprompterScriptRewriteMode;
  label: string;
}[] = [
  { mode: 'to_spoken', label: 'Chuyển thành kịch bản nói' },
  { mode: 'more_natural', label: 'Tự nhiên hơn' },
  { mode: 'more_casual', label: 'Dân dã hơn' },
  { mode: 'less_written', label: 'Bớt giống văn viết' },
  { mode: 'less_preachy', label: 'Bớt giảng đạo' },
  { mode: 'more_frank', label: 'Thẳng thắn hơn' },
  { mode: 'more_deep', label: 'Sâu sắc hơn' },
  { mode: 'shorten_1min', label: 'Rút ngắn còn 1 phút' },
  { mode: 'shorten_3min', label: 'Rút ngắn còn 3 phút' },
  { mode: 'shorten_5min', label: 'Rút ngắn còn 5 phút' },
];
