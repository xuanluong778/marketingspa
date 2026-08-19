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
  /** Target chunk length (seconds) — 5–10 min band (prefer 5m: Whisper ổn định hơn 7–10m) */
  chunkSeconds: 5 * 60,
  chunkMinSeconds: 5 * 60,
  chunkMaxSeconds: 10 * 60,
  /** Overlap between consecutive chunks */
  overlapSeconds: 8,
  /** Completed only if processed duration within this of audio duration */
  durationMatchToleranceSec: 3,
  /** Min relative ASR end / chunk duration before accepting chunk (verbose_json) */
  chunkAsrCoverageRatio: 0.85,
  /** Abs slack (s) for last speech timestamp vs chunk length */
  chunkAsrCoverageSlackSec: 20,
  /** In-worker retries per chunk when ASR incomplete or empty */
  chunkMaxAttempts: 3,
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
  'downloading',
  'extracting_audio',
  'transcribing',
  'cleaning',
  'completed',
  'failed',
  'cancelled',
] as const;

export type VideoTranscriptionStage = (typeof VIDEO_TRANSCRIPTION_STAGES)[number];

export const VIDEO_TRANSCRIPTION_STATUSES = [
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
] as const;

export type VideoTranscriptionStatus = (typeof VIDEO_TRANSCRIPTION_STATUSES)[number];

export const VIDEO_TRANSCRIPTION_SOURCE_TYPES = [
  'upload',
  'youtube',
  'facebook',
  'tiktok',
] as const;

export type VideoTranscriptionSourceType = (typeof VIDEO_TRANSCRIPTION_SOURCE_TYPES)[number];

/** Keep temp media briefly after complete so user can download video. */
export const VIDEO_TRANSCRIPTION_TEMP_RETENTION_MS = 30 * 60 * 1000;

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
  validating: 'Kiểm tra link',
  downloading: 'Tải video',
  extracting_audio: 'Tách âm thanh',
  transcribing: 'Nhận dạng lời nói',
  cleaning: 'Làm sạch nội dung',
  completed: 'Hoàn tất',
  failed: 'Thất bại',
  cancelled: 'Đã hủy',
};

export type VideoUrlProbeResult = {
  ok: boolean;
  platform?: Exclude<VideoTranscriptionSourceType, 'upload'>;
  sourceType?: Exclude<VideoTranscriptionSourceType, 'upload'>;
  url?: string;
  title?: string | null;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
  errorCode?: string;
  message?: string;
};

/** Hostname allowlist for video URL import (no private IP check here). */
export function isAllowedVideoTranscriptionHost(hostname: string): boolean {
  const host = hostname.replace(/^www\./, '').toLowerCase();
  if (
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'youtu.be' ||
    host === 'music.youtube.com' ||
    host === 'youtube-nocookie.com'
  ) {
    return true;
  }
  if (
    host === 'facebook.com' ||
    host === 'm.facebook.com' ||
    host === 'fb.watch' ||
    host === 'fb.com' ||
    host === 'web.facebook.com'
  ) {
    return true;
  }
  if (host === 'tiktok.com' || host === 'm.tiktok.com' || host === 'vm.tiktok.com') {
    return true;
  }
  // Subdomains: *.facebook.com, *.tiktok.com, *.youtube.com
  if (host.endsWith('.youtube.com') || host.endsWith('.facebook.com') || host.endsWith('.tiktok.com')) {
    return true;
  }
  return false;
}

/**
 * Map yt-dlp / downloader stderr into clear per-platform errors (no DRM bypass hints).
 */
