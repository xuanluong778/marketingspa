/**
 * Camera effect session: sharp person + blurred/image/3D background only.
 * Own canvas + single RAF — never touches Teleprompter scroll.
 *
 * Quality contract:
 * - Output canvas = exact videoWidth×videoHeight (1:1). Never render small then upscale.
 * - Adaptive quality only slows mask FPS — never shrinks output canvas, person RGB, or bg assets.
 * - Person RGB from camera video only (no filter / no blur / no temporal blend on person).
 * - Mask = alpha only; 20–30fps when moving; in-flight gate so queue cannot lag 5+ frames;
 *   reuse ≤1–2 composed frames; ≤1–2px hard-edge feather (nearest mask upscale).
 * - Image/3D bg: full-resolution source file cover-drawn. Never thumbnails.
 * - One compose per rAF on a single output canvas → one canvas.captureStream (preview = record).
 */

import {
  FrameTimeWindow,
  effectiveSegmentIntervalMs,
  isBenignVisionRuntimeMessage,
  isHighMotionForMask,
  nextQualityTier,
  paramsForQualityTier,
  type QualityTier,
} from './adaptive-quality';
import {
  isDisplayCaptureTrack,
  isWeakClientForBackgroundEffects,
  type CameraBackgroundBlurLevel,
} from './blur-levels';
import {
  OUTPUT_MAX_WIDTH,
  blurDownscaleFactorForDevice,
  computeOutputSize,
  packPersonMaskRgba,
} from './blur-compose';
import { drawImageCover, syncVideoElementDecodeSize } from './preset-backgrounds';
import {
  inferMaskPolarity,
  personWeightFromNormalized,
  type MaskPolarity,
  normalizeCategorySample,
} from './segmentation-mask';

export type CameraEffectPaint =
  | { kind: 'blur'; level: Exclude<CameraBackgroundBlurLevel, 'none'> }
  | { kind: 'image'; image: CanvasImageSource; presetId: string }
  | { kind: 'motion'; video: HTMLVideoElement; presetId: string; quality: 'full' | 'low' };

export type CameraBlurSessionOptions = {
  onPerformanceNote?: (message: string) => void;
  onSoftFallback?: (reason: string) => void;
  /** @deprecated alias of onSoftFallback */
  onFallback?: (reason: string) => void;
};

export type CameraBlurSession = {
  start(rawCameraStream: MediaStream, paint: CameraEffectPaint): Promise<MediaStream>;
  updatePaint(paint: CameraEffectPaint): void;
  /** Mirror person + mask only (selfie). Never flips background image/3D. */
  setMirrorPerson(mirror: boolean): void;
  getMirrorPerson(): boolean;
  stop(): void;
  /** Freeze last canvas frame without ending the capture MediaStream. */
  softHold(): MediaStream | null;
  isRunning(): boolean;
  getPaint(): CameraEffectPaint | null;
  getQualityTier(): QualityTier;
  /** Live output canvas size (must match camera videoWidth/videoHeight). */
  getOutputSize(): { width: number; height: number } | null;
  /** Live composed capture stream (null when stopped). */
  getCaptureStream(): MediaStream | null;
};

type ImageSegmenterLike = {
  segmentForVideo: (
    video: HTMLVideoElement,
    timestamp: number,
    callback: (result: SegmentResult) => void,
  ) => void;
  close?: () => void;
};

type SegmentResult = {
  categoryMask?: {
    getAsFloat32Array: () => Float32Array;
    getAsUint8Array?: () => Uint8Array;
    width: number;
    height: number;
    close?: () => void;
  };
  confidenceMasks?: Array<{
    getAsFloat32Array: () => Float32Array;
    width?: number;
    height?: number;
    close?: () => void;
  } | null>;
};

let sharedSegmenter: ImageSegmenterLike | null = null;
let sharedSegmenterPromise: Promise<ImageSegmenterLike> | null = null;

