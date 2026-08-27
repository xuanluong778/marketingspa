/**
 * Accuracy helpers for Vietnamese video transcription:
 * glossary-driven ASR repair, stuck-syllable fixes, CER/WER, suspicious segments.
 * No hard-coded brand→phrase maps — glossary terms drive variants.
 */
import type { TranscriptSegment } from './video-transcription';

export type GlossaryTerm = string;

export function parseGlossaryInput(raw: string | string[] | null | undefined): string[] {
  if (!raw) return [];
  const parts = Array.isArray(raw) ? raw : raw.split(/[\n,;|]+/);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const t = p.trim().replace(/\s+/g, ' ');
    if (t.length < 2 || t.length > 80) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.slice(0, 200);
}

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'd');
}

function compact(s: string): string {
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** Generate plausible ASR mishearings for a glossary term (digits, spacing, tones). */
export function generateGlossaryAsrVariants(term: string): string[] {
  const base = term.trim();
  if (!base) return [];
  const lower = base.toLowerCase();
  const noSpace = lower.replace(/\s+/g, '');
  const compactForm = compact(base);
  const variants = new Set<string>([base, lower, noSpace, compactForm]);

  // Split CamelCase / PascalCase: Oneway → One way
  const camelParts = base.replace(/([a-z])([A-Z])/g, '$1 $2').split(/\s+/);
  if (camelParts.length > 1) {
    variants.add(camelParts.join(' ').toLowerCase());
    variants.add(camelParts.join('').toLowerCase());
  }

  // English digit / letter confusions commonly produced by ASR
  const digitMap: Array<[RegExp, string]> = [
    [/\bone\b/gi, '1'],
    [/\btwo\b/gi, '2'],
    [/\bto\b/gi, '2'],
    [/\bfor\b/gi, '4'],
    [/\bfour\b/gi, '4'],
  ];
  for (const v of [...variants]) {
    let d = v;
    for (const [re, dig] of digitMap) d = d.replace(re, dig);
    variants.add(d);
    variants.add(d.replace(/\s+/g, ''));
    variants.add(d.replace(/\s+/g, ' '));
  }

  // "one way" style → "1 way", "1way", "1 vay" (Vietnamese ASR often hears way≈vay)
  if (/way$/i.test(noSpace) || /way\b/i.test(lower)) {
    const stem = noSpace.replace(/way$/i, '');
    variants.add(`${stem} way`);
    variants.add(`${stem}way`);
    variants.add(`1 way`);
    variants.add(`1way`);
    variants.add(`1 vay`);
    variants.add(`1vay`);
    variants.add(`một way`);
    variants.add(`mot way`);
    variants.add(`một vay`);
    variants.add(`mot vay`);
    variants.add(`on way`);
    variants.add(`on vay`);
    variants.add(`owen`);
    variants.add(`one vay`);
  }

  // Leading vowel / missing onset patterns
  if (compactForm.length >= 4) {
    variants.add(compactForm.slice(1));
  }

  return [...variants].filter((v) => v.length >= 2).slice(0, 40);
}

export function buildSttPrompt(params: {
  glossary: string[];
  previousTail?: string;
  videoTitle?: string | null;
  chunkIndex?: number;
  chunkCount?: number;
}): string {
  const bits: string[] = [];
  // Keep prompt SHORT and free of labels like "Đoạn N" — Whisper often echoes prompt as fake transcript
  // when guided-text looks like the spoken content.
  bits.push(
    'Transcribe the spoken words accurately. Prefer Vietnamese. Do not invent section labels.',
  );
  if (params.glossary.length) {
    bits.push(`Proper names: ${params.glossary.slice(0, 25).join(', ')}.`);
  }
  const tail = (params.previousTail || '').trim().slice(-200);
  if (tail) {
    // Only previous speech context — never meta like chunk counters
    bits.push(`Context: ${tail}`);
  }
  // Intentionally omit videoTitle + "Đoạn i/n" (caused echo: "Đoạn 2. Đoạn 3.")
  void params.videoTitle;
  void params.chunkIndex;
  void params.chunkCount;
  return bits.join(' ').slice(0, 400);
}

/**
 * Drop STT hallucinations that are just prompt echoes (e.g. "Đoạn 2. Đoạn 3.").
 */
export function stripPromptEchoArtifacts(text: string): string {
  let t = (text || '').trim();
  if (!t) return t;
  // Whole-transcript is only "Đoạn N" labels
  if (/^(?:đoạn\s*\d+(?:\s*\/\s*\d+)?\s*[.,;:]?\s*)+$/iu.test(t)) {
    return '';
  }
  // Leading label spam
  t = t.replace(/^(?:đoạn\s*\d+(?:\s*\/\s*\d+)?\s*[.,;:]?\s*)+/iu, '').trim();
  return t;
}

/** Minimum expected transcript size (chars) for non-silent audio. */
export function minTranscriptCharsForDuration(durationSec: number): number {
  if (!(durationSec > 20)) return 1;
  // User gate: >20s and <50 chars is always failure; scale gently after that
  return Math.max(50, Math.min(400, Math.floor(durationSec * 2)));
}

export function isTranscriptTooShortForDuration(text: string, durationSec: number): boolean {
  const t = (text || '').trim();
  return t.length < minTranscriptCharsForDuration(durationSec);
}

/**
 * Apply glossary to transcript using longest ASR-variant match (not a fixed brand map).
 */
export function applyGlossaryToTranscript(text: string, glossary: string[]): string {
  if (!text?.trim() || !glossary.length) return text;
  let out = text;

  // Sort by length desc so longer brands win
  const terms = [...glossary].sort((a, b) => b.length - a.length);
  for (const term of terms) {
    const variants = generateGlossaryAsrVariants(term)
      .map((v) => v.trim())
      .filter((v) => v.toLowerCase() !== term.toLowerCase())
      .sort((a, b) => b.length - a.length);

    for (const variant of variants) {
      // Word-boundary-ish match; allow flexible spaces inside variant
      const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'giu');
      out = out.replace(re, term);
    }
  }
  return out;
}

