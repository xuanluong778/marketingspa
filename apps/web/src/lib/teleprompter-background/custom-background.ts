/**
 * User-uploaded custom backgrounds (local Object URL only — never uploaded/saved to DB).
 *
 * Allowed: image/jpeg, image/png, image/webp · video/mp4, video/webm
 */

export const CUSTOM_BG_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const CUSTOM_BG_VIDEO_MIME = ['video/mp4', 'video/webm'] as const;

export const CUSTOM_BG_IMAGE_MAX_BYTES = 8 * 1024 * 1024; // 8 MB
export const CUSTOM_BG_VIDEO_MAX_BYTES = 32 * 1024 * 1024; // 32 MB
export const CUSTOM_BG_VIDEO_MAX_SECONDS = 90;
/** Reject absurd stills that blow memory when decoded. */
export const CUSTOM_BG_IMAGE_MAX_EDGE = 4096;
/** Soft cap for decode width of user video frames in preview (compose still cover-scales). */
export const CUSTOM_BG_VIDEO_MAX_EDGE = 1920;

export type CustomBgKind = 'image' | 'video';

export type CustomBgValidationOk = {
  ok: true;
  kind: CustomBgKind;
  mime: string;
  fileName: string;
  sizeBytes: number;
};

export type CustomBgValidationErr = {
  ok: false;
  code:
    | 'empty'
    | 'type'
    | 'size_image'
    | 'size_video'
    | 'duration'
    | 'dimensions'
    | 'decode'
    | 'unknown';
  message: string;
};

export type CustomBgValidationResult = CustomBgValidationOk | CustomBgValidationErr;

export type PreparedCustomBgImage = {
  kind: 'image';
  fileName: string;
  objectUrl: string;
  mime: string;
  sizeBytes: number;
  width: number;
  height: number;
  /** Decoded element ready for canvas drawImage (prefer ImageBitmap when available). */
  element: HTMLImageElement | ImageBitmap;
};

export type PreparedCustomBgVideo = {
  kind: 'video';
  fileName: string;
  objectUrl: string;
  mime: string;
  sizeBytes: number;
  width: number;
  height: number;
  durationSec: number;
  /** Looping muted video — never attach audio to MediaRecorder. */
  element: HTMLVideoElement;
};

export type PreparedCustomBg = PreparedCustomBgImage | PreparedCustomBgVideo;

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

/** Map extension when MIME is empty/generic (some OS pickers). */
export function guessMimeFromFileName(fileName: string): string | null {
  switch (extOf(fileName)) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'mp4':
    case 'm4v':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    default:
      return null;
  }
}

export function resolveCustomBgMime(file: { type?: string; name?: string }): string {
  const t = (file.type || '').toLowerCase().trim();
  if (
    (CUSTOM_BG_IMAGE_MIME as readonly string[]).includes(t) ||
    (CUSTOM_BG_VIDEO_MIME as readonly string[]).includes(t)
  ) {
    return t;
  }
  return guessMimeFromFileName(file.name || '') || t;
}

export function classifyCustomBgMime(mime: string): CustomBgKind | null {
  if ((CUSTOM_BG_IMAGE_MIME as readonly string[]).includes(mime)) return 'image';
  if ((CUSTOM_BG_VIDEO_MIME as readonly string[]).includes(mime)) return 'video';
  return null;
}

/**
 * Fast sync checks (type + size). Duration/dim need async probe after Object URL.
 */
export function validateCustomBackgroundFileSync(
  file: File | null | undefined,
): CustomBgValidationResult {
  if (!file || !(file instanceof File) || file.size <= 0) {
    return {
      ok: false,
      code: 'empty',
      message: 'Chưa chọn file nền.',
    };
  }

  const mime = resolveCustomBgMime(file);
  const kind = classifyCustomBgMime(mime);
  if (!kind) {
    return {
      ok: false,
      code: 'type',
      message: 'Định dạng không hỗ trợ. Dùng JPG, PNG, WebP hoặc MP4, WebM.',
    };
  }

  if (kind === 'image' && file.size > CUSTOM_BG_IMAGE_MAX_BYTES) {
    return {
      ok: false,
      code: 'size_image',
      message: `Ảnh quá lớn (tối đa ${Math.round(CUSTOM_BG_IMAGE_MAX_BYTES / (1024 * 1024))} MB).`,
    };
  }
  if (kind === 'video' && file.size > CUSTOM_BG_VIDEO_MAX_BYTES) {
    return {
      ok: false,
      code: 'size_video',
      message: `Video quá lớn (tối đa ${Math.round(CUSTOM_BG_VIDEO_MAX_BYTES / (1024 * 1024))} MB).`,
    };
  }

  return {
    ok: true,
    kind,
    mime,
    fileName: file.name || 'background',
    sizeBytes: file.size,
  };
}

