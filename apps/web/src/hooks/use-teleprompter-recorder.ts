'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  createCameraBlurSession,
  createLayoutRecordingCompositor,
  createPassthroughRecordingCompositor,
  DEFAULT_CAMERA_ONLY_LAYOUT,
  DEFAULT_SCREEN_PIP_LAYOUT,
  disposeMotionBackgroundVideo,
  disposePreparedCustomBg,
  clearAppliedCustomBackground,
  fileFromPersistedCustomBg,
  getTeleprompterMotionBgPreset,
  isDisplayCaptureTrack,
  isTeleprompterBackgroundEffectsEnabled,
  isWeakClientForBackgroundEffects,
  loadAppliedCustomBackground,
  loadMotionBackgroundVideo,
  loadPresetBackgroundImage,
  normalizeCameraOverlayLayout,
  prepareCustomBackgroundFromFile,
  saveAppliedCustomBackground,
  selectMotionBgQuality,
  shouldFallbackMotionToImage,
  type CameraBackgroundBlurLevel,
  type CameraBlurSession,
  type CameraEffectPaint,
  type CameraOverlayLayout,
  type LayoutRecordingCompositor,
  type PreparedCustomBg,
  type TeleprompterBgPresetId,
  type TeleprompterMotionBgId,
} from '@/lib/teleprompter-background';
import {
  audioLevelFromAnalyser,
  buildRecordingFilename,
  canTransition,
  classifyMediaError,
  constraintsForMode,
  displayMediaConstraints,
  estimateRecordingBytes,
  formatByteSize,
  formatRecordingClock,
  MAX_RECOMMENDED_SECONDS,
  modeIncludesScreenShare,
  mediaRecorderOptionsForQuality,
  pickRecorderMimeType,
  qualityToResolution,
  revokeObjectUrl,
  sanitizeRecordingFilename,
  shouldBlockUnload,
  sizeWarningLevel,
  stopMediaStream,
  videoTrackSettingsResolution,
  type TeleprompterCountdownSeconds,
  type TeleprompterFacingMode,
  type TeleprompterMediaErrorCode,
  type TeleprompterRecordMode,
  type TeleprompterRecorderState,
  type TeleprompterVideoQuality,
} from '@/lib/teleprompter-media';

export type MediaDeviceOption = {
  deviceId: string;
  label: string;
  kind: 'videoinput' | 'audioinput';
};

export type UseTeleprompterRecorderOptions = {
  onRecordingStart?: () => void;
  onRecordingPause?: () => void;
  onRecordingResume?: () => void;
  onRecordingStop?: () => void;
};

export type UseTeleprompterRecorderResult = {
  state: TeleprompterRecorderState;
  mode: TeleprompterRecordMode;
  setMode: (m: TeleprompterRecordMode) => void;
  quality: TeleprompterVideoQuality;
  setQuality: (q: TeleprompterVideoQuality) => void;
  countdownSeconds: TeleprompterCountdownSeconds;
  setCountdownSeconds: (n: TeleprompterCountdownSeconds) => void;
  videoDevices: MediaDeviceOption[];
  audioDevices: MediaDeviceOption[];
  videoDeviceId: string;
  audioDeviceId: string;
  setVideoDeviceId: (id: string) => void;
  setAudioDeviceId: (id: string) => void;
  facingMode: TeleprompterFacingMode;
  switchFacingCamera: () => Promise<void>;
  cameraTrackEnabled: boolean;
  micTrackEnabled: boolean;
  toggleCameraTrack: () => void;
  toggleMicTrack: () => void;
  error: { code: TeleprompterMediaErrorCode; message: string } | null;
  elapsedSeconds: number;
  elapsedLabel: string;
  countdownLeft: number | null;
  audioLevel: number;
  mimeType: string | null;
  previewUrl: string | null;
  recordedBlob: Blob | null;
  recordedFilename: string | null;
  setRecordedFilename: (name: string) => void;
  estimatedBytes: number;
  estimatedSizeLabel: string;
  actualBytes: number | null;
  sizeLevel: 'none' | 'warn' | 'critical';
  overRecommendedDuration: boolean;
  hasDownloaded: boolean;
  liveStream: MediaStream | null;
  isLiveVideo: boolean;
  isLiveAudio: boolean;
  enableDevices: () => Promise<void>;
  startRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => void;
  retake: () => void;
  download: () => void;
  dispose: () => void;
  videoPreviewRef: RefObject<HTMLVideoElement | null>;
  /** Background effects UI (feature-flagged): blur + image presets. */
  backgroundEffectsEnabled: boolean;
  backgroundBlurLevel: CameraBackgroundBlurLevel;
  setBackgroundBlurLevel: (level: CameraBackgroundBlurLevel) => void;
  backgroundPresetId: TeleprompterBgPresetId | null;
  setBackgroundPreset: (id: TeleprompterBgPresetId | null) => void;
  backgroundMotionId: TeleprompterMotionBgId | null;
  setBackgroundMotion: (id: TeleprompterMotionBgId | null) => void;
  /** Local custom background (Object URL; never uploaded). */
  customBackground: {
    applied: boolean;
    kind: 'image' | 'video' | null;
    fileName: string | null;
    previewUrl: string | null;
    canApply: boolean;
  };
  customBackgroundError: string | null;
  /** Validate + prepare file for preview (not yet applied to camera). */
  stageCustomBackgroundFile: (file: File | null) => Promise<boolean>;
  /** Apply staged/preview file onto person-background compose. */
  applyCustomBackground: () => void;
  /** Remove custom bg, revoke Object URL, restore default (no effect). */
  clearCustomBackground: () => void;
  backgroundBlurStatus: 'off' | 'loading' | 'active' | 'fallback';
  backgroundBlurMessage: string | null;
  /** Camera PiP / overlay layout on recording canvas. */
  cameraLayout: CameraOverlayLayout;
  setCameraLayout: (patch: Partial<CameraOverlayLayout>) => void;
  /** True when screen share stream is live. */
  screenShareActive: boolean;
  compositorFallbackActive: boolean;
};

