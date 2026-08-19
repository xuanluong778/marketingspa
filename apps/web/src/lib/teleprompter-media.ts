/**
 * Pure helpers for Teleprompter in-browser MediaRecorder.
 * Browser APIs are injected via optional params for unit tests.
 */

export type TeleprompterRecordMode = 'video_audio' | 'video_only' | 'audio_only' | 'screen_camera';

export type TeleprompterVideoQuality = 'economy' | 'standard';

export type TeleprompterRecorderState =
  'idle' | 'requesting' | 'ready' | 'countdown' | 'recording' | 'paused' | 'stopped' | 'error';

export type TeleprompterMediaErrorCode =
  | 'permission_denied'
  | 'no_camera'
  | 'no_microphone'
  | 'device_not_found'
  | 'device_removed'
  | 'mime_unsupported'
  | 'not_supported'
  | 'unknown';

export type TeleprompterFacingMode = 'user' | 'environment';

/** Priority order for MediaRecorder MIME selection */
export const VIDEO_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
] as const;

export const AUDIO_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'] as const;

export const COUNTDOWN_OPTIONS = [0, 3, 5, 10] as const;
export type TeleprompterCountdownSeconds = (typeof COUNTDOWN_OPTIONS)[number];

/** Recommended max session length (seconds) */
export const MAX_RECOMMENDED_SECONDS = 30 * 60;

/** Soft warn when accumulated size exceeds this (bytes) */
export const WARN_SIZE_BYTES = 400 * 1024 * 1024;

/** Stronger warn (near browser memory limits) */
export const CRITICAL_SIZE_BYTES = 800 * 1024 * 1024;

export type MimeIsTypeSupported = (mimeType: string) => boolean;

const DEFAULT_IS_SUPPORTED: MimeIsTypeSupported = (mimeType) => {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return false;
  }
  try {
    return MediaRecorder.isTypeSupported(mimeType);
  } catch {
    return false;
  }
};

export function pickRecorderMimeType(
  mode: TeleprompterRecordMode,
  isTypeSupported: MimeIsTypeSupported = DEFAULT_IS_SUPPORTED,
): string | null {
  const list =
    mode === 'audio_only'
      ? (AUDIO_MIME_CANDIDATES as readonly string[])
      : (VIDEO_MIME_CANDIDATES as readonly string[]);
  for (const mime of list) {
    if (isTypeSupported(mime)) return mime;
  }
  return null;
}

/** Map MIME → download extension (never hardcode .mp4 for webm). */
export function extensionForMime(mimeType: string): string {
  const base = (mimeType.split(';')[0] || mimeType).trim().toLowerCase();
  if (base === 'video/webm' || base === 'audio/webm') return 'webm';
  if (base === 'video/mp4' || base === 'audio/mp4') return 'mp4';
  if (base === 'video/ogg' || base === 'audio/ogg') return 'ogg';
  if (base === 'audio/mpeg') return 'mp3';
  if (base.includes('webm')) return 'webm';
  if (base.includes('mp4')) return 'mp4';
  return 'bin';
}

export function buildRecordingFilename(
  mimeType: string,
  mode: TeleprompterRecordMode,
  at: Date = new Date(),
): string {
  const ext = extensionForMime(mimeType);
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
  const kind = mode === 'audio_only' ? 'audio' : 'video';
  return `teleprompter-${kind}-${stamp}.${ext}`;
}