export function mapVideoDownloadError(
  platform: Exclude<VideoTranscriptionSourceType, 'upload'> | 'unknown',
  raw: string,
): { code: string; message: string } {
  const msg = (raw || '').toLowerCase();
  const platLabel =
    platform === 'youtube'
      ? 'YouTube'
      : platform === 'facebook'
        ? 'Facebook'
        : platform === 'tiktok'
          ? 'TikTok'
          : 'nguồn video';

  if (/sign in to confirm|not a bot|cookies?-from-browser|pass cookies|bot.?check/i.test(msg)) {
    return {
      code: 'PLATFORM_BOTCHECK',
      message:
        platform === 'youtube'
          ? 'YouTube yêu cầu xác minh (bot check). Cấu hình cookie yt-dlp hợp lệ trên server, hoặc tải video về máy rồi upload.'
          : `${platLabel} chặn truy cập tự động (bot/IP). Hãy thử lại sau hoặc tải file về máy rồi upload.`,
    };
  }
  if (/ip address is blocked|your ip|blocked from accessing/i.test(msg)) {
    return {
      code: 'PLATFORM_IP_BLOCKED',
      message: `${platLabel} chặn IP máy chủ — không tải được. Hãy tải file về máy rồi upload.`,
    };
  }
  if (
    /private video|this video is private|login required|only available for|friends only|chỉ dành cho bạn bè|members.?only|authentication|cookies? are needed/i.test(
      msg,
    )
  ) {
    return {
      code: 'PRIVATE_OR_RESTRICTED',
      message: `Video ${platLabel} riêng tư / bị hạn chế — chỉ xử lý nội dung công khai hoặc nội dung bạn có quyền sử dụng. Hãy tải file về máy rồi upload.`,
    };
  }
  if (/drm|widevine|encrypted|premium.?content|copyright|geo.?restrict|not available in your country/i.test(msg)) {
    return {
      code: 'DRM_OR_PROTECTED',
      message: `Video ${platLabel} bị bảo vệ (DRM / giới hạn khu vực) — hệ thống không hỗ trợ vượt cơ chế bảo vệ.`,
    };
  }
  if (/unsupported url|no video formats|unable to extract|extractor.*failed|offline/i.test(msg)) {
    return {
      code: 'UNSUPPORTED_OR_GONE',
      message: `Không đọc được video ${platLabel} công khai từ URL này (có thể đã gỡ hoặc không phải video/Reel/Shorts).`,
    };
  }
  if (/timed? ?out|timeout|socket/i.test(msg)) {
    return {
      code: 'DOWNLOAD_TIMEOUT',
      message: `Hết thời gian chờ khi tải video từ ${platLabel}. Thử lại hoặc upload file.`,
    };
  }
  if (/filesize|file is larger|max-filesize|quá lớn|too large/i.test(msg)) {
    return {
      code: 'FILE_TOO_LARGE',
      message: `File video ${platLabel} vượt giới hạn dung lượng cho phép.`,
    };
  }
  return {
    code: 'DOWNLOAD_FAILED',
    message: `Không tải được video từ ${platLabel}. ${raw.slice(0, 240) || 'Lỗi không xác định.'}`,
  };
}

