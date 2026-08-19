/**
 * Canvas layout recording compositor.
 * Own RAF + canvas.captureStream — never shared with Teleprompter auto-scroll RAF.
 *
 * Layers:
 *  1) Screen share (optional, full-bleed cover)
 *  2) Camera (full or PiP) — already processed stream (person + bg blur/image/3D)
 * Audio: microphone tracks merged from raw getUserMedia (never teleprompter UI audio).
 *
 * Does NOT capture DOM — Teleprompter chrome/controls never appear in output.
 */

import {
  coverDrawSource,
  layoutToPixelRect,
  normalizeCameraOverlayLayout,
  type CameraOverlayLayout,
} from './camera-overlay-layout';

export type LayoutCompositorSources = {
  screenStream: MediaStream | null;
  cameraStream: MediaStream | null;
  audioStream: MediaStream | null;
};

export type LayoutCompositorStartOptions = LayoutCompositorSources & {
  outputWidth: number;
  outputHeight: number;
  fps?: number;
  layout?: Partial<CameraOverlayLayout> | null;
};

export type LayoutRecordingCompositor = {
  readonly kind: 'layout-recording-compositor';
  start(options: LayoutCompositorStartOptions): MediaStream;
  updateLayout(layout: Partial<CameraOverlayLayout>): void;
  updateSources(sources: Partial<LayoutCompositorSources>): void;
  getLayout(): CameraOverlayLayout;
  isRunning(): boolean;
  getOutputStream(): MediaStream | null;
  stop(): void;
  dispose(): void;
};

function attachVideo(
  stream: MediaStream | null,
  el: HTMLVideoElement | null,
): HTMLVideoElement | null {
  if (!stream || !el) return null;
  const hasVideo = stream.getVideoTracks().some((t) => t.readyState === 'live' || t.enabled);
  if (!hasVideo) return null;
  el.srcObject = stream;
  el.muted = true;
  el.playsInline = true;
  void el.play().catch(() => undefined);
  return el;
}

/**
 * Create a layout compositor instance. Call start() to begin captureStream.
 * On failure, caller should fall back to track-merge passthrough compositor.
 */