/** Keep user-provided name but force a safe basename + correct extension for mime. */
export function sanitizeRecordingFilename(name: string, mimeType: string): string {
  const ext = extensionForMime(mimeType);
  let base = (name || '').trim().replace(/[/\\?%*:|"<>]/g, '_');
  base = base.replace(/\.+$/g, '');
  // strip existing extension
  base = base.replace(/\.(webm|mp4|ogg|mp3|bin)$/i, '');
  base = base.replace(/\s+/g, ' ').trim() || 'teleprompter-recording';
  if (base.length > 120) base = base.slice(0, 120);
  return `${base}.${ext}`;
}

export function qualityToResolution(quality: TeleprompterVideoQuality): {
  width: number;
  height: number;
  label: string;
} {
  if (quality === 'standard') {
    return { width: 1920, height: 1080, label: '1080p' };
  }
  return { width: 1280, height: 720, label: '720p' };
}

/** Minimum video encode bitrate for 1080p standard quality (user contract). */
export const VIDEO_BITS_PER_SECOND_1080P = 8_000_000;
/** Encode bitrate target for 720p economy. */
export const VIDEO_BITS_PER_SECOND_720P = 4_000_000;
/** Shared audio bitrate when recording with mic. */
export const AUDIO_BITS_PER_SECOND = 128_000;

/** MediaRecorder videoBitsPerSecond for selected quality. */
export function videoBitsPerSecondForQuality(quality: TeleprompterVideoQuality): number {
  return quality === 'standard' ? VIDEO_BITS_PER_SECOND_1080P : VIDEO_BITS_PER_SECOND_720P;
}

/**
 * Build MediaRecorder options: sharp encode + correct mime.
 * 1080p always requests ≥ 8 Mbps video.
 */
export function mediaRecorderOptionsForQuality(
  mimeType: string,
  mode: TeleprompterRecordMode,
  quality: TeleprompterVideoQuality,
): MediaRecorderOptions {
  const opts: MediaRecorderOptions = { mimeType };
  if (mode === 'audio_only') {
    opts.audioBitsPerSecond = AUDIO_BITS_PER_SECOND;
    return opts;
  }
  opts.videoBitsPerSecond = videoBitsPerSecondForQuality(quality);
  if (mode !== 'video_only') {
    opts.audioBitsPerSecond = AUDIO_BITS_PER_SECOND;
  }
  return opts;
}

/** Rough average bitrate (bits/s) for size estimates — not a compressor. */
export function estimateBitrateBps(
  mode: TeleprompterRecordMode,
  quality: TeleprompterVideoQuality,
): number {
  if (mode === 'audio_only') return AUDIO_BITS_PER_SECOND;
  if (mode === 'screen_camera') {
    const video = videoBitsPerSecondForQuality(quality);
    return video + AUDIO_BITS_PER_SECOND;
  }
  const video = videoBitsPerSecondForQuality(quality);
  const audio = mode === 'video_only' ? 0 : AUDIO_BITS_PER_SECOND;
  return video + audio;
}

/**
 * Read live track resolution from getSettings() (preferred) with safe fallbacks.
 * Used to verify canvas.captureStream matches native camera pixels.
 */
export function videoTrackSettingsResolution(track: MediaStreamTrack | null | undefined): {
  width: number;
  height: number;
  frameRate: number | null;
} {
  if (!track || typeof track.getSettings !== 'function') {
    return { width: 0, height: 0, frameRate: null };
  }
  try {
    const s = track.getSettings();
    const width = Math.round(Number(s.width) || 0);
    const height = Math.round(Number(s.height) || 0);
    const frameRate =
      typeof s.frameRate === 'number' && Number.isFinite(s.frameRate) ? s.frameRate : null;
    return { width, height, frameRate };
  } catch {
    return { width: 0, height: 0, frameRate: null };
  }
}

export function estimateRecordingBytes(
  elapsedSeconds: number,
  mode: TeleprompterRecordMode,
  quality: TeleprompterVideoQuality,
): number {
  const s = Math.max(0, elapsedSeconds);
  return Math.round((estimateBitrateBps(mode, quality) / 8) * s);
}

export function formatByteSize(bytes: number): string {
  const n = Math.max(0, bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function sizeWarningLevel(bytes: number): 'none' | 'warn' | 'critical' {
  if (bytes >= CRITICAL_SIZE_BYTES) return 'critical';
  if (bytes >= WARN_SIZE_BYTES) return 'warn';
  return 'none';
}

export function constraintsForMode(
  mode: TeleprompterRecordMode,
  opts: {
    videoId?: string;
    audioId?: string;
    quality?: TeleprompterVideoQuality;
    facingMode?: TeleprompterFacingMode;
  } = {},
): MediaStreamConstraints {
  const quality = opts.quality ?? 'economy';
  const { width, height } = qualityToResolution(quality);
  const facing = opts.facingMode ?? 'user';

  // screen_camera: mic always from getUserMedia; camera may be requested separately or with mic.
  // Screen comes from getDisplayMedia (not this function).
  let video: boolean | MediaTrackConstraints = false;
  if (mode !== 'audio_only') {
    if (opts.videoId) {
      video = {
        deviceId: { exact: opts.videoId },
        width: { ideal: width },
        height: { ideal: height },
        frameRate: { ideal: 30, max: 30 },
        // Prefer native sensor frames over browser soft-scaling (Chrome)
        ...({ resizeMode: 'none' } as MediaTrackConstraints),
      };
    } else {
      video = {
        facingMode: { ideal: facing },
        width: { ideal: width },
        height: { ideal: height },
        frameRate: { ideal: 30, max: 30 },
        ...({ resizeMode: 'none' } as MediaTrackConstraints),
      };
    }
  }

  const audio: boolean | MediaTrackConstraints =
    mode === 'video_only'
      ? false
      : opts.audioId
        ? { deviceId: { exact: opts.audioId }, echoCancellation: true, noiseSuppression: true }
        : { echoCancellation: true, noiseSuppression: true };

  return { video, audio };
}

/** getDisplayMedia constraints — video only (mic is always from getUserMedia). */
export function displayMediaConstraints(
  quality: TeleprompterVideoQuality = 'economy',
): DisplayMediaStreamOptions {
  const { width, height } = qualityToResolution(quality);
  return {
    video: {
      width: { ideal: width },
      height: { ideal: height },
      frameRate: { ideal: 24, max: 30 },
    },
    audio: false,
  };
}

/** Whether the record mode includes a display-capture (screen) layer. */
export function modeIncludesScreenShare(mode: TeleprompterRecordMode): boolean {
  return mode === 'screen_camera';
}

/** Whether the record mode needs a user-facing camera track. */
export function modeIncludesCamera(mode: TeleprompterRecordMode): boolean {
  return mode !== 'audio_only';
}

export function classifyMediaError(err: unknown): {
  code: TeleprompterMediaErrorCode;
  message: string;
} {
  const name =
    err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : '';
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : 'Không thể truy cập thiết bị media';

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return {
      code: 'permission_denied',
      message: 'Bạn đã từ chối quyền camera/microphone. Xem hướng dẫn bên dưới để bật lại.',
    };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    if (/audio|microphone|mic/i.test(msg)) {
      return { code: 'no_microphone', message: 'Không tìm thấy microphone.' };
    }
    if (/video|camera/i.test(msg)) {
      return { code: 'no_camera', message: 'Không tìm thấy camera.' };
    }
    return {
      code: 'device_not_found',
      message: 'Không tìm thấy camera hoặc microphone.',
    };
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return {
      code: 'device_removed',
      message: 'Thiết bị đang được dùng bởi ứng dụng khác hoặc đã bị rút.',
    };
  }
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return {
      code: 'device_not_found',
      message:
        'Không thể dùng thiết bị/độ phân giải đã chọn. Thử “Tiết kiệm (720p)” hoặc camera khác.',
    };
  }
  if (name === 'NotSupportedError' || /mime|not supported/i.test(msg)) {
    return {
      code: 'mime_unsupported',
      message: 'Trình duyệt không hỗ trợ định dạng quay phù hợp.',
    };
  }
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return {
      code: 'not_supported',
      message: 'Trình duyệt không hỗ trợ getUserMedia / MediaRecorder.',
    };
  }
  return { code: 'unknown', message: msg || 'Lỗi media không xác định.' };
}

/** Human steps when permission was denied (Chrome / Edge / Safari / Android / iOS). */
export function permissionRecoverySteps(): string[] {
  return [
    'Chrome / Edge (máy tính): bấm biểu tượng ổ khóa (hoặc camera) trên thanh địa chỉ → Camera & Microphone = Cho phép → tải lại trang.',
    'Chrome Android: Cài đặt site (ⓘ) → Quyền → Camera / Micro = Cho phép.',
    'Safari iPhone: Cài đặt → Safari → Camera / Microphone → Cho phép; hoặc Cài đặt → [tên site] → Camera/Mic.',
    'Nếu vẫn bị chặn: xóa quyền site cho tên miền này, rồi bấm “Bật camera” lại để xin quyền mới.',
  ];
}

export function stopMediaStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  }
}