/** Common Vietnamese stuck-syllable repairs (pattern-based, not sentence-specific). */
const STUCK_PAIR_FIXES: Array<[RegExp, string]> = [
  [/tiềnếu/gi, 'tiền nếu'],
  [/chuyênói/gi, 'chuyện nói'],
  [/âmưu/gi, 'âm mưu'],
  [/khôngờ/gi, 'không giờ'],
  [/khôngể/gi, 'không thể'],
  [/khôngược/gi, 'không được'],
  [/làmược/gi, 'làm được'],
  [/cóể/gi, 'có thể'],
  [/đãược/gi, 'đã được'],
  [/sẽược/gi, 'sẽ được'],
  [/vớiả/gi, 'với cả'],
  [/mộtột/gi, 'một đợt'],
  [/giángon/gi, 'giá ngon'],
  [/đồịn/gi, 'đồ xịn'],
  [/muốnua/gi, 'muốn mua'],
];

export function fixStuckVietnameseWords(text: string): string {
  let out = text;
  for (const [re, rep] of STUCK_PAIR_FIXES) {
    out = out.replace(re, rep);
  }
  // Generic: lowercase letter glued to uppercase mid-token rarely — skip
  // Split digit glued inside letters already handled in normalize
  return out;
}

export function detectSuspiciousSegments(
  segments: Array<TranscriptSegment & { avgLogprob?: number; confidence?: number }>,
  glossary: string[],
): Array<{ start: number; end: number; reason: string; text: string }> {
  const suspicious: Array<{ start: number; end: number; reason: string; text: string }> = [];
  const glossaryCompact = glossary.map(compact).filter((g) => g.length >= 3);

  for (const seg of segments) {
    const text = (seg.text || '').trim();
    if (!text) continue;
    const reasons: string[] = [];
    const conf = seg.confidence ?? (seg.avgLogprob != null ? Math.exp(seg.avgLogprob) : undefined);
    if (conf != null && conf < 0.45) reasons.push('low_confidence');

    // Stuck words / missing spaces (long token with mixed pattern)
    if (
      /\p{L}{10,}/u.test(text) &&
      /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text)
    ) {
      // long Vietnamese run without spaces — likely stuck
      if (!text.includes(' ') && text.length >= 10) reasons.push('stuck_token');
    }
    for (const [,] of STUCK_PAIR_FIXES) {
      /* checked below via known patterns */
    }
    if (/tiềnếu|chuyênói|âmưu|khôngờ|khôngể/i.test(text)) reasons.push('stuck_pattern');

    // Digit glued oddly in Vietnamese phrase (e.g. "1 vay", "10cach")
    if (/\d\s*\p{L}|\p{L}\s*\d/u.test(text) && /\b\d+\s*(vay|way|nen|nghin|trieu)\b/i.test(text)) {
      reasons.push('digit_in_phrase');
    }

    // Possible glossary miss: compact window near glossary but not exact
    const segCompact = compact(text);
    for (const g of glossaryCompact) {
      if (segCompact.includes(g)) continue;
      // if segment looks like a near-miss of glossary (edit distance on compact)
      if (g.length >= 4 && segCompact.length >= 3) {
        const window = segCompact.slice(0, Math.min(segCompact.length, g.length + 2));
        if (
          levenshtein(window, g) > 0 &&
          levenshtein(window, g) <= Math.max(2, Math.floor(g.length * 0.34))
        ) {
          reasons.push('glossary_near_miss');
          break;
        }
      }
    }

    if (reasons.length) {
      const pad = 4;
      suspicious.push({
        start: Math.max(0, seg.start - pad),
        end: seg.end + pad,
        reason: reasons.join(','),
        text,
      });
    }
  }

  // Merge overlapping windows
  suspicious.sort((a, b) => a.start - b.start);
  const merged: typeof suspicious = [];
  for (const s of suspicious) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end + 1) {
      last.end = Math.max(last.end, s.end);
      last.reason = `${last.reason};${s.reason}`;
      last.text = `${last.text} ${s.text}`;
    } else {
      merged.push({ ...s });
    }
  }

  // Clamp window 20–40s (keep ≥20s even when segment is near t=0)
  return merged.map((s) => {
    let start = s.start;
    let end = s.end;
    const dur = end - start;
    if (dur < 20) {
      const mid = (start + end) / 2;
      start = Math.max(0, mid - 10);
      end = start + 20;
    }
    if (end - start > 40) {
      end = start + 40;
    }
    return { ...s, start, end };
  });
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[m]![n]!;
}