async function getSharedSegmenter(): Promise<ImageSegmenterLike> {
  if (sharedSegmenter) return sharedSegmenter;
  if (!sharedSegmenterPromise) {
    sharedSegmenterPromise = (async () => {
      const vision = await import('@mediapipe/tasks-vision');
      const { FilesetResolver, ImageSegmenter } = vision;
      const wasmVersion = '0.10.21';
      const fileset = await FilesetResolver.forVisionTasks(
        `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${wasmVersion}/wasm`,
      );
      const modelUrls = [
        'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite',
        'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
      ];
      let lastErr: unknown;
      for (const modelUrl of modelUrls) {
        for (const delegate of ['GPU', 'CPU'] as const) {
          try {
            const seg = await ImageSegmenter.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: modelUrl, delegate },
              runningMode: 'VIDEO',
              outputCategoryMask: true,
              outputConfidenceMasks: false,
            });
            sharedSegmenter = seg as ImageSegmenterLike;
            return sharedSegmenter;
          } catch (err) {
            if (isBenignVisionRuntimeMessage(err)) continue;
            lastErr = err;
          }
        }
      }
      throw lastErr ?? new Error('image_segmenter_load_failed');
    })().catch((err) => {
      sharedSegmenterPromise = null;
      sharedSegmenter = null;
      throw err;
    });
  }
  return sharedSegmenterPromise;
}

function copyMaskBuffer(src: ArrayLike<number>): Float32Array {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = Number(src[i] ?? 0);
  return out;
}

