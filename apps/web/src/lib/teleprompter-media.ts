/**
 * Pure helpers for Teleprompter in-browser MediaRecorder.
 * Browser APIs are injected via optional params for unit tests.
 */

export type TeleprompterRecordMode = 'video_audio' | 'video_only' | 'audio_only';

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

/** Priority order for MediaRecorder MIME selection */
export const VIDEO_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
] as const;

export const AUDIO_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'] as const;

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

export function constraintsForMode(
  mode: TeleprompterRecordMode,
  deviceIds: { videoId?: string; audioId?: string },
): MediaStreamConstraints {
  const video: boolean | MediaTrackConstraints =
    mode === 'audio_only'
      ? false
      : deviceIds.videoId
        ? { deviceId: { exact: deviceIds.videoId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' };

  const audio: boolean | MediaTrackConstraints =
    mode === 'video_only'
      ? false
      : deviceIds.audioId
        ? { deviceId: { exact: deviceIds.audioId }, echoCancellation: true, noiseSuppression: true }
        : { echoCancellation: true, noiseSuppression: true };

  return { video, audio };
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
      message: 'Bạn đã từ chối quyền camera/microphone. Hãy bật lại trong cài đặt trình duyệt.',
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
      message: 'Không thể dùng thiết bị đã chọn. Hãy chọn camera/mic khác.',
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
  ready: ['countdown', 'requesting', 'idle', 'error'],
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
