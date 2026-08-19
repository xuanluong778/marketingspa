/**
 * Local draft for standalone Teleprompter page (/teleprompter).
 * Separate from session bridge used by Content Marketing “Làm video”.
 */

export type TeleprompterTheme = 'dark' | 'light';
export type TeleprompterTextAlign = 'left' | 'center' | 'right';

/** Base px/s at 1× — tuned for on-camera reading (large teleprompter type). */
export const TELEPROMPTER_BASE_SCROLL_PX = 45;

/** Kept at 1 so rates 0.25×–2× map linearly to px/s. */
export const TELEPROMPTER_SCROLL_RATE_SCALE = 1;
export const TELEPROMPTER_PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
export type TeleprompterPlaybackSpeed = (typeof TELEPROMPTER_PLAYBACK_SPEEDS)[number];

export function isTeleprompterPlaybackSpeed(value: unknown): value is TeleprompterPlaybackSpeed {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    (TELEPROMPTER_PLAYBACK_SPEEDS as readonly number[]).includes(value)
  );
}

export function normalizeTeleprompterPlaybackSpeed(value: unknown): TeleprompterPlaybackSpeed {
  const n = typeof value === 'number' ? value : Number(value);
  return isTeleprompterPlaybackSpeed(n) ? n : 1;
}

export function formatTeleprompterPlaybackSpeed(speed: number): string {
  const n = normalizeTeleprompterPlaybackSpeed(speed);
  // Vietnamese decimal comma for labels: 0,25× · 1× · 1,25×
  const label = Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
  return `${label}×`;
}

export function teleprompterPlaybackSpeedIndex(speed: unknown): number {
  const n = normalizeTeleprompterPlaybackSpeed(speed);
  const idx = (TELEPROMPTER_PLAYBACK_SPEEDS as readonly number[]).indexOf(n);
  return idx >= 0 ? idx : (TELEPROMPTER_PLAYBACK_SPEEDS as readonly number[]).indexOf(1);
}

export function stepTeleprompterPlaybackSpeed(
  current: unknown,
  delta: number,
): TeleprompterPlaybackSpeed {
  const idx = teleprompterPlaybackSpeedIndex(current);
  const next = Math.min(TELEPROMPTER_PLAYBACK_SPEEDS.length - 1, Math.max(0, idx + delta));
  return TELEPROMPTER_PLAYBACK_SPEEDS[next]!;
}

/** Preset font sizes for Teleprompter runner toolbar (applied to script text only). */
export const TELEPROMPTER_FONT_SIZES = [28, 32, 36, 40, 48, 56, 64, 72, 80, 96] as const;
export type TeleprompterFontSize = (typeof TELEPROMPTER_FONT_SIZES)[number];

export function isTeleprompterFontSize(value: unknown): value is TeleprompterFontSize {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    (TELEPROMPTER_FONT_SIZES as readonly number[]).includes(value)
  );
}

/** Keep any in-range size (form slider); dropdown picks exact presets. */
export function normalizeTeleprompterFontSize(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 36;
  return Math.min(96, Math.max(18, Math.round(n)));
}

export function formatTeleprompterFontSize(size: number): string {
  return `${normalizeTeleprompterFontSize(size)}px`;
}

export type TeleprompterDraft = {
  title: string;
  originalScript: string;
  editedScript: string;
  fontSize: number;
  scrollSpeed: number;
  /** Runner multiplier: effectivePxPerSec = scrollSpeed * playbackSpeed * SCROLL_RATE_SCALE */
  playbackSpeed: TeleprompterPlaybackSpeed;
  lineHeight: number;
  contentWidth: number;
  mirrorMode: boolean;
  theme: TeleprompterTheme;
  textAlign: TeleprompterTextAlign;
  countdown: 3 | 5 | 10;
  lastPosition: number;
  estimatedDuration: number;
  updatedAt: string;
  /** Meta từ “Làm video” — persist để reload / quay lại nguồn */
  sourceType?: string;
  sourceContentId?: string;
  sourceRoute?: string;
  sourceTitle?: string;
  /** Phiên lịch sử */
  sessionId?: string;
  facebookPost?: string;
  videoHook?: string;
  /** Hash kịch bản lúc Check Content Ads — để nhắc check lại khi đổi */
  policyCheckedScriptHash?: string;
  policyCheckId?: string;
  policyStatus?: string;
  policyCheckedAt?: string;
  policyRiskScore?: number;
};

const STORAGE_KEY = 'ms_teleprompter_studio_draft_v1';

