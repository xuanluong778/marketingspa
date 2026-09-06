/**
 * Pure helpers for camera background blur (unit-testable, no DOM).
 */

export const CAMERA_BACKGROUND_BLUR_LEVELS = ['none', 'light', 'medium', 'strong'] as const;
export type CameraBackgroundBlurLevel = (typeof CAMERA_BACKGROUND_BLUR_LEVELS)[number];

export const CAMERA_BACKGROUND_BLUR_LABELS: Record<CameraBackgroundBlurLevel, string> = {
  none: 'Không hiệu ứng',
  light: 'Làm mờ nhẹ',
  medium: 'Làm mờ vừa',
  strong: 'Làm mờ mạnh',
};

/** Blur radius in CSS pixels at processing resolution. */
export function blurRadiusForLevel(level: CameraBackgroundBlurLevel): number {
  switch (level) {
    case 'light':
      return 8;
    case 'medium':
      return 16;
    case 'strong':
      return 28;
    default:
      return 0;
  }
}

export function isCameraBackgroundBlurLevel(value: unknown): value is CameraBackgroundBlurLevel {
  return (
    typeof value === 'string' &&
    (CAMERA_BACKGROUND_BLUR_LEVELS as readonly string[]).includes(value)
  );
}

export function normalizeCameraBackgroundBlurLevel(value: unknown): CameraBackgroundBlurLevel {
  return isCameraBackgroundBlurLevel(value) ? value : 'none';
}

/**
 * Detect weak client — skip ML segmentation and force raw camera.
 * Injectable for tests.
 */
export function isWeakClientForBackgroundEffects(
  nav: {
    hardwareConcurrency?: number;
    deviceMemory?: number;
  } = typeof navigator !== 'undefined' ? navigator : {},
): boolean {
  const cores = nav.hardwareConcurrency ?? 2;
  if (cores > 0 && cores < 4) return true;
  const mem = nav.deviceMemory;
  if (typeof mem === 'number' && mem > 0 && mem < 4) return true;
  return false;
}

/**
 * Screen-share / display capture tracks must never get person-segmentation blur.
 * MediaStreamTrack.getSettings().displaySurface is set for getDisplayMedia tracks.
 */
export function isDisplayCaptureTrack(
  track: { getSettings?: () => MediaTrackSettings | Record<string, unknown> } | null | undefined,
): boolean {
  if (!track || typeof track.getSettings !== 'function') return false;
  try {
    const s = track.getSettings() as { displaySurface?: string };
    return typeof s.displaySurface === 'string' && s.displaySurface.length > 0;
  } catch {
    return false;
  }
}

/** Reference max for legacy blur-radius notes (compose uses OUTPUT_MAX_WIDTH). */
export const BLUR_PROCESS_MAX_WIDTH = 1920;

/**
 * @deprecated Prefer FrameTimeWindow rolling average (adaptive-quality).
 * Kept for older imports — no longer used for hard-kill.
 */
export const BLUR_SLOW_FRAME_MS = 120;
/** @deprecated Prefer adaptive quality tiers. */
export const BLUR_SLOW_FRAME_STREAK = 10_000;
