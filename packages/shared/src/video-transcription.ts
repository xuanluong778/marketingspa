import { z } from 'zod';

/** Limits (defaults) — override via env on API/worker */
export const VIDEO_TRANSCRIPTION_LIMITS = {
  /** Default 30 minutes; override with VIDEO_TRANSCRIPTION_MAX_DURATION_SECONDS for longer chunked jobs */
  maxDurationSeconds: 30 * 60,
  maxFileBytes: 500 * 1024 * 1024,
  /** Overall job / download / extract ceiling — per-chunk STT has its own timeout */
  jobTimeoutMs: 45 * 60 * 1000,
  chunkTimeoutMs: 12 * 60 * 1000,
  maxAttempts: 3,
  rateLimitMax: 5,
  rateLimitWindowMs: 10 * 60 * 1000,
  /** Target chunk length (seconds) — 5–10 min band */
  chunkSeconds: 7 * 60,
  chunkMinSeconds: 5 * 60,
  chunkMaxSeconds: 10 * 60,
  /** Overlap between consecutive chunks */
  overlapSeconds: 8,
  /** Completed only if processed duration within this of audio duration */
  durationMatchToleranceSec: 3,
  dailyQuotaByPlan: {
    trial: 10,
    starter: 20,
    pro: 50,
    business: 100,
    default: 30,
  },
} as const;

export const VIDEO_TRANSCRIPTION_STAGES = [
  'queued',
  'validating',
  'extracting_audio',
  'transcribing',
  'cleaning',
  'completed',
  'failed',
] as const;

export type VideoTranscriptionStage = (typeof VIDEO_TRANSCRIPTION_STAGES)[number];

export const VIDEO_TRANSCRIPTION_STATUSES = [
  'pending',
  'processing',
  'completed',
  'failed',
] as const;

export type VideoTranscriptionStatus = (typeof VIDEO_TRANSCRIPTION_STATUSES)[number];

export const VIDEO_TRANSCRIPTION_SOURCE_TYPES = ['upload', 'youtube'] as const;

export type VideoTranscriptionSourceType = (typeof VIDEO_TRANSCRIPTION_SOURCE_TYPES)[number];

export const VIDEO_TRANSCRIPTION_LANGUAGES = [
  'auto',
  'vi',
  'en',
  'zh',
  'ja',
  'ko',
  'th',
  'fr',
  'de',
  'es',
] as const;

export type VideoTranscriptionLanguage = (typeof VIDEO_TRANSCRIPTION_LANGUAGES)[number];

export const VIDEO_TRANSCRIPTION_STAGE_LABELS: Record<VideoTranscriptionStage, string> = {
  queued: 'Đang xếp hàng',
  validating: 'Kiểm tra video',
  extracting_audio: 'Tách âm thanh',
  transcribing: 'Chuyển lời nói thành văn bản',
  cleaning: 'Làm sạch',
  completed: 'Hoàn tất',
  failed: 'Thất bại',
};

export const videoTranscriptionQueuePayloadSchema = z.object({
  organizationId: z.string().uuid(),
  transcriptionId: z.string().uuid(),
  userId: z.string().uuid(),
  /** Retry only this chunk index, then re-merge */
  chunkIndex: z.number().int().nonnegative().optional(),
});

export type VideoTranscriptionQueuePayload = z.infer<typeof videoTranscriptionQueuePayloadSchema>;

export type TranscriptChunkPlan = {
  index: number;
  startSec: number;
  endSec: number;
  /** Duration of this slice including overlap on the trailing edge (except last) */
  durationSec: number;
};

export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
  avgLogprob?: number;
  confidence?: number;
};

export type TranscriptChunkResult = {
  index: number;
  startSec: number;
  endSec: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  text: string;
  rawText: string;
  segments: TranscriptSegment[];
  charCount: number;
  error?: string | null;
  attempts: number;
};

export type TranscriptProgressSnapshot = {
  version: 1;
  audioDurationSeconds: number;
  videoDurationSeconds: number;
  processedDurationSeconds: number;
  chunkCount: number;
  chunksCompleted: number;
  firstTimestamp: number | null;
  lastTimestamp: number | null;
  resultCharCount: number;
  chunks: TranscriptChunkResult[];
};

