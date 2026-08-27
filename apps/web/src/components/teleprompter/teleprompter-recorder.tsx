'use client';

import { useState, useRef } from 'react';
import {
  CloudUpload,
  Download,
  FlipHorizontal,
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Video,
  VideoOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTeleprompterRecorder } from '@/hooks/use-teleprompter-recorder';
import {
  COUNTDOWN_OPTIONS,
  formatByteSize,
  MAX_RECOMMENDED_SECONDS,
  permissionRecoverySteps,
  type TeleprompterCountdownSeconds,
  type TeleprompterRecordMode,
  type TeleprompterVideoQuality,
} from '@/lib/teleprompter-media';
import {
  CAMERA_BACKGROUND_BLUR_LABELS,
  CAMERA_BACKGROUND_BLUR_LEVELS,
  TELEPROMPTER_BG_PRESETS,
  TELEPROMPTER_MOTION_BG_PRESETS,
  type CameraBackgroundBlurLevel,
  type TeleprompterBgPresetId,
  type TeleprompterMotionBgId,
} from '@/lib/teleprompter-background';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  formatBytes,
  uploadTeleprompterRecording,
  type UploadProgress,
} from '@/lib/teleprompter-recording-api';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n/i18n-provider';

export type TeleprompterRecorderProps = {
  /** Scroll frame into view + reset TP to start when user clicks “Bắt đầu quay”. */
  onSyncPrepareForRecord: () => void;
  /** Start TP from top once MediaRecorder is live (post-countdown). */
  onSyncPlayFromStart: () => void;
  /** Resume TP from current position (recorder pause → resume). */
  onSyncPlay: () => void;
  onSyncPause: () => void;
  className?: string;
  /** Optional ContentTeleprompterSource id to attach on save */
  teleprompterSourceId?: string | null;
  scriptTitle?: string;
  onSavedToSystem?: () => void;
};

const MODE_OPTIONS: Array<{ value: TeleprompterRecordMode; label: string }> = [
  { value: 'video_audio', label: 'Video + âm thanh' },
  { value: 'video_only', label: 'Chỉ video' },
  { value: 'screen_camera', label: 'Màn hình + Camera' },
  { value: 'audio_only', label: 'Chỉ ghi âm' },
];