export function useTeleprompterRecorder(
  options: UseTeleprompterRecorderOptions = {},
): UseTeleprompterRecorderResult {
  const [state, setState] = useState<TeleprompterRecorderState>('idle');
  const [mode, setModeState] = useState<TeleprompterRecordMode>('video_audio');
  const [quality, setQualityState] = useState<TeleprompterVideoQuality>('economy');
  const [countdownSeconds, setCountdownSeconds] = useState<TeleprompterCountdownSeconds>(3);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceOption[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceOption[]>([]);
  const [videoDeviceId, setVideoDeviceId] = useState('');
  const [audioDeviceId, setAudioDeviceId] = useState('');
  const [facingMode, setFacingMode] = useState<TeleprompterFacingMode>('user');
  const [cameraTrackEnabled, setCameraTrackEnabled] = useState(true);
  const [micTrackEnabled, setMicTrackEnabled] = useState(true);
  const [error, setError] = useState<{
    code: TeleprompterMediaErrorCode;
    message: string;
  } | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [countdownLeft, setCountdownLeft] = useState<number | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedFilename, setRecordedFilenameState] = useState<string | null>(null);
  const [actualBytes, setActualBytes] = useState<number | null>(null);
  const [chunkBytes, setChunkBytes] = useState(0);
  const [hasDownloaded, setHasDownloaded] = useState(false);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const [backgroundBlurLevel, setBackgroundBlurLevelState] =
    useState<CameraBackgroundBlurLevel>('none');
  const [backgroundPresetId, setBackgroundPresetIdState] = useState<TeleprompterBgPresetId | null>(
    null,
  );
  const [backgroundMotionId, setBackgroundMotionIdState] = useState<TeleprompterMotionBgId | null>(
    null,
  );
  const [customBgApplied, setCustomBgApplied] = useState(false);
  const [customBgKind, setCustomBgKind] = useState<'image' | 'video' | null>(null);
  const [customBgFileName, setCustomBgFileName] = useState<string | null>(null);
  const [customBgPreviewUrl, setCustomBgPreviewUrl] = useState<string | null>(null);
  const [customBackgroundError, setCustomBackgroundError] = useState<string | null>(null);
  const [customStagedReady, setCustomStagedReady] = useState(false);
  const [backgroundBlurStatus, setBackgroundBlurStatus] = useState<
    'off' | 'loading' | 'active' | 'fallback'
  >('off');
  const [backgroundBlurMessage, setBackgroundBlurMessage] = useState<string | null>(null);
  const [cameraLayout, setCameraLayoutState] = useState<CameraOverlayLayout>(
    DEFAULT_CAMERA_ONLY_LAYOUT,
  );
  const [screenShareActive, setScreenShareActive] = useState(false);
  const [compositorFallbackActive, setCompositorFallbackActive] = useState(false);

  /** Raw getUserMedia stream (camera + mic tracks). Never stop tracks from the blur session alone. */
  const rawStreamRef = useRef<MediaStream | null>(null);
  /** Optional screen-share stream from getDisplayMedia (video only). */
  const screenStreamRef = useRef<MediaStream | null>(null);
  /** Stream published to preview + MediaRecorder (raw or composed). */
  const streamRef = useRef<MediaStream | null>(null);
  const blurSessionRef = useRef<CameraBlurSession | null>(null);
  const layoutCompositorRef = useRef<LayoutRecordingCompositor | null>(null);
  const cameraLayoutRef = useRef<CameraOverlayLayout>(DEFAULT_CAMERA_ONLY_LAYOUT);
  const blurLevelRef = useRef<CameraBackgroundBlurLevel>('none');
  const presetIdRef = useRef<TeleprompterBgPresetId | null>(null);
  const motionIdRef = useRef<TeleprompterMotionBgId | null>(null);
  /** Staged (preview) custom bg — may not be applied to compose yet. */
  const customStagedRef = useRef<PreparedCustomBg | null>(null);
  /** Applied custom bg used by compose. */
  const customAppliedRef = useRef<PreparedCustomBg | null>(null);
  const customAppliedFlagRef = useRef(false);
  /** Race guard so rapid preset swaps only apply the latest selection. */
  const effectGenRef = useRef(0);
  const effectsFlag = isTeleprompterBackgroundEffectsEnabled();
  const trackCompositorRef = useRef(createPassthroughRecordingCompositor());
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string | null>(null);
  const modeRef = useRef(mode);
  const qualityRef = useRef(quality);
  const facingRef = useRef(facingMode);
  const previewUrlRef = useRef<string | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<number | null>(null);
  const elapsedBaseRef = useRef(0);
  const elapsedStartedAtRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelRafRef = useRef<number | null>(null);
  const levelBufferRef = useRef<Uint8Array | null>(null);
  const stateRef = useRef(state);
  const autoStoppedDurationRef = useRef(false);
  const callbacksRef = useRef(options);
  callbacksRef.current = options;
  /** Soft restart after performance fallback — never clears selection. */
  const softRestartTimerRef = useRef<number | null>(null);
  const softRestartAttemptRef = useRef(0);
  const rebuildProcessedStreamRef = useRef<(() => Promise<void>) | null>(null);
  /** True while effects paint (image/blur/motion) is active on blur session. */
  const effectComposedLiveRef = useRef(false);
  /** Soft-held canvas stream kept until a new effect stream is published. */
  const frozenEffectStreamRef = useRef<MediaStream | null>(null);

  const transition = useCallback((to: TeleprompterRecorderState) => {
    setState((from) => {
      if (!canTransition(from, to)) {
        console.warn(`[teleprompter-recorder] ignore ${from} → ${to}`);
        return from;
      }
      stateRef.current = to;
      return to;
    });
  }, []);

  const clearCountdown = useCallback(() => {
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdownLeft(null);
  }, []);

  const clearElapsed = useCallback(() => {
    if (elapsedTimerRef.current !== null) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }, []);

  const stopLevelMeter = useCallback(() => {
    if (levelRafRef.current !== null) {
      cancelAnimationFrame(levelRafRef.current);
      levelRafRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  const closeAudioGraph = useCallback(() => {
    stopLevelMeter();
    analyserRef.current = null;
    levelBufferRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
  }, [stopLevelMeter]);

  const revokePreview = useCallback(() => {
    revokeObjectUrl(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);
    setRecordedBlob(null);
    setRecordedFilenameState(null);
    setActualBytes(null);
    setHasDownloaded(false);
  }, []);

  const detachPreviewVideo = useCallback(() => {
    const el = videoPreviewRef.current;
    if (el) el.srcObject = null;
  }, []);

  const attachPreview = useCallback((stream: MediaStream | null) => {
    const el = videoPreviewRef.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    if (stream) void el.play().catch(() => undefined);
  }, []);

  const publishLiveStream = useCallback(
    (stream: MediaStream | null) => {
      streamRef.current = stream;
      setLiveStream(stream);
      attachPreview(stream);
      // Drop soft-frozen tracks only after preview switched away from them
      const frozen = frozenEffectStreamRef.current;
      if (frozen && frozen !== stream) {
        for (const t of frozen.getTracks()) {
          try {
            t.stop();
          } catch {
            /* ignore */
          }
        }
        frozenEffectStreamRef.current = null;
      }
    },
    [attachPreview],
  );

  const stopLayoutCompositor = useCallback(() => {
    try {
      layoutCompositorRef.current?.stop();
    } catch {
      /* ignore */
    }
    try {
      layoutCompositorRef.current?.dispose();
    } catch {
      /* ignore */
    }
    layoutCompositorRef.current = null;
  }, []);

  const stopScreenShare = useCallback(() => {
    stopMediaStream(screenStreamRef.current);
    screenStreamRef.current = null;
    setScreenShareActive(false);
  }, []);

  const stopBlurSession = useCallback(() => {
    try {
      blurSessionRef.current?.stop();
    } catch {
      /* ignore */
    }
    blurSessionRef.current = null;
    try {
      disposeMotionBackgroundVideo();
    } catch {
      /* ignore */
    }
  }, []);

  /**
   * Build preview/record stream.
   * When background effects already compose person+bg, prefer track-merge (no 2nd canvas)
   * so upload images stay sharp and not re-scaled. Layout canvas only for screen PiP.
   */
  const composeAndPublish = useCallback(
    (
      cameraStream: MediaStream | null,
      audioStream: MediaStream | null,
      opts?: { effectComposed?: boolean },
    ) => {
      if (modeRef.current === 'audio_only') {
        stopLayoutCompositor();
        setCompositorFallbackActive(false);
        publishLiveStream(audioStream || cameraStream);
        return;
      }

      const audio = modeRef.current === 'video_only' ? null : audioStream;
      const screen = screenStreamRef.current;
      const layout = cameraLayoutRef.current;
      const effectComposed = !!opts?.effectComposed;

      // Sync person-only mirror into blur session (never flips full-res bg assets)
      try {
        blurSessionRef.current?.setMirrorPerson(!!layout.flipX);
      } catch {
        /* ignore */
      }

      // Sharp path: effects already composed person+bg on one canvas.
      // Only re-layout (2nd encode) when screen share or real PiP box — NOT for
      // border-radius alone (that was re-encoding 1080p → soft "nhòe" everywhere).
      const needsLayoutReencode =
        !!screen ||
        layout.width < 0.995 ||
        layout.height < 0.995 ||
        layout.x > 0.002 ||
        layout.y > 0.002;
      if (effectComposed && !needsLayoutReencode && cameraStream) {
        stopLayoutCompositor();
        setCompositorFallbackActive(false);
        const merged = trackCompositorRef.current.compose({
          videoStream: cameraStream,
          audioStream: audio,
        });
        publishLiveStream(merged || cameraStream);
        return;
      }

      const q = qualityToResolution(qualityRef.current);
      const vt = cameraStream?.getVideoTracks()[0];
      const settings = vt && typeof vt.getSettings === 'function' ? vt.getSettings() : {};
      let width = Math.round(Number(settings.width) || 0) || q.width;
      let height = Math.round(Number(settings.height) || 0) || q.height;
      if (width < 2 || height < 2) {
        width = q.width;
        height = q.height;
      }
      if (width % 2) width -= 1;
      if (height % 2) height -= 1;

      // Never flip full composed frames (flips uploaded/3D bg); raw camera may flip
      const layoutForDraw = effectComposed ? { ...layout, flipX: false } : layout;

      try {
        if (!layoutCompositorRef.current) {
          layoutCompositorRef.current = createLayoutRecordingCompositor();
        }
        const lc = layoutCompositorRef.current;
        let out: MediaStream | null = null;

        if (lc.isRunning()) {
          lc.updateLayout(layoutForDraw);
          lc.updateSources({
            screenStream: screen,
            cameraStream,
            audioStream: audio,
          });
          out = lc.getOutputStream();
        }

        if (!out) {
          stopLayoutCompositor();
          layoutCompositorRef.current = createLayoutRecordingCompositor();
          out = layoutCompositorRef.current.start({
            screenStream: screen,
            cameraStream,
            audioStream: audio,
            outputWidth: width,
            outputHeight: height,
            layout: layoutForDraw,
            fps: 30,
          });
        }

        setCompositorFallbackActive(false);
        publishLiveStream(out);
      } catch {
        stopLayoutCompositor();
        setCompositorFallbackActive(true);
        const composed = trackCompositorRef.current.compose({
          videoStream: cameraStream,
          audioStream: audio,
          screenStream: screen,
        });
        publishLiveStream(composed || cameraStream || audio);
      }
    },
    [publishLiveStream, stopLayoutCompositor],
  );

  const clearSoftRestartTimer = useCallback(() => {
    if (softRestartTimerRef.current != null) {
      window.clearTimeout(softRestartTimerRef.current);
      softRestartTimerRef.current = null;
    }
  }, []);

  /**
   * Soft performance fallback: keep background selection & Object URLs.
   * Do NOT switch preview to raw camera (that made upload bg disappear for ~2s).
   * Rebuild processor in place after a short delay.
   */
  const scheduleSoftEffectRestart = useCallback(
    (message: string) => {
      setBackgroundBlurStatus('fallback');
      setBackgroundBlurMessage(message);
      // Keep current live stream frame (last composed) — do not publish raw-only
      clearSoftRestartTimer();
      if (softRestartAttemptRef.current >= 4) {
        setBackgroundBlurMessage(
          `${message} (đã giữ nền; bấm lại mức/nền hoặc “Làm mới thiết bị” để thử lại).`,
        );
        return;
      }
      softRestartAttemptRef.current += 1;
      softRestartTimerRef.current = window.setTimeout(() => {
        softRestartTimerRef.current = null;
        if (!rawStreamRef.current) return;
        const stillWants =
          blurLevelRef.current !== 'none' ||
          !!presetIdRef.current ||
          !!motionIdRef.current ||
          (customAppliedFlagRef.current && !!customAppliedRef.current);
        if (!stillWants) return;
        void rebuildProcessedStreamRef.current?.();
      }, 1_500);
    },
    [clearSoftRestartTimer],
  );

  const setCameraLayout = useCallback((patch: Partial<CameraOverlayLayout>) => {
    const screenActive =
      modeIncludesScreenShare(modeRef.current) &&
      !!screenStreamRef.current?.getVideoTracks().length;
    const next = normalizeCameraOverlayLayout(
      { ...cameraLayoutRef.current, ...patch },
      { screenActive },
    );
    cameraLayoutRef.current = next;
    setCameraLayoutState(next);
    // flipX UI = person selfie only; never flips uploaded/3D background plate
    try {
      blurSessionRef.current?.setMirrorPerson(!!next.flipX);
    } catch {
      /* ignore */
    }
    if (layoutCompositorRef.current?.isRunning()) {
      // When effects compose person+bg, force layout flipX off so bg stays upright
      const layoutDraw = effectComposedLiveRef.current ? { ...next, flipX: false } : next;
      layoutCompositorRef.current.updateLayout(layoutDraw);
    }
  }, []);

  const disposeCustomBg = useCallback((which: 'staged' | 'applied' | 'all') => {
    if (which === 'staged' || which === 'all') {
      disposePreparedCustomBg(customStagedRef.current);
      customStagedRef.current = null;
      setCustomStagedReady(false);
    }
    if (which === 'applied' || which === 'all') {
      disposePreparedCustomBg(customAppliedRef.current);
      customAppliedRef.current = null;
      customAppliedFlagRef.current = false;
      setCustomBgApplied(false);
    }
    if (which === 'all') {
      setCustomBgPreviewUrl(null);
      setCustomBgFileName(null);
      setCustomBgKind(null);
    } else if (which === 'staged' && customAppliedRef.current) {
      setCustomBgPreviewUrl(customAppliedRef.current.objectUrl);
      setCustomBgFileName(customAppliedRef.current.fileName);
      setCustomBgKind(customAppliedRef.current.kind);
    } else if (which === 'staged') {
      setCustomBgPreviewUrl(null);
      setCustomBgFileName(null);
      setCustomBgKind(null);
    } else if (which === 'applied' && customStagedRef.current) {
      setCustomBgPreviewUrl(customStagedRef.current.objectUrl);
      setCustomBgFileName(customStagedRef.current.fileName);
      setCustomBgKind(customStagedRef.current.kind);
    } else if (which === 'applied') {
      setCustomBgPreviewUrl(null);
      setCustomBgFileName(null);
      setCustomBgKind(null);
    }
  }, []);

  /**
   * Rebuild preview/record stream from raw camera + optional effects + layout compositor.
   * Does not touch teleprompter scroll RAF / mic / script draft storage.
   * Effect swaps while running update paint sources only — no scroll reset.
   */
  const rebuildProcessedStream = useCallback(async () => {
    const gen = ++effectGenRef.current;
    const raw = rawStreamRef.current;
    if (!raw) {
      stopBlurSession();
      stopLayoutCompositor();
      setCompositorFallbackActive(false);
      effectComposedLiveRef.current = false;
      publishLiveStream(null);
      setBackgroundBlurStatus('off');
      return;
    }

    if (modeRef.current === 'audio_only') {
      stopBlurSession();
      stopLayoutCompositor();
      setBackgroundBlurStatus('off');
      setBackgroundBlurMessage(null);
      setCompositorFallbackActive(false);
      effectComposedLiveRef.current = false;
      composeAndPublish(null, raw);
      return;
    }

    const level = blurLevelRef.current;
    const presetId = presetIdRef.current;
    const motionId = motionIdRef.current;
    const customOn = customAppliedFlagRef.current && !!customAppliedRef.current;
    const wantsEffect = level !== 'none' || !!presetId || !!motionId || customOn;
    const videoTrack = raw.getVideoTracks()[0] ?? null;

    // Display surface as camera input is unsupported (screen is a separate stream)
    if (isDisplayCaptureTrack(videoTrack)) {
      stopBlurSession();
      setBackgroundBlurStatus('off');
      setBackgroundBlurMessage(
        'Hiệu ứng nền chỉ áp dụng cho camera, không áp dụng chia sẻ màn hình.',
      );
      composeAndPublish(raw, raw);
      return;
    }

    if (!effectsFlag || !wantsEffect || !videoTrack) {
      stopBlurSession();
      setBackgroundBlurStatus('off');
      setBackgroundBlurMessage(null);
      effectComposedLiveRef.current = false;
      composeAndPublish(raw, raw);
      return;
    }

    // Weak devices: keep selection; session starts at lower quality tier (no clear / no URL revoke).
    const weakNote =
      isWeakClientForBackgroundEffects() && !motionId && !presetId && !customOn && level !== 'none';

    setBackgroundBlurStatus('loading');
    setBackgroundBlurMessage(
      weakNote ? 'Thiết bị yếu — chạy blur ở chế độ tiết kiệm (giữ lựa chọn).' : null,
    );

    try {
      let paint: CameraEffectPaint;
      let degradeNote: string | null = weakNote
        ? 'Thiết bị yếu — chạy blur ở chế độ tiết kiệm (giữ lựa chọn).'
        : null;

      if (customOn && customAppliedRef.current) {
        disposeMotionBackgroundVideo();
        const c = customAppliedRef.current;
        if (c.kind === 'image') {
          paint = { kind: 'image', image: c.element, presetId: '__custom__' };
        } else {
          paint = {
            kind: 'motion',
            video: c.element,
            presetId: '__custom__',
            quality: 'full',
          };
        }
      } else if (motionId) {
        const motionPreset = getTeleprompterMotionBgPreset(motionId);
        if (!motionPreset) throw new Error(`unknown_motion:${motionId}`);

        if (shouldFallbackMotionToImage()) {
          const image = await loadPresetBackgroundImage(motionPreset.fallbackImagePresetId);
          if (gen !== effectGenRef.current) return;
          paint = {
            kind: 'image',
            image,
            presetId: motionPreset.fallbackImagePresetId,
          };
          degradeNote = 'Thiết bị yếu — nền 3D dùng ảnh tĩnh (giữ lựa chọn nền).';
        } else {
          const quality = selectMotionBgQuality();
          const video = await loadMotionBackgroundVideo(motionId, quality);
          if (gen !== effectGenRef.current) return;
          paint = { kind: 'motion', video, presetId: motionId, quality };
          if (quality === 'low') {
            degradeNote = 'Nền 3D chất lượng thấp (asset cache; không revoke).';
          }
        }
      } else if (presetId) {
        disposeMotionBackgroundVideo();
        const image = await loadPresetBackgroundImage(presetId);
        if (gen !== effectGenRef.current) return;
        paint = { kind: 'image', image, presetId };
      } else {
        disposeMotionBackgroundVideo();
        paint = {
          kind: 'blur',
          level: level as Exclude<CameraBackgroundBlurLevel, 'none'>,
        };
      }

      if (gen !== effectGenRef.current) return;

      const ensureSession = () => {
        if (!blurSessionRef.current) {
          blurSessionRef.current = createCameraBlurSession({
            onPerformanceNote: (msg) => {
              setBackgroundBlurMessage(msg);
            },
            onSoftFallback: (reason) => {
              // Soft path: freeze last canvas frame (do NOT end tracks → no black flash)
              try {
                const frozen = blurSessionRef.current?.softHold() ?? null;
                if (frozen) frozenEffectStreamRef.current = frozen;
              } catch {
                try {
                  blurSessionRef.current?.stop();
                } catch {
                  /* ignore */
                }
              }
              blurSessionRef.current = null;
              scheduleSoftEffectRestart(
                reason || 'Hiệu ứng tạm dừng — giữ nền đã chọn, đang thử lại…',
              );
            },
          });
        }
        return blurSessionRef.current;
      };

      const session = ensureSession();

      if (session.isRunning()) {
        session.updatePaint(paint);
        softRestartAttemptRef.current = 0;
        effectComposedLiveRef.current = true;
        try {
          session.setMirrorPerson(!!cameraLayoutRef.current.flipX);
        } catch {
          /* ignore */
        }
        // Always re-attach composed stream so UI never stays on frozen raw after paint switch
        const composed = session.getCaptureStream();
        if (composed) {
          composeAndPublish(composed, raw, { effectComposed: true });
        } else {
          const layout = layoutCompositorRef.current;
          const prevOut = layout?.getOutputStream() ?? null;
          if (layout?.isRunning()) {
            layout.updateSources({
              screenStream: screenStreamRef.current,
              audioStream: modeRef.current === 'video_only' ? null : raw,
            });
            const nextOut = layout.getOutputStream() || prevOut;
            if (nextOut) publishLiveStream(nextOut);
          }
        }
        setBackgroundBlurStatus('active');
        setBackgroundBlurMessage(degradeNote);
        return;
      }

      await new Promise<void>((r) => setTimeout(r, 0));
      if (gen !== effectGenRef.current) return;

      const videoOnly = await session.start(raw, paint);
      if (gen !== effectGenRef.current) {
        try {
          session.stop();
        } catch {
          /* ignore */
        }
        if (blurSessionRef.current === session) blurSessionRef.current = null;
        return;
      }

      softRestartAttemptRef.current = 0;
      effectComposedLiveRef.current = true;
      try {
        session.setMirrorPerson(!!cameraLayoutRef.current.flipX);
      } catch {
        /* ignore */
      }
      composeAndPublish(videoOnly, raw, { effectComposed: true });
      setBackgroundBlurStatus('active');
      {
        const size = session.getOutputSize();
        const vt = videoOnly.getVideoTracks()[0];
        const tr = videoTrackSettingsResolution(vt);
        const resNote =
          size && size.width > 0
            ? `Output ${size.width}×${size.height}` +
              (tr.width > 0 && (tr.width !== size.width || tr.height !== size.height)
                ? ` (track ${tr.width}×${tr.height})`
                : ' 1:1 camera')
            : null;
        setBackgroundBlurMessage([degradeNote, resNote].filter(Boolean).join(' · ') || null);
      }
    } catch (err) {
      if (gen !== effectGenRef.current) return;
      if (err instanceof Error && err.message === 'session_aborted') {
        return;
      }
      try {
        const frozen = blurSessionRef.current?.softHold() ?? null;
        if (frozen) frozenEffectStreamRef.current = frozen;
      } catch {
        try {
          blurSessionRef.current?.stop();
        } catch {
          /* ignore */
        }
      }
      blurSessionRef.current = null;
      const msg =
        err instanceof Error && err.message === 'display_capture_not_supported'
          ? 'Hiệu ứng nền không áp dụng cho chia sẻ màn hình.'
          : err instanceof Error && String(err.message).startsWith('bg_')
            ? 'Không tải được nền ảnh — giữ lựa chọn, thử lại…'
            : err instanceof Error && String(err.message).includes('motion')
              ? 'Không tải được nền 3D — giữ lựa chọn, thử lại…'
              : 'Model hiệu ứng nền lỗi — giữ nền đã chọn, thử lại…';
      scheduleSoftEffectRestart(msg);
    }
  }, [
    composeAndPublish,
    effectsFlag,
    publishLiveStream,
    scheduleSoftEffectRestart,
    stopBlurSession,
    stopLayoutCompositor,
  ]);

  rebuildProcessedStreamRef.current = rebuildProcessedStream;

  const setBackgroundBlurLevel = useCallback(
    (level: CameraBackgroundBlurLevel) => {
      if (!effectsFlag) return;
      blurLevelRef.current = level;
      setBackgroundBlurLevelState(level);
      if (level !== 'none') {
        presetIdRef.current = null;
        motionIdRef.current = null;
        customAppliedFlagRef.current = false;
        setBackgroundPresetIdState(null);
        setBackgroundMotionIdState(null);
        setCustomBgApplied(false);
        // Keep staged file for user; only drop applied compose
        disposeCustomBg('applied');
      }
      void rebuildProcessedStream();
    },
    [disposeCustomBg, effectsFlag, rebuildProcessedStream],
  );

  const setBackgroundPreset = useCallback(
    (id: TeleprompterBgPresetId | null) => {
      if (!effectsFlag) return;
      presetIdRef.current = id;
      setBackgroundPresetIdState(id);
      if (id) {
        blurLevelRef.current = 'none';
        motionIdRef.current = null;
        customAppliedFlagRef.current = false;
        setBackgroundBlurLevelState('none');
        setBackgroundMotionIdState(null);
        setCustomBgApplied(false);
        disposeCustomBg('applied');
      }
      void rebuildProcessedStream();
    },
    [disposeCustomBg, effectsFlag, rebuildProcessedStream],
  );

  const setBackgroundMotion = useCallback(
    (id: TeleprompterMotionBgId | null) => {
      if (!effectsFlag) return;
      motionIdRef.current = id;
      setBackgroundMotionIdState(id);
      if (id) {
        blurLevelRef.current = 'none';
        presetIdRef.current = null;
        customAppliedFlagRef.current = false;
        setBackgroundBlurLevelState('none');
        setBackgroundPresetIdState(null);
        setCustomBgApplied(false);
        disposeCustomBg('applied');
      } else {
        try {
          disposeMotionBackgroundVideo();
        } catch {
          /* ignore */
        }
      }
      void rebuildProcessedStream();
    },
    [disposeCustomBg, effectsFlag, rebuildProcessedStream],
  );

  const stageCustomBackgroundFile = useCallback(
    async (file: File | null) => {
      if (!effectsFlag) return false;
      setCustomBackgroundError(null);
      if (!file) return false;
      try {
        // Replace previous staged (and not leave dangling URLs)
        disposePreparedCustomBg(customStagedRef.current);
        customStagedRef.current = null;

        const prepared = await prepareCustomBackgroundFromFile(file);
        if ('ok' in prepared && prepared.ok === false) {
          setCustomBackgroundError(prepared.message);
          setCustomBgPreviewUrl(null);
          setCustomBgFileName(null);
          setCustomBgKind(null);
          return false;
        }
        const bg = prepared as PreparedCustomBg;
        customStagedRef.current = bg;
        setCustomStagedReady(true);
        setCustomBgPreviewUrl(bg.objectUrl);
        setCustomBgFileName(bg.fileName);
        setCustomBgKind(bg.kind);
        setCustomBackgroundError(null);
        return true;
      } catch {
        setCustomBackgroundError('Không xử lý được file. Thử file khác.');
        setCustomStagedReady(false);
        return false;
      }
    },
    [effectsFlag],
  );

  const applyCustomBackground = useCallback(() => {
    if (!effectsFlag) return;
    const staged = customStagedRef.current;
    if (!staged) {
      setCustomBackgroundError('Chọn file và chờ preview trước khi áp dụng.');
      return;
    }
    // Apply staged as active; dispose previous applied if different object
    if (customAppliedRef.current && customAppliedRef.current !== staged) {
      disposePreparedCustomBg(customAppliedRef.current);
    }
    customAppliedRef.current = staged;
    customStagedRef.current = null; // ownership moved to applied
    setCustomStagedReady(false);
    customAppliedFlagRef.current = true;
    setCustomBgApplied(true);
    setCustomBgPreviewUrl(staged.objectUrl);
    setCustomBgFileName(staged.fileName);
    setCustomBgKind(staged.kind);
    setCustomBackgroundError(null);

    // Clear other effects mutually exclusive
    blurLevelRef.current = 'none';
    presetIdRef.current = null;
    motionIdRef.current = null;
    setBackgroundBlurLevelState('none');
    setBackgroundPresetIdState(null);
    setBackgroundMotionIdState(null);
    try {
      disposeMotionBackgroundVideo();
    } catch {
      /* ignore */
    }
    void rebuildProcessedStream();
    // Persist to IndexedDB so F5 reload can restore (local only, not server upload)
    void saveAppliedCustomBackground(staged).catch(() => {
      setCustomBackgroundError(
        'Đã áp dụng nền nhưng không lưu được qua phiên (trình duyệt chặn lưu cục bộ).',
      );
    });
  }, [effectsFlag, rebuildProcessedStream]);

  const clearCustomBackground = useCallback(() => {
    disposeCustomBg('all');
    customAppliedFlagRef.current = false;
    setCustomBgApplied(false);
    setCustomBackgroundError(null);
    void clearAppliedCustomBackground();
    void rebuildProcessedStream();
  }, [disposeCustomBg, rebuildProcessedStream]);

  // Restore last applied custom bg after F5 (IndexedDB → prepare → apply)
  useEffect(() => {
    if (!effectsFlag) return;
    let cancelled = false;
    void (async () => {
      try {
        const rec = await loadAppliedCustomBackground();
        if (cancelled || !rec) return;
        // Don't clobber a live selection already made in this session
        if (customAppliedFlagRef.current || customStagedRef.current || customAppliedRef.current) {
          return;
        }
        const file = fileFromPersistedCustomBg(rec);
        const prepared = await prepareCustomBackgroundFromFile(file);
        if (cancelled) {
          if (!('ok' in prepared && prepared.ok === false)) {
            disposePreparedCustomBg(prepared as PreparedCustomBg);
          }
          return;
        }
        if ('ok' in prepared && prepared.ok === false) {
          void clearAppliedCustomBackground();
          return;
        }
        const bg = prepared as PreparedCustomBg;
        customAppliedRef.current = bg;
        customAppliedFlagRef.current = true;
        setCustomBgApplied(true);
        setCustomBgPreviewUrl(bg.objectUrl);
        setCustomBgFileName(bg.fileName);
        setCustomBgKind(bg.kind);
        setCustomStagedReady(false);
        blurLevelRef.current = 'none';
        presetIdRef.current = null;
        motionIdRef.current = null;
        setBackgroundBlurLevelState('none');
        setBackgroundPresetIdState(null);
        setBackgroundMotionIdState(null);
        if (rawStreamRef.current) {
          void rebuildProcessedStreamRef.current?.();
        }
      } catch {
        /* ignore restore failures */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectsFlag]);
  const stopTracks = useCallback(() => {
    clearSoftRestartTimer();
    softRestartAttemptRef.current = 0;
    stopBlurSession();
    stopLayoutCompositor();
    stopScreenShare();
    disposeCustomBg('all');
    stopMediaStream(rawStreamRef.current);
    rawStreamRef.current = null;
    streamRef.current = null;
    setLiveStream(null);
    setCompositorFallbackActive(false);
    detachPreviewVideo();
    setBackgroundBlurStatus('off');
  }, [
    clearSoftRestartTimer,
    detachPreviewVideo,
    disposeCustomBg,
    stopBlurSession,
    stopLayoutCompositor,
    stopScreenShare,
  ]);

  /**
   * Release camera / screen / mic / compositor RAF after a recording ends.
   * Keeps prepared custom-bg ObjectURLs (user can re-enable camera without re-upload).
   * Does not touch Teleprompter scroll RAF or draft.
   */
  const releaseLiveMedia = useCallback(() => {
    clearSoftRestartTimer();
    stopBlurSession();
    stopLayoutCompositor();
    stopScreenShare();
    stopMediaStream(rawStreamRef.current);
    rawStreamRef.current = null;
    streamRef.current = null;
    setLiveStream(null);
    setCompositorFallbackActive(false);
    detachPreviewVideo();
    setBackgroundBlurStatus('off');
    setCameraTrackEnabled(false);
    setMicTrackEnabled(false);
  }, [
    clearSoftRestartTimer,
    detachPreviewVideo,
    stopBlurSession,
    stopLayoutCompositor,
    stopScreenShare,
  ]);

  const dispose = useCallback(() => {
    clearCountdown();
    clearElapsed();
    closeAudioGraph();
    try {
      const rec = recorderRef.current;
      if (rec && rec.state !== 'inactive') rec.stop();
    } catch {
      /* ignore */
    }
    recorderRef.current = null;
    chunksRef.current = [];
    stopTracks();
    try {
      trackCompositorRef.current.dispose();
    } catch {
      /* ignore */
    }
    revokePreview();
    setError(null);
    setElapsedSeconds(0);
    setChunkBytes(0);
    elapsedBaseRef.current = 0;
    setBackgroundBlurMessage(null);
    setCompositorFallbackActive(false);
    transition('idle');
  }, [clearCountdown, clearElapsed, closeAudioGraph, revokePreview, stopTracks, transition]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    qualityRef.current = quality;
  }, [quality]);
  useEffect(() => {
    facingRef.current = facingMode;
  }, [facingMode]);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const el = videoPreviewRef.current;
    if (!el) return;
    if (liveStream && mode !== 'audio_only' && state !== 'stopped') {
      el.srcObject = liveStream;
      void el.play().catch(() => undefined);
    } else if (!previewUrl) {
      el.srcObject = null;
    }
  }, [liveStream, mode, previewUrl, state]);

  // beforeunload when recording or undownloaded
  useEffect(() => {
    const undownloaded = state === 'stopped' && !!previewUrl && !hasDownloaded;
    const block = shouldBlockUnload(state, undownloaded);
    if (!block) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [state, previewUrl, hasDownloaded]);

  const listDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const list = await navigator.mediaDevices.enumerateDevices();
    const videos: MediaDeviceOption[] = [];
    const audios: MediaDeviceOption[] = [];
    for (const d of list) {
      if (d.kind === 'videoinput') {
        videos.push({
          deviceId: d.deviceId,
          label: d.label || `Camera ${videos.length + 1}`,
          kind: 'videoinput',
        });
      } else if (d.kind === 'audioinput') {
        audios.push({
          deviceId: d.deviceId,
          label: d.label || `Mic ${audios.length + 1}`,
          kind: 'audioinput',
        });
      }
    }
    setVideoDevices(videos);
    setAudioDevices(audios);
    setVideoDeviceId((prev) => prev || videos[0]?.deviceId || '');
    setAudioDeviceId((prev) => prev || audios[0]?.deviceId || '');
  }, []);

  const startLevelMeter = useCallback(
    (stream: MediaStream) => {
      closeAudioGraph();
      if (stream.getAudioTracks().length === 0) return;
      try {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
        levelBufferRef.current = new Uint8Array(analyser.fftSize);
        const tick = () => {
          if (!analyserRef.current || !levelBufferRef.current) return;
          const track = rawStreamRef.current?.getAudioTracks()[0];
          if (track && !track.enabled) {
            setAudioLevel(0);
          } else {
            setAudioLevel(audioLevelFromAnalyser(analyserRef.current, levelBufferRef.current));
          }
          levelRafRef.current = requestAnimationFrame(tick);
        };
        void ctx.resume().catch(() => undefined);
        levelRafRef.current = requestAnimationFrame(tick);
      } catch {
        /* optional */
      }
    },
    [closeAudioGraph],
  );

  const wireEndedHandlers = useCallback((stream: MediaStream) => {
    for (const track of stream.getTracks()) {
      track.addEventListener('ended', () => {
        if (stateRef.current === 'recording' || stateRef.current === 'paused') {
          setError({
            code: 'device_removed',
            message: 'Thiết bị media đã bị ngắt. Đã dừng quay.',
          });
          try {
            if (recorderRef.current && recorderRef.current.state !== 'inactive') {
              recorderRef.current.stop();
            }
          } catch {
            /* ignore */
          }
        }
      });
    }
  }, []);

  const openStream = useCallback(
    async (
      nextMode: TeleprompterRecordMode,
      videoId: string,
      audioId: string,
      nextQuality: TeleprompterVideoQuality,
      facing: TeleprompterFacingMode,
    ) => {
      stopTracks();
      closeAudioGraph();

      // Screen first (permission UX), then camera + mic via getUserMedia
      if (modeIncludesScreenShare(nextMode)) {
        if (!navigator.mediaDevices?.getDisplayMedia) {
          throw Object.assign(new Error('getDisplayMedia is not supported'), {
            name: 'NotSupportedError',
          });
        }
        let display: MediaStream;
        try {
          display = await navigator.mediaDevices.getDisplayMedia(
            displayMediaConstraints(nextQuality),
          );
        } catch (err) {
          if (nextQuality === 'standard') {
            display = await navigator.mediaDevices.getDisplayMedia(
              displayMediaConstraints('economy'),
            );
            setQualityState('economy');
            qualityRef.current = 'economy';
          } else {
            throw err;
          }
        }
        screenStreamRef.current = display;
        setScreenShareActive(true);
        const screenLayout = normalizeCameraOverlayLayout(DEFAULT_SCREEN_PIP_LAYOUT, {
          screenActive: true,
        });
        cameraLayoutRef.current = screenLayout;
        setCameraLayoutState(screenLayout);

        const onScreenEnded = () => {
          stopMediaStream(screenStreamRef.current);
          screenStreamRef.current = null;
          setScreenShareActive(false);
          const onlyCam = normalizeCameraOverlayLayout(DEFAULT_CAMERA_ONLY_LAYOUT, {
            screenActive: false,
          });
          cameraLayoutRef.current = onlyCam;
          setCameraLayoutState(onlyCam);
          void rebuildProcessedStream();
        };
        for (const t of display.getVideoTracks()) {
          t.addEventListener('ended', onScreenEnded);
        }
      } else {
        // Camera-only / audio: full-bleed defaults; keep flip preference
        const merged = normalizeCameraOverlayLayout(
          {
            ...DEFAULT_CAMERA_ONLY_LAYOUT,
            flipX: cameraLayoutRef.current.flipX,
          },
          { screenActive: false },
        );
        cameraLayoutRef.current = merged;
        setCameraLayoutState(merged);
      }

      const constraints = constraintsForMode(nextMode, {
        videoId: videoId || undefined,
        audioId: audioId || undefined,
        quality: qualityRef.current,
        facingMode: facing,
      });
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        // 1080p unsupported → fall back to 720p (keep screen share if already granted)
        if (nextQuality === 'standard' && nextMode !== 'audio_only') {
          const fallback = constraintsForMode(nextMode, {
            videoId: videoId || undefined,
            audioId: audioId || undefined,
            quality: 'economy',
            facingMode: facing,
          });
          try {
            stream = await navigator.mediaDevices.getUserMedia(fallback);
            setQualityState('economy');
            qualityRef.current = 'economy';
          } catch (err2) {
            stopScreenShare();
            throw err2;
          }
        } else {
          stopScreenShare();
          throw err;
        }
      }
      rawStreamRef.current = stream;
      setCameraTrackEnabled(stream.getVideoTracks()[0]?.enabled ?? true);
      setMicTrackEnabled(stream.getAudioTracks()[0]?.enabled ?? true);
      wireEndedHandlers(stream);
      startLevelMeter(stream);
      await listDevices();
      await rebuildProcessedStream();
      return stream;
    },
    [
      closeAudioGraph,
      listDevices,
      rebuildProcessedStream,
      startLevelMeter,
      stopScreenShare,
      stopTracks,
      wireEndedHandlers,
    ],
  );

  const enableDevices = useCallback(async () => {
    setError(null);
    revokePreview();
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(classifyMediaError(new Error('not supported')));
      transition('error');
      return;
    }
    const mime = pickRecorderMimeType(mode);
    if (!mime) {
      setError({
        code: 'mime_unsupported',
        message: 'Trình duyệt không hỗ trợ định dạng MediaRecorder phù hợp.',
      });
      transition('error');
      return;
    }
    mimeRef.current = mime;
    setMimeType(mime);
    transition('requesting');
    try {
      await openStream(mode, videoDeviceId, audioDeviceId, quality, facingMode);
      transition('ready');
    } catch (err) {
      stopTracks();
      setError(classifyMediaError(err));
      transition('error');
    }
  }, [
    audioDeviceId,
    facingMode,
    mode,
    openStream,
    quality,
    revokePreview,
    stopTracks,
    transition,
    videoDeviceId,
  ]);

  const reopenIfLive = useCallback(
    async (
      nextMode: TeleprompterRecordMode,
      videoId: string,
      audioId: string,
      nextQuality: TeleprompterVideoQuality,
      facing: TeleprompterFacingMode,
    ) => {
      if (!rawStreamRef.current && !['ready', 'stopped', 'error'].includes(stateRef.current)) {
        return;
      }
      if (['recording', 'paused', 'countdown'].includes(stateRef.current)) return;
      const mime = pickRecorderMimeType(nextMode);
      mimeRef.current = mime;
      setMimeType(mime);
      if (!mime) {
        setError({
          code: 'mime_unsupported',
          message: 'Trình duyệt không hỗ trợ định dạng MediaRecorder phù hợp.',
        });
        transition('error');
        return;
      }
      transition('requesting');
      try {
        await openStream(nextMode, videoId, audioId, nextQuality, facing);
        setError(null);
        transition(stateRef.current === 'stopped' ? 'ready' : 'ready');
      } catch (err) {
        stopTracks();
        setError(classifyMediaError(err));
        transition('error');
      }
    },
    [openStream, stopTracks, transition],
  );

  const setMode = useCallback(
    (m: TeleprompterRecordMode) => {
      setModeState(m);
      modeRef.current = m;
      if (rawStreamRef.current || stateRef.current === 'ready' || stateRef.current === 'error') {
        void reopenIfLive(m, videoDeviceId, audioDeviceId, quality, facingMode);
      }
    },
    [audioDeviceId, facingMode, quality, reopenIfLive, videoDeviceId],
  );

  const setQuality = useCallback(
    (q: TeleprompterVideoQuality) => {
      setQualityState(q);
      qualityRef.current = q;
      if (
        rawStreamRef.current &&
        !['recording', 'paused', 'countdown'].includes(stateRef.current)
      ) {
        void reopenIfLive(modeRef.current, videoDeviceId, audioDeviceId, q, facingMode);
      }
    },
    [audioDeviceId, facingMode, reopenIfLive, videoDeviceId],
  );

  const applyDeviceChange = useCallback(
    async (videoId: string, audioId: string) => {
      if (!rawStreamRef.current) return;
      if (!['ready', 'stopped'].includes(stateRef.current)) return;
      await reopenIfLive(modeRef.current, videoId, audioId, qualityRef.current, facingRef.current);
    },
    [reopenIfLive],
  );

  const setVideoDeviceIdSafe = useCallback(
    (id: string) => {
      setVideoDeviceId(id);
      void applyDeviceChange(id, audioDeviceId);
    },
    [applyDeviceChange, audioDeviceId],
  );

  const setAudioDeviceIdSafe = useCallback(
    (id: string) => {
      setAudioDeviceId(id);
      void applyDeviceChange(videoDeviceId, id);
    },
    [applyDeviceChange, videoDeviceId],
  );

  const switchFacingCamera = useCallback(async () => {
    if (modeRef.current === 'audio_only') return;
    const next: TeleprompterFacingMode = facingRef.current === 'user' ? 'environment' : 'user';
    const res = qualityRef.current === 'standard' ? { w: 1920, h: 1080 } : { w: 1280, h: 720 };

    if (['recording', 'paused'].includes(stateRef.current) && rawStreamRef.current) {
      try {
        const fresh = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: next },
            width: { ideal: res.w },
            height: { ideal: res.h },
          },
          audio: false,
        });
        const newTrack = fresh.getVideoTracks()[0];
        if (!newTrack) {
          stopMediaStream(fresh);
          return;
        }
        const raw = rawStreamRef.current;
        const old = raw.getVideoTracks()[0];
        if (old) {
          raw.removeTrack(old);
          old.stop();
        }
        raw.addTrack(newTrack);
        for (const t of fresh.getTracks()) {
          if (t !== newTrack) t.stop();
        }
        setFacingMode(next);
        facingRef.current = next;
        setCameraTrackEnabled(newTrack.enabled);
        // Rebuild blur/preview off the updated raw stream
        await rebuildProcessedStream();
        await listDevices();
      } catch (err) {
        setError(classifyMediaError(err));
      }
      return;
    }

    setFacingMode(next);
    facingRef.current = next;
    if (rawStreamRef.current) {
      await reopenIfLive(modeRef.current, '', audioDeviceId, qualityRef.current, next);
      setVideoDeviceId('');
    }
  }, [audioDeviceId, listDevices, rebuildProcessedStream, reopenIfLive]);

  const toggleCameraTrack = useCallback(() => {
    // Mute at source so blur pipeline and preview both go dark
    const track = rawStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCameraTrackEnabled(track.enabled);
  }, []);

  const toggleMicTrack = useCallback(() => {
    const track = rawStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicTrackEnabled(track.enabled);
  }, []);

  const beginElapsed = useCallback(() => {
    clearElapsed();
    elapsedStartedAtRef.current = Date.now();
    elapsedTimerRef.current = window.setInterval(() => {
      const extra = (Date.now() - elapsedStartedAtRef.current) / 1000;
      const total = elapsedBaseRef.current + extra;
      setElapsedSeconds(total);
      if (total >= MAX_RECOMMENDED_SECONDS && !autoStoppedDurationRef.current) {
        autoStoppedDurationRef.current = true;
        try {
          if (recorderRef.current && recorderRef.current.state !== 'inactive') {
            recorderRef.current.stop();
          }
        } catch {
          /* ignore */
        }
      }
    }, 200);
  }, [clearElapsed]);

  const freezeElapsed = useCallback(() => {
    const extra = (Date.now() - elapsedStartedAtRef.current) / 1000;
    elapsedBaseRef.current += Math.max(0, extra);
    setElapsedSeconds(elapsedBaseRef.current);
    clearElapsed();
  }, [clearElapsed]);

  const startMediaRecorder = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) {
      setError({
        code: 'unknown',
        message: 'Chưa có luồng media. Hãy bật camera/microphone trước.',
      });
      transition('error');
      return;
    }
    const mime = mimeRef.current || pickRecorderMimeType(modeRef.current);
    if (!mime) {
      setError({
        code: 'mime_unsupported',
        message: 'Trình duyệt không hỗ trợ định dạng MediaRecorder phù hợp.',
      });
      transition('error');
      return;
    }
    mimeRef.current = mime;
    setMimeType(mime);
    chunksRef.current = [];
    setChunkBytes(0);
    autoStoppedDurationRef.current = false;
    let recorder: MediaRecorder;
    const quality = qualityRef.current;
    const mrOpts = mediaRecorderOptionsForQuality(mime, modeRef.current, quality);
    try {
      recorder = new MediaRecorder(stream, mrOpts);
    } catch {
      // Some browsers reject non-standard bitrate fields — retry mime only
      try {
        recorder = new MediaRecorder(stream, { mimeType: mime });
      } catch (err) {
        setError(classifyMediaError(err));
        transition('error');
        return;
      }
    }
    // Log actual track resolution for QA (devtools)
    try {
      const vt = stream.getVideoTracks()[0];
      const res = videoTrackSettingsResolution(vt);
      if (res.width > 0) {
        console.info(
          `[teleprompter-recorder] live track ${res.width}x${res.height}` +
            (res.frameRate != null ? `@${Math.round(res.frameRate)}` : '') +
            ` · encode target ${mrOpts.videoBitsPerSecond ?? 0} bps`,
        );
      }
    } catch {
      /* ignore */
    }
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        chunksRef.current.push(ev.data);
        setChunkBytes((n) => n + ev.data.size);
      }
    };
    recorder.onerror = () => {
      setError({ code: 'unknown', message: 'MediaRecorder gặp lỗi khi quay.' });
      transition('error');
    };
    recorder.onstop = () => {
      clearElapsed();
      freezeElapsed();
      const blobType =
        mimeRef.current || mime || chunksRef.current[0]?.type || 'application/octet-stream';
      const blob = new Blob(chunksRef.current, { type: blobType });
      chunksRef.current = [];
      const url = URL.createObjectURL(blob);
      revokeObjectUrl(previewUrlRef.current);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setRecordedBlob(blob);
      setActualBytes(blob.size);
      setHasDownloaded(false);
      const filename = buildRecordingFilename(blobType, modeRef.current);
      setRecordedFilenameState(filename);
      // Recording finished: free live media + compositor/blur RAF + level meter.
      // Object URL for the recorded file is retained until retake/dispose.
      try {
        closeAudioGraph();
      } catch {
        /* ignore */
      }
      releaseLiveMedia();
      recorderRef.current = null;
      transition('stopped');
      callbacksRef.current.onRecordingStop?.();
    };
    recorderRef.current = recorder;
    try {
      recorder.start(250);
    } catch (err) {
      setError(classifyMediaError(err));
      transition('error');
      return;
    }
    elapsedBaseRef.current = 0;
    setElapsedSeconds(0);
    beginElapsed();
    transition('recording');
    callbacksRef.current.onRecordingStart?.();
  }, [beginElapsed, clearElapsed, closeAudioGraph, freezeElapsed, releaseLiveMedia, transition]);

  const startRecording = useCallback(() => {
    if (!rawStreamRef.current) {
      setError({
        code: 'unknown',
        message: 'Hãy bấm “Bật camera” trước khi quay.',
      });
      return;
    }
    if (!['ready', 'stopped'].includes(stateRef.current)) return;
    if (!streamRef.current) {
      void rebuildProcessedStream().then(() => {
        if (!streamRef.current || !['ready', 'stopped'].includes(stateRef.current)) return;
        // re-enter after composition without recreating nested countdown incorrectly
        startRecording();
      });
      return;
    }
    revokePreview();
    clearCountdown();
    if (countdownSeconds <= 0) {
      startMediaRecorder();
      return;
    }
    transition('countdown');
    let left = countdownSeconds;
    setCountdownLeft(left);
    countdownTimerRef.current = window.setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearCountdown();
        startMediaRecorder();
        return;
      }
      setCountdownLeft(left);
    }, 1000);
  }, [
    clearCountdown,
    countdownSeconds,
    rebuildProcessedStream,
    revokePreview,
    startMediaRecorder,
    transition,
  ]);

  const pauseRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec || rec.state !== 'recording') return;
    try {
      if (typeof rec.pause === 'function') rec.pause();
      else return;
    } catch {
      return;
    }
    freezeElapsed();
    transition('paused');
    callbacksRef.current.onRecordingPause?.();
  }, [freezeElapsed, transition]);

  const resumeRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec || rec.state !== 'paused') return;
    try {
      if (typeof rec.resume === 'function') rec.resume();
      else return;
    } catch {
      return;
    }
    beginElapsed();
    transition('recording');
    callbacksRef.current.onRecordingResume?.();
  }, [beginElapsed, transition]);

  const stopRecording = useCallback(() => {
    clearCountdown();
    if (stateRef.current === 'countdown') {
      transition('ready');
      return;
    }
    const rec = recorderRef.current;
    if (!rec || rec.state === 'inactive') {
      if (streamRef.current) transition('ready');
      else transition('idle');
      return;
    }
    try {
      rec.stop();
    } catch {
      transition('stopped');
    }
  }, [clearCountdown, transition]);

  const retake = useCallback(() => {
    const wasLive =
      stateRef.current === 'recording' ||
      stateRef.current === 'paused' ||
      stateRef.current === 'countdown';
    clearCountdown();
    clearElapsed();
    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        // null onstop skips blob finalize; still notify Teleprompter to pause
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      }
    } catch {
      /* ignore */
    }
    recorderRef.current = null;
    chunksRef.current = [];
    revokePreview();
    setElapsedSeconds(0);
    setChunkBytes(0);
    elapsedBaseRef.current = 0;
    autoStoppedDurationRef.current = false;
    if (wasLive) {
      callbacksRef.current.onRecordingStop?.();
    }
    // Keep live stream + does not touch teleprompter draft/scroll
    if (rawStreamRef.current) transition('ready');
    else transition('idle');
  }, [clearCountdown, clearElapsed, revokePreview, transition]);

  const setRecordedFilename = useCallback(
    (name: string) => {
      const mime = mimeRef.current || mimeType || 'video/webm';
      setRecordedFilenameState(sanitizeRecordingFilename(name, mime));
    },
    [mimeType],
  );

  const download = useCallback(() => {
    if (!previewUrlRef.current || !recordedFilename) return;
    const a = document.createElement('a');
    a.href = previewUrlRef.current;
    a.download = recordedFilename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setHasDownloaded(true);
  }, [recordedFilename]);

  useEffect(() => () => dispose(), [dispose]);

  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    const onChange = () => {
      void listDevices();
    };
    md.addEventListener('devicechange', onChange);
    return () => md.removeEventListener('devicechange', onChange);
  }, [listDevices]);

  const estimatedBytes =
    actualBytes != null
      ? actualBytes
      : chunkBytes > 0
        ? chunkBytes
        : estimateRecordingBytes(elapsedSeconds, mode, quality);
  const sizeLevel = sizeWarningLevel(estimatedBytes);
  const overRecommendedDuration = elapsedSeconds >= MAX_RECOMMENDED_SECONDS;

  const isLiveVideo = Boolean(
    liveStream &&
    mode !== 'audio_only' &&
    liveStream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled),
  );
  const isLiveAudio = Boolean(
    liveStream &&
    mode !== 'video_only' &&
    liveStream.getAudioTracks().some((t) => t.readyState === 'live' && t.enabled),
  );

  return {
    state,
    mode,
    setMode,
    quality,
    setQuality,
    countdownSeconds,
    setCountdownSeconds,
    videoDevices,
    audioDevices,
    videoDeviceId,
    audioDeviceId,
    setVideoDeviceId: setVideoDeviceIdSafe,
    setAudioDeviceId: setAudioDeviceIdSafe,
    facingMode,
    switchFacingCamera,
    cameraTrackEnabled,
    micTrackEnabled,
    toggleCameraTrack,
    toggleMicTrack,
    error,
    elapsedSeconds,
    elapsedLabel: formatRecordingClock(elapsedSeconds),
    countdownLeft,
    audioLevel,
    mimeType,
    previewUrl,
    recordedBlob,
    recordedFilename,
    setRecordedFilename,
    estimatedBytes,
    estimatedSizeLabel: formatByteSize(estimatedBytes),
    actualBytes,
    sizeLevel,
    overRecommendedDuration,
    hasDownloaded,
    liveStream,
    isLiveVideo,
    isLiveAudio,
    enableDevices,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    retake,
    download,
    dispose,
    videoPreviewRef,
    backgroundEffectsEnabled: effectsFlag,
    backgroundBlurLevel,
    setBackgroundBlurLevel,
    backgroundPresetId,
    setBackgroundPreset,
    backgroundMotionId,
    setBackgroundMotion,
    customBackground: {
      applied: customBgApplied,
      kind: customBgKind,
      fileName: customBgFileName,
      previewUrl: customBgPreviewUrl,
      canApply: customStagedReady,
    },
    customBackgroundError,
    stageCustomBackgroundFile,
    applyCustomBackground,
    clearCustomBackground,
    backgroundBlurStatus,
    backgroundBlurMessage,
    cameraLayout,
    setCameraLayout,
    screenShareActive,
    compositorFallbackActive,
  };
}
