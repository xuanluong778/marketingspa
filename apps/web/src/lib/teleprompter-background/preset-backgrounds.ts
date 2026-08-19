/**
 * Preset studio backgrounds for camera compositing (unit-testable catalog).
 * Full images live under /public/teleprompter/backgrounds/ — load only when selected.
 */

export type TeleprompterBgPresetId = 'studio' | 'office' | 'podcast' | 'meeting' | 'tech';

export type TeleprompterBgPreset = {
  id: TeleprompterBgPresetId;
  label: string;
  /** Full image path (lazy-load on select). */
  src: string;
  /** Small thumb path (lazy-load when Nền ảnh tab opens). */
  thumbSrc: string;
  description: string;
};

export const TELEPROMPTER_BG_PRESETS: readonly TeleprompterBgPreset[] = [
  {
    id: 'studio',
    label: 'Studio',
    src: '/teleprompter/backgrounds/studio.svg',
    thumbSrc: '/teleprompter/backgrounds/thumbs/studio.svg',
    description: 'Phông studio tối, ánh sáng mềm',
  },
  {
    id: 'office',
    label: 'Văn phòng',
    src: '/teleprompter/backgrounds/office.svg',
    thumbSrc: '/teleprompter/backgrounds/thumbs/office.svg',
    description: 'Không gian làm việc sáng',
  },
  {
    id: 'podcast',
    label: 'Podcast',
    src: '/teleprompter/backgrounds/podcast.svg',
    thumbSrc: '/teleprompter/backgrounds/thumbs/podcast.svg',
    description: 'Góc thu âm ấm, tường gỗ',
  },
  {
    id: 'meeting',
    label: 'Phòng họp',
    src: '/teleprompter/backgrounds/meeting.svg',
    thumbSrc: '/teleprompter/backgrounds/thumbs/meeting.svg',
    description: 'Phòng họp hiện đại',
  },
  {
    id: 'tech',
    label: 'Công nghệ',
    src: '/teleprompter/backgrounds/tech.svg',
    thumbSrc: '/teleprompter/backgrounds/thumbs/tech.svg',
    description: 'Nền tech xanh gradient',
  },
] as const;

export function getTeleprompterBgPreset(
  id: string | null | undefined,
): TeleprompterBgPreset | null {
  if (!id) return null;
  return TELEPROMPTER_BG_PRESETS.find((p) => p.id === id) ?? null;
}

/**
 * object-fit: cover + object-position: center for canvas drawImage.
 */
export function computeCoverDrawRect(
  srcW: number,
  srcH: number,
  destW: number,
  destH: number,
): { dx: number; dy: number; dw: number; dh: number } {
  const sw = Math.max(1, srcW);
  const sh = Math.max(1, srcH);
  const dwScale = destW / sw;
  const dhScale = destH / sh;
  const scale = Math.max(dwScale, dhScale);
  const dw = sw * scale;
  const dh = sh * scale;
  return {
    dx: (destW - dw) / 2,
    dy: (destH - dh) / 2,
    dw,
    dh,
  };
}

export function drawImageCover(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  destW: number,
  destH: number,
): void {
  // Prefer intrinsic full resolution — never the CSS layout box of a hidden video.
  let iw = destW;
  let ih = destH;
  if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
    iw = image.width;
    ih = image.height;
  } else if (image instanceof HTMLVideoElement) {
    iw = image.videoWidth || destW;
    ih = image.videoHeight || destH;
  } else if (image instanceof HTMLImageElement) {
    iw = image.naturalWidth || image.width || destW;
    ih = image.naturalHeight || image.height || destH;
  } else if (image instanceof HTMLCanvasElement) {
    iw = image.width || destW;
    ih = image.height || destH;
  } else if (typeof OffscreenCanvas !== 'undefined' && image instanceof OffscreenCanvas) {
    iw = image.width || destW;
    ih = image.height || destH;
  } else if ('width' in image && 'height' in image) {
    iw = Number((image as { width: number }).width) || destW;
    ih = Number((image as { height: number }).height) || destH;
  }
  const { dx, dy, dw, dh } = computeCoverDrawRect(iw, ih, destW, destH);
  const prevSmooth = ctx.imageSmoothingEnabled;
  const prevQuality = ctx.imageSmoothingQuality;
  // Downscale cover uses high quality; never stretch up with soft filter from tiny CSS boxes
  const scaleUp = dw > iw || dh > ih;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = scaleUp ? 'medium' : 'high';
  ctx.filter = 'none';
  ctx.drawImage(image, dx, dy, dw, dh);
  ctx.imageSmoothingEnabled = prevSmooth;
  ctx.imageSmoothingQuality = prevQuality;
}

/**
 * Size off-DOM video to its decoded pixels so browsers sample full frames for drawImage.
 * Tiny 16×16 CSS boxes have caused soft upscales on some engines.
 */
export function syncVideoElementDecodeSize(video: HTMLVideoElement | null | undefined): void {
  if (!video) return;
  const vw = video.videoWidth || 0;
  const vh = video.videoHeight || 0;
  if (vw < 2 || vh < 2) return;
  const wPx = `${vw}px`;
  const hPx = `${vh}px`;
  if (video.style.width !== wPx || video.style.height !== hPx) {
    video.style.position = 'fixed';
    video.style.left = '-9999px';
    video.style.top = '0';
    video.style.width = wPx;
    video.style.height = hPx;
    video.style.opacity = '0';
    video.style.pointerEvents = 'none';
  }
}

/** In-memory cache so re-selecting a preset does not re-fetch. */
const imageCache = new Map<string, HTMLImageElement | ImageBitmap>();

export function clearPresetImageCache(): void {
  for (const v of imageCache.values()) {
    if (typeof ImageBitmap !== 'undefined' && v instanceof ImageBitmap) {
      try {
        v.close();
      } catch {
        /* ignore */
      }
    }
  }
  imageCache.clear();
}

/**
 * Lazy-load one preset full image. Never loads the whole catalog.
 * Prefer createImageBitmap after decode for less main-thread jank when available.
 */
export async function loadPresetBackgroundImage(
  id: TeleprompterBgPresetId,
  fetchImpl: typeof fetch = typeof fetch !== 'undefined'
    ? fetch.bind(globalThis)
    : (undefined as unknown as typeof fetch),
): Promise<HTMLImageElement | ImageBitmap> {
  const cached = imageCache.get(id);
  if (cached) return cached;

  const preset = getTeleprompterBgPreset(id);
  if (!preset) throw new Error(`unknown_preset:${id}`);

  // Prefer fetch + blob + createImageBitmap (work off critical path when possible)
  if (typeof fetchImpl === 'function' && typeof createImageBitmap === 'function') {
    const res = await fetchImpl(preset.src, { cache: 'force-cache' });
    if (!res.ok) throw new Error(`bg_fetch_${res.status}`);
    const blob = await res.blob();
    // Yield a tick so Teleprompter RAF can run
    await new Promise<void>((r) => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => r());
      else setTimeout(r, 0);
    });
    const bitmap = await createImageBitmap(blob);
    imageCache.set(id, bitmap);
    return bitmap;
  }

  // Fallback HTMLImageElement
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.decoding = 'async';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error(`bg_img_error:${id}`));
    el.src = preset.src;
  });
  imageCache.set(id, img);
  return img;
}
