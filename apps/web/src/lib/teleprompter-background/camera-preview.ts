import type { CameraPreviewController, CameraPreviewOptions } from './types';

/**
 * Camera preview controller (passthrough foundation).
 * Only binds stream → videoElement; no effects, no recording.
 */
export function createPassthroughCameraPreview(): CameraPreviewController {
  let video: HTMLVideoElement | null = null;

  return {
    kind: 'camera-preview',
    attach(options: CameraPreviewOptions) {
      const el = options.videoElement ?? video;
      if (!el) return;
      video = el;
      // Mirror existing recorder pattern: assign srcObject when stream present
      if (el.srcObject !== options.stream) {
        el.srcObject = options.stream;
      }
      if (options.stream && typeof el.play === 'function') {
        void el.play().catch(() => undefined);
      }
    },
    detach() {
      if (video) {
        video.srcObject = null;
      }
    },
    dispose() {
      if (video) {
        video.srcObject = null;
      }
      video = null;
    },
  };
}
