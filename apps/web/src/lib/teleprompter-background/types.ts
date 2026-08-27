/**
 * Shared contracts for Background Effects (camera / processor / compositor).
 * No browser APIs required here — keep pure for unit tests.
 */

/** Effect modes — blur_* used by camera background UI. */
export type BackgroundEffectMode =
  'none' | 'blur' | 'blur_light' | 'blur_medium' | 'blur_strong' | 'image' | 'color';

export type CameraPreviewOptions = {
  /** Live camera (or mixed) stream; null when not ready. */
  stream: MediaStream | null;
  /** Optional element already used by the recorder UI. */
  videoElement?: HTMLVideoElement | null;
};

/**
 * Owns binding a MediaStream to a <video> for preview only.
 * Must not own MediaRecorder or teleprompter scroll.
 */
export type CameraPreviewController = {
  readonly kind: 'camera-preview';
  attach(options: CameraPreviewOptions): void;
  detach(): void;
  dispose(): void;
};

export type BackgroundProcessorOptions = {
  mode: BackgroundEffectMode;
  /** Strength 0–1 when mode is blur (processor may ignore until implemented). */
  blurStrength?: number;
  /** Object URL / static path when mode is image. */
  backgroundImageUrl?: string | null;
  /** CSS color when mode is color. */
  backgroundColor?: string | null;
};

export type ProcessedVideoFrame = {
  /** Output stream safe to show in preview and/or feed compositor. */
  stream: MediaStream | null;
  mode: BackgroundEffectMode;
};

/**
 * Transforms camera frames → processed video track/stream.
 * Implementation in later prompts; foundation is passthrough only.
 */
export type BackgroundProcessor = {
  readonly kind: 'background-processor';
  configure(options: BackgroundProcessorOptions): void;
  /**
   * Process raw stream into output. When effects disabled or mode none,
   * MUST return the same stream reference (passthrough).
   */
  process(input: MediaStream | null): ProcessedVideoFrame;
  dispose(): void;
};

export type RecordingCompositorOptions = {
  /** Usually the processed video stream. */
  videoStream: MediaStream | null;
  /** Mic tracks kept separate from visual processing. */
  audioStream: MediaStream | null;
  /** Optional screen-share stream for layout compositor (null when camera-only). */
  screenStream?: MediaStream | null;
  /** Optional layout for camera PiP (layout compositor). */
  cameraLayout?: Partial<import('./camera-overlay-layout').CameraOverlayLayout> | null;
  /** Output canvas size for layout compose. */
  outputWidth?: number;
  outputHeight?: number;
};

/**
 * Combines processed video + audio for MediaRecorder only.
 * Does not replace getUserMedia permission flow.
 */
export type RecordingCompositor = {
  readonly kind: 'recording-compositor';
  /**
   * Build a stream for MediaRecorder. When no processing, returns video+audio merge.
   * Passthrough foundation: reuses existing tracks without canvas compose.
   */
  compose(options: RecordingCompositorOptions): MediaStream | null;
  dispose(): void;
};
