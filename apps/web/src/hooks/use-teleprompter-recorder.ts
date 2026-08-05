'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  audioLevelFromAnalyser,
  buildRecordingFilename,
  canTransition,
  classifyMediaError,
  constraintsForMode,
  formatRecordingClock,
  pickRecorderMimeType,
  revokeObjectUrl,
  stopMediaStream,
  type TeleprompterMediaErrorCode,
  type TeleprompterRecordMode,
  type TeleprompterRecorderState,
} from '@/lib/teleprompter-media';

export type MediaDeviceOption = {
  deviceId: string;
  label: string;
  kind: 'videoinput' | 'audioinput';
};

export type UseTeleprompterRecorderOptions = {
  /** Called when countdown finishes and recording actually starts */
  onRecordingStart?: () => void;
  /** Pause teleprompter when recording pauses */
  onRecordingPause?: () => void;
  /** Resume teleprompter when recording resumes */
  onRecordingResume?: () => void;
  /** After user stops (finalized blob ready) */
  onRecordingStop?: () => void;
  countdownSeconds?: number;
};

export type UseTeleprompterRecorderResult = {
  state: TeleprompterRecorderState;
  mode: TeleprompterRecordMode;
  setMode: (m: TeleprompterRecordMode) => void;
  videoDevices: MediaDeviceOption[];
  audioDevices: MediaDeviceOption[];
  videoDeviceId: string;
  audioDeviceId: string;
  setVideoDeviceId: (id: string) => void;
  setAudioDeviceId: (id: string) => void;
  error: { code: TeleprompterMediaErrorCode; message: string } | null;
  elapsedSeconds: number;
  elapsedLabel: string;
  countdownLeft: number | null;
  audioLevel: number;
  mimeType: string | null;
  previewUrl: string | null;
  recordedBlob: Blob | null;
  recordedFilename: string | null;
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
};