export function createCameraBlurSession(options?: CameraBlurSessionOptions): CameraBlurSession {
  let paint: CameraEffectPaint | null = null;
  let running = false;
  let rafId: number | null = null;
  let hiddenVideo: HTMLVideoElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  /** Person RGB + alpha only — destination-in without wiping bg. */
  let personCanvas: HTMLCanvasElement | null = null;
  /** Mask only — always ML native size, never forces output resize. */
  let maskCanvas: HTMLCanvasElement | null = null;
  /** Full-output hard mask (person alpha only); rebuilt when mask/mirror changes. */
  let scaledMaskCanvas: HTMLCanvasElement | null = null;
  let blurTinyCanvas: HTMLCanvasElement | null = null;
  /** Cached cover-raster of static image bg (output size) — 1:1 blit each frame. */
  let imageBgPlate: HTMLCanvasElement | null = null;
  let imageBgPlateKey = '';
  /** Tiny canvas for motion energy (not used for draw). */
  let motionCanvas: HTMLCanvasElement | null = null;
  let captureStream: MediaStream | null = null;
  /** CanvasCaptureMediaStreamTrack when available — push frames after each paint. */
  let captureTrack: MediaStreamTrack | null = null;
  let lastTs = 0;
  let lastSegmentAt = 0;
  /** Never pile segment callbacks — backlog = multi-frame ghost. */
  let segmentInFlight = false;
  let segmentStartedAt = 0;
  /** If MediaPipe never returns, unlock so compose keeps live. */
  const SEGMENT_TIMEOUT_MS = 400;
  let lockedPolarity: MaskPolarity | null = null;
  let badMaskStreak = 0;
  /** Only note in UI after this many consecutive bad packs — never kills the session. */
  const BAD_MASK_NOTE_STREAK = 150;
  let sessionEpoch = 0;
  let weakClient = false;
  let qualityTier: QualityTier = 0;
  const frameWindow = new FrameTimeWindow();
  let lastDegradeAt = 0;
  const DEGRADE_COOLDOWN_MS = 8_000;
  let maskAgeFrames = 999;
  let motionScore = 0;
  let prevMotionBuf: Uint8ClampedArray | null = null;
  let motionSampleCounter = 0;
  /** Selfie mirror applies to person+mask layers only — never to full-res bg assets. */
  let mirrorPerson = true;
  /** Rebuild full-res alpha only when mask or mirror changes (not every compose). */
  let scaledMaskDirty = true;
  const MOTION_W = 48;
  const MOTION_H = 27;

  let lastMask: Float32Array | null = null;
  let lastMaskW = 0;
  let lastMaskH = 0;
  let maskImageData: ImageData | null = null;

  /**
   * Tear down session.
   * When soft=true: stop processing but leave canvas captureStream tracks alive so
   * preview freezes on last good frame (no black flash while soft-restarting).
   */
  const stopInternal = (mode: 'hard' | 'soft' = 'hard') => {
    sessionEpoch += 1;
    running = false;
    segmentInFlight = false;
    segmentStartedAt = 0;
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (mode === 'hard' && captureStream) {
      for (const t of captureStream.getTracks()) {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      }
      captureStream = null;
      captureTrack = null;
    }
    if (hiddenVideo) {
      try {
        hiddenVideo.pause();
      } catch {
        /* ignore */
      }
      hiddenVideo.srcObject = null;
      hiddenVideo.remove();
      hiddenVideo = null;
    }
    // Keep canvas for soft freeze last-frame; hard path drops everything
    if (mode === 'hard') {
      if (canvas?.parentNode) {
        try {
          canvas.remove();
        } catch {
          /* ignore */
        }
      }
      canvas = null;
      personCanvas = null;
      maskCanvas = null;
      scaledMaskCanvas = null;
      blurTinyCanvas = null;
      imageBgPlate = null;
      imageBgPlateKey = '';
      motionCanvas = null;
      maskImageData = null;
      lastMask = null;
      lastMaskW = 0;
      lastMaskH = 0;
    }
    scaledMaskDirty = true;
    lastTs = 0;
    lastSegmentAt = 0;
    lockedPolarity = null;
    badMaskStreak = 0;
    maskAgeFrames = 999;
    motionScore = 0;
    prevMotionBuf = null;
    frameWindow.reset();
  };

  const currentParams = () => paramsForQualityTier(qualityTier);

  /** Output always tracks camera size — never from adaptive tier. */
  const lockedOutputSize = (srcW: number, srcH: number) =>
    computeOutputSize(srcW, srcH, OUTPUT_MAX_WIDTH);

  const syncHiddenVideoCssSize = (vw: number, vh: number) => {
    if (!hiddenVideo) return;
    // Match real decode size so browsers don't downscale the media element path
    hiddenVideo.style.cssText = `position:fixed;left:-9999px;top:0;width:${Math.max(2, vw)}px;height:${Math.max(2, vh)}px;opacity:0;pointer-events:none`;
  };

  const resizeOutputCanvases = (w: number, h: number) => {
    if (!canvas) return;
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w;
    canvas.height = h;
    if (personCanvas) {
      personCanvas.width = w;
      personCanvas.height = h;
    }
    if (scaledMaskCanvas) {
      scaledMaskCanvas.width = w;
      scaledMaskCanvas.height = h;
    }
    scaledMaskDirty = true;
    imageBgPlate = null;
    imageBgPlateKey = '';
  };

  /**
   * Chromium: captureStream(0) freezes unless requestFrame is called after each paint.
   * Also call after captureStream(fps>0) so consumers never stick on the first frame.
   */
  const pushCaptureFrame = () => {
    const t = captureTrack;
    if (!t) return;
    const req = (t as MediaStreamTrack & { requestFrame?: () => void }).requestFrame;
    if (typeof req === 'function') {
      try {
        req.call(t);
      } catch {
        /* ignore */
      }
    }
  };

  const paintRawOnly = () => {
    if (!hiddenVideo || !canvas) return;
    // Never use desynchronized — pairs poorly with captureStream and can stall frames.
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    ctx.filter = 'none';
    const vw = hiddenVideo.videoWidth || 0;
    const vh = hiddenVideo.videoHeight || 0;
    // Strict 1:1 path — no upscale soft filter
    if (vw === canvas.width && vh === canvas.height) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(hiddenVideo, 0, 0);
    } else {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(hiddenVideo, 0, 0, canvas.width, canvas.height);
    }
    pushCaptureFrame();
  };

  /**
   * Motion energy 0..1 from tiny grayscale buffer (independent of mask canvas).
   */
  const sampleMotion = (): number => {
    // Sample every 2nd frame so wave/head turns register quickly without starving compose
    motionSampleCounter += 1;
    if (motionSampleCounter % 2 !== 0) return motionScore;
    if (!hiddenVideo || hiddenVideo.readyState < 2) return motionScore;
    if (!motionCanvas) motionCanvas = document.createElement('canvas');
    if (motionCanvas.width !== MOTION_W || motionCanvas.height !== MOTION_H) {
      motionCanvas.width = MOTION_W;
      motionCanvas.height = MOTION_H;
    }
    const mctx = motionCanvas.getContext('2d', { willReadFrequently: true });
    if (!mctx) return motionScore;
    mctx.filter = 'none';
    mctx.imageSmoothingEnabled = true;
    mctx.drawImage(hiddenVideo, 0, 0, MOTION_W, MOTION_H);
    let img: ImageData;
    try {
      img = mctx.getImageData(0, 0, MOTION_W, MOTION_H);
    } catch {
      return motionScore;
    }
    const buf = img.data;
    if (!prevMotionBuf || prevMotionBuf.length !== buf.length) {
      prevMotionBuf = new Uint8ClampedArray(buf);
      return 0;
    }
    let sum = 0;
    const n = buf.length / 4;
    for (let i = 0; i < buf.length; i += 4) {
      const y = (buf[i]! * 0.299 + buf[i + 1]! * 0.587 + buf[i + 2]! * 0.114) | 0;
      const py =
        (prevMotionBuf[i]! * 0.299 +
          prevMotionBuf[i + 1]! * 0.587 +
          prevMotionBuf[i + 2]! * 0.114) |
        0;
      sum += Math.abs(y - py);
    }
    prevMotionBuf.set(buf);
    const mean = sum / Math.max(1, n) / 255;
    motionScore = motionScore * 0.25 + Math.min(1, mean * 8) * 0.75;
    return motionScore;
  };

  /**
   * Build / refresh full-res hard person mask (alpha only) if dirty.
   * Nearest-neighbor upscale — bilinear soft rims create ghost/halo under motion.
   */
  const ensureScaledPersonMask = (
    w: number,
    h: number,
    mctx: CanvasRenderingContext2D,
  ): HTMLCanvasElement | null => {
    if (!lastMask || lastMaskW <= 0 || lastMaskH <= 0 || !maskCanvas) return null;
    if (
      !scaledMaskDirty &&
      scaledMaskCanvas &&
      scaledMaskCanvas.width === w &&
      scaledMaskCanvas.height === h
    ) {
      return scaledMaskCanvas;
    }

    const mw = lastMaskW;
    const mh = lastMaskH;
    const polarity = lockedPolarity ?? 'high-is-person';

    if (
      !maskImageData ||
      maskCanvas.width !== mw ||
      maskCanvas.height !== mh ||
      maskImageData.width !== mw ||
      maskImageData.height !== mh
    ) {
      maskCanvas.width = mw;
      maskCanvas.height = mh;
      maskImageData = mctx.createImageData(mw, mh);
    }
    packPersonMaskRgba(maskImageData.data, lastMask, mw * mh, polarity, {
      width: mw,
      height: mh,
      closeHoles: true,
    });
    mctx.putImageData(maskImageData, 0, 0);

    if (!scaledMaskCanvas) scaledMaskCanvas = document.createElement('canvas');
    if (scaledMaskCanvas.width !== w || scaledMaskCanvas.height !== h) {
      scaledMaskCanvas.width = w;
      scaledMaskCanvas.height = h;
    }
    const sctx = scaledMaskCanvas.getContext('2d', { alpha: true });
    if (!sctx) return null;
    sctx.clearRect(0, 0, w, h);
    // Hard edges only (~1–2px after harden). High-quality scale = multi-px soft ghost.
    sctx.imageSmoothingEnabled = false;
    sctx.filter = 'none';
    if (mirrorPerson) {
      sctx.save();
      sctx.translate(w, 0);
      sctx.scale(-1, 1);
      sctx.drawImage(maskCanvas, 0, 0, w, h);
      sctx.restore();
    } else {
      sctx.drawImage(maskCanvas, 0, 0, w, h);
    }
    scaledMaskDirty = false;
    return scaledMaskCanvas;
  };

  /**
   * Rasterize static image background once at exact output size for 1:1 blits
   * (avoids re-running soft cover scale every rAF → clearer UI text on uploads).
   */
  const ensureImageBgPlate = (
    image: CanvasImageSource,
    presetId: string,
    w: number,
    h: number,
  ): HTMLCanvasElement | null => {
    const key = `${presetId}|${w}x${h}`;
    if (
      imageBgPlate &&
      imageBgPlateKey === key &&
      imageBgPlate.width === w &&
      imageBgPlate.height === h
    ) {
      return imageBgPlate;
    }
    if (!imageBgPlate) imageBgPlate = document.createElement('canvas');
    imageBgPlate.width = w;
    imageBgPlate.height = h;
    const b = imageBgPlate.getContext('2d', { alpha: false });
    if (!b) return null;
    b.filter = 'none';
    b.imageSmoothingEnabled = true;
    b.imageSmoothingQuality = 'high';
    b.clearRect(0, 0, w, h);
    drawImageCover(b, image, w, h);
    imageBgPlateKey = key;
    return imageBgPlate;
  };

  /**
   * Single-stack compose (one visual pass per rAF):
   * 1) Background — image: full-res cover cached 1:1; motion: native video; blur: soft plate only
   * 2) Person RGB 1:1 from live camera (+ mirror), no filter/temporal
   * 3) Mask as alpha only (destination-in)
   * 4) Stack person onto bg
   */
  const composeWithMask = () => {
    if (!hiddenVideo || !canvas || !personCanvas || !maskCanvas || !paint) return;

    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d', { alpha: false });
    const pctx = personCanvas.getContext('2d', { alpha: true });
    const mctx = maskCanvas.getContext('2d', { alpha: true, willReadFrequently: true });
    if (!ctx || !pctx || !mctx) return;

    const hasMask = !!lastMask && lastMaskW > 0 && lastMaskH > 0;
    const scaledMask = hasMask ? ensureScaledPersonMask(w, h, mctx) : null;
    const vw = hiddenVideo.videoWidth || w;
    const vh = hiddenVideo.videoHeight || h;
    const personOneToOne = vw === w && vh === h;

    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.clearRect(0, 0, w, h);

    if (paint.kind === 'image') {
      const plate = ensureImageBgPlate(paint.image, paint.presetId, w, h);
      if (plate) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(plate, 0, 0);
      } else {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        drawImageCover(ctx, paint.image, w, h);
      }
    } else if (paint.kind === 'motion') {
      const mv = paint.video;
      syncVideoElementDecodeSize(mv);
      if (mv.readyState >= 2) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        drawImageCover(ctx, mv, w, h);
      } else {
        ctx.fillStyle = '#0b1220';
        ctx.fillRect(0, 0, w, h);
      }
    } else {
      // Blur plate only — never use this path as the person layer
      const baseFactor = blurDownscaleFactorForDevice(paint.level, weakClient);
      const factor = Math.max(3, Math.round(baseFactor * currentParams().blurFactorScale));
      const tw = Math.max(2, Math.round(w / factor));
      const th = Math.max(2, Math.round(h / factor));

      if (!blurTinyCanvas) blurTinyCanvas = document.createElement('canvas');
      if (blurTinyCanvas.width !== tw || blurTinyCanvas.height !== th) {
        blurTinyCanvas.width = tw;
        blurTinyCanvas.height = th;
      }
      const tctx = blurTinyCanvas.getContext('2d', { alpha: false });
      if (!tctx) return;
      tctx.filter = 'none';
      tctx.imageSmoothingEnabled = true;
      if (mirrorPerson) {
        tctx.save();
        tctx.translate(tw, 0);
        tctx.scale(-1, 1);
        tctx.drawImage(hiddenVideo, 0, 0, tw, th);
        tctx.restore();
      } else {
        tctx.drawImage(hiddenVideo, 0, 0, tw, th);
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium';
      ctx.drawImage(blurTinyCanvas, 0, 0, w, h);
    }

    // Person RGB — direct camera video only, never blur / never thrift-size
    pctx.globalCompositeOperation = 'source-over';
    pctx.filter = 'none';
    pctx.clearRect(0, 0, w, h);
    pctx.imageSmoothingEnabled = false;
    if (mirrorPerson) {
      pctx.save();
      pctx.translate(w, 0);
      pctx.scale(-1, 1);
      if (personOneToOne) {
        pctx.drawImage(hiddenVideo, 0, 0);
      } else {
        pctx.imageSmoothingEnabled = true;
        pctx.imageSmoothingQuality = 'high';
        pctx.drawImage(hiddenVideo, 0, 0, w, h);
      }
      pctx.restore();
    } else if (personOneToOne) {
      pctx.drawImage(hiddenVideo, 0, 0);
    } else {
      pctx.imageSmoothingEnabled = true;
      pctx.imageSmoothingQuality = 'high';
      pctx.drawImage(hiddenVideo, 0, 0, w, h);
    }

    // Alpha only — no RGB from mask
    if (scaledMask) {
      pctx.globalCompositeOperation = 'destination-in';
      pctx.imageSmoothingEnabled = false;
      pctx.filter = 'none';
      pctx.drawImage(scaledMask, 0, 0);
      pctx.globalCompositeOperation = 'source-over';
    }

    ctx.imageSmoothingEnabled = false;
    ctx.filter = 'none';
    ctx.drawImage(personCanvas, 0, 0);
    pushCaptureFrame();
  };

  function extractAndCacheMask(result: SegmentResult): boolean {
    let data: ArrayLike<number> | null = null;
    let width = 0;
    let height = 0;

    if (result.categoryMask) {
      width = result.categoryMask.width;
      height = result.categoryMask.height;
      try {
        if (typeof result.categoryMask.getAsUint8Array === 'function') {
          data = result.categoryMask.getAsUint8Array();
        } else {
          data = result.categoryMask.getAsFloat32Array();
        }
      } catch {
        data = result.categoryMask.getAsFloat32Array();
      }
    } else if (result.confidenceMasks?.[0]) {
      const c = result.confidenceMasks[0];
      data = c.getAsFloat32Array();
      width = c.width || 0;
      height = c.height || 0;
    }

    if (!data || width <= 0 || height <= 0 || data.length === 0) return false;

    if (!lockedPolarity) {
      lockedPolarity = inferMaskPolarity(data, width, height);
    }

    const pol = lockedPolarity;
    let sum = 0;
    const take = Math.min(data.length, 1024);
    const step = Math.max(1, (data.length / take) | 0);
    let n = 0;
    for (let i = 0; i < data.length && n < take; i += step) {
      sum += personWeightFromNormalized(normalizeCategorySample(data[i] ?? 0), pol);
      n += 1;
    }
    const meanPerson = n > 0 ? sum / n : 0;
    if (meanPerson < 0.02 || meanPerson > 0.98) return false;

    lastMask = copyMaskBuffer(data);
    lastMaskW = width;
    lastMaskH = height;
    maskAgeFrames = 0;
    scaledMaskDirty = true;
    return true;
  }

  function applySegmentResult(result: SegmentResult) {
    try {
      const ok = extractAndCacheMask(result);
      if (!ok) {
        badMaskStreak += 1;
        // Keep last good mask — never kill stream. Compose on next rAF only.
        if (badMaskStreak === BAD_MASK_NOTE_STREAK) {
          options?.onPerformanceNote?.(
            'Mask tạm không ổn định — giữ nền + mask gần nhất (không tắt hiệu ứng).',
          );
        }
        if (badMaskStreak > BAD_MASK_NOTE_STREAK * 4) badMaskStreak = BAD_MASK_NOTE_STREAK;
        return;
      }
      badMaskStreak = 0;
      // Do NOT compose here — only rAF composes (one pass; no double maskAge).
    } finally {
      try {
        result.categoryMask?.close?.();
      } catch {
        /* ignore */
      }
      try {
        result.confidenceMasks?.forEach((m) => m?.close?.());
      } catch {
        /* ignore */
      }
    }
  }

  const applyQualityTier = (tier: QualityTier, note?: string) => {
    qualityTier = tier;
    // Do NOT resize output canvases — adaptive only changes segment interval / mask age
    frameWindow.reset();
    lastDegradeAt = performance.now();
    if (note) options?.onPerformanceNote?.(note);
  };

  const maybeDegradeFromRollingAvg = (now: number) => {
    if (now - lastDegradeAt < DEGRADE_COOLDOWN_MS) return;
    if (!frameWindow.shouldDegrade()) return;

    if (qualityTier < 3) {
      const next = nextQualityTier(qualityTier);
      applyQualityTier(
        next,
        next === 1
          ? 'Thiết bị tải cao — giảm tần suất segmentation (giữ độ phân giải output/nền).'
          : next === 2
            ? 'Tiếp tục giảm FPS segmentation — nền full-res + camera vẫn giữ nét.'
            : 'Segmentation tiết kiệm tối đa — output/nền không giảm.',
      );
      return;
    }

    // Never stop the session / never wipe background for load.
    options?.onPerformanceNote?.(
      'Thiết bị tải cao — giữ nền full-res, chỉ chạy mask chậm hơn (không tắt hiệu ứng).',
    );
    lastDegradeAt = now;
    frameWindow.reset();
  };

  const loop = () => {
    if (!running || !hiddenVideo || !sharedSegmenter) {
      rafId = null;
      return;
    }

    const t0 = performance.now();

    if (hiddenVideo.readyState < 2) {
      paintRawOnly();
      rafId = requestAnimationFrame(loop);
      return;
    }

    const vw = hiddenVideo.videoWidth || 0;
    const vh = hiddenVideo.videoHeight || 0;
    if (vw > 0 && vh > 0 && canvas) {
      const next = lockedOutputSize(vw, vh);
      if (canvas.width !== next.width || canvas.height !== next.height) {
        resizeOutputCanvases(next.width, next.height);
        syncHiddenVideoCssSize(vw, vh);
      }
    }

    const m = sampleMotion();
    const params = currentParams();
    const now = performance.now();
    // Unstick dead segment callbacks so rAF never blocks forever on GPU/MediaPipe
    if (segmentInFlight && segmentStartedAt > 0 && now - segmentStartedAt > SEGMENT_TIMEOUT_MS) {
      segmentInFlight = false;
      segmentStartedAt = 0;
    }
    const segMs = effectiveSegmentIntervalMs(params, m, paint?.kind);
    const highMotion = isHighMotionForMask(m);
    const maskStale = maskAgeFrames >= params.maxMaskAgeFrames;
    // Motion uses min interval (avoid hammering WASM every rAF → main-thread freeze)
    const dueSegment =
      !segmentInFlight &&
      (now - lastSegmentAt >= segMs ||
        maskStale ||
        (highMotion && now - lastSegmentAt >= Math.min(segMs, params.motionSegmentIntervalMs)));

    if (dueSegment) {
      segmentInFlight = true;
      segmentStartedAt = now;
      lastSegmentAt = now;
      const stamp = now <= lastTs ? lastTs + 1 : now;
      lastTs = stamp;
      try {
        sharedSegmenter.segmentForVideo(hiddenVideo, stamp, (result) => {
          segmentInFlight = false;
          segmentStartedAt = 0;
          if (!running) return;
          applySegmentResult(result);
        });
      } catch (err) {
        segmentInFlight = false;
        segmentStartedAt = 0;
        if (!isBenignVisionRuntimeMessage(err)) {
          options?.onPerformanceNote?.('Segmentation tạm lỗi — dùng mask gần nhất (giữ nền).');
        }
      }
    }

    // Exactly one compose per rAF: live person RGB + freshest mask alpha + push capture frame
    composeWithMask();
    if (lastMask) maskAgeFrames += 1;

    const dt = performance.now() - t0;
    frameWindow.push(performance.now(), dt);
    maybeDegradeFromRollingAvg(performance.now());

    if (running) rafId = requestAnimationFrame(loop);
  };

  return {
    getPaint: () => paint,
    getQualityTier: () => qualityTier,
    isRunning: () => running,
    getCaptureStream: () => captureStream,
    getOutputSize: () =>
      canvas && canvas.width > 0 && canvas.height > 0
        ? { width: canvas.width, height: canvas.height }
        : null,
    getMirrorPerson: () => mirrorPerson,
    setMirrorPerson: (mirror) => {
      const next = !!mirror;
      if (next !== mirrorPerson) {
        mirrorPerson = next;
        scaledMaskDirty = true;
      }
    },
    updatePaint: (next) => {
      paint = next;
      imageBgPlate = null;
      imageBgPlateKey = '';
    },
    async start(rawCameraStream, nextPaint) {
      stopInternal('hard');
      const epoch = sessionEpoch;
      paint = nextPaint;
      weakClient = isWeakClientForBackgroundEffects();
      qualityTier = weakClient ? 1 : 0;
      frameWindow.reset();

      const vTrack = rawCameraStream.getVideoTracks()[0];
      if (!vTrack) throw new Error('no_video_track');
      if (isDisplayCaptureTrack(vTrack)) {
        throw new Error('display_capture_not_supported');
      }

      let settingsW = 0;
      let settingsH = 0;
      try {
        const s = typeof vTrack.getSettings === 'function' ? vTrack.getSettings() : {};
        settingsW = Math.round(Number(s.width) || 0);
        settingsH = Math.round(Number(s.height) || 0);
      } catch {
        /* ignore */
      }

      hiddenVideo = document.createElement('video');
      hiddenVideo.playsInline = true;
      hiddenVideo.muted = true;
      hiddenVideo.autoplay = true;
      hiddenVideo.setAttribute('data-tp-bg-effect', 'source');
      document.body.appendChild(hiddenVideo);
      hiddenVideo.srcObject = rawCameraStream;
      await hiddenVideo.play().catch(() => undefined);

      if (epoch !== sessionEpoch) throw new Error('session_aborted');

      await new Promise<void>((r) => {
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => r());
        else setTimeout(r, 0);
      });
      if (epoch !== sessionEpoch) throw new Error('session_aborted');

      await new Promise<void>((resolve) => {
        if (hiddenVideo!.readyState >= 1) {
          resolve();
          return;
        }
        hiddenVideo!.onloadedmetadata = () => resolve();
        setTimeout(() => resolve(), 1500);
      });
      if (epoch !== sessionEpoch) throw new Error('session_aborted');

      await new Promise<void>((r) => setTimeout(r, 0));
      if (epoch !== sessionEpoch) throw new Error('session_aborted');

      // Exact camera pixels
      const srcW = hiddenVideo.videoWidth || settingsW || 1280;
      const srcH = hiddenVideo.videoHeight || settingsH || 720;
      syncHiddenVideoCssSize(srcW, srcH);
      const { width: w, height: h } = lockedOutputSize(srcW, srcH);

      canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.setAttribute('data-tp-bg-effect', 'compose');
      // Keep capture surface in the document so Chromium keeps capturing frames reliably
      canvas.style.cssText =
        'position:fixed;left:-99999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none;contain:strict';
      document.body.appendChild(canvas);
      personCanvas = document.createElement('canvas');
      personCanvas.width = w;
      personCanvas.height = h;
      maskCanvas = document.createElement('canvas');
      blurTinyCanvas = document.createElement('canvas');
      motionCanvas = document.createElement('canvas');
      motionCanvas.width = MOTION_W;
      motionCanvas.height = MOTION_H;
      scaledMaskDirty = true;

      await getSharedSegmenter();
      if (epoch !== sessionEpoch) throw new Error('session_aborted');

      // Steady 24–30fps capture — captureStream(0) freezes unless requestFrame (and still glitches).
      const captureFps = 30;
      captureStream = canvas.captureStream(captureFps);
      captureTrack = captureStream.getVideoTracks()[0] ?? null;
      if (captureTrack) captureTrack.enabled = true;
      running = true;
      lastSegmentAt = 0;
      segmentInFlight = false;
      segmentStartedAt = 0;
      maskAgeFrames = 999;
      paintRawOnly();
      rafId = requestAnimationFrame(loop);
      return captureStream;
    },
    stop: () => stopInternal('hard'),
    softHold: () => {
      const frozen = captureStream;
      stopInternal('soft');
      return frozen;
    },
  };
}
