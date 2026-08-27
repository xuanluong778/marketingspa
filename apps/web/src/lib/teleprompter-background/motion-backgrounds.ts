/**
 * Motion (looping video) 3D-style backgrounds for camera compositing.
 * Pre-encoded WebM/MP4 only — no Three.js / WebGL scene graph.
 */

export type TeleprompterMotionBgId = 'aurora' | 'particles' | 'neon' | 'grid3d' | 'cosmos';

export type MotionBgQuality = 'full' | 'low';

export type TeleprompterMotionBgPreset = {
  id: TeleprompterMotionBgId;
  label: string;
  description: string;
  thumbSrc: string;
  /** Static image fallback if device cannot decode / run video loops. */
  fallbackImagePresetId: 'studio' | 'office' | 'podcast' | 'meeting' | 'tech';
  /** Full quality (≤640×360 @ ~12fps, silent). */
  srcWebm: string;
  srcMp4: string;
  /** Reduced quality (≤426×240 @ ~10fps, silent). */
  srcWebmLow: string;
  srcMp4Low: string;
};

/** Max decode/size contract for authored assets (documented limits). */
export const MOTION_BG_MAX_WIDTH = 640;
export const MOTION_BG_MAX_HEIGHT = 360;
export const MOTION_BG_MAX_FPS_FULL = 12;
export const MOTION_BG_MAX_FPS_LOW = 10;

export const TELEPROMPTER_MOTION_BG_PRESETS: readonly TeleprompterMotionBgPreset[] = [
  {
    id: 'aurora',
    label: 'Aurora 3D',
    description: 'Sóng màu aurora chuyển động nhẹ',
    thumbSrc: '/teleprompter/backgrounds/motion/thumbs/aurora.jpg',
    fallbackImagePresetId: 'tech',
    srcWebm: '/teleprompter/backgrounds/motion/aurora.webm',
    srcMp4: '/teleprompter/backgrounds/motion/aurora.mp4',
    srcWebmLow: '/teleprompter/backgrounds/motion/aurora-low.webm',
    srcMp4Low: '/teleprompter/backgrounds/motion/aurora-low.mp4',
  },
  {
    id: 'particles',
    label: 'Particles',
    description: 'Hạt ánh sáng trừu tượng',
    thumbSrc: '/teleprompter/backgrounds/motion/thumbs/particles.jpg',
    fallbackImagePresetId: 'studio',
    srcWebm: '/teleprompter/backgrounds/motion/particles.webm',
    srcMp4: '/teleprompter/backgrounds/motion/particles.mp4',
    srcWebmLow: '/teleprompter/backgrounds/motion/particles-low.webm',
    srcMp4Low: '/teleprompter/backgrounds/motion/particles-low.mp4',
  },
  {
    id: 'neon',
    label: 'Neon',
    description: 'Neon pulse công nghệ',
    thumbSrc: '/teleprompter/backgrounds/motion/thumbs/neon.jpg',
    fallbackImagePresetId: 'tech',
    srcWebm: '/teleprompter/backgrounds/motion/neon.webm',
    srcMp4: '/teleprompter/backgrounds/motion/neon.mp4',
    srcWebmLow: '/teleprompter/backgrounds/motion/neon-low.webm',
    srcMp4Low: '/teleprompter/backgrounds/motion/neon-low.mp4',
  },
  {
    id: 'grid3d',
    label: 'Grid 3D',
    description: 'Lưới 3D đang trượt',
    thumbSrc: '/teleprompter/backgrounds/motion/thumbs/grid3d.jpg',
    fallbackImagePresetId: 'meeting',
    srcWebm: '/teleprompter/backgrounds/motion/grid3d.webm',
    srcMp4: '/teleprompter/backgrounds/motion/grid3d.mp4',
    srcWebmLow: '/teleprompter/backgrounds/motion/grid3d-low.webm',
    srcMp4Low: '/teleprompter/backgrounds/motion/grid3d-low.mp4',
  },
  {
    id: 'cosmos',
    label: 'Cosmos',
    description: 'Không gian sao chuyển động',
    thumbSrc: '/teleprompter/backgrounds/motion/thumbs/cosmos.jpg',
    fallbackImagePresetId: 'studio',
    srcWebm: '/teleprompter/backgrounds/motion/cosmos.webm',
    srcMp4: '/teleprompter/backgrounds/motion/cosmos.mp4',
    srcWebmLow: '/teleprompter/backgrounds/motion/cosmos-low.webm',
    srcMp4Low: '/teleprompter/backgrounds/motion/cosmos-low.mp4',
  },
] as const;

export function getTeleprompterMotionBgPreset(
  id: string | null | undefined,
): TeleprompterMotionBgPreset | null {
  if (!id) return null;
  return TELEPROMPTER_MOTION_BG_PRESETS.find((p) => p.id === id) ?? null;
}

/**
 * Prefer full-quality motion asset for sharp backgrounds.
 * Low file only on very weak CPU+RAM pairs.
 */
export function selectMotionBgQuality(
  nav: {
    hardwareConcurrency?: number;
    deviceMemory?: number;
  } = typeof navigator !== 'undefined' ? navigator : {},
): MotionBgQuality {
  void nav;
  // Always full-res motion file — low variants only used via explicit override (none).
  // Soft “nhòe” on 3D was largely decode CSS sampling + low files; keep full.
  return 'full';
}

/**
 * Whether motion video loops are too heavy — caller should use static image fallback.
 * Slightly stricter than blur weak-check so borderline devices still get image not jank.
 */
export function shouldFallbackMotionToImage(
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

export function motionSourceUrls(
  preset: TeleprompterMotionBgPreset,
  quality: MotionBgQuality,
): { webm: string; mp4: string } {
  if (quality === 'low') {
    return { webm: preset.srcWebmLow, mp4: preset.srcMp4Low };
  }
  return { webm: preset.srcWebm, mp4: preset.srcMp4 };
}
