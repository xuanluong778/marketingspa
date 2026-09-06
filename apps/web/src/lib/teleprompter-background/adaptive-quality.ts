/**
 * Adaptive quality for camera background effects (unit-testable).
 *
 * Contract:
 * - May only reduce segmentation FPS / mask refresh aggressiveness / bg-blur cost.
 * - MUST NOT lower output canvas, full-res image bg, or 3D video assets.
 */

export type QualityTier = 0 | 1 | 2 | 3;

/** Rolling window length for frame-time samples (ms). */
export const QUALITY_WINDOW_MS = 8_000;

/** Need this many samples before evaluating average. */
export const QUALITY_MIN_SAMPLES = 40;

/** Window must cover at least this span before degrade decisions. */
export const QUALITY_MIN_SPAN_MS = 5_000;

/** Average frame work (ms) above this → step down one quality tier. */
export const QUALITY_AVG_SLOW_MS = 55;

/** Single-frame spike ignored unless rolling avg also bad. */
export const QUALITY_SPIKE_MS = 120;

/**
 * Segmentation / mask-only knobs. Output resolution lives elsewhere and is fixed
 * to camera pixels (see computeOutputSize / OUTPUT_*).
 */
export type QualityTierParams = {
  /** Base segment interval when motion is low/medium. */
  segmentIntervalMs: number;
  /** When motion high, segment at least this often (ms). */
  motionSegmentIntervalMs: number;
  /**
   * Max frames to reuse last mask for compose (1–2).
   * Higher values → ghost limbs when waving.
   */
  maxMaskAgeFrames: number;
  /** Multiplier for bg-only blur downscale (blur mode only — never image/3D). */
  blurFactorScale: number;
};

export function paramsForQualityTier(tier: QualityTier): QualityTierParams {
  switch (tier) {
    case 0:
      // Still ~30fps mask; motion every rAF (~30fps). Reuse ≤1 composed frame.
      return {
        segmentIntervalMs: 33,
        motionSegmentIntervalMs: 16,
        maxMaskAgeFrames: 1,
        blurFactorScale: 1,
      };
    case 1:
      return {
        segmentIntervalMs: 40,
        motionSegmentIntervalMs: 16,
        maxMaskAgeFrames: 1,
        blurFactorScale: 0.9,
      };
    case 2:
      // Still target 20–30fps on motion; only idle can go slower.
      return {
        segmentIntervalMs: 50,
        motionSegmentIntervalMs: 33,
        maxMaskAgeFrames: 2,
        blurFactorScale: 0.8,
      };
    case 3:
    default:
      // Idle thrift only — motion still ≤ ~30fps so hands/head never leave a 3+ frame ghost.
      return {
        segmentIntervalMs: 66,
        motionSegmentIntervalMs: 33,
        maxMaskAgeFrames: 2,
        blurFactorScale: 0.7,
      };
  }
}

export function clampQualityTier(n: number): QualityTier {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 3) return 3;
  return Math.floor(n) as QualityTier;
}

export function nextQualityTier(tier: QualityTier): QualityTier {
  return clampQualityTier(tier + 1);
}

/**
 * Base segment interval by paint kind. Image/3D still need fresh person masks —
 * assets stay full-res cached; only mask cadence varies.
 */
export function segmentIntervalForPaintKind(
  kind: 'blur' | 'image' | 'motion' | null | undefined,
  baseMs: number,
): number {
  void kind;
  return Math.max(16, Math.round(baseMs) || 50);
}

/**
 * Pick effective segment interval from tier params + motion score (0..1).
 * High motion → near every-frame segmentation to kill ghost heads/hands.
 */
export function effectiveSegmentIntervalMs(
  params: QualityTierParams,
  motionScore01: number,
  paintKind?: 'blur' | 'image' | 'motion' | null,
): number {
  const motion = Math.max(0, Math.min(1, motionScore01));
  const base = segmentIntervalForPaintKind(paintKind, params.segmentIntervalMs);
  const fast = Math.min(base, params.motionSegmentIntervalMs);
  // Any tangible motion → bias hard toward every-frame / 20–30fps mask
  if (motion < 0.05) return base;
  if (motion >= 0.22) return Math.max(16, fast);
  const t = (motion - 0.05) / 0.17;
  return Math.max(16, Math.round(base + (fast - base) * t));
}

/** True when subject is moving enough that reusing a stale mask would ghost. */
export function isHighMotionForMask(motionScore01: number): boolean {
  return Math.max(0, Math.min(1, motionScore01)) >= 0.08;
}

/**
 * Rolling frame-time window. Call push(now, dtMs) every compose frame.
 * shouldDegrade() only after ≥5–8s of samples — never kill on a few spikes.
 */
export class FrameTimeWindow {
  private samples: { t: number; dt: number }[] = [];

  push(nowMs: number, dtMs: number): void {
    const dt = Math.max(0, Number(dtMs) || 0);
    this.samples.push({ t: nowMs, dt });
    const cutoff = nowMs - QUALITY_WINDOW_MS;
    while (this.samples.length > 0 && this.samples[0]!.t < cutoff) {
      this.samples.shift();
    }
  }

  sampleCount(): number {
    return this.samples.length;
  }

  spanMs(): number {
    if (this.samples.length < 2) return 0;
    return this.samples[this.samples.length - 1]!.t - this.samples[0]!.t;
  }

  averageMs(): number | null {
    if (this.samples.length < QUALITY_MIN_SAMPLES) return null;
    if (this.spanMs() < QUALITY_MIN_SPAN_MS) return null;
    let sum = 0;
    for (const s of this.samples) sum += s.dt;
    return sum / this.samples.length;
  }

  shouldDegrade(thresholdMs: number = QUALITY_AVG_SLOW_MS): boolean {
    const avg = this.averageMs();
    return avg != null && avg > thresholdMs;
  }

  reset(): void {
    this.samples = [];
  }
}

/** Benign MediaPipe / WebGL console messages — never treat as hard failures. */
export function isBenignVisionRuntimeMessage(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : String(err ?? '');
  if (!msg) return false;
  return (
    /OpenGL error checking is disabled/i.test(msg) ||
    /error checking is disabled/i.test(msg) ||
    /GL_INVALID|WEBGL_debug/i.test(msg)
  );
}
