/**
 * Pure mask helpers for person vs background (unit-testable, no MediaPipe).
 *
 * Selfie segmenter categories: 0 = background, 1 = person.
 * Category values may arrive as 0/1 or 0/255 after conversion — normalize carefully.
 * Confidence channels are float [0,1]; prefer person channel when available.
 */

export type MaskPolarity = 'high-is-person' | 'high-is-background';

/** Clamp to [0, 1]. */
export function clamp01(v: number): number {
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v;
}

/**
 * Normalize a raw category-mask sample to [0,1] where higher usually means
 * higher category index (person = 1). Handles 0/1 and 0/255 encodings.
 */
export function normalizeCategorySample(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  // 0..255 category or alpha-style
  if (raw > 1.5) {
    // Category index 1 sometimes expands oddly; treat >=127 as “high”.
    // True category indices stay 0 or 1 and never hit this branch.
    return raw >= 127.5 ? 1 : 0;
  }
  // Soft 0..1 or integer categories 0/1
  return clamp01(raw);
}

/**
 * Map a normalized sample to person weight given polarity.
 * Person weight 1 = fully opaque foreground (sharp person).
 */
export function personWeightFromNormalized(normalized: number, polarity: MaskPolarity): number {
  const n = clamp01(normalized);
  return polarity === 'high-is-person' ? n : 1 - n;
}

/**
 * Soften binary edges slightly for hair/shoulders (reduces stair-steps).
 * Keeps weight continuous; does NOT invert polarity.
 */
export function softenPersonWeight(weight: number, softness = 0.12): number {
  const w = clamp01(weight);
  if (softness <= 0) return w;
  // Smoothstep-like remap around mid: spreads binary steps without turning mid gray into solid person.
  const t = clamp01((w - softness) / Math.max(1e-6, 1 - 2 * softness));
  return t * t * (3 - 2 * t);
}

/**
 * Infer mask polarity from one frame of mask samples.
 * Selfie subjects usually occupy the center more than the border.
 * Returns high-is-person when center mean > border mean (after normalize).
 */
export function inferMaskPolarity(
  samples: ArrayLike<number>,
  width: number,
  height: number,
): MaskPolarity {
  const w = Math.max(1, width | 0);
  const h = Math.max(1, height | 0);
  const n = samples.length;
  if (n < w * h) {
    // Partial / flat array — use global mean: rare person → if mean high, high is background.
    let sum = 0;
    const take = Math.min(n, 4096);
    for (let i = 0; i < take; i++) sum += normalizeCategorySample(samples[i] ?? 0);
    const mean = sum / take;
    return mean > 0.55 ? 'high-is-background' : 'high-is-person';
  }

  const x0 = Math.floor(w * 0.25);
  const x1 = Math.ceil(w * 0.75);
  const y0 = Math.floor(h * 0.2);
  const y1 = Math.ceil(h * 0.8);

  let cSum = 0;
  let cN = 0;
  let bSum = 0;
  let bN = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = normalizeCategorySample(samples[y * w + x] ?? 0);
      const inCenter = x >= x0 && x < x1 && y >= y0 && y < y1;
      if (inCenter) {
        cSum += v;
        cN += 1;
      } else {
        bSum += v;
        bN += 1;
      }
    }
  }

  const cMean = cN > 0 ? cSum / cN : 0;
  const bMean = bN > 0 ? bSum / bN : 0;

  // Person tends to be central → whichever side is higher center vs border is person polarity
  if (cMean >= bMean) return 'high-is-person';
  return 'high-is-background';
}

/**
 * Fill RGBA ImageData alpha channel from person weights (RGB left intact).
 * personWeights in [0,1], length >= w*h (or mask resized sample via sampler).
 */
export function applyPersonAlphaToImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  personAlphaAt: (x: number, y: number) => number,
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = clamp01(personAlphaAt(x, y));
      data[(y * width + x) * 4 + 3] = Math.round(a * 255);
    }
  }
}

/**
 * Sample person weight from a mask buffer resized from mw×mh → canvas w×h.
 */
export function samplePersonWeight(
  mask: ArrayLike<number>,
  mw: number,
  mh: number,
  x: number,
  y: number,
  destW: number,
  destH: number,
  polarity: MaskPolarity,
  soften = true,
): number {
  if (mw <= 0 || mh <= 0 || destW <= 0 || destH <= 0) return 0;
  const mx = Math.min(mw - 1, Math.max(0, Math.floor((x * mw) / destW)));
  const my = Math.min(mh - 1, Math.max(0, Math.floor((y * mh) / destH)));
  // Bilinear-ish 2×2 average for slightly softer hair edges without full filter cost
  const x1 = Math.min(mw - 1, mx + 1);
  const y1 = Math.min(mh - 1, my + 1);
  const a = normalizeCategorySample(mask[my * mw + mx] ?? 0);
  const b = normalizeCategorySample(mask[my * mw + x1] ?? 0);
  const c = normalizeCategorySample(mask[y1 * mw + mx] ?? 0);
  const d = normalizeCategorySample(mask[y1 * mw + x1] ?? 0);
  const n = (a + b + c + d) * 0.25;
  const w = personWeightFromNormalized(n, polarity);
  return soften ? softenPersonWeight(w) : w;
}

/**
 * Prefer person confidence channel; fall back to 1 - background confidence.
 * Returns undefined if no usable channel.
 */
export function pickPersonConfidenceMask(
  confidenceMasks:
    | Array<
        | { getAsFloat32Array: () => Float32Array; width?: number; height?: number }
        | null
        | undefined
      >
    | null
    | undefined,
): { data: Float32Array; width: number; height: number; polarity: MaskPolarity } | null {
  if (!confidenceMasks || confidenceMasks.length === 0) return null;

  // Selfie: [0]=background, [1]=person when both present.
  if (confidenceMasks.length >= 2 && confidenceMasks[1]) {
    const m = confidenceMasks[1];
    const data = m.getAsFloat32Array();
    return {
      data,
      width: m.width || 0,
      height: m.height || 0,
      polarity: 'high-is-person',
    };
  }

  if (confidenceMasks[0]) {
    const m = confidenceMasks[0];
    const data = m.getAsFloat32Array();
    // Single channel: typically person confidence for legacy selfie graphs.
    // Infer polarity once from spatial prior.
    const w = m.width || Math.sqrt(data.length) | 0;
    const h = m.height || (w > 0 ? (data.length / w) | 0 : 0);
    const polarity = inferMaskPolarity(data, w, h);
    return { data, width: w, height: h, polarity };
  }

  return null;
}