export function TeleprompterRecorder({
  onSyncPrepareForRecord,
  onSyncPlayFromStart,
  onSyncPlay,
  onSyncPause,
  className,
  teleprompterSourceId,
  scriptTitle,
  onSavedToSystem,
}: TeleprompterRecorderProps) {
  const t = useT();
  const [autoStartTp, setAutoStartTp] = useState(true);
  const [stopTpOnStop, setStopTpOnStop] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const autoStartTpRef = useRef(autoStartTp);
  const stopTpOnStopRef = useRef(stopTpOnStop);
  autoStartTpRef.current = autoStartTp;
  stopTpOnStopRef.current = stopTpOnStop;
  const onSyncPrepareRef = useRef(onSyncPrepareForRecord);
  const onSyncPlayFromStartRef = useRef(onSyncPlayFromStart);
  const onSyncPlayRef = useRef(onSyncPlay);
  const onSyncPauseRef = useRef(onSyncPause);
  onSyncPrepareRef.current = onSyncPrepareForRecord;
  onSyncPlayFromStartRef.current = onSyncPlayFromStart;
  onSyncPlayRef.current = onSyncPlay;
  onSyncPauseRef.current = onSyncPause;

  const rec = useTeleprompterRecorder({
    onRecordingStart: () => {
      // MediaRecorder started (after countdown) → TP from top when option on
      if (autoStartTpRef.current) {
        onSyncPlayFromStartRef.current();
      }
    },
    onRecordingPause: () => {
      onSyncPauseRef.current();
    },
    onRecordingResume: () => {
      // Resume from current TP position — do not reset
      if (autoStartTpRef.current) {
        onSyncPlayRef.current();
      }
    },
    onRecordingStop: () => {
      if (stopTpOnStopRef.current) {
        onSyncPauseRef.current();
      }
    },
  });

  const handleStartRecording = () => {
    // Always: scroll to runner + reset TP to 0 before countdown (even mid-script / running)
    onSyncPrepareRef.current();
    rec.startRecording();
  };

  const showLiveVideo = rec.mode !== 'audio_only' && rec.state !== 'stopped' && !rec.previewUrl;
  const showRecordedPreview = rec.state === 'stopped' && !!rec.previewUrl;
  const busy = rec.state === 'requesting' || rec.state === 'countdown';
  const recordingLike =
    rec.state === 'recording' || rec.state === 'paused' || rec.state === 'countdown';
  const canToggleTracks =
    rec.state === 'ready' ||
    rec.state === 'recording' ||
    rec.state === 'paused' ||
    rec.state === 'countdown';
  const uploading =
    uploadProgress != null &&
    (uploadProgress.phase === 'init' ||
      uploadProgress.phase === 'uploading' ||
      uploadProgress.phase === 'completing');

  const runUpload = async () => {
    if (!rec.recordedBlob || rec.state !== 'stopped') return;
    setUploadError(null);
    setSavedOk(false);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await uploadTeleprompterRecording({
        blob: rec.recordedBlob,
        title: (rec.recordedFilename || scriptTitle || 'Recording').replace(/\.[^.]+$/, ''),
        recordingType: rec.mode,
        mimeType: rec.mimeType || rec.recordedBlob.type || 'video/webm',
        duration: rec.elapsedSeconds,
        teleprompterSourceId: teleprompterSourceId || undefined,
        signal: ac.signal,
        onProgress: setUploadProgress,
      });
      setSavedOk(true);
      onSavedToSystem?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload thất bại';
      if (!msg.includes('hủy')) setUploadError(msg);
      setUploadProgress((p) =>
        p
          ? { ...p, phase: msg.includes('hủy') ? 'cancelled' : 'error', message: msg }
          : {
              phase: 'error',
              uploadedBytes: 0,
              totalBytes: rec.recordedBlob?.size || 0,
              part: 0,
              totalParts: 0,
              message: msg,
              online: typeof navigator === 'undefined' ? true : navigator.onLine,
            },
      );
    } finally {
      abortRef.current = null;
    }
  };

  return (
    <section
      className={cn(
        'rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950',
        className,
      )}
      aria-label="Quay video / ghi âm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Quay video trên trình duyệt
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Chỉ xin quyền khi bấm “Bật camera”. File lưu trên máy — không upload server.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {recordingLike && rec.state !== 'countdown' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600/10 px-2.5 py-1 font-semibold text-red-600">
              <span
                className={cn(
                  'h-2 w-2 rounded-full bg-red-600',
                  rec.state === 'recording' && 'animate-pulse',
                )}
              />
              {rec.state === 'paused' ? 'TẠM DỪNG' : 'REC'}
              <span className="tabular-nums">{rec.elapsedLabel}</span>
            </span>
          )}
          {rec.state === 'countdown' && (
            <span className="rounded-full bg-amber-500/15 px-2.5 py-1 font-semibold text-amber-700">
              Đếm {rec.countdownLeft}s…
            </span>
          )}
          <StatusChip ok={rec.isLiveVideo} label="Camera" />
          <StatusChip ok={rec.isLiveAudio} label="Mic" />
          {rec.mode === 'screen_camera' && (
            <StatusChip ok={rec.screenShareActive} label="Màn hình" />
          )}
        </div>
      </div>

      {(rec.overRecommendedDuration || rec.sizeLevel !== 'none') && (
        <div
          className={cn(
            'mt-3 rounded-md border px-3 py-2 text-xs',
            rec.sizeLevel === 'critical' || rec.overRecommendedDuration
              ? 'border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200'
              : 'border-amber-400/40 bg-amber-400/10 text-amber-800 dark:text-amber-100',
          )}
        >
          {rec.overRecommendedDuration && (
            <p>
              Đã vượt khuyến nghị {MAX_RECOMMENDED_SECONDS / 60} phút/phiên
              {rec.state === 'stopped' ? ' — phiên đã được dừng tự động.' : '.'}
            </p>
          )}
          {rec.sizeLevel !== 'none' && (
            <p>
              Dung lượng recording lớn ({rec.estimatedSizeLabel}). Nên dừng và tải xuống sớm để
              tránh trình duyệt hết bộ nhớ.
            </p>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]">
        <div className="space-y-3">
          <div className="relative aspect-video overflow-hidden rounded-lg border border-slate-200 bg-black dark:border-slate-700">
            {showLiveVideo && (
              <video
                ref={rec.videoPreviewRef}
                className="h-full w-full object-contain bg-black"
                style={
                  // Layout compositor bakes flip/PiP; only mirror raw fallback stream
                  rec.compositorFallbackActive ? { transform: 'scaleX(-1)' } : undefined
                }
                playsInline
                muted
                autoPlay
              />
            )}
            {rec.mode === 'audio_only' && !showRecordedPreview && (
              <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 text-white/80">
                <Mic className="h-10 w-10 opacity-70" />
                <p className="text-sm">Chế độ chỉ ghi âm</p>
              </div>
            )}
            {showRecordedPreview && rec.mode === 'audio_only' && (
              <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-3 p-4">
                <Mic className="h-10 w-10 text-white/80" />
                <audio
                  key={rec.previewUrl!}
                  controls
                  src={rec.previewUrl!}
                  className="w-full max-w-md"
                />
              </div>
            )}
            {showRecordedPreview && rec.mode !== 'audio_only' && (
              <video
                key={rec.previewUrl}
                className="h-full w-full object-contain"
                src={rec.previewUrl!}
                controls
                playsInline
                preload="metadata"
              />
            )}
            {rec.state === 'idle' && !showRecordedPreview && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70">
                <Video className="h-10 w-10 opacity-60" />
                <p className="px-4 text-center text-sm">
                  Chưa bật camera — bấm “Bật camera” để xin quyền
                </p>
              </div>
            )}
            {rec.state === 'countdown' && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/50">
                <span className="text-7xl font-bold text-white drop-shadow-lg">
                  {rec.countdownLeft}
                </span>
              </div>
            )}
            {!rec.cameraTrackEnabled && showLiveVideo && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-white/80">
                Camera tạm tắt
              </div>
            )}
          </div>

          {rec.mode !== 'video_only' &&
            (rec.state === 'ready' ||
              rec.state === 'recording' ||
              rec.state === 'paused' ||
              rec.state === 'countdown' ||
              rec.state === 'requesting') && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Mức microphone</span>
                  <span className="tabular-nums">{Math.round(rec.audioLevel * 100)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-[width] duration-75"
                    style={{ width: `${Math.round(rec.audioLevel * 100)}%` }}
                  />
                </div>
              </div>
            )}

          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>
              Dung lượng ước tính:{' '}
              <strong className="text-foreground">{rec.estimatedSizeLabel}</strong>
              {rec.actualBytes != null ? ` (thực tế ${formatByteSize(rec.actualBytes)})` : ''}
            </span>
            {rec.mimeType && <span className="font-mono break-all opacity-80">{rec.mimeType}</span>}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Chế độ</Label>
            <Select
              value={rec.mode}
              onValueChange={(v) => rec.setMode(v as TeleprompterRecordMode)}
              disabled={recordingLike || busy}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {rec.mode !== 'audio_only' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Chất lượng</Label>
              <Select
                value={rec.quality}
                onValueChange={(v) => rec.setQuality(v as TeleprompterVideoQuality)}
                disabled={recordingLike || busy}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="economy">Tiết kiệm · 720p</SelectItem>
                  <SelectItem value="standard">Tiêu chuẩn · 1080p (nếu hỗ trợ)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Countdown</Label>
            <Select
              value={String(rec.countdownSeconds)}
              onValueChange={(v) =>
                rec.setCountdownSeconds(Number(v) as TeleprompterCountdownSeconds)
              }
              disabled={recordingLike || busy}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTDOWN_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n === 0 ? '0 giây (bắt đầu ngay)' : `${n} giây`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {rec.mode !== 'audio_only' && rec.backgroundEffectsEnabled && (
            <div className="space-y-2">
              <Label className="inline-flex items-center gap-1.5 text-xs">
                <Sparkles className="h-3.5 w-3.5 text-sky-600" />
                Hiệu ứng nền
              </Label>
              <Tabs defaultValue="blur" className="w-full">
                <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-4">
                  <TabsTrigger value="blur" className="px-1 text-[11px]">
                    Làm mờ
                  </TabsTrigger>
                  <TabsTrigger value="image" className="px-1 text-[11px]">
                    Nền ảnh
                  </TabsTrigger>
                  <TabsTrigger value="motion" className="px-1 text-[11px]">
                    Nền 3D
                  </TabsTrigger>
                  <TabsTrigger value="upload" className="px-1 text-[11px]">
                    Tải lên
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="blur" className="mt-2 space-y-1.5">
                  <Select
                    value={
                      rec.customBackground.applied ||
                      rec.backgroundPresetId ||
                      rec.backgroundMotionId
                        ? 'none'
                        : rec.backgroundBlurLevel || 'none'
                    }
                    onValueChange={(v) =>
                      rec.setBackgroundBlurLevel(v as CameraBackgroundBlurLevel)
                    }
                    disabled={
                      rec.state === 'idle' ||
                      rec.state === 'requesting' ||
                      rec.backgroundBlurStatus === 'loading'
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Mức làm mờ" />
                    </SelectTrigger>
                    <SelectContent>
                      {CAMERA_BACKGROUND_BLUR_LEVELS.map((level) => (
                        <SelectItem key={level} value={level}>
                          {CAMERA_BACKGROUND_BLUR_LABELS[level]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TabsContent>
                <TabsContent value="image" className="mt-2 space-y-2">
                  <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-3">
                    <button
                      type="button"
                      disabled={
                        rec.state === 'idle' ||
                        rec.state === 'requesting' ||
                        rec.backgroundBlurStatus === 'loading'
                      }
                      onClick={() => rec.setBackgroundPreset(null)}
                      className={cn(
                        'relative flex aspect-video flex-col items-center justify-center rounded-md border text-[10px] font-medium transition-colors',
                        !rec.backgroundPresetId
                          ? 'border-sky-500 bg-sky-500/10 text-sky-800 ring-1 ring-sky-500/40 dark:text-sky-200'
                          : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted',
                        'disabled:pointer-events-none disabled:opacity-50',
                      )}
                    >
                      Tắt
                    </button>
                    {TELEPROMPTER_BG_PRESETS.map((preset) => {
                      const selected = rec.backgroundPresetId === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          title={preset.description}
                          disabled={
                            rec.state === 'idle' ||
                            rec.state === 'requesting' ||
                            rec.backgroundBlurStatus === 'loading'
                          }
                          onClick={() =>
                            rec.setBackgroundPreset(preset.id as TeleprompterBgPresetId)
                          }
                          className={cn(
                            'group relative overflow-hidden rounded-md border text-left transition-colors',
                            selected
                              ? 'border-sky-500 ring-1 ring-sky-500/50'
                              : 'border-border hover:border-sky-400/60',
                            'disabled:pointer-events-none disabled:opacity-50',
                          )}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={preset.thumbSrc}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="aspect-video w-full object-cover object-center"
                          />
                          <span
                            className={cn(
                              'absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-[9px] text-white',
                              selected && 'bg-sky-700/85',
                            )}
                          >
                            {preset.label}
                          </span>
                          {selected && (
                            <span className="absolute right-1 top-1 rounded bg-sky-600 px-1 text-[8px] font-semibold uppercase tracking-wide text-white">
                              Chọn
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Nền phủ cover, căn giữa. Ảnh full chỉ tải khi chọn.
                  </p>
                </TabsContent>
                <TabsContent value="motion" className="mt-2 space-y-2">
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      disabled={
                        rec.state === 'idle' ||
                        rec.state === 'requesting' ||
                        rec.backgroundBlurStatus === 'loading'
                      }
                      onClick={() => rec.setBackgroundMotion(null)}
                      className={cn(
                        'relative flex aspect-video flex-col items-center justify-center rounded-md border text-[10px] font-medium transition-colors',
                        !rec.backgroundMotionId
                          ? 'border-sky-500 bg-sky-500/10 text-sky-800 ring-1 ring-sky-500/40 dark:text-sky-200'
                          : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted',
                        'disabled:pointer-events-none disabled:opacity-50',
                      )}
                    >
                      Tắt
                    </button>
                    {TELEPROMPTER_MOTION_BG_PRESETS.map((preset) => {
                      const selected = rec.backgroundMotionId === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          title={preset.description}
                          disabled={
                            rec.state === 'idle' ||
                            rec.state === 'requesting' ||
                            rec.backgroundBlurStatus === 'loading'
                          }
                          onClick={() =>
                            rec.setBackgroundMotion(preset.id as TeleprompterMotionBgId)
                          }
                          className={cn(
                            'group relative overflow-hidden rounded-md border text-left transition-colors',
                            selected
                              ? 'border-sky-500 ring-1 ring-sky-500/50'
                              : 'border-border hover:border-sky-400/60',
                            'disabled:pointer-events-none disabled:opacity-50',
                          )}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={preset.thumbSrc}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="aspect-video w-full object-cover object-center"
                          />
                          <span
                            className={cn(
                              'absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-[9px] text-white',
                              selected && 'bg-sky-700/85',
                            )}
                          >
                            {preset.label}
                          </span>
                          {selected && (
                            <span className="absolute right-1 top-1 rounded bg-sky-600 px-1 text-[8px] font-semibold uppercase tracking-wide text-white">
                              Chọn
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Video loop muted · 1 nền · tạm dừng khi ẩn tab. Máy yếu → ảnh tĩnh.
                  </p>
                </TabsContent>
                <TabsContent value="upload" className="mt-2 space-y-2">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,.jpg,.jpeg,.png,.webp,.mp4,.webm"
                    className="hidden"
                    id="tp-custom-bg-input"
                    disabled={
                      rec.state === 'idle' ||
                      rec.state === 'requesting' ||
                      rec.backgroundBlurStatus === 'loading'
                    }
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      e.target.value = '';
                      void rec.stageCustomBackgroundFile(f);
                    }}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-8 text-xs"
                      disabled={
                        rec.state === 'idle' ||
                        rec.state === 'requesting' ||
                        rec.backgroundBlurStatus === 'loading'
                      }
                      onClick={() => document.getElementById('tp-custom-bg-input')?.click()}
                    >
                      Chọn file…
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 text-xs"
                      disabled={
                        !rec.customBackground.canApply ||
                        rec.state === 'idle' ||
                        rec.state === 'requesting' ||
                        rec.backgroundBlurStatus === 'loading'
                      }
                      onClick={() => rec.applyCustomBackground()}
                    >
                      Áp dụng
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={!rec.customBackground.previewUrl && !rec.customBackground.applied}
                      onClick={() => rec.clearCustomBackground()}
                    >
                      Xóa nền
                    </Button>
                  </div>
                  {rec.customBackground.previewUrl && (
                    <div className="space-y-1">
                      <p className="truncate text-[10px] text-muted-foreground">
                        {rec.customBackground.fileName}
                        {rec.customBackground.kind
                          ? ` · ${rec.customBackground.kind === 'video' ? 'Video' : 'Ảnh'}`
                          : ''}
                        {rec.customBackground.applied ? ' · đang dùng' : ' · xem trước'}
                      </p>
                      <div className="overflow-hidden rounded-md border border-border">
                        {rec.customBackground.kind === 'video' ? (
                          // eslint-disable-next-line jsx-a11y/media-has-caption
                          <video
                            src={rec.customBackground.previewUrl}
                            className="aspect-video w-full object-cover object-center"
                            muted
                            playsInline
                            loop
                            autoPlay
                          />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={rec.customBackground.previewUrl}
                            alt=""
                            className="aspect-video w-full object-cover object-center"
                          />
                        )}
                      </div>
                    </div>
                  )}
                  {rec.customBackgroundError && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">
                      {rec.customBackgroundError}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    JPG/PNG/WebP ≤ 8MB · MP4/WebM ≤ 32MB · ≤ 90s. Bấm «Áp dụng» để lưu trên trình
                    duyệt này (F5 không mất). Không tải lên server.
                  </p>
                </TabsContent>
              </Tabs>
              {rec.backgroundBlurStatus === 'loading' && (
                <p className="text-[11px] text-muted-foreground">
                  {rec.customBackground.applied
                    ? 'Đang áp dụng nền đã tải…'
                    : rec.backgroundMotionId
                      ? t('teleprompter.loadingBg3d')
                      : rec.backgroundPresetId
                        ? t('teleprompter.loadingBgImage')
                        : 'Đang khởi tạo làm mờ…'}
                </p>
              )}
              {rec.backgroundBlurStatus === 'active' && (
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  {rec.customBackground.applied
                    ? 'Nền tùy chỉnh đã lưu trên máy (trình duyệt) — F5 vẫn còn. Bấm «Xóa nền» để bỏ.'
                    : rec.backgroundMotionId
                      ? 'Nền 3D (video) phía sau người — không audio nền, không ảnh hưởng cuộn kịch bản.'
                      : rec.backgroundPresetId
                        ? 'Nền ảnh phía sau người (không ảnh hưởng cuộn kịch bản).'
                        : 'Đang làm mờ nền camera (không ảnh hưởng cuộn kịch bản).'}
                </p>
              )}
              {rec.backgroundBlurMessage && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                  {rec.backgroundBlurMessage}
                </p>
              )}
            </div>
          )}

          {rec.mode !== 'audio_only' &&
            (rec.state === 'ready' ||
              rec.state === 'recording' ||
              rec.state === 'paused' ||
              rec.state === 'countdown') && (
              <div className="space-y-2 rounded-md border border-slate-100 p-2 dark:border-slate-800">
                <Label className="text-xs">Camera trên khung ghi</Label>
                <p className="text-[10px] text-muted-foreground">
                  {rec.mode === 'screen_camera'
                    ? 'PiP trên màn hình chia sẻ — không ghi UI Teleprompter/nút điều khiển.'
                    : 'Lật / bo tròn camera trong video xuất (compositor canvas).'}
                </p>
                {rec.mode === 'screen_camera' && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="space-y-1 text-[10px] text-muted-foreground">
                        Vị trí ngang
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round(rec.cameraLayout.x * 100)}
                          onChange={(e) => rec.setCameraLayout({ x: Number(e.target.value) / 100 })}
                          className="w-full"
                        />
                      </label>
                      <label className="space-y-1 text-[10px] text-muted-foreground">
                        Vị trí dọc
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round(rec.cameraLayout.y * 100)}
                          onChange={(e) => rec.setCameraLayout({ y: Number(e.target.value) / 100 })}
                          className="w-full"
                        />
                      </label>
                      <label className="space-y-1 text-[10px] text-muted-foreground">
                        Rộng
                        <input
                          type="range"
                          min={12}
                          max={60}
                          value={Math.round(rec.cameraLayout.width * 100)}
                          onChange={(e) =>
                            rec.setCameraLayout({ width: Number(e.target.value) / 100 })
                          }
                          className="w-full"
                        />
                      </label>
                      <label className="space-y-1 text-[10px] text-muted-foreground">
                        Cao
                        <input
                          type="range"
                          min={12}
                          max={60}
                          value={Math.round(rec.cameraLayout.height * 100)}
                          onChange={(e) =>
                            rec.setCameraLayout({ height: Number(e.target.value) / 100 })
                          }
                          className="w-full"
                        />
                      </label>
                    </div>
                  </>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1 text-[10px] text-muted-foreground">
                    Bo góc
                    <input
                      type="range"
                      min={0}
                      max={50}
                      value={Math.round(rec.cameraLayout.borderRadius * 100)}
                      onChange={(e) =>
                        rec.setCameraLayout({ borderRadius: Number(e.target.value) / 100 })
                      }
                      className="w-full"
                    />
                  </label>
                  <label className="flex items-end gap-2 pb-1 text-[11px] font-medium text-foreground">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300"
                      checked={rec.cameraLayout.flipX}
                      onChange={(e) => rec.setCameraLayout({ flipX: e.target.checked })}
                    />
                    Lật người (selfie)
                  </label>
                </div>
                {rec.compositorFallbackActive && (
                  <p className="text-[10px] text-amber-700 dark:text-amber-300">
                    Compositor canvas lỗi — đang dùng luồng quay cũ (camera + mic).
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground">
                  Lật chỉ áp dụng người — nền ảnh/3D luôn giữ hướng đúng (không lật chữ).
                </p>
              </div>
            )}

          {rec.mode !== 'audio_only' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Camera</Label>
              <div className="flex gap-2">
                <Select
                  value={rec.videoDeviceId || '__auto__'}
                  onValueChange={(id) => rec.setVideoDeviceId(id === '__auto__' ? '' : id)}
                  disabled={recordingLike || rec.videoDevices.length === 0}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Chọn camera" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__auto__">Tự động</SelectItem>
                    {rec.videoDevices.map((d) => (
                      <SelectItem key={d.deviceId} value={d.deviceId}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  title="Đổi camera trước/sau"
                  className="shrink-0"
                  disabled={rec.state === 'idle' || rec.state === 'requesting'}
                  onClick={() => void rec.switchFacingCamera()}
                >
                  <FlipHorizontal className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {rec.mode !== 'video_only' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Microphone</Label>
              <Select
                value={rec.audioDeviceId || '__auto__'}
                onValueChange={(id) => rec.setAudioDeviceId(id === '__auto__' ? '' : id)}
                disabled={recordingLike || rec.audioDevices.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn microphone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">Tự động</SelectItem>
                  {rec.audioDevices.map((d) => (
                    <SelectItem key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2 rounded-md border border-slate-100 p-2 dark:border-slate-800">
            <label
              className="flex cursor-pointer items-center gap-2 text-xs font-medium"
              style={{ color: '#000000' }}
            >
              <input
                type="checkbox"
                className="rounded border-slate-300"
                checked={autoStartTp}
                onChange={(e) => setAutoStartTp(e.target.checked)}
                data-tp-sync="auto-start"
              />
              <span style={{ color: '#000000' }}>Teleprompter tự chạy khi bắt đầu quay</span>
            </label>
            <label
              className="flex cursor-pointer items-center gap-2 text-xs font-medium"
              style={{ color: '#000000' }}
            >
              <input
                type="checkbox"
                className="rounded border-slate-300"
                checked={stopTpOnStop}
                onChange={(e) => setStopTpOnStop(e.target.checked)}
                data-tp-sync="stop-on-stop"
              />
              <span style={{ color: '#000000' }}>Dừng Teleprompter khi dừng quay</span>
            </label>
          </div>

          {rec.error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <p className="font-medium">{rec.error.message}</p>
              {rec.error.code === 'permission_denied' && (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-destructive/90">
                  {permissionRecoverySteps().map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {showRecordedPreview && (
            <div className="space-y-1.5">
              <Label className="text-xs">Tên file tải xuống</Label>
              <Input
                value={rec.recordedFilename ?? ''}
                onChange={(e) => rec.setRecordedFilename(e.target.value)}
                className="text-sm"
                spellCheck={false}
              />
              {rec.hasDownloaded ? (
                <p className="text-[11px] text-emerald-600">Đã tải file.</p>
              ) : (
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                  Chưa tải file — thoát trang sẽ hiện cảnh báo.
                </p>
              )}
            </div>
          )}

          <div className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-1.5rem)] flex-nowrap items-center gap-1.5 overflow-x-auto rounded-lg bg-white p-1.5 shadow-lg sm:gap-2 sm:p-2 dark:bg-slate-900 dark:shadow-black/40">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0 whitespace-nowrap"
              onClick={() => void rec.enableDevices()}
              disabled={recordingLike}
            >
              <Video className="mr-1 h-3.5 w-3.5" />
              {rec.state === 'ready' || rec.state === 'stopped' ? 'Làm mới thiết bị' : 'Bật camera'}
            </Button>

            {canToggleTracks && rec.mode !== 'audio_only' && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 whitespace-nowrap"
                onClick={rec.toggleCameraTrack}
                title={rec.cameraTrackEnabled ? 'Tắt camera' : 'Bật camera'}
              >
                {rec.cameraTrackEnabled ? (
                  <Video className="h-3.5 w-3.5" />
                ) : (
                  <VideoOff className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
            {canToggleTracks && rec.mode !== 'video_only' && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 whitespace-nowrap"
                onClick={rec.toggleMicTrack}
                title={rec.micTrackEnabled ? 'Tắt mic' : 'Bật mic'}
              >
                {rec.micTrackEnabled ? (
                  <Mic className="h-3.5 w-3.5" />
                ) : (
                  <MicOff className="h-3.5 w-3.5" />
                )}
              </Button>
            )}

            {(rec.state === 'ready' || rec.state === 'stopped') && (
              <Button
                type="button"
                size="sm"
                className="shrink-0 whitespace-nowrap"
                onClick={handleStartRecording}
              >
                <Play className="mr-1 h-3.5 w-3.5" />
                Bắt đầu quay
              </Button>
            )}

            {rec.state === 'recording' && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="shrink-0 whitespace-nowrap"
                onClick={rec.pauseRecording}
              >
                <Pause className="mr-1 h-3.5 w-3.5" />
                Tạm dừng
              </Button>
            )}

            {rec.state === 'paused' && (
              <Button
                type="button"
                size="sm"
                className="shrink-0 whitespace-nowrap"
                onClick={rec.resumeRecording}
              >
                <Play className="mr-1 h-3.5 w-3.5" />
                Tiếp tục
              </Button>
            )}

            {(rec.state === 'recording' || rec.state === 'paused' || rec.state === 'countdown') && (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="shrink-0 whitespace-nowrap"
                onClick={rec.stopRecording}
              >
                <Square className="mr-1 h-3.5 w-3.5" />
                Dừng
              </Button>
            )}

            {rec.state === 'stopped' && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0 whitespace-nowrap"
                  onClick={rec.retake}
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  Quay lại
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0 whitespace-nowrap"
                  onClick={rec.download}
                  disabled={!rec.previewUrl}
                >
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Tải xuống
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="shrink-0 whitespace-nowrap"
                  disabled={!rec.recordedBlob || uploading}
                  onClick={() => void runUpload()}
                >
                  <CloudUpload className="mr-1 h-3.5 w-3.5" />
                  Lưu lên hệ thống
                </Button>
                {uploading && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0 whitespace-nowrap"
                    onClick={() => abortRef.current?.abort()}
                  >
                    Hủy upload
                  </Button>
                )}
                {(uploadError || uploadProgress?.phase === 'error') && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0 whitespace-nowrap"
                    onClick={() => void runUpload()}
                  >
                    {t('common.retry')}
                  </Button>
                )}
              </>
            )}
          </div>

          {uploadProgress && rec.state === 'stopped' && (
            <div className="mt-3 space-y-1.5 rounded-md border border-slate-100 p-3 text-xs dark:border-slate-800">
              <div className="flex justify-between gap-2">
                <span>
                  {uploadProgress.phase === 'done'
                    ? 'Đã lưu lên hệ thống'
                    : uploadProgress.phase === 'cancelled'
                      ? 'Đã hủy upload'
                      : uploadProgress.phase === 'error'
                        ? 'Upload lỗi'
                        : `Đang upload… part ${uploadProgress.part}/${uploadProgress.totalParts || '?'}`}
                </span>
                <span className="tabular-nums">
                  {formatBytes(uploadProgress.uploadedBytes)} /{' '}
                  {formatBytes(uploadProgress.totalBytes)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className={cn(
                    'h-full rounded-full transition-[width]',
                    uploadProgress.phase === 'error' ? 'bg-red-500' : 'bg-sky-600',
                  )}
                  style={{
                    width: `${
                      uploadProgress.totalBytes
                        ? Math.min(
                            100,
                            Math.round(
                              (uploadProgress.uploadedBytes / uploadProgress.totalBytes) * 100,
                            ),
                          )
                        : 0
                    }%`,
                  }}
                />
              </div>
              {!uploadProgress.online && (
                <p className="text-amber-700 dark:text-amber-300">
                  Cảnh báo: mất mạng — kết nối lại rồi thử lại.
                </p>
              )}
              {(uploadError || uploadProgress.message) && uploadProgress.phase === 'error' && (
                <p className="text-destructive">{uploadError || uploadProgress.message}</p>
              )}
              {savedOk && uploadProgress.phase === 'done' && (
                <p className="text-emerald-600">Xem tại tab “Video đã quay”.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium',
        ok
          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
          : 'bg-slate-100 text-slate-500 dark:bg-slate-800',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', ok ? 'bg-emerald-500' : 'bg-slate-400')} />
      {label} {ok ? 'OK' : '—'}
    </span>
  );
}

export default TeleprompterRecorder;