export function buildChunkPlan(
  durationSec: number,
  opts?: { chunkSeconds?: number; overlapSeconds?: number },
): TranscriptChunkPlan[] {
  const duration = Math.max(0, durationSec);
  if (duration <= 0) return [];

  const chunkLen = Math.min(
    VIDEO_TRANSCRIPTION_LIMITS.chunkMaxSeconds,
    Math.max(
      VIDEO_TRANSCRIPTION_LIMITS.chunkMinSeconds,
      opts?.chunkSeconds ?? VIDEO_TRANSCRIPTION_LIMITS.chunkSeconds,
    ),
  );
  const overlap = Math.min(
    10,
    Math.max(5, opts?.overlapSeconds ?? VIDEO_TRANSCRIPTION_LIMITS.overlapSeconds),
  );

  if (duration <= chunkLen + overlap) {
    return [{ index: 0, startSec: 0, endSec: duration, durationSec: duration }];
  }

  const plans: TranscriptChunkPlan[] = [];
  let start = 0;
  let index = 0;
  while (start < duration - 0.05) {
    const end = Math.min(duration, start + chunkLen);
    plans.push({
      index,
      startSec: start,
      endSec: end,
      durationSec: Math.max(0.1, end - start),
    });
    if (end >= duration - 0.05) break;
    start = Math.max(0, end - overlap);
    index += 1;
    // Safety against infinite loop
    if (index > 500) break;
  }
  return plans;
}

function normalizeWords(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function wordsEqualish(a: string, b: string): boolean {
  if (a === b) return true;
  // Soft match for ASR variance on Vietnamese tones (last resort)
  const strip = (x: string) =>
    x.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'd');
  return strip(a) === strip(b);
}

/**
 * Find how many leading words of `next` duplicate the trailing words of `prev`.
 */
export function findOverlapWordCount(prev: string, next: string, maxLook = 80): number {
  const a = normalizeWords(prev);
  const b = normalizeWords(next);
  if (!a.length || !b.length) return 0;
  const maxK = Math.min(maxLook, a.length, b.length);
  for (let k = maxK; k >= 4; k--) {
    let ok = true;
    for (let i = 0; i < k; i++) {
      if (!wordsEqualish(a[a.length - k + i]!, b[i]!)) {
        ok = false;
        break;
      }
    }
    if (ok) return k;
  }
  // Try shorter with high ratio
  for (let k = Math.min(3, maxK); k >= 2; k--) {
    let ok = true;
    for (let i = 0; i < k; i++) {
      if (!wordsEqualish(a[a.length - k + i]!, b[i]!)) {
        ok = false;
        break;
      }
    }
    if (ok) return k;
  }
  return 0;
}

function dropLeadingWords(text: string, count: number): string {
  if (count <= 0) return text.trim();
  const parts = text.trim().split(/\s+/);
  return parts.slice(count).join(' ').trim();
}

/**
 * Merge chunk texts using timestamp segments when available; otherwise word-overlap dedupe.
 */