export function revokeObjectUrl(url: string | null | undefined): void {
  if (!url) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    /* ignore */
  }
}

/** Simple RMS-style level 0–1 from AnalyserNode time domain data */
export function audioLevelFromAnalyser(analyser: AnalyserNode, buffer: Uint8Array): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analyser.getByteTimeDomainData(buffer as any);
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const v = (buffer[i]! - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / Math.max(1, buffer.length));
  return Math.min(1, rms * 3.5);
}

/** Allowed transitions for unit tests and guard rails */
const TRANSITIONS: Record<TeleprompterRecorderState, TeleprompterRecorderState[]> = {
  idle: ['requesting', 'error'],
  requesting: ['ready', 'error', 'idle'],
  ready: ['countdown', 'requesting', 'idle', 'error', 'recording'],
  countdown: ['recording', 'ready', 'idle', 'error'],
  recording: ['paused', 'stopped', 'error'],
  paused: ['recording', 'stopped', 'error'],
  stopped: ['ready', 'idle', 'countdown', 'error'],
  error: ['idle', 'requesting', 'ready'],
};

export function canTransition(
  from: TeleprompterRecorderState,
  to: TeleprompterRecorderState,
): boolean {
  if (from === to) return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function formatRecordingClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  if (h > 0) return `${two(h)}:${two(m)}:${two(sec)}`;
  return `${two(m)}:${two(sec)}`;
}

/** Whether leave-page warn should engage */
export function shouldBlockUnload(
  state: TeleprompterRecorderState,
  hasUndownloadedBlob: boolean,
): boolean {
  if (state === 'recording' || state === 'paused' || state === 'countdown') return true;
  if (state === 'stopped' && hasUndownloadedBlob) return true;
  return false;
}
