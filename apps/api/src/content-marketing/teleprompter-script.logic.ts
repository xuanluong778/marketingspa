/**
 * POST /content-marketing/teleprompter/rewrite
 * Viết lại kịch bản nói — một bài hoàn chỉnh, không dàn ý.
 */
import type { OpenAiService } from '../openai/openai.service';
import type { TeleprompterScriptRewriteMode } from './dto/content-marketing.dto';

export type TeleprompterScriptRewriteResult = {
  script: string;
  warnings: string[];
  source: 'ai' | 'template';
  rewriteMode: TeleprompterScriptRewriteMode;
  wordCount: number;
};

const REWRITE_HINT: Record<TeleprompterScriptRewriteMode, string> = {
  to_spoken:
    'Chuyển thành kịch bản nói hoàn chỉnh: câu ngắn, dễ đọc camera, có dấu "/" ngắt hơi, không heading.',
  more_natural: 'Tự nhiên hơn: giống nói chuyện thật, ngắt nhịp thoải mái, bớt “bài văn”.',
  more_casual: 'Dân dã hơn: từ đời thường, bớt trang trọng, vẫn rõ ý.',
  less_written: 'Bớt giống văn viết: bỏ cấu trúc luận văn, liên từ sách vở, câu dài.',
  less_preachy: 'Bớt giảng đạo: bỏ giọng khuyên răn, nói nhẹ như tâm sự.',
  more_frank: 'Thẳng thắn hơn: nói rõ ý, không vòng vo, vẫn tôn trọng.',
  more_deep: 'Sâu sắc hơn: thêm lớp suy nghĩ, không sáo ngữ, không diễn văn.',
  shorten_1min: 'Rút còn ~1 phút đọc (130–180 từ tiếng Việt). Giữ ý chính, hook, kết.',
  shorten_3min: 'Rút còn ~3 phút đọc (350–500 từ). Giữ mạch nói liền mạch.',
  shorten_5min: 'Rút còn ~5 phút đọc (650–850 từ). Giữ đủ chi tiết quan trọng.',
};

const WORD_TARGETS: Partial<
  Record<TeleprompterScriptRewriteMode, { min: number; max: number }>
> = {
  shorten_1min: { min: 130, max: 180 },
  shorten_3min: { min: 350, max: 500 },
  shorten_5min: { min: 650, max: 850 },
};

const STYLE_RULES = `QUY TẮC (bắt buộc):
- Chỉ trả MỘT bài nói hoàn chỉnh (videoScript). Không dàn ý, không heading, không bullet.
- CẤM: "Tình huống:", "Góc nhìn:", "Kết luận:", "Phân tích:", "Chủ đề:", "Bài học:".
- Câu ngắn, dễ đọc trước camera. Chuyển ý tự nhiên.
- Có thể dùng dấu "/" để ngắt hơi khi đọc Teleprompter.
- Có thể bọc **từ cần nhấn** bằng ** (markdown bold) — tối đa vài chỗ.
- KHÔNG bịa trải nghiệm, số liệu, thành tích, phát ngôn mới.
- GIỮ NGUYÊN: tên thương hiệu, giá, địa chỉ, dữ kiện, cam kết đã có trong bản gốc.
- Không chào kênh. Không "chào mừng quay lại".
- Không lặp máy móc.`;