export function createLayoutRecordingCompositor(): LayoutRecordingCompositor {
  let running = false;
  let rafId: number | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let captureStream: MediaStream | null = null;
  let cameraVideo: HTMLVideoElement | null = null;
  let screenVideo: HTMLVideoElement | null = null;
  let layout: CameraOverlayLayout = normalizeCameraOverlayLayout(null);
  let screenStream: MediaStream | null = null;
  let cameraStream: MediaStream | null = null;
  let audioStream: MediaStream | null = null;
  let outW = 1280;
  let outH = 720;

  const stopInternal = (stopCaptureTracks: boolean) => {
    running = false;
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (cameraVideo) {
      try {
        cameraVideo.pause();
      } catch {
        /* ignore */
      }
      cameraVideo.srcObject = null;
      cameraVideo.remove();
      cameraVideo = null;
    }
    if (screenVideo) {
      try {
        screenVideo.pause();
      } catch {
        /* ignore */
      }
      screenVideo.srcObject = null;
      screenVideo.remove();
      screenVideo = null;
    }
    if (captureStream && stopCaptureTracks) {
      for (const t of captureStream.getTracks()) {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      }
    }
    captureStream = null;
    canvas = null;
    // Do not stop source camera/screen/mic tracks — owned by recorder hook
  };

  const paintFrame = () => {
    if (!running || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, w, h);

    const hasScreen =
      !!screenVideo && screenVideo.readyState >= 2 && (screenVideo.videoWidth || 0) > 0;

    // 1) Screen full-bleed cover (no teleprompter DOM)
    if (hasScreen && screenVideo) {
      const sw = screenVideo.videoWidth;
      const sh = screenVideo.videoHeight;
      const src = coverDrawSource(sw, sh, w, h);
      ctx.drawImage(screenVideo, src.sx, src.sy, src.sw, src.sh, 0, 0, w, h);
    }

    // 2) Camera overlay (full frame when no screen, PiP when screen)
    const hasCam =
      !!cameraVideo && cameraVideo.readyState >= 2 && (cameraVideo.videoWidth || 0) > 0;
    if (hasCam && cameraVideo) {
      const effective = normalizeCameraOverlayLayout(layout, { screenActive: hasScreen });
      // When no screen, force full-bleed camera box while preserving flip/radius
      const useLayout = hasScreen ? effective : { ...effective, x: 0, y: 0, width: 1, height: 1 };
      const rect = layoutToPixelRect(useLayout, w, h);
      const cw = cameraVideo.videoWidth;
      const ch = cameraVideo.videoHeight;
      // 1:1 draw when canvas matches source — avoid soft cover resample when possible
      const sameAspect =
        Math.abs(cw / Math.max(1, ch) - rect.w / Math.max(1, rect.h)) < 0.02 &&
        Math.abs(cw - rect.w) < 2 &&
        Math.abs(ch - rect.h) < 2;

      ctx.save();
      // Rounded clip
      if (rect.radiusPx > 0) {
        const r = Math.min(rect.radiusPx, Math.floor(Math.min(rect.w, rect.h) / 2));
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(rect.x, rect.y, rect.w, rect.h, r);
        } else {
          const x = rect.x;
          const y = rect.y;
          const rw = rect.w;
          const rh = rect.h;
          ctx.moveTo(x + r, y);
          ctx.arcTo(x + rw, y, x + rw, y + rh, r);
          ctx.arcTo(x + rw, y + rh, x, y + rh, r);
          ctx.arcTo(x, y + rh, x, y, r);
          ctx.arcTo(x, y, x + rw, y, r);
          ctx.closePath();
        }
        ctx.clip();
      } else {
        ctx.beginPath();
        ctx.rect(rect.x, rect.y, rect.w, rect.h);
        ctx.clip();
      }

      ctx.imageSmoothingEnabled = !sameAspect;
      ctx.imageSmoothingQuality = sameAspect ? 'low' : 'high';
      ctx.filter = 'none';

      if (useLayout.flipX) {
        ctx.translate(rect.x + rect.w, rect.y);
        ctx.scale(-1, 1);
        if (sameAspect) {
          ctx.drawImage(cameraVideo, 0, 0, cw, ch, 0, 0, rect.w, rect.h);
        } else {
          const src = coverDrawSource(cw, ch, rect.w, rect.h);
          ctx.drawImage(cameraVideo, src.sx, src.sy, src.sw, src.sh, 0, 0, rect.w, rect.h);
        }
      } else if (sameAspect) {
        ctx.drawImage(cameraVideo, 0, 0, cw, ch, rect.x, rect.y, rect.w, rect.h);
      } else {
        const src = coverDrawSource(cw, ch, rect.w, rect.h);
        ctx.drawImage(cameraVideo, src.sx, src.sy, src.sw, src.sh, rect.x, rect.y, rect.w, rect.h);
      }
      ctx.restore();

      // Subtle ring so PiP is readable on busy screens
      if (hasScreen) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2;
        if (rect.radiusPx > 0 && typeof ctx.roundRect === 'function') {
          const r = Math.min(rect.radiusPx, Math.floor(Math.min(rect.w, rect.h) / 2));
          ctx.beginPath();
          ctx.roundRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2, Math.max(0, r - 1));
          ctx.stroke();
        } else {
          ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
        }
        ctx.restore();
      }
    }

    // If neither produced content, keep solid fill (already drawn)
  };

  const loop = () => {
    if (!running) {
      rafId = null;
      return;
    }
    try {
      paintFrame();
    } catch {
      /* keep loop alive; caller has timeouts/fallback paths */
    }
    rafId = requestAnimationFrame(loop);
  };

  const rebuildOutputStream = (): MediaStream => {
    if (!canvas) throw new Error('layout_compositor_no_canvas');
    // Stop previous capture tracks only
    if (captureStream) {
      for (const t of captureStream.getTracks()) {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      }
    }
    const fps = 30;
    const videoOnly = canvas.captureStream(fps);
    const tracks: MediaStreamTrack[] = [...videoOnly.getVideoTracks()];
    // Microphone only (from getUserMedia audio) — never screen/system audio unless already in audioStream
    if (audioStream) {
      for (const t of audioStream.getAudioTracks()) {
        if (t.readyState !== 'ended') tracks.push(t);
      }
    }
    captureStream = new MediaStream(tracks);
    return captureStream;
  };

  return {
    kind: 'layout-recording-compositor',
    getLayout: () => layout,
    isRunning: () => running,
    getOutputStream: () => captureStream,
    updateLayout: (next) => {
      layout = normalizeCameraOverlayLayout(
        { ...layout, ...next },
        {
          screenActive: !!screenStream?.getVideoTracks().length,
        },
      );
    },
    updateSources: (sources) => {
      if ('screenStream' in sources) {
        screenStream = sources.screenStream ?? null;
        if (screenVideo) {
          screenVideo.srcObject = null;
          if (screenStream) attachVideo(screenStream, screenVideo);
        }
      }
      if ('cameraStream' in sources) {
        cameraStream = sources.cameraStream ?? null;
        if (cameraVideo) {
          cameraVideo.srcObject = null;
          if (cameraStream) attachVideo(cameraStream, cameraVideo);
        }
      }
      if ('audioStream' in sources) {
        audioStream = sources.audioStream ?? null;
        if (running && canvas) {
          try {
            rebuildOutputStream();
          } catch {
            /* ignore */
          }
        }
      }
      layout = normalizeCameraOverlayLayout(layout, {
        screenActive: !!screenStream?.getVideoTracks().length,
      });
    },
    start(options) {
      stopInternal(true);
      outW = Math.max(2, Math.round(options.outputWidth) || 1280);
      outH = Math.max(2, Math.round(options.outputHeight) || 720);
      screenStream = options.screenStream;
      cameraStream = options.cameraStream;
      audioStream = options.audioStream;
      layout = normalizeCameraOverlayLayout(options.layout, {
        screenActive: !!screenStream?.getVideoTracks().length,
      });

      if (typeof document === 'undefined') {
        throw new Error('layout_compositor_no_dom');
      }

      canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      canvas.setAttribute('data-tp-layout-compose', '1');

      cameraVideo = document.createElement('video');
      cameraVideo.setAttribute('data-tp-layout-cam', '1');
      cameraVideo.muted = true;
      cameraVideo.playsInline = true;
      cameraVideo.style.cssText = `position:fixed;left:-9999px;top:0;width:${Math.max(2, cameraVideo.videoWidth || options.outputWidth)}px;height:${Math.max(2, cameraVideo.videoHeight || options.outputHeight)}px;opacity:0;pointer-events:none`;
      document.body.appendChild(cameraVideo);
      attachVideo(cameraStream, cameraVideo);

      screenVideo = document.createElement('video');
      screenVideo.setAttribute('data-tp-layout-screen', '1');
      screenVideo.muted = true;
      screenVideo.playsInline = true;
      screenVideo.style.cssText =
        'position:fixed;left:-9999px;top:0;width:16px;height:16px;opacity:0;pointer-events:none';
      document.body.appendChild(screenVideo);
      attachVideo(screenStream, screenVideo);

      running = true;
      paintFrame();
      // Resize after metadata if video sizes known
      const fixCamSize = () => {
        if (!cameraVideo) return;
        const vw = cameraVideo.videoWidth;
        const vh = cameraVideo.videoHeight;
        if (vw > 0 && vh > 0) {
          cameraVideo.style.width = `${vw}px`;
          cameraVideo.style.height = `${vh}px`;
        }
      };
      cameraVideo.addEventListener('loadedmetadata', fixCamSize);
      setTimeout(fixCamSize, 100);

      rafId = requestAnimationFrame(loop);
      return rebuildOutputStream();
    },
    stop: () => stopInternal(true),
    dispose: () => stopInternal(true),
  };
}