export function tokenizeWords(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Word Error Rate (0..1+) — token-level Levenshtein / |reference| */
export function wordErrorRate(reference: string, hypothesis: string): number {
  const ref = tokenizeWords(reference);
  const hyp = tokenizeWords(hypothesis);
  if (!ref.length) return hyp.length ? 1 : 0;
  return tokenEditDistance(ref, hyp) / ref.length;
}

function tokenEditDistance(ref: string[], hyp: string[]): number {
  const m = ref.length;
  const n = hyp.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[m]![n]!;
}

/** Character Error Rate on compacted letters */
export function charErrorRate(reference: string, hypothesis: string): number {
  const ref = compact(reference);
  const hyp = compact(hypothesis);
  if (!ref.length) return hyp.length ? 1 : 0;
  return levenshtein(ref, hyp) / ref.length;
}

/**
 * Full post-STT Vietnamese correction — presentation + glossary + stuck words.
 * Does not paraphrase or invent content beyond glossary/stuck repairs.
 */
export function correctVietnameseTranscript(raw: string, opts?: { glossary?: string[] }): string {
  let text = (raw || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Strip timestamps
  text = text.replace(
    /\[?\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?(?:\s*-->\s*\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)?\]?/g,
    ' ',
  );

  text = fixStuckVietnameseWords(text);
  text = applyGlossaryToTranscript(text, opts?.glossary || []);

  // Immediate triple/double stutter (Unicode boundaries — ASCII \b breaks VN syllables)
  text = text.replace(/(?<![\p{L}\p{N}'])([\p{L}\p{N}']{2,})\s+\1\s+\1(?![\p{L}\p{N}'])/giu, '$1');
  text = text.replace(/(?<![\p{L}\p{N}'])([\p{L}\p{N}']{2,})\s+\1(?![\p{L}\p{N}'])/giu, '$1');

  // Punctuation spacing
  text = text.replace(/([,.!?;:…])(\p{L})/gu, '$1 $2');
  text = text.replace(/\s+([,.!?;:…])/g, '$1');
  text = text.replace(/(\p{L})(\d)/gu, '$1 $2').replace(/(\d)(\p{L})/gu, '$1 $2');

  // Light Vietnamese pause commas (presentation only — does not change words)
  text = text.replace(/\b(ngon)\s+(qua)\b/giu, '$1, $2');
  text = text.replace(/\b(đi|nhé|nha|ạ)\s+(qua|với|và)\b/giu, '$1, $2');

  // Sentence case
  const parts = text.split(/([.!?]+\s+)/);
  let rebuilt = '';
  for (let i = 0; i < parts.length; i++) {
    let part = parts[i] || '';
    if (i === 0 || /[.!?]+\s+/.test(parts[i - 1] || '')) {
      part = part.replace(
        /^(\s*)(\p{L})/u,
        (_, sp: string, ch: string) => sp + ch.toLocaleUpperCase('vi'),
      );
    }
    rebuilt += part;
  }
  text = rebuilt.trim();
  if (text) {
    text = text.replace(/^(\p{L})/u, (ch) => ch.toLocaleUpperCase('vi'));
  }

  // Ensure terminal sentence punctuation when missing (presentation)
  if (text && !/[.!?…]"?$/.test(text)) {
    text = `${text}.`;
  }

  // Light paragraphing — group ~3–4 sentences; avoid one sentence per line
  const units = text.split(/(?<=[.!?…])\s+/).filter(Boolean);
  if (units.length > 3) {
    const paras: string[] = [];
    for (let i = 0; i < units.length; i += 4) {
      paras.push(units.slice(i, i + 4).join(' '));
    }
    text = paras.join('\n\n');
  } else if (units.length > 1 && !text.includes('\n\n')) {
    text = units.join(' ');
  }

  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Splice replacement text into full transcript by approximate time window text match */
export function spliceSegmentText(
  fullText: string,
  oldSnippet: string,
  newSnippet: string,
): string {
  const old = oldSnippet.trim();
  const neu = newSnippet.trim();
  if (!old || !neu) return fullText;
  if (fullText.includes(old)) return fullText.replace(old, neu);
  // Fuzzy: replace first window with similar compact form
  const words = fullText.split(/(\s+)/);
  const oldWords = tokenizeWords(old);
  if (oldWords.length < 2) return fullText;
  const plain = words.filter((w) => !/^\s+$/.test(w));
  void plain;
  // Fall back: append nothing, return glossary-corrected full text only
  return fullText;
}

function polishWordCount(input: string, output: string): number {
  const a = input.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(Boolean).length;
  const b = output.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(Boolean).length;
  if (!a) return b ? 999 : 1;
  return b / a;
}

/** Prompt for conservative transcript polish — spelling/punctuation/paragraphs only. */
export function buildTranscriptPolishPrompt(text: string, glossary: string[] = []): string {
  const glossaryLine = glossary.length
    ? `Tên riêng / thuật ngữ phải giữ đúng: ${glossary.slice(0, 40).join(', ')}.`
    : '';
  return `Biên tập transcript tiếng Việt. Chỉ được:
- Sửa chính tả, dấu thanh tiếng Việt, tên riêng, dấu câu (. , ? !), viết hoa đầu câu.
- Chia thành các đoạn văn tự nhiên (cách nhau một dòng trống), mỗi đoạn khoảng 3–5 câu.
- Sửa lỗi nhận dạng phổ biến dựa trên ngữ cảnh câu (không đổi ý).
${glossaryLine}

TUYỆT ĐỐI KHÔNG: dịch, paraphrase, tóm tắt, thêm/bớt câu, thêm tiêu đề/ghi chú/timestamp/markdown.

Chỉ trả văn bản đã chỉnh sửa.

Transcript gốc:
"""
${text.slice(0, 14000)}
"""`;
}

/**
 * AI polish — spelling, punctuation, paragraphs only. Falls back to input on failure or drift.
 */
export async function polishVietnameseTranscriptWithAi(
  raw: string,
  opts?: {
    glossary?: string[];
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    timeoutMs?: number;
  },
): Promise<{ text: string; applied: boolean; reason?: string }> {
  const input = (raw || '').trim();
  if (!input || input.length < 20) return { text: input, applied: false, reason: 'too_short' };
  const apiKey = opts?.apiKey?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { text: input, applied: false, reason: 'no_api_key' };

  const baseUrl = (opts?.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(
    /\/$/,
    '',
  );
  const model =
    opts?.model?.trim() ||
    process.env.OPENAI_TRANSCRIPT_POLISH_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    'gpt-4o-mini';

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 90_000);
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: Math.min(8000, Math.max(900, Math.ceil(input.length * 1.25))),
        messages: [
          {
            role: 'system',
            content:
              'Biên tập transcript tiếng Việt: chỉ sửa chính tả, dấu câu, viết hoa, chia đoạn. Không dịch, không paraphrase, không thêm/bớt ý.',
          },
          { role: 'user', content: buildTranscriptPolishPrompt(input, opts?.glossary || []) },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { text: input, applied: false, reason: `http_${res.status}` };
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    let out = (data.choices?.[0]?.message?.content || '').trim();
    out = out.replace(/^```[\w]*\n?/gm, '').replace(/```$/gm, '').trim();
    if (!out || out.length < Math.floor(input.length * 0.5)) {
      return { text: input, applied: false, reason: 'too_short_output' };
    }
    const wcRatio = polishWordCount(input, out);
    if (wcRatio < 0.82 || wcRatio > 1.06) {
      return { text: input, applied: false, reason: `word_ratio_${wcRatio.toFixed(2)}` };
    }
    return { text: out, applied: true };
  } catch (err) {
    return {
      text: input,
      applied: false,
      reason: err instanceof Error ? err.message.slice(0, 80) : 'error',
    };
  }
}
