/**
 * Singleton motion background video element.
 * - Exactly one looping video at a time
 * - muted + playsInline + no audio track attachment to MediaRecorder
 * - Pause when document is hidden; resume when visible
 * - Dispose previous element fully when switching/clearing
 *
 * Does NOT share RAF with Teleprompter scroll — playback is driven by the
 * video element's decoder; compositing uses the effect session's own loop.
 */

import {
  getTeleprompterMotionBgPreset,
  motionSourceUrls,
  selectMotionBgQuality,
  type MotionBgQuality,
  type TeleprompterMotionBgId,
} from './motion-backgrounds';

type ActiveMotion = {
  id: TeleprompterMotionBgId;
  quality: MotionBgQuality;
  video: HTMLVideoElement;
};

let active: ActiveMotion | null = null;
let visibilityBound = false;

function ensureVisibilityHook() {
  if (visibilityBound || typeof document === 'undefined') return;
  visibilityBound = true;
  document.addEventListener('visibilitychange', () => {
    const v = active?.video;
    if (!v) return;
    if (document.hidden) {
      try {
        v.pause();
      } catch {
        /* ignore */
      }
    } else {
      // Keep muted forever so no audio can bleed into the page or recorder
      v.muted = true;
      v.volume = 0;
      void v.play().catch(() => undefined);
    }
  });
}

function hardSilence(el: HTMLVideoElement) {
  el.muted = true;
  el.defaultMuted = true;
  el.volume = 0;
  // Assets are authored with -an (no audio). Element is never connected to
  // MediaRecorder — only canvas drawImage of frames (no audio path).
}

/**
 * Release the singleton motion video (pause, detach src, remove from DOM).
 */
export function disposeMotionBackgroundVideo(): void {
  if (!active) return;
  const { video } = active;
  active = null;
  try {
    video.pause();
  } catch {
    /* ignore */
  }
  try {
    video.removeAttribute('src');
    while (video.firstChild) video.removeChild(video.firstChild);
    video.load();
  } catch {
    /* ignore */
  }
  try {
    video.remove();
  } catch {
    /* ignore */
  }
}

/**
 * Load (or reuse) a single looping silent motion background.
 * Swapping id/quality disposes the previous video first.
 */
export async function loadMotionBackgroundVideo(
  id: TeleprompterMotionBgId,
  quality: MotionBgQuality = selectMotionBgQuality(),
): Promise<HTMLVideoElement> {
  ensureVisibilityHook();

  if (active && active.id === id && active.quality === quality && active.video) {
    hardSilence(active.video);
    if (document.hidden) {
      try {
        active.video.pause();
      } catch {
        /* ignore */
      }
    } else {
      void active.video.play().catch(() => undefined);
    }
    return active.video;
  }

  // One-at-a-time: tear down any previous loop before loading the next
  disposeMotionBackgroundVideo();

  const preset = getTeleprompterMotionBgPreset(id);
  if (!preset) throw new Error(`unknown_motion:${id}`);

  const { webm, mp4 } = motionSourceUrls(preset, quality);
  const video = document.createElement('video');
  video.setAttribute('data-tp-motion-bg', id);
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.playsInline = true;
  video.loop = true;
  video.autoplay = true;
  video.preload = 'auto';
  video.controls = false;
  video.disablePictureInPicture = true;
  hardSilence(video);
  // Size to decoded pixels as soon as metadata is available (not 16×16 CSS soft-sample)
  video.style.cssText =
    'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';

  // Prefer WebM then MP4 for wider Chrome/Safari coverage (both authored silent)
  const sWebm = document.createElement('source');
  sWebm.src = webm;
  sWebm.type = 'video/webm';
  const sMp4 = document.createElement('source');
  sMp4.src = mp4;
  sMp4.type = 'video/mp4';
  video.appendChild(sWebm);
  video.appendChild(sMp4);

  document.body.appendChild(video);

  await new Promise<void>((resolve, reject) => {
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error(`motion_load_failed:${id}`));
    };
    const cleanup = () => {
      video.removeEventListener('loadeddata', onOk);
      video.removeEventListener('error', onErr);
    };
    video.addEventListener('loadeddata', onOk, { once: true });
    video.addEventListener('error', onErr, { once: true });
    video.load();
    // Safety timeout
    setTimeout(() => {
      if (video.readyState >= 2) onOk();
    }, 8000);
  });

  // Match native decode size for full-frame canvas sampling
  {
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 360;
    video.style.width = `${vw}px`;
    video.style.height = `${vh}px`;
  }
  hardSilence(video);
  if (!document.hidden) {
    await video.play().catch(() => undefined);
  }

  active = { id, quality, video };
  return video;
}

export function getActiveMotionBackgroundVideo(): HTMLVideoElement | null {
  return active?.video ?? null;
}

export function getActiveMotionBackgroundId(): TeleprompterMotionBgId | null {
  return active?.id ?? null;
}