export const DEFAULT_TELEPROMPTER_DRAFT: TeleprompterDraft = {
  title: '',
  originalScript: '',
  editedScript: '',
  fontSize: 36,
  scrollSpeed: 80,
  playbackSpeed: 1,
  lineHeight: 1.6,
  contentWidth: 720,
  mirrorMode: false,
  theme: 'dark',
  textAlign: 'left',
  countdown: 3,
  lastPosition: 0,
  estimatedDuration: 0,
  updatedAt: new Date(0).toISOString(),
  sourceType: undefined,
  sourceContentId: undefined,
  sourceRoute: undefined,
  sourceTitle: undefined,
  sessionId: undefined,
  facebookPost: undefined,
  videoHook: undefined,
  policyCheckedScriptHash: undefined,
  policyCheckId: undefined,
  policyStatus: undefined,
  policyCheckedAt: undefined,
  policyRiskScore: undefined,
};

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Ước lượng thời lượng đọc (giây) theo số từ tiếng Việt ~150 từ/phút. */
export function estimateDurationSeconds(script: string): number {
  const words = script
    .replace(/\//g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean).length;
  if (words <= 0) return 0;
  return Math.max(5, Math.round((words / 150) * 60));
}

export function normalizeTeleprompterDraft(
  raw: Partial<TeleprompterDraft> | null | undefined,
): TeleprompterDraft {
  const base = { ...DEFAULT_TELEPROMPTER_DRAFT };
  if (!raw || typeof raw !== 'object') return base;
  const countdown =
    raw.countdown === 3 || raw.countdown === 5 || raw.countdown === 10
      ? raw.countdown
      : base.countdown;
  const edited =
    typeof raw.editedScript === 'string'
      ? raw.editedScript
      : typeof raw.originalScript === 'string'
        ? raw.originalScript
        : '';
  const original =
    typeof raw.originalScript === 'string' && raw.originalScript ? raw.originalScript : edited;
  return {
    title: typeof raw.title === 'string' ? raw.title : '',
    originalScript: original,
    editedScript: edited,
    fontSize: normalizeTeleprompterFontSize(raw.fontSize ?? base.fontSize),
    scrollSpeed: clamp(Number(raw.scrollSpeed) || base.scrollSpeed, 20, 240),
    playbackSpeed: normalizeTeleprompterPlaybackSpeed(raw.playbackSpeed),
    lineHeight: clamp(Number(raw.lineHeight) || base.lineHeight, 1.2, 2.4),
    contentWidth: clamp(Number(raw.contentWidth) || base.contentWidth, 360, 1600),
    mirrorMode: Boolean(raw.mirrorMode),
    theme: raw.theme === 'light' ? 'light' : 'dark',
    textAlign: raw.textAlign === 'center' || raw.textAlign === 'right' ? raw.textAlign : 'left',
    countdown,
    lastPosition: clamp(Number(raw.lastPosition) || 0, 0, 1_000_000),
    estimatedDuration:
      Number(raw.estimatedDuration) > 0
        ? Number(raw.estimatedDuration)
        : estimateDurationSeconds(edited),
    updatedAt:
      typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : new Date().toISOString(),
    sourceType: typeof raw.sourceType === 'string' ? raw.sourceType : undefined,
    sourceContentId: typeof raw.sourceContentId === 'string' ? raw.sourceContentId : undefined,
    sourceRoute: typeof raw.sourceRoute === 'string' ? raw.sourceRoute : undefined,
    sourceTitle: typeof raw.sourceTitle === 'string' ? raw.sourceTitle : undefined,
    sessionId: typeof raw.sessionId === 'string' ? raw.sessionId : undefined,
    facebookPost: typeof raw.facebookPost === 'string' ? raw.facebookPost : undefined,
    videoHook: typeof raw.videoHook === 'string' ? raw.videoHook : undefined,
    policyCheckedScriptHash:
      typeof raw.policyCheckedScriptHash === 'string' ? raw.policyCheckedScriptHash : undefined,
    policyCheckId: typeof raw.policyCheckId === 'string' ? raw.policyCheckId : undefined,
    policyStatus: typeof raw.policyStatus === 'string' ? raw.policyStatus : undefined,
    policyCheckedAt: typeof raw.policyCheckedAt === 'string' ? raw.policyCheckedAt : undefined,
    policyRiskScore: Number.isFinite(Number(raw.policyRiskScore))
      ? Number(raw.policyRiskScore)
      : undefined,
  };
}

export function loadTeleprompterDraft(): TeleprompterDraft | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeTeleprompterDraft(JSON.parse(raw) as Partial<TeleprompterDraft>);
  } catch {
    return null;
  }
}

export function saveTeleprompterDraft(draft: TeleprompterDraft): void {
  const s = storage();
  if (!s) return;
  const next = normalizeTeleprompterDraft({
    ...draft,
    estimatedDuration: estimateDurationSeconds(draft.editedScript),
    updatedAt: new Date().toISOString(),
  });
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
}

export function clearTeleprompterDraft(): void {
  const s = storage();
  if (!s) return;
  s.removeItem(STORAGE_KEY);
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}
