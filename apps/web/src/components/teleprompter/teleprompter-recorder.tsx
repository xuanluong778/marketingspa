'use client';

import { Download, Mic, Pause, Play, RotateCcw, Square, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTeleprompterRecorder } from '@/hooks/use-teleprompter-recorder';
import type { TeleprompterRecordMode } from '@/lib/teleprompter-media';
import { cn } from '@/lib/utils';

export type TeleprompterRecorderProps = {
  /** Start teleprompter scroll immediately (no teleprompter countdown) */
  onSyncPlay: () => void;
  /** Pause teleprompter scroll */
  onSyncPause: () => void;
  className?: string;
};

const MODE_OPTIONS: Array<{ value: TeleprompterRecordMode; label: string }> = [
  { value: 'video_audio', label: 'Video + âm thanh' },
  { value: 'video_only', label: 'Chỉ video' },
  { value: 'audio_only', label: 'Chỉ ghi âm' },
];

export function TeleprompterRecorder({
  onSyncPlay,
  onSyncPause,
  className,
}: TeleprompterRecorderProps) {
  const rec = useTeleprompterRecorder({
    onRecordingStart: onSyncPlay,
    onRecordingPause: onSyncPause,
    onRecordingResume: onSyncPlay,
    onRecordingStop: onSyncPause,
  });

  const showLiveVideo = rec.mode !== 'audio_only' && rec.state !== 'stopped' && !rec.previewUrl;
  const showRecordedPreview = rec.state === 'stopped' && !!rec.previewUrl;
  const busy = rec.state === 'requesting' || rec.state === 'countdown';
  const recordingLike =
    rec.state === 'recording' || rec.state === 'paused' || rec.state === 'countdown';

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
            Chỉ xin quyền khi bấm “Bật camera”. File lưu trên máy — chưa upload server.
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
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,320px)]">
        <div className="space-y-3">
          <div className="relative aspect-video overflow-hidden rounded-lg border border-slate-200 bg-black dark:border-slate-700">
            {/* Live preview — mirrored visually only */}
            {showLiveVideo && (
              <video
                ref={rec.videoPreviewRef}
                className="h-full w-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
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
                <audio controls src={rec.previewUrl!} className="w-full max-w-md" />
              </div>
            )}
            {showRecordedPreview && rec.mode !== 'audio_only' && (
              <video
                key={rec.previewUrl}
                className="h-full w-full object-contain"
                src={rec.previewUrl!}
                controls
                playsInline
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
          </div>

          {/* Audio level */}
          {rec.mode !== 'video_only' && (rec.isLiveAudio || rec.state === 'requesting') && (
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
              <p className="text-[11px] text-muted-foreground">
                Nói thử vài câu — thanh mức phải nhấp nháy nếu mic hoạt động.
              </p>
            </div>
          )}
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
              <Label className="text-xs">Camera</Label>
              <Select
                value={rec.videoDeviceId || undefined}
                onValueChange={rec.setVideoDeviceId}
                disabled={recordingLike || rec.videoDevices.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn camera" />
                </SelectTrigger>
                <SelectContent>
                  {rec.videoDevices.map((d) => (
                    <SelectItem key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {rec.mode !== 'video_only' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Microphone</Label>
              <Select
                value={rec.audioDeviceId || undefined}
                onValueChange={rec.setAudioDeviceId}
                disabled={recordingLike || rec.audioDevices.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn microphone" />
                </SelectTrigger>
                <SelectContent>
                  {rec.audioDevices.map((d) => (
                    <SelectItem key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {rec.mimeType && (
            <p className="text-[11px] text-muted-foreground break-all">
              Định dạng: <span className="font-mono">{rec.mimeType}</span>
            </p>
          )}

          {rec.error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {rec.error.message}
            </div>
          )}

          <div className="mt-auto flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void rec.enableDevices()}
              disabled={recordingLike}
            >
              <Video className="mr-1 h-3.5 w-3.5" />
              {rec.state === 'ready' || rec.state === 'stopped' ? 'Làm mới thiết bị' : 'Bật camera'}
            </Button>

            {(rec.state === 'ready' || rec.state === 'stopped') && (
              <Button type="button" size="sm" onClick={rec.startRecording}>
                <Play className="mr-1 h-3.5 w-3.5" />
                Bắt đầu quay
              </Button>
            )}

            {rec.state === 'recording' && (
              <Button type="button" size="sm" variant="secondary" onClick={rec.pauseRecording}>
                <Pause className="mr-1 h-3.5 w-3.5" />
                Tạm dừng
              </Button>
            )}

            {rec.state === 'paused' && (
              <Button type="button" size="sm" onClick={rec.resumeRecording}>
                <Play className="mr-1 h-3.5 w-3.5" />
                Tiếp tục
              </Button>
            )}

            {(rec.state === 'recording' || rec.state === 'paused' || rec.state === 'countdown') && (
              <Button type="button" size="sm" variant="destructive" onClick={rec.stopRecording}>
                <Square className="mr-1 h-3.5 w-3.5" />
                Dừng
              </Button>
            )}

            {rec.state === 'stopped' && (
              <>
                <Button type="button" size="sm" variant="outline" onClick={rec.retake}>
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  Quay lại
                </Button>
                <Button type="button" size="sm" onClick={rec.download} disabled={!rec.previewUrl}>
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Tải xuống
                  {rec.recordedFilename ? ` (.${rec.recordedFilename.split('.').pop()})` : ''}
                </Button>
              </>
            )}
          </div>
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