export const videoTranscriptionQueuePayloadSchema = z.object({
  organizationId: z.string().uuid(),
  transcriptionId: z.string().uuid(),
  userId: z.string().uuid(),
  /**
   * When true (remote URL jobs): download full video and keep for TTL download.
   * When false/omitted: download audio-only for STT (default).
   */
  keepVideo: z.boolean().optional().default(false),
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
  /** Relative end of last speech segment within this chunk (seconds from chunk start) */
  asrEndSec?: number | null;
};

export type TranscriptProgressSnapshot = {
  version: 1;
  audioDurationSeconds: number;
  videoDurationSeconds: number;
  processedDurationSeconds: number;
  chunkCount: number;
  chunksCompleted: number;
  /** Chunk index currently PROCESSING (UI: chunk hiện tại / tổng) */
  currentChunkIndex?: number | null;
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

  // Single chunk when short (duration fits one window + a little slack)
  if (duration <= chunkLen + overlap) {
    return [{ index: 0, startSec: 0, endSec: duration, durationSec: duration }];
  }

  const plans: TranscriptChunkPlan[] = [];
  let start = 0;
  let index = 0;
  while (start < duration - 0.05) {
    let end = Math.min(duration, start + chunkLen);
    // Nếu phần còn lại sau chunk này < ~2 phút, gộp vào chunk cuối (luôn cover hết audio)
    const remainingAfter = duration - end;
    if (remainingAfter > 0.05 && remainingAfter < Math.max(overlap + 5, 90)) {
      end = duration;
    }
    plans.push({
      index,
      startSec: start,
      endSec: end,
      durationSec: Math.max(0.1, end - start),
    });
    if (end >= duration - 0.05) break;
    start = Math.max(0, end - overlap);
    index += 1;
    if (index > 500) break;
  }

  // Hard guarantee: last plan end == duration
  if (plans.length) {
    const last = plans[plans.length - 1]!;
    if (last.endSec < duration - 0.05) {
      plans.push({
        index: plans.length,
        startSec: Math.max(0, last.endSec - overlap),
        endSec: duration,
        durationSec: Math.max(0.1, duration - Math.max(0, last.endSec - overlap)),
      });
    } else {
      last.endSec = duration;
      last.durationSec = Math.max(0.1, duration - last.startSec);
    }
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
 * Caps drop so we never strip most of a chunk (partial-transcript bug).
 */
export function findOverlapWordCount(prev: string, next: string, maxLook = 40): number {
  const a = normalizeWords(prev);
  const b = normalizeWords(next);
  if (!a.length || !b.length) return 0;
  // Cap by maxLook and 50% of next length — enough for ~8s speech overlap (~15–25 words)
  // without wiping the bulk of a multi-minute chunk.
  const hardCap = Math.min(
    maxLook,
    a.length,
    b.length,
    Math.max(2, Math.floor(b.length * 0.5)),
  );
  if (hardCap < 2) return 0;
  for (let k = hardCap; k >= 4; k--) {
    let ok = true;
    for (let i = 0; i < k; i++) {
      if (!wordsEqualish(a[a.length - k + i]!, b[i]!)) {
        ok = false;
        break;
      }
    }
    if (ok) return k;
  }
  for (let k = Math.min(3, hardCap); k >= 2; k--) {
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

/** Max relative end time of ASR segments within a chunk (0 = no segments). */
export function asrRelativeEndSec(segments: TranscriptSegment[] | undefined | null): number {
  if (!segments?.length) return 0;
  let max = 0;
  for (const s of segments) {
    const e = Number(s.end) || 0;
    if (e > max) max = e;
  }
  return max;
}

/**
 * Decide if STT result covers enough of the chunk timeline.
 * Root cause of partial transcripts: Whisper/OpenAI returns early-cut text while
 * worker still marked the chunk completed and plan-based coverage looked "full".
 */
export function isChunkAsrCoverageAcceptable(opts: {
  durationSec: number;
  text: string;
  segments?: TranscriptSegment[] | null;
}): { ok: boolean; asrEndSec: number; reason?: string } {
  const duration = Math.max(0.1, opts.durationSec);
  const text = (opts.text || '').trim();
  const words = text ? normalizeWords(text).length : 0;
  const asrEnd = asrRelativeEndSec(opts.segments);
  const ratio = VIDEO_TRANSCRIPTION_LIMITS.chunkAsrCoverageRatio;
  const slack = VIDEO_TRANSCRIPTION_LIMITS.chunkAsrCoverageSlackSec;
  const required = Math.max(0, Math.min(duration * ratio, duration - slack));

  // Hard gate (user): audio >20s must not complete with tiny transcript (prompt-echo / mute)
  if (duration > 20 && text.length < 50) {
    return {
      ok: false,
      asrEndSec: asrEnd,
      reason: `ASR_TOO_SHORT: ${text.length} chars for ${duration.toFixed(1)}s (min 50)`,
    };
  }

  // Very short clips
  if (duration <= 45) {
    if (!text) {
      return { ok: false, asrEndSec: 0, reason: 'EMPTY_TRANSCRIPT' };
    }
    return { ok: true, asrEndSec: asrEnd > 0 ? asrEnd : duration };
  }

  // Minimum density — prevents "full timeline segments + 15-char hallucination"
  const minChars = Math.max(50, Math.min(400, Math.floor(duration * 2)));
  if (text.length < minChars) {
    return {
      ok: false,
      asrEndSec: asrEnd,
      reason: `ASR_TOO_SHORT: ${text.length} chars < min ${minChars} for ${duration.toFixed(1)}s`,
    };
  }

  if (opts.segments && opts.segments.length > 0) {
    if (asrEnd + 0.05 >= required) {
      return { ok: true, asrEndSec: asrEnd };
    }
    if (words >= 20 && asrEnd < required) {
      return {
        ok: false,
        asrEndSec: asrEnd,
        reason: `ASR_TRUNCATED: only ${asrEnd.toFixed(1)}s of ${duration.toFixed(1)}s (words=${words})`,
      };
    }
    return { ok: true, asrEndSec: duration };
  }

  if (!text) {
    return { ok: false, asrEndSec: 0, reason: 'EMPTY_TRANSCRIPT' };
  }
  const minWords = Math.min(50, Math.max(8, Math.floor(duration / 12)));
  if (words < minWords) {
    return {
      ok: false,
      asrEndSec: 0,
      reason: `ASR_TOO_SHORT: words=${words} < min=${minWords} for ${duration.toFixed(1)}s`,
    };
  }
  return { ok: true, asrEndSec: duration };
}

/**
 * Merge **full chunk texts** (primary) with capped word-overlap dedupe.
 * Segments only provide timeline metadata — never the sole text source
 * (segment filter previously could drop middle/end chunk bodies).
 */
export function mergeChunkTranscripts(
  chunks: Array<{
    index: number;
    startSec: number;
    endSec: number;
    text: string;
    segments?: TranscriptSegment[];
  }>,
  _overlapSeconds = VIDEO_TRANSCRIPTION_LIMITS.overlapSeconds,
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
    let text = (chunk.text || '').trim();
    if (!text) {
      // Timeline: still advance coverage for empty/silent chunks
      coveredUntil = Math.max(coveredUntil, chunk.endSec);
      continue;
    }

    if (textParts.length) {
      // Only inspect trailing context — avoid O(n²) + over-dedupe on long merges
      const prevTail = textParts[textParts.length - 1] || '';
      const prevCtx = `${prevTail}`.slice(-2500);
      const nextWords = normalizeWords(text).length;
      const maxDrop = Math.min(40, Math.max(4, Math.floor(nextWords * 0.5)));
      const overlapWords = findOverlapWordCount(prevCtx, text, maxDrop);
      text = dropLeadingWords(text, overlapWords);
    }
    if (text) {
      textParts.push(text);
    }

    const segs = (chunk.segments || [])
      .map((s) => ({
        start: chunk.startSec + (Number(s.start) || 0),
        end: chunk.startSec + (Number(s.end) || 0),
        text: (s.text || '').trim(),
      }))
      .filter((s) => s.text);

    if (segs.length) {
      for (const seg of segs) {
        if (i > 0 && seg.end <= coveredUntil + 0.35) continue;
        if (i > 0 && seg.start < coveredUntil) {
          const newDur = seg.end - coveredUntil;
          if (newDur < (seg.end - seg.start) * 0.35) continue;
        }
        allSegs.push(seg);
      }
    } else if (text) {
      allSegs.push({
        start: chunk.startSec,
        end: chunk.endSec,
        text,
      });
    }

    const next = ordered[i + 1];
    coveredUntil = next
      ? Math.max(coveredUntil, next.startSec)
      : Math.max(coveredUntil, chunk.endSec);
  }

  const rawMerged = textParts
    .join(' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+\n/g, '\n')
    .trim();

  // Prefer timeline spanning first chunk start → last chunk end when we have texts
  const firstTimestamp =
    ordered.length && textParts.length
      ? ordered[0]!.startSec
      : allSegs.length
        ? allSegs[0]!.start
        : null;
  const lastWithText = [...ordered].reverse().find((c) => (c.text || '').trim());
  const lastTimestamp = lastWithText
    ? lastWithText.endSec
    : allSegs.length
      ? allSegs[allSegs.length - 1]!.end
      : null;

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
  platform?: Exclude<VideoTranscriptionSourceType, 'upload'>;
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
  if (parsed.username || parsed.password) {
    return {
      ok: false,
      errorCode: 'USERINFO',
      message: 'URL không được chứa thông tin đăng nhập',
    };
  }
  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal'
  ) {
    return {
      ok: false,
      errorCode: 'LOCALHOST',
      message: 'Không cho phép localhost / host nội bộ / metadata',
    };
  }
  // Block raw private/link-local IPs early (SSRF)
  if (
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    host === '::1' ||
    host === '[::1]'
  ) {
    return {
      ok: false,
      errorCode: 'PRIVATE_IP',
      message: 'Không cho phép IP nội bộ / đặc biệt',
    };
  }

  if (
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'youtu.be' ||
    host === 'music.youtube.com' ||
    host === 'youtube-nocookie.com' ||
    host.endsWith('.youtube.com')
  ) {
    // Accept watch, shorts, youtu.be, embed
    const path = parsed.pathname.toLowerCase();
    const isShorts = path.includes('/shorts/');
    const isWatch = path.includes('/watch') || host === 'youtu.be' || path.includes('/embed/');
    if (!isShorts && !isWatch && !parsed.searchParams.get('v') && host !== 'youtu.be') {
      // Still allow generic youtube video URLs — yt-dlp will validate
      if (!path || path === '/') {
        return {
          ok: false,
          errorCode: 'INVALID_YOUTUBE_URL',
          message: 'Link YouTube không hợp lệ — dùng /watch, /shorts hoặc youtu.be',
        };
      }
    }
    return { ok: true, sourceType: 'youtube', platform: 'youtube' };
  }

  if (
    host === 'facebook.com' ||
    host === 'm.facebook.com' ||
    host === 'web.facebook.com' ||
    host === 'fb.watch' ||
    host === 'fb.com' ||
    host.endsWith('.facebook.com')
  ) {
    return { ok: true, sourceType: 'facebook', platform: 'facebook' };
  }

  if (host === 'tiktok.com' || host === 'm.tiktok.com' || host === 'vm.tiktok.com' || host.endsWith('.tiktok.com')) {
    return { ok: true, sourceType: 'tiktok', platform: 'tiktok' };
  }

  return {
    ok: false,
    errorCode: 'UNSUPPORTED_URL',
    message:
      'Chỉ hỗ trợ link YouTube (video/Shorts), Facebook (video/Reel/bài công khai), TikTok công khai, hoặc upload file.',
  };
}
