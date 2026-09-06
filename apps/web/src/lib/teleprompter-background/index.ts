/**
 * Teleprompter Background Effects module.
 *
 * CONSTRAINTS:
 * - Never touch scrollContainerRef, RAF loop, scrollTop, or auto-scroll in studio.
 * - Never alter Start/Pause/Resume/Reset, countdown, fullscreen, playback speed, script save.
 * - Wire recorder/preview only behind isTeleprompterBackgroundEffectsEnabled().
 * - Only blur camera tracks — refuse displaySurface / screen share.
 */

export {
  isTeleprompterBackgroundEffectsEnabled,
  TELEPROMPTER_BACKGROUND_EFFECTS_ENV_KEYS,
} from './feature-flag';
export type {
  BackgroundEffectMode,
  BackgroundProcessor,
  BackgroundProcessorOptions,
  CameraPreviewController,
  CameraPreviewOptions,
  RecordingCompositor,
  RecordingCompositorOptions,
  ProcessedVideoFrame,
} from './types';
export { createPassthroughCameraPreview } from './camera-preview';
export { createPassthroughBackgroundProcessor } from './background-processor';
export { createPassthroughRecordingCompositor } from './recording-compositor';
export {
  createCameraBlurSession,
  type CameraBlurSession,
  type CameraBlurSessionOptions,
  type CameraEffectPaint,
} from './camera-blur-session';
export {
  FrameTimeWindow,
  QUALITY_WINDOW_MS,
  QUALITY_MIN_SAMPLES,
  QUALITY_MIN_SPAN_MS,
  QUALITY_AVG_SLOW_MS,
  clampQualityTier,
  isBenignVisionRuntimeMessage,
  isHighMotionForMask,
  nextQualityTier,
  paramsForQualityTier,
  segmentIntervalForPaintKind,
  effectiveSegmentIntervalMs,
  type QualityTier,
  type QualityTierParams,
} from './adaptive-quality';
export {
  CAMERA_BACKGROUND_BLUR_LABELS,
  CAMERA_BACKGROUND_BLUR_LEVELS,
  blurRadiusForLevel,
  isCameraBackgroundBlurLevel,
  isDisplayCaptureTrack,
  isWeakClientForBackgroundEffects,
  normalizeCameraBackgroundBlurLevel,
  type CameraBackgroundBlurLevel,
} from './blur-levels';
export {
  createLayoutRecordingCompositor,
  type LayoutCompositorStartOptions,
  type LayoutCompositorSources,
  type LayoutRecordingCompositor,
} from './layout-recording-compositor';
export {
  DEFAULT_CAMERA_ONLY_LAYOUT,
  DEFAULT_SCREEN_PIP_LAYOUT,
  clamp01 as clampOverlay01,
  coverDrawSource,
  layoutToPixelRect,
  normalizeCameraOverlayLayout,
  type CameraOverlayLayout,
} from './camera-overlay-layout';
export {
  blurDownscaleFactor,
  blurDownscaleFactorForDevice,
  computeOutputSize,
  hardenPersonAlpha,
  packPersonMaskRgba,
  morphClosePersonAlpha,
  fillInteriorPersonHoles,
  rehardUpscaledMaskAlpha,
  SEGMENT_INTERVAL_MS,
  OUTPUT_MAX_WIDTH,
  OUTPUT_MIN_WIDTH,
  EFFECT_PROCESS_MAX_WIDTH,
} from './blur-compose';
export {
  clamp01,
  inferMaskPolarity,
  normalizeCategorySample,
  personWeightFromNormalized,
  softenPersonWeight,
  type MaskPolarity,
} from './segmentation-mask';
export {
  TELEPROMPTER_BG_PRESETS,
  clearPresetImageCache,
  computeCoverDrawRect,
  drawImageCover,
  getTeleprompterBgPreset,
  loadPresetBackgroundImage,
  syncVideoElementDecodeSize,
  type TeleprompterBgPreset,
  type TeleprompterBgPresetId,
} from './preset-backgrounds';
export {
  TELEPROMPTER_MOTION_BG_PRESETS,
  MOTION_BG_MAX_WIDTH,
  MOTION_BG_MAX_HEIGHT,
  MOTION_BG_MAX_FPS_FULL,
  MOTION_BG_MAX_FPS_LOW,
  getTeleprompterMotionBgPreset,
  selectMotionBgQuality,
  shouldFallbackMotionToImage,
  motionSourceUrls,
  type TeleprompterMotionBgId,
  type TeleprompterMotionBgPreset,
  type MotionBgQuality,
} from './motion-backgrounds';
export {
  disposeMotionBackgroundVideo,
  loadMotionBackgroundVideo,
  getActiveMotionBackgroundVideo,
  getActiveMotionBackgroundId,
} from './motion-video-player';
export {
  CUSTOM_BG_IMAGE_MAX_BYTES,
  CUSTOM_BG_VIDEO_MAX_BYTES,
  CUSTOM_BG_VIDEO_MAX_SECONDS,
  CUSTOM_BG_IMAGE_MAX_EDGE,
  CUSTOM_BG_IMAGE_MIME,
  CUSTOM_BG_VIDEO_MIME,
  classifyCustomBgMime,
  disposePreparedCustomBg,
  guessMimeFromFileName,
  prepareCustomBackgroundFromFile,
  resolveCustomBgMime,
  revokeObjectUrlSafe,
  validateCustomBackgroundFileSync,
  type CustomBgKind,
  type CustomBgValidationResult,
  type PreparedCustomBg,
} from './custom-background';
export {
  clearAppliedCustomBackground,
  fileFromPersistedCustomBg,
  loadAppliedCustomBackground,
  saveAppliedCustomBackground,
  type PersistedCustomBgMeta,
  type PersistedCustomBgRecord,
} from './custom-background-persist';