export function mergeChunkTranscripts(
  chunks: Array<{
    index: number;
    startSec: number;
    endSec: number;
    text: string;
    segments?: TranscriptSegment[];
  }>,
  overlapSeconds = VIDEO_TRANSCRIPTION_LIMITS.overlapSeconds,
): {
  rawMerged: string;
  segments: TranscriptSegment[];
  firstTimestamp: number | null;
  lastTimestamp: number | null;
} {
  const ordered = [...chunks].sort((x, y) => x.index - y.index);
  const allSegs: TranscriptSegment[] = [];
  const textParts: string[] = [];
  let coveredUntil = -1;

  for (let i = 0; i < ordered.length; i++) {
    const chunk = ordered[i]!;
    const segs = (chunk.segments || [])
      .map((s) => ({
        start: chunk.startSec + s.start,
        end: chunk.startSec + s.end,
        text: (s.text || '').trim(),
      }))
      .filter((s) => s.text);

    if (segs.length) {
      for (const seg of segs) {
        // Skip segments that mostly sit in already-covered overlap region
        if (i > 0 && seg.end <= coveredUntil + 0.35) continue;
        if (i > 0 && seg.start < coveredUntil) {
          // Partial overlap: keep if majority is new
          const newDur = seg.end - coveredUntil;
          if (newDur < (seg.end - seg.start) * 0.35) continue;
        }
        allSegs.push(seg);
        textParts.push(seg.text);
      }
      coveredUntil = Math.max(coveredUntil, chunk.endSec - (i < ordered.length - 1 ? 0 : 0));
      // Advance coverage to end of this chunk minus overlap reserved for next
      const next = ordered[i + 1];
      coveredUntil = next
        ? Math.max(coveredUntil, next.startSec)
        : Math.max(coveredUntil, chunk.endSec);
    } else {
      let text = (chunk.text || '').trim();
      if (!text) continue;
      if (textParts.length) {
        const overlapWords = findOverlapWordCount(textParts.join(' '), text, 80);
        text = dropLeadingWords(text, overlapWords);
      }
      if (text) {
        textParts.push(text);
        allSegs.push({
          start: chunk.startSec,
          end: chunk.endSec,
          text,
        });
      }
      coveredUntil = Math.max(coveredUntil, chunk.endSec - overlapSeconds);
    }
  }

  const rawMerged = textParts
    .join(' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+\n/g, '\n')
    .trim();

  const firstTimestamp = allSegs.length ? allSegs[0]!.start : null;
  const lastTimestamp = allSegs.length ? allSegs[allSegs.length - 1]!.end : null;
  return { rawMerged, segments: allSegs, firstTimestamp, lastTimestamp };
}

/**
 * Collapse long repeated blocks (e.g. looping ads) without deleting unique content.
 */
export function collapseRepeatedBlocks(text: string): string {
  let out = (text || '').trim();
  if (!out) return out;

  // Consecutive identical phrases (≥8 words) repeated 2+ times
  for (let n = 0; n < 4; n++) {
    const before = out;
    out = out.replace(/(\b(?:[\p{L}\p{N}']+\s+){7,40}[\p{L}\p{N}']+\b)(?:\s+\1){2,}/giu, '$1');
    if (out === before) break;
  }

  const paragraphs = out
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length >= 3) {
    const seen = new Map<string, number>();
    const kept: string[] = [];
    for (const p of paragraphs) {
      const key = normalizeWords(p).join(' ');
      if (key.split(' ').length < 12) {
        kept.push(p);
        continue;
      }
      const n = (seen.get(key) || 0) + 1;
      seen.set(key, n);
      if (n <= 1) kept.push(p);
    }
    out = kept.join('\n\n');
  }

  return out;
}

/**
 * Light ASR cleanup — no meaning change. Strip timestamps, immediate word doubles.
 */
export function cleanTranscriptText(raw: string): string {
  let text = (raw || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  text = text.replace(
    /\[?\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?(?:\s*-->\s*\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)?\]?/g,
    ' ',
  );
  text = text.replace(/\(\d{1,2}:\d{2}(?::\d{2})?\)/g, ' ');

  // Immediate word repeats only (ASR stutter), keep intentional doubles like "rất rất"
  text = text.replace(/\b([\p{L}\p{N}']+)\s+\1\s+\1\b/giu, '$1');
  text = text.replace(/\b([\p{L}\p{N}']+)\s+\1\b/giu, '$1');

  text = collapseRepeatedBlocks(text);

  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}

/**
 * Vietnamese presentation normalize: punctuation spacing, sentence case, paragraphs.
 * Must NOT invent facts or change wording.
 */
export function normalizeVietnameseTranscript(raw: string): string {
  let text = cleanTranscriptText(raw);

  // Space after punctuation if missing
  text = text.replace(/([,.!?;:…])(\p{L})/gu, '$1 $2');
  // No space before punctuation
  text = text.replace(/\s+([,.!?;:…])/g, '$1');
  // Fix stuck Latin/number boundaries lightly
  text = text.replace(/(\p{L})(\d)/gu, '$1 $2').replace(/(\d)(\p{L})/gu, '$1 $2');

  // Sentence boundaries → capitalize first letter (Unicode letter)
  const sentences = text.split(/([.!?]+\s+)/);
  let rebuilt = '';
  for (let i = 0; i < sentences.length; i++) {
    let part = sentences[i] || '';
    if (i === 0 || /[.!?]+\s+/.test(sentences[i - 1] || '')) {
      part = part.replace(/^(\s*)(\p{L})/u, (_, sp: string, ch: string) => sp + ch.toUpperCase());
    }
    rebuilt += part;
  }
  text = rebuilt.trim();
  if (text) {
    text = text.replace(/^(\p{L})/u, (ch) => ch.toUpperCase());
  }

  // Paragraph every ~3–4 sentences for readability (presentation only)
  const units = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (units.length > 4) {
    const paras: string[] = [];
    for (let i = 0; i < units.length; i += 3) {
      paras.push(units.slice(i, i + 3).join(' '));
    }
    text = paras.join('\n\n');
  }

  return text.trim();
}

export function durationsMatch(
  audioSec: number,
  processedSec: number,
  tolerance: number = VIDEO_TRANSCRIPTION_LIMITS.durationMatchToleranceSec,
): boolean {
  if (!(audioSec > 0) || !(processedSec > 0)) return false;
  return Math.abs(audioSec - processedSec) <= Math.max(tolerance, audioSec * 0.02);
}

export function sumCompletedChunkCoverage(chunks: TranscriptChunkResult[]): number {
  const completed = chunks
    .filter((c) => c.status === 'completed')
    .sort((a, b) => a.index - b.index);
  if (!completed.length) return 0;
  // Union of [start,end) intervals
  const ranges = completed.map((c) => [c.startSec, c.endSec] as [number, number]);
  ranges.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curS = ranges[0]![0];
  let curE = ranges[0]![1];
  for (let i = 1; i < ranges.length; i++) {
    const [s, e] = ranges[i]!;
    if (s <= curE + 0.05) {
      curE = Math.max(curE, e);
    } else {
      total += curE - curS;
      curS = s;
      curE = e;
    }
  }
  total += curE - curS;
  return total;
}

export function resolveDailyTranscriptionQuota(
  planCode: string | null | undefined,
  isTrial: boolean,
): number {
  if (isTrial) return VIDEO_TRANSCRIPTION_LIMITS.dailyQuotaByPlan.trial;
  const code = (planCode || '').toLowerCase();
  if (code.includes('business') || code.includes('enterprise')) {
    return VIDEO_TRANSCRIPTION_LIMITS.dailyQuotaByPlan.business;
  }
  if (code.includes('pro')) return VIDEO_TRANSCRIPTION_LIMITS.dailyQuotaByPlan.pro;
  if (code.includes('starter') || code.includes('basic')) {
    return VIDEO_TRANSCRIPTION_LIMITS.dailyQuotaByPlan.starter;
  }
  return VIDEO_TRANSCRIPTION_LIMITS.dailyQuotaByPlan.default;
}

export function classifyVideoSourceUrl(url: string): {
  ok: boolean;
  sourceType?: VideoTranscriptionSourceType;
  errorCode?: string;
  message?: string;
} {
  const trimmed = url.trim();
  if (!trimmed) {
    return { ok: false, errorCode: 'EMPTY_URL', message: 'URL trống' };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, errorCode: 'INVALID_URL', message: 'URL không hợp lệ' };
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { ok: false, errorCode: 'INVALID_URL', message: 'Chỉ chấp nhận http/https' };
  }
  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  if (
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'youtu.be' ||
    host === 'music.youtube.com'
  ) {
    return { ok: true, sourceType: 'youtube' };
  }
  if (
    host.includes('facebook.com') ||
    host.includes('fb.watch') ||
    host.includes('fb.com') ||
    host.includes('instagram.com')
  ) {
    return {
      ok: false,
      errorCode: 'FACEBOOK_SCRAPE_FORBIDDEN',
      message:
        'Không hỗ trợ tải tự động từ Facebook/Instagram. Hãy tải video/Reel về máy rồi upload file (chỉ dùng video bạn sở hữu hoặc có quyền).',
    };
  }
  return {
    ok: false,
    errorCode: 'UNSUPPORTED_URL',
    message: 'Chỉ hỗ trợ link YouTube hoặc upload file video/audio trực tiếp.',
  };
}