export function revokeObjectUrlSafe(url: string | null | undefined): void {
  if (!url || typeof url !== 'string') return;
  if (!url.startsWith('blob:')) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    /* ignore */
  }
}

/**
 * Probe image natural size; rejects if decode fails or edge too large.
 */
export async function probeCustomImage(
  objectUrl: string,
): Promise<{ width: number; height: number } | CustomBgValidationErr> {
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('decode'));
      img.src = objectUrl;
    });
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (width < 2 || height < 2) {
      return {
        ok: false,
        code: 'dimensions',
        message: 'Không đọc được kích thước ảnh.',
      };
    }
    if (width > CUSTOM_BG_IMAGE_MAX_EDGE || height > CUSTOM_BG_IMAGE_MAX_EDGE) {
      return {
        ok: false,
        code: 'dimensions',
        message: `Ảnh quá lớn (mỗi cạnh tối đa ${CUSTOM_BG_IMAGE_MAX_EDGE}px).`,
      };
    }
    return { width, height };
  } catch {
    return {
      ok: false,
      code: 'decode',
      message: 'Không đọc được ảnh. File có thể hỏng hoặc không phải JPG/PNG/WebP.',
    };
  }
}

/**
 * Probe video metadata (duration + size); silent loop-ready element not returned here.
 */
export async function probeCustomVideo(
  objectUrl: string,
): Promise<{ width: number; height: number; durationSec: number } | CustomBgValidationErr> {
  try {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    await new Promise<void>((resolve, reject) => {
      const onMeta = () => {
        cleanup();
        resolve();
      };
      const onErr = () => {
        cleanup();
        reject(new Error('decode'));
      };
      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onMeta);
        video.removeEventListener('error', onErr);
      };
      video.addEventListener('loadedmetadata', onMeta);
      video.addEventListener('error', onErr);
      video.src = objectUrl;
      // Some browsers fire metadata late
      setTimeout(() => {
        if (video.readyState >= 1) onMeta();
      }, 6000);
    });
    const width = video.videoWidth || 0;
    const height = video.videoHeight || 0;
    const durationSec = Number.isFinite(video.duration) ? video.duration : 0;
    video.removeAttribute('src');
    try {
      video.load();
    } catch {
      /* ignore */
    }
    if (width < 2 || height < 2) {
      return {
        ok: false,
        code: 'dimensions',
        message: 'Không đọc được kích thước video.',
      };
    }
    if (width > CUSTOM_BG_VIDEO_MAX_EDGE || height > CUSTOM_BG_VIDEO_MAX_EDGE) {
      return {
        ok: false,
        code: 'dimensions',
        message: `Video quá lớn (mỗi cạnh tối đa ${CUSTOM_BG_VIDEO_MAX_EDGE}px).`,
      };
    }
    // duration can be Infinity for some streams — reject; NaN also
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      return {
        ok: false,
        code: 'duration',
        message: 'Không đọc được thời lượng video.',
      };
    }
    if (durationSec > CUSTOM_BG_VIDEO_MAX_SECONDS) {
      return {
        ok: false,
        code: 'duration',
        message: `Video quá dài (tối đa ${CUSTOM_BG_VIDEO_MAX_SECONDS} giây).`,
      };
    }
    return { width, height, durationSec };
  } catch {
    return {
      ok: false,
      code: 'decode',
      message: 'Không đọc được video. Dùng MP4 hoặc WebM hợp lệ.',
    };
  }
}

/**
 * Validate + prepare local custom background (Object URL). Caller must revoke via disposePreparedCustomBg.
 */