export function useTeleprompterRecorder(
  options: UseTeleprompterRecorderOptions = {},
): UseTeleprompterRecorderResult {
  const {
    onRecordingStart,
    onRecordingPause,
    onRecordingResume,
    onRecordingStop,
    countdownSeconds = 3,
  } = options;

  const [state, setState] = useState<TeleprompterRecorderState>('idle');
  const [mode, setModeState] = useState<TeleprompterRecordMode>('video_audio');
  const [videoDevices, setVideoDevices] = useState<MediaDeviceOption[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceOption[]>([]);
  const [videoDeviceId, setVideoDeviceId] = useState('');
  const [audioDeviceId, setAudioDeviceId] = useState('');
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
  const [recordedFilename, setRecordedFilename] = useState<string | null>(null);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string | null>(null);
  const modeRef = useRef(mode);
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
    setRecordedFilename(null);
  }, []);

  const detachPreviewVideo = useCallback(() => {
    const el = videoPreviewRef.current;
    if (el) {
      el.srcObject = null;
    }
  }, []);

  const stopTracks = useCallback(() => {
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    setLiveStream(null);
    detachPreviewVideo();
  }, [detachPreviewVideo]);

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
    revokePreview();
    setError(null);
    setElapsedSeconds(0);
    elapsedBaseRef.current = 0;
    transition('idle');
  }, [clearCountdown, clearElapsed, closeAudioGraph, revokePreview, stopTracks, transition]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Attach live stream to video element when ready
  useEffect(() => {
    const el = videoPreviewRef.current;
    if (!el) return;
    if (liveStream && mode !== 'audio_only') {
      el.srcObject = liveStream;
      void el.play().catch(() => undefined);
    } else if (!previewUrl) {
      el.srcObject = null;
    }
  }, [liveStream, mode, previewUrl]);

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
      const hasAudio = stream.getAudioTracks().length > 0;
      if (!hasAudio) return;
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
          setAudioLevel(audioLevelFromAnalyser(analyserRef.current, levelBufferRef.current));
          levelRafRef.current = requestAnimationFrame(tick);
        };
        void ctx.resume().catch(() => undefined);
        levelRafRef.current = requestAnimationFrame(tick);
      } catch {
        /* level meter optional */
      }
    },
    [closeAudioGraph],
  );

  const openStream = useCallback(
    async (nextMode: TeleprompterRecordMode, videoId: string, audioId: string) => {
      stopTracks();
      closeAudioGraph();
      const constraints = constraintsForMode(nextMode, {
        videoId: videoId || undefined,
        audioId: audioId || undefined,
      });
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      setLiveStream(stream);

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

      startLevelMeter(stream);
      await listDevices();
      return stream;
    },
    [closeAudioGraph, listDevices, startLevelMeter, stopTracks],
  );

  const enableDevices = useCallback(async () => {
    setError(null);
    revokePreview();
    if (!navigator.mediaDevices?.getUserMedia) {
      const classified = classifyMediaError(new Error('not supported'));
      setError(classified);
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
      await openStream(mode, videoDeviceId, audioDeviceId);
      transition('ready');
    } catch (err) {
      stopTracks();
      const classified = classifyMediaError(err);
      if (classified.code === 'no_camera' || classified.code === 'device_not_found') {
        if (mode !== 'audio_only' && mode !== 'video_only') {
          // try clearer message for mixed mode
        }
      }
      setError(classified);
      transition('error');
    }
  }, [audioDeviceId, mode, openStream, revokePreview, stopTracks, transition, videoDeviceId]);

  const setMode = useCallback(
    (m: TeleprompterRecordMode) => {
      setModeState(m);
      modeRef.current = m;
      // Re-request only if already had devices live
      if (streamRef.current || stateRef.current === 'ready' || stateRef.current === 'error') {
        const mime = pickRecorderMimeType(m);
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
        void (async () => {
          if (!streamRef.current && stateRef.current === 'idle') return;
          transition('requesting');
          try {
            await openStream(m, videoDeviceId, audioDeviceId);
            setError(null);
            transition('ready');
          } catch (err) {
            stopTracks();
            setError(classifyMediaError(err));
            transition('error');
          }
        })();
      }
    },
    [audioDeviceId, openStream, stopTracks, transition, videoDeviceId],
  );

  // Swap device while ready
  const applyDeviceChange = useCallback(
    async (videoId: string, audioId: string) => {
      if (!streamRef.current) return;
      if (!['ready', 'stopped'].includes(stateRef.current)) return;
      transition('requesting');
      try {
        await openStream(modeRef.current, videoId, audioId);
        setError(null);
        transition('ready');
      } catch (err) {
        stopTracks();
        setError(classifyMediaError(err));
        transition('error');
      }
    },
    [openStream, stopTracks, transition],
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

  const beginElapsed = useCallback(() => {
    clearElapsed();
    elapsedStartedAtRef.current = Date.now();
    elapsedTimerRef.current = window.setInterval(() => {
      const extra = (Date.now() - elapsedStartedAtRef.current) / 1000;
      setElapsedSeconds(elapsedBaseRef.current + extra);
    }, 200);
  }, [clearElapsed]);

  const freezeElapsed = useCallback(() => {
    const extra = (Date.now() - elapsedStartedAtRef.current) / 1000;
    elapsedBaseRef.current += extra;
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
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: mime });
    } catch (err) {
      setError(classifyMediaError(err));
      transition('error');
      return;
    }
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
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
      const filename = buildRecordingFilename(blobType, modeRef.current);
      setRecordedFilename(filename);
      transition('stopped');
      onRecordingStop?.();
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
    onRecordingStart?.();
  }, [beginElapsed, clearElapsed, freezeElapsed, onRecordingStart, onRecordingStop, transition]);

  const startRecording = useCallback(() => {
    if (!streamRef.current) {
      setError({
        code: 'unknown',
        message: 'Hãy bấm “Bật camera” trước khi quay.',
      });
      return;
    }
    if (!['ready', 'stopped'].includes(stateRef.current)) return;
    revokePreview();
    clearCountdown();
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
  }, [clearCountdown, countdownSeconds, revokePreview, startMediaRecorder, transition]);

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
    onRecordingPause?.();
  }, [freezeElapsed, onRecordingPause, transition]);

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
    onRecordingResume?.();
  }, [beginElapsed, onRecordingResume, transition]);

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
    // onstop finalizes blob
  }, [clearCountdown, transition]);

  const retake = useCallback(() => {
    clearCountdown();
    clearElapsed();
    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
    } catch {
      /* ignore */
    }
    recorderRef.current = null;
    chunksRef.current = [];
    revokePreview();
    setElapsedSeconds(0);
    elapsedBaseRef.current = 0;
    if (streamRef.current) {
      transition('ready');
    } else {
      transition('idle');
    }
  }, [clearCountdown, clearElapsed, revokePreview, transition]);

  const download = useCallback(() => {
    if (!previewUrlRef.current || !recordedFilename) return;
    const a = document.createElement('a');
    a.href = previewUrlRef.current;
    a.download = recordedFilename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [recordedFilename]);

  // Cleanup on unmount
  useEffect(() => () => dispose(), [dispose]);

  // devicechange
  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    const onChange = () => {
      void listDevices();
    };
    md.addEventListener('devicechange', onChange);
    return () => md.removeEventListener('devicechange', onChange);
  }, [listDevices]);

  const isLiveVideo = Boolean(
    liveStream &&
    mode !== 'audio_only' &&
    liveStream.getVideoTracks().some((t) => t.readyState === 'live'),
  );
  const isLiveAudio = Boolean(
    liveStream &&
    mode !== 'video_only' &&
    liveStream.getAudioTracks().some((t) => t.readyState === 'live'),
  );

  return {
    state,
    mode,
    setMode,
    videoDevices,
    audioDevices,
    videoDeviceId,
    audioDeviceId,
    setVideoDeviceId: setVideoDeviceIdSafe,
    setAudioDeviceId: setAudioDeviceIdSafe,
    error,
    elapsedSeconds,
    elapsedLabel: formatRecordingClock(elapsedSeconds),
    countdownLeft,
    audioLevel,
    mimeType,
    previewUrl,
    recordedBlob,
    recordedFilename,
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
  };
}
