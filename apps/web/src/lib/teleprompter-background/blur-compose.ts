/**
 * Fast person-mask packing + blur strength helpers (unit-testable).
 *
 * Pipeline contract:
 * - Output canvas = exact camera videoWidth × videoHeight (1:1, never render small then upscale).
 * - Only the camera-blur background layer is downscaled/upscaled to fake blur.
 * - Full image / 3D assets always draw cover from original file resolution.
 * - Mask packs at ML size then upscales for alpha only; person RGB is never filtered/blurred.
 */

import {
  clamp01,
  normalizeCategorySample,
  personWeightFromNormalized,
  type MaskPolarity,
} from './segmentation-mask';

/**
 * Pack person weight into RGBA (white + alpha).
 * Near-binary at ML resolution; nearest-neighbor upscale keeps rim ~1–2px (no soft halo).
 * Optional hole-fill plugs interior gaps without growing/shrinking the silhouette.
 */
export function packPersonMaskRgba(
  out: Uint8ClampedArray,
  mask: ArrayLike<number>,
  maskLen: number,
  polarity: MaskPolarity,
  opts?: { width?: number; height?: number; closeHoles?: boolean },
): void {
  const n = Math.min(maskLen, (out.length / 4) | 0);
  for (let i = 0; i < n; i++) {
    const raw = personWeightFromNormalized(normalizeCategorySample(mask[i] ?? 0), polarity);
    const a = (hardenPersonAlpha(raw) * 255 + 0.5) | 0;
    const o = i * 4;
    out[o] = 255;
    out[o + 1] = 255;
    out[o + 2] = 255;
    out[o + 3] = a;
  }
  const w = (opts?.width ?? 0) | 0;
  const h = (opts?.height ?? 0) | 0;
  if (opts?.closeHoles && w > 2 && h > 2 && w * h <= n) {
    fillInteriorPersonHoles(out, w, h);
  }
}

/**
 * Fill tiny interior holes (bg pixels nearly enclosed by person) without eroding the outer rim.
 * A bg sample becomes person iff ≥ minNeighbors of 8 neighbors are person.
 */
export function fillInteriorPersonHoles(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  minNeighbors = 6,
): void {
  const n = width * height;
  if (n <= 0 || rgba.length < n * 4) return;
  const bin = new Uint8Array(n);
  for (let i = 0; i < n; i++) bin[i] = rgba[i * 4 + 3]! >= 128 ? 1 : 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (bin[i]) continue;
      let c = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          c += bin[(y + dy) * width + (x + dx)]!;
        }
      }
      if (c >= minNeighbors) {
        const o = i * 4;
        rgba[o] = 255;
        rgba[o + 1] = 255;
        rgba[o + 2] = 255;
        rgba[o + 3] = 255;
      }
    }
  }
}

/** @deprecated alias — use fillInteriorPersonHoles */
export function morphClosePersonAlpha(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  fillInteriorPersonHoles(rgba, width, height);
}

/**
 * Interior of person → 1, pure bg → 0.
 * Narrow ~1 ML-pixel transition so after nearest/hard upscale the rim is ≤1–2px
 * (wide soft steps → ghost halo on face/hair/hands when waving).
 */
export function hardenPersonAlpha(weight: number): number {
  const w = clamp01(weight);
  // Inclusive body (don't eat hair/shoulders) + hard outside
  if (w <= 0.46) return 0;
  if (w >= 0.58) return 1;
  const t = (w - 0.46) / 0.12;
  // Steeper than plain smoothstep — mid grays snap toward solid, less semi-opaque halo
  const s = t * t * (3 - 2 * t);
  return s * s * (3 - 2 * s);
}

/** Optional full-res alpha re-harden (tests / offline); avoid hot path getImageData. */
export function rehardUpscaledMaskAlpha(data: Uint8ClampedArray): void {
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i]!;
    // Kill almost-clear fringe (ghost), solidify almost-opaque body
    if (a <= 64) {
      data[i] = 0;
    } else if (a >= 200) {
      data[i] = 255;
    } else {
      const t = (a - 64) / 136;
      const s = t * t * (3 - 2 * t);
      data[i] = (s * s * (3 - 2 * s) * 255 + 0.5) | 0;
    }
  }
}

/**
 * Downscale factors for background-only blur (higher = stronger / blockier).
 * Keep moderate so light blur is smooth, not thumbnail-upscale mud.
 * Person is never drawn to this tiny canvas as the sole final layer.
 */
export function blurDownscaleFactor(level: 'light' | 'medium' | 'strong'): number {
  switch (level) {
    case 'light':
      return 6;
    case 'medium':
      return 10;
    case 'strong':
      return 16;
    default:
      return 6;
  }
}

/** Weaker devices: gentler background blur factors (person still full-res). */
export function blurDownscaleFactorForDevice(
  level: 'light' | 'medium' | 'strong',
  weak: boolean,
): number {
  const base = blurDownscaleFactor(level);
  if (!weak) return base;
  return Math.max(6, Math.round(base * 0.65));
}

/** Default segmentation cadence target (~20–25fps mask when still). */
export const SEGMENT_INTERVAL_MS = 40;

/**
 * Soft guidance for UI/tests (camera may deliver less; we never invent higher).
 * Output canvas still follows live videoWidth/videoHeight 1:1.
 */
export const OUTPUT_MIN_WIDTH = 1280;

/**
 * Memory guard only for absurd sensors (e.g. 4K). Cameras ≤1920 stay exact 1:1.
 * Never used as a quality-adaptive resize target.
 */
export const OUTPUT_MAX_WIDTH = 1920;

/**
 * @deprecated Use OUTPUT_MAX_WIDTH — kept for older imports/tests.
 */
export const EFFECT_PROCESS_MAX_WIDTH = OUTPUT_MAX_WIDTH;

/**
 * Output size matching source exactly (1:1).
 * Never invent resolution above the camera.
 * Only scale down when width exceeds maxWidth (memory guard for 4K+) — never upscale.
 * Adaptive quality must not pass a lower maxWidth.
 */
export function computeOutputSize(
  srcW: number,
  srcH: number,
  maxWidth: number = OUTPUT_MAX_WIDTH,
): { width: number; height: number; scale: number } {
  const sw = Math.max(2, Math.round(srcW) || 640);
  const sh = Math.max(2, Math.round(srcH) || 480);
  const cap = Math.max(2, Math.round(maxWidth) || OUTPUT_MAX_WIDTH);
  // Exact camera size when under cap (no even-round shrink).
  if (sw <= cap) {
    return { width: sw, height: sh, scale: 1 };
  }
  const scale = cap / sw;
  const width = Math.max(2, Math.round(sw * scale));
  const height = Math.max(2, Math.round(sh * scale));
  return { width, height, scale };
}