export async function prepareCustomBackgroundFromFile(
  file: File,
): Promise<PreparedCustomBg | CustomBgValidationErr> {
  const basic = validateCustomBackgroundFileSync(file);
  if (!basic.ok) return basic;

  const objectUrl = URL.createObjectURL(file);
  try {
    if (basic.kind === 'image') {
      const probe = await probeCustomImage(objectUrl);
      if ('ok' in probe && probe.ok === false) {
        revokeObjectUrlSafe(objectUrl);
        return probe;
      }
      const { width, height } = probe as { width: number; height: number };
      let element: HTMLImageElement | ImageBitmap;
      if (typeof createImageBitmap === 'function') {
        // Full-resolution bitmap (no resize options) for sharp cover-draw at output size
        const res = await fetch(objectUrl);
        const blob = await res.blob();
        element = await createImageBitmap(blob);
      } else {
        const img = new Image();
        img.decoding = 'async';
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('decode'));
          img.src = objectUrl;
        });
        element = img;
      }
      return {
        kind: 'image',
        fileName: basic.fileName,
        objectUrl,
        mime: basic.mime,
        sizeBytes: basic.sizeBytes,
        width,
        height,
        element,
      };
    }

    // video
    const probe = await probeCustomVideo(objectUrl);
    if ('ok' in probe && probe.ok === false) {
      revokeObjectUrlSafe(objectUrl);
      return probe;
    }
    const { width, height, durationSec } = probe as {
      width: number;
      height: number;
      durationSec: number;
    };
    const video = document.createElement('video');
    video.setAttribute('data-tp-custom-bg', '1');
    video.setAttribute('playsinline', '');
    video.playsInline = true;
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.loop = true;
    video.autoplay = true;
    video.preload = 'auto';
    video.controls = false;
    // Start tiny; resized to videoWidth×videoHeight after metadata (full sampling)
    video.style.cssText =
      'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    video.src = objectUrl;
    document.body.appendChild(video);
    await new Promise<void>((resolve, reject) => {
      const onOk = () => {
        cleanup();
        resolve();
      };
      const onErr = () => {
        cleanup();
        reject(new Error('decode'));
      };
      const cleanup = () => {
        video.removeEventListener('loadeddata', onOk);
        video.removeEventListener('error', onErr);
      };
      video.addEventListener('loadeddata', onOk);
      video.addEventListener('error', onErr);
      video.load();
      setTimeout(() => {
        if (video.readyState >= 2) onOk();
      }, 8000);
    });
    {
      const vw = video.videoWidth || width;
      const vh = video.videoHeight || height;
      video.style.width = `${Math.max(2, vw)}px`;
      video.style.height = `${Math.max(2, vh)}px`;
    }
    if (!document.hidden) {
      await video.play().catch(() => undefined);
    }

    // Pause when tab hidden (own listener; not Teleprompter RAF)
    const onVis = () => {
      if (document.hidden) {
        try {
          video.pause();
        } catch {
          /* ignore */
        }
      } else {
        video.muted = true;
        video.volume = 0;
        void video.play().catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    (video as HTMLVideoElement & { __tpVis?: () => void }).__tpVis = onVis;

    return {
      kind: 'video',
      fileName: basic.fileName,
      objectUrl,
      mime: basic.mime,
      sizeBytes: basic.sizeBytes,
      width,
      height,
      durationSec,
      element: video,
    };
  } catch {
    revokeObjectUrlSafe(objectUrl);
    return {
      ok: false,
      code: 'decode',
      message: 'Không xử lý được file nền. Thử file khác.',
    };
  }
}

export function disposePreparedCustomBg(bg: PreparedCustomBg | null | undefined): void {
  if (!bg) return;
  if (bg.kind === 'image') {
    if (typeof ImageBitmap !== 'undefined' && bg.element instanceof ImageBitmap) {
      try {
        bg.element.close();
      } catch {
        /* ignore */
      }
    }
  }
  if (bg.kind === 'video') {
    const v = bg.element as HTMLVideoElement & { __tpVis?: () => void };
    if (v.__tpVis) {
      try {
        document.removeEventListener('visibilitychange', v.__tpVis);
      } catch {
        /* ignore */
      }
      v.__tpVis = undefined;
    }
    try {
      v.pause();
    } catch {
      /* ignore */
    }
    try {
      v.removeAttribute('src');
      v.load();
    } catch {
      /* ignore */
    }
    try {
      v.remove();
    } catch {
      /* ignore */
    }
  }
  revokeObjectUrlSafe(bg.objectUrl);
}