function countWords(text: string): number {
  return text
    .replace(/\*\*/g, '')
    .replace(/\//g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean).length;
}

export function stripScriptOutlineLabels(text: string): string {
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
    /Tình huống tôi muốn bàn:\s*/gi,
    /Góc nhìn:\s*/gi,
    /Kết luận:\s*/gi,
  ];
  for (const re of patterns) out = out.replace(re, '');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

export function breathifyScript(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .replace(/([,.?!…])\s*/g, '$1 / ')
    .replace(/\s*\/\s*\/+/g, ' / ')
    .replace(/\s+\/\s*$/g, '')
    .trim();
}

function trimToWordRange(text: string, min: number, max: number): string {
  const clean = stripScriptOutlineLabels(text);
  const sentences = clean.split(/(?<=[.!?…])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const picked: string[] = [];
  let words = 0;
  for (const s of sentences) {
    const wc = countWords(s);
    if (words + wc > max && picked.length > 0) break;
    picked.push(s);
    words += wc;
    if (words >= min) break;
  }
  let result = picked.join(' ');
  while (countWords(result) > max && picked.length > 1) {
    picked.pop();
    result = picked.join(' ');
  }
  return breathifyScript(result || clean.split(/\s+/).slice(0, max).join(' '));
}

function applyTemplateRewrite(
  script: string,
  mode: TeleprompterScriptRewriteMode,
): string {
  let out = stripScriptOutlineLabels(script);

  if (mode === 'to_spoken') {
    out = out
      .split(/\n+/)
      .map((line) => breathifyScript(line))
      .filter(Boolean)
      .join('\n\n');
  }
  if (mode === 'more_casual') {
    out = out
      .replace(/\bdo đó\b|\btuy nhiên\b|\bhơn nữa\b/gi, 'thôi thì')
      .replace(/quan trọng là/gi, 'cái quan trọng là');
  }
  if (mode === 'more_natural') {
    out = out.replace(/\n{3,}/g, '\n\n');
  }
  if (mode === 'less_written') {
    out = out
      .replace(/Theo quan điểm của tôi[,:]?\s*/gi, 'Tôi nghĩ ')
      .replace(/Tôi nhận ra rằng[,:]?\s*/gi, 'Nhưng ngẫm lại, ')
      .replace(/—/g, ', ')
      .replace(/;\s*/g, '. ');
  }
  if (mode === 'less_preachy') {
    out = out
      .replace(/phải\s+/gi, 'nên ')
      .replace(/đừng\s+bao giờ/gi, 'đừng vội');
  }
  if (mode === 'more_frank') {
    if (!/nói thẳng/i.test(out)) {
      out = `Nói thẳng nhé. / ${out}`;
    }
  }
  if (mode === 'more_deep') {
    if (!/một lớp nữa/i.test(out)) {
      out = `${out}\n\nCó một lớp nữa: đôi khi mình vội phán vì chỉ thấy một mặt.`;
    }
  }
  const target = WORD_TARGETS[mode];
  if (target) {
    out = trimToWordRange(out, target.min, target.max);
  }
  if (mode === 'to_spoken' && !out.includes('/')) {
    out = out
      .split(/\n+/)
      .map((line) => breathifyScript(line))
      .join('\n\n');
  }
  return stripScriptOutlineLabels(out);
}

function buildPrompt(script: string, mode: TeleprompterScriptRewriteMode, title?: string): string {
  const target = WORD_TARGETS[mode];
  const lengthNote = target
    ? `Độ dài mục tiêu: ${target.min}–${target.max} từ tiếng Việt.`
    : '';
  return `${STYLE_RULES}

CHẾ ĐỘ: ${mode}
${REWRITE_HINT[mode]}
${lengthNote}

Tiêu đề tham khảo: ${(title || '').trim() || '(không có)'}

Kịch bản gốc:
"""
${script.slice(0, 10000)}
"""

Viết lại thành MỘT bài nói hoàn chỉnh cho Teleprompter.
Trả JSON thuần: {"script":"...","warnings":["..."]}
- script: toàn bộ kịch bản (có thể dùng / và **nhấn**).
- warnings: cảnh báo nếu thiếu dữ kiện hoặc phải cắt bớt (không chèn vào script).`;
}

export async function rewriteTeleprompterScript(
  script: string,
  mode: TeleprompterScriptRewriteMode,
  openai?: OpenAiService,
  title?: string,
): Promise<TeleprompterScriptRewriteResult> {
  const input = (script || '').trim();
  if (!input) {
    return {
      script: '',
      warnings: ['Kịch bản trống.'],
      source: 'template',
      rewriteMode: mode,
      wordCount: 0,
    };
  }

  const fallback = applyTemplateRewrite(input, mode);
  const base: TeleprompterScriptRewriteResult = {
    script: fallback,
    warnings: [REWRITE_HINT[mode]],
    source: 'template',
    rewriteMode: mode,
    wordCount: countWords(fallback),
  };

  if (!openai?.isConfigured()) return base;

  try {
    const raw = await openai.chatCompletion({
      messages: [{ role: 'user', content: buildPrompt(input, mode, title) }],
      maxTokens: mode.startsWith('shorten_5') ? 2200 : mode.startsWith('shorten_3') ? 1600 : 1200,
      temperature: mode === 'more_frank' ? 0.82 : 0.72,
    });
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as {
      script?: string;
      warnings?: string[];
    };
    let result = stripScriptOutlineLabels((parsed.script || fallback).trim());
    if (!result.includes('/') && result.length > 80) {
      result = result
        .split(/\n+/)
        .map((l) => (l.trim() ? breathifyScript(l) : ''))
        .filter(Boolean)
        .join('\n\n');
    }
    const target = WORD_TARGETS[mode];
    if (target && countWords(result) > target.max + 40) {
      result = trimToWordRange(result, target.min, target.max);
    }
    const warnings = [
      REWRITE_HINT[mode],
      ...(Array.isArray(parsed.warnings) ? parsed.warnings.filter(Boolean).map(String) : []),
    ].slice(0, 6);
    return {
      script: result,
      warnings,
      source: 'ai',
      rewriteMode: mode,
      wordCount: countWords(result),
    };
  } catch {
    return base;
  }
}

export const __teleprompterScriptTest = {
  countWords,
  stripScriptOutlineLabels,
  breathifyScript,
  trimToWordRange,
  applyTemplateRewrite,
};
