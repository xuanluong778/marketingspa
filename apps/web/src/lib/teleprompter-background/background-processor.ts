import type { BackgroundProcessor, BackgroundProcessorOptions, ProcessedVideoFrame } from './types';

/**
 * Background processor foundation: always passthrough.
 * Real segmentation/blur will be added in a later step behind the feature flag.
 */
export function createPassthroughBackgroundProcessor(): BackgroundProcessor {
  let options: BackgroundProcessorOptions = { mode: 'none' };

  return {
    kind: 'background-processor',
    configure(next: BackgroundProcessorOptions) {
      options = {
        mode: next.mode || 'none',
        blurStrength: next.blurStrength,
        backgroundImageUrl: next.backgroundImageUrl ?? null,
        backgroundColor: next.backgroundColor ?? null,
      };
    },
    process(input: MediaStream | null): ProcessedVideoFrame {
      // Foundation: ignore effect options — never allocate canvas/workers here.
      return { stream: input, mode: options.mode };
    },
    dispose() {
      options = { mode: 'none' };
    },
  };
}
