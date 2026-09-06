/**
 * Pure layout math for camera overlay on recording canvas (unit-testable).
 * All fractions are in [0,1] relative to output frame.
 */

export type CameraOverlayLayout = {
  /** Left edge of camera box (0–1 of output width). */
  x: number;
  /** Top edge of camera box (0–1 of output height). */
  y: number;
  /** Width of camera box (0–1 of output width). */
  width: number;
  /** Height of camera box (0–1 of output height). */
  height: number;
  /** Corner radius as fraction of the smaller overlay side (0 = square, 0.5 = circle-ish). */
  borderRadius: number;
  /** Mirror camera horizontally for user-facing feel. */
  flipX: boolean;
};

export const DEFAULT_CAMERA_ONLY_LAYOUT: CameraOverlayLayout = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  borderRadius: 0,
  /**
   * UI meaning with background effects: mirror PERSON only (selfie).
   * Layout compositor must NOT flip full composed frames when effects bake bg+person.
   */
  flipX: true,
};

/** PiP default: bottom-right when screen is present. */
export const DEFAULT_SCREEN_PIP_LAYOUT: CameraOverlayLayout = {
  x: 0.68,
  y: 0.62,
  width: 0.28,
  height: 0.32,
  borderRadius: 0.18,
  flipX: true,
};

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Sanitize layout; keep min size so face stays usable.
 */
export function normalizeCameraOverlayLayout(
  input: Partial<CameraOverlayLayout> | null | undefined,
  opts?: { screenActive?: boolean },
): CameraOverlayLayout {
  const base = opts?.screenActive ? DEFAULT_SCREEN_PIP_LAYOUT : DEFAULT_CAMERA_ONLY_LAYOUT;
  const width = Math.min(1, Math.max(0.12, clamp01(input?.width ?? base.width)));
  const height = Math.min(1, Math.max(0.12, clamp01(input?.height ?? base.height)));
  const x = Math.min(1 - width, Math.max(0, clamp01(input?.x ?? base.x)));
  const y = Math.min(1 - height, Math.max(0, clamp01(input?.y ?? base.y)));
  const borderRadius = Math.min(
    0.5,
    Math.max(0, clamp01(input?.borderRadius ?? base.borderRadius)),
  );
  const flipX = typeof input?.flipX === 'boolean' ? input.flipX : base.flipX;
  return { x, y, width, height, borderRadius, flipX };
}

/** Pixel rect inside output canvas (no subpixel chop for clean edges). */
export function layoutToPixelRect(
  layout: CameraOverlayLayout,
  outW: number,
  outH: number,
): { x: number; y: number; w: number; h: number; radiusPx: number } {
  const w = Math.max(2, Math.round(layout.width * outW));
  const h = Math.max(2, Math.round(layout.height * outH));
  const x = Math.max(0, Math.min(outW - w, Math.round(layout.x * outW)));
  const y = Math.max(0, Math.min(outH - h, Math.round(layout.y * outH)));
  const radiusPx = Math.round(Math.min(w, h) * layout.borderRadius);
  return { x, y, w, h, radiusPx };
}

/**
 * Cover-fit source into dest rect (center crop).
 * Returns draw args for ctx.drawImage(src, sx,sy,sw,sh, dx,dy,dw,dh).
 */
export function coverDrawSource(
  srcW: number,
  srcH: number,
  destW: number,
  destH: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const sw0 = Math.max(1, srcW);
  const sh0 = Math.max(1, srcH);
  const scale = Math.max(destW / sw0, destH / sh0);
  const sw = destW / scale;
  const sh = destH / scale;
  return {
    sx: (sw0 - sw) / 2,
    sy: (sh0 - sh) / 2,
    sw,
    sh,
  };
}
