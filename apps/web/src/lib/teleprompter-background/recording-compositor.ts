import type { RecordingCompositor, RecordingCompositorOptions } from './types';

/**
 * Recording compositor foundation.
 * Merges video + audio tracks into one MediaStream for MediaRecorder without canvas.
 * Returns null if both inputs are empty.
 */
export function createPassthroughRecordingCompositor(): RecordingCompositor {
  return {
    kind: 'recording-compositor',
    compose(options: RecordingCompositorOptions): MediaStream | null {
      const tracks: MediaStreamTrack[] = [];
      if (options.videoStream) {
        tracks.push(...options.videoStream.getVideoTracks());
      }
      if (options.audioStream) {
        tracks.push(...options.audioStream.getAudioTracks());
      }
      // Also accept video tracks that already include audio (single-stream source)
      if (options.videoStream && !options.audioStream) {
        tracks.push(...options.videoStream.getAudioTracks());
      }
      if (!tracks.length) return null;
      // Dedupe by track id
      const seen = new Set<string>();
      const unique = tracks.filter((t) => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });
      if (typeof MediaStream === 'undefined') {
        // Node unit tests without DOM MediaStream constructor
        return null;
      }
      return new MediaStream(unique);
    },
    dispose() {
      /* no-op foundation */
    },
  };
}
