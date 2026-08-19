'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Eye,
  EyeOff,
  FlipHorizontal2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';
import { TeleprompterScriptEditor } from '@/components/teleprompter/teleprompter-script-editor';
import { TeleprompterRecorder } from '@/components/teleprompter/teleprompter-recorder';
import { TeleprompterRecordingsLibrary } from '@/components/teleprompter/teleprompter-recordings-library';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import {
  clearTeleprompterHandoff,
  loadTeleprompterHandoff,
  type TeleprompterHandoff,
} from '@/lib/teleprompter-bridge';
import { cn } from '@/lib/utils';
import {
  addBreathMarks,
  autoSplitParagraphs,
  parseScriptLine,
  stripScriptNoise,
} from '@/lib/teleprompter-script-tools';
import {
  DEFAULT_TELEPROMPTER_DRAFT,
  estimateDurationSeconds,
  formatClock,
  formatTeleprompterFontSize,
  formatTeleprompterPlaybackSpeed,
  loadTeleprompterDraft,
  normalizeTeleprompterFontSize,
  saveTeleprompterDraft,
  TELEPROMPTER_BASE_SCROLL_PX,
  TELEPROMPTER_FONT_SIZES,
  TELEPROMPTER_PLAYBACK_SPEEDS,
  TELEPROMPTER_SCROLL_RATE_SCALE,
  type TeleprompterDraft,
  type TeleprompterPlaybackSpeed,
} from '@/lib/teleprompter-storage';
import {
  applyScrollOffset,
  computePxDelta,
  ensureScrollPort,
  progressFromMetrics,
} from '@/lib/teleprompter-scroll-engine';

type SourceSnapshot = Partial<TeleprompterHandoff> & {
  sourceType?: string;
  sourceContentId?: string;
  sourceRoute?: string;
  sourceTitle?: string;
  originalScript?: string;
  editedScript?: string;
  videoHook?: string;
  facebookPost?: string;
};

function draftFromSource(source: SourceSnapshot): TeleprompterDraft {
  const script = (source.editedScript || source.originalScript || '').trim();
  return {
    ...DEFAULT_TELEPROMPTER_DRAFT,
    title: source.sourceTitle || 'Kịch bản quay video',
    sourceTitle: source.sourceTitle || 'Kịch bản quay video',
    originalScript: source.originalScript || script,
    editedScript: script,
    sourceType: source.sourceType || 'manual',
    sourceContentId: source.sourceContentId,
    sourceRoute: source.sourceRoute,
    facebookPost: source.facebookPost,
    videoHook: source.videoHook,
    estimatedDuration: estimateDurationSeconds(script),
    updatedAt: new Date().toISOString(),
  };
}

export function TeleprompterStudio() {
  const searchParams = useSearchParams();
  const contentId = searchParams.get('contentId');
  const [draft, setDraft] = useState<TeleprompterDraft>(DEFAULT_TELEPROMPTER_DRAFT);
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [countdownLeft, setCountdownLeft] = useState<number | null>(null);
  const [studioTab, setStudioTab] = useState<'record' | 'library'>('record');
  const [libraryRefresh, setLibraryRefresh] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  /** Form tiêu đề/kịch bản mặc định ẩn — chỉ mở khi bấm “Hiện form chỉnh sửa”. */
  const [showEditor, setShowEditor] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const runnerRef = useRef<HTMLDivElement>(null);
  /** Viewport with fixed height — content moves via transform (virtual offset). */
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  /** Virtual scroll offset in px (transform translateY). Primary scroll state. */
  const virtualOffsetRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);
  const runIdRef = useRef(0);
  const countdownTimerRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const draftRef = useRef(draft);
  const isRunningRef = useRef(false);
  const fullscreenRef = useRef(false);
  const positionSavedAt = useRef(0);
  const progressSavedAt = useRef(0);

  const applyOffset = useCallback(
    (offset: number): { progress: number; offset: number; maxScroll: number } => {
      const viewport = scrollContainerRef.current;
      const content = scrollContentRef.current;
      if (!viewport || !content) {
        return { progress: 0, offset: 0, maxScroll: 0 };
      }
      const maxHint = ensureScrollPort(viewport, content, {
        fullscreen: fullscreenRef.current,
      });
      const { metrics, offset: clamped } = applyScrollOffset({
        viewport,
        content,
        offset,
        mirror: draftRef.current.mirrorMode,
        maxScrollHint: maxHint,
      });
      virtualOffsetRef.current = clamped;
      // Surface for smoke tests / DevTools
      viewport.dataset.tpOffset = String(Math.round(clamped));
      viewport.dataset.tpMaxScroll = String(Math.round(metrics.maxScroll));
      return {
        progress: progressFromMetrics(metrics),
        offset: clamped,
        maxScroll: metrics.maxScroll,
      };
    },
    [],
  );

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    fullscreenRef.current = fullscreen;
  }, [fullscreen]);

  useEffect(() => {
    let cancelled = false;
    const handoff = loadTeleprompterHandoff();

    const load = async () => {
      let source: SourceSnapshot | null = null;
      if (contentId) {
        if (handoff?.sourceContentId === contentId || handoff?.editedScript?.trim()) {
          source = handoff;
        }
        if (!source?.editedScript && !source?.originalScript) {
          try {
            const api = await apiClient<SourceSnapshot>(
              `/content-marketing/teleprompter-source/${encodeURIComponent(contentId)}`,
            );
            source = { ...api, sourceContentId: api.sourceContentId || contentId };
          } catch {
            /* offline / 401 — still use local draft; do not block page */
          }
        }
        if (source) clearTeleprompterHandoff();
      } else if (handoff?.editedScript?.trim()) {
        source = handoff;
        clearTeleprompterHandoff();
      }

      if (cancelled) return;
      const next =
        source?.editedScript?.trim() || source?.originalScript?.trim()
          ? draftFromSource(source)
          : loadTeleprompterDraft() || { ...DEFAULT_TELEPROMPTER_DRAFT };
      setDraft(next);
      draftRef.current = next;
      if (source) saveTeleprompterDraft(next);
      setLoaded(true);
      requestAnimationFrame(() => {
        const pos = next.lastPosition || 0;
        virtualOffsetRef.current = pos;
        const applied = applyOffset(pos);
        setScrollProgress(applied.progress);
      });
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [contentId, applyOffset]);

  useEffect(() => {
    if (!loaded) return;
    // Never write draft while RAF is running — avoids remount thrash
    if (isRunningRef.current) return;
    const timer = window.setTimeout(() => saveTeleprompterDraft(draft), 500);
    return () => window.clearTimeout(timer);
  }, [draft, loaded]);

  /** Invalidate runId + cancel the single RAF loop. Only pause/reset/end/unmount. */
  const stopRafLoop = useCallback((opts?: { clearPlayingState?: boolean }) => {
    runIdRef.current += 1;
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    lastFrameTimeRef.current = null;
    isRunningRef.current = false;
    if (opts?.clearPlayingState !== false) {
      setPlaying(false);
    }
  }, []);

  /**
   * Start RAF immediately (ref-driven). Does not wait for React to flush `playing`.
   * Invalidates any prior loop via runId.
   * Uses native scrollTop (+ transform fallback) so scrollbar stays in sync.
   */
  const startRafLoop = useCallback(() => {
    const container = scrollContainerRef.current;
    const content = scrollContentRef.current;
    if (!container || !content) return;

    // Kill previous loop
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    isRunningRef.current = true;
    lastFrameTimeRef.current = null;
    setPlaying(true);

    // Re-assert port + sync visual to current virtual offset before first frame
    ensureScrollPort(container, content, { fullscreen: fullscreenRef.current });
    // Honor live scrollbar position if user had dragged
    if (container.scrollHeight - container.clientHeight > 24) {
      virtualOffsetRef.current = container.scrollTop;
    }
    applyOffset(virtualOffsetRef.current);

    const tick = (now: number) => {
      if (runIdRef.current !== runId || !isRunningRef.current) {
        rafIdRef.current = null;
        return;
      }
      const el = scrollContainerRef.current;
      const body = scrollContentRef.current;
      if (!el || !body) {
        rafIdRef.current = requestAnimationFrame(tick);
        return;
      }

      const prev = lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;
      const dtSec = prev == null ? 1 / 60 : (now - prev) / 1000;

      const current = draftRef.current;
      const delta = computePxDelta({
        dtSec,
        basePxPerSec: TELEPROMPTER_BASE_SCROLL_PX,
        scrollSpeed: current.scrollSpeed,
        playbackSpeed: current.playbackSpeed,
        rateScale: TELEPROMPTER_SCROLL_RATE_SCALE,
      });

      // Refresh port each frame; adopt native scrollTop so mid-play drag works
      const maxScroll = ensureScrollPort(el, body, { fullscreen: fullscreenRef.current });
      const nativeMax = Math.max(0, el.scrollHeight - el.clientHeight);
      if (nativeMax > 24 && Math.abs(el.scrollTop - virtualOffsetRef.current) > 1.5) {
        // User dragged scrollbar / wheel while playing — continue from that position
        virtualOffsetRef.current = el.scrollTop;
      }
      const nextOffset = Math.min(maxScroll, Math.max(0, virtualOffsetRef.current + delta));
      const applied = applyOffset(nextOffset);

      if (now - progressSavedAt.current > 50) {
        progressSavedAt.current = now;
        setScrollProgress(applied.progress);
      }
      if (now - positionSavedAt.current > 2000) {
        positionSavedAt.current = now;
        draftRef.current = { ...draftRef.current, lastPosition: applied.offset };
      }

      // End only when we can travel and reached the end
      if (applied.maxScroll > 24 && applied.offset >= applied.maxScroll - 2) {
        isRunningRef.current = false;
        rafIdRef.current = null;
        setPlaying(false);
        setScrollProgress(1);
        draftRef.current = { ...draftRef.current, lastPosition: applied.offset };
        return;
      }
      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);
  }, [applyOffset]);

  // Unmount-only cleanup — never cancel RAF from draft/recorder/auth effects
  useEffect(() => {
    return () => {
      stopRafLoop({ clearPlayingState: false });
      if (countdownTimerRef.current !== null) {
        window.clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, [stopRafLoop]);

  useEffect(() => {
    const onFullscreenChange = () =>
      setFullscreen(document.fullscreenElement === runnerRef.current);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  /** Giữ vị trí đọc khi ẩn/hiện form / fullscreen — never while running. */
  useEffect(() => {
    if (!loaded || isRunningRef.current) return;
    const restore = virtualOffsetRef.current || draftRef.current.lastPosition;
    const id = requestAnimationFrame(() => {
      if (!isRunningRef.current) {
        const applied = applyOffset(restore);
        setScrollProgress(applied.progress);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [loaded, showEditor, fullscreen, applyOffset]);

  /** Re-apply mirror / font layout when draft visual settings change (not while playing is required — transform still applied). */
  useEffect(() => {
    if (!loaded || isRunningRef.current) return;
    const applied = applyOffset(virtualOffsetRef.current);
    setScrollProgress(applied.progress);
  }, [draft.mirrorMode, draft.fontSize, draft.lineHeight, draft.contentWidth, loaded, applyOffset]);

  const updateDraft = useCallback((update: Partial<TeleprompterDraft>) => {
    setDraft((previous) => {
      const next = {
        ...previous,
        ...update,
        estimatedDuration:
          update.editedScript === undefined
            ? previous.estimatedDuration
            : estimateDurationSeconds(update.editedScript),
      };
      draftRef.current = next;
      return next;
    });
  }, []);

  const startPlayingScroll = useCallback(() => {
    if (!draftRef.current.editedScript.trim()) return;
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdownLeft(null);
    try {
      runnerRef.current?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    } catch {
      /* ignore */
    }

    const el = scrollContainerRef.current;
    const body = scrollContentRef.current;
    if (!el || !body) return;

    const maxScroll = ensureScrollPort(el, body, { fullscreen: fullscreenRef.current });
    // Restart from top when already at end
    if (maxScroll > 24 && virtualOffsetRef.current >= maxScroll - 4) {
      virtualOffsetRef.current = 0;
      draftRef.current = { ...draftRef.current, lastPosition: 0 };
    }
    applyOffset(virtualOffsetRef.current);

    // Direct RAF — do not wait for React setState
    startRafLoop();
  }, [startRafLoop, applyOffset]);

  const beginPlayback = useCallback(() => {
    if (!draftRef.current.editedScript.trim()) return;
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (isRunningRef.current) return;

    const seconds =
      draftRef.current.countdown === 5 || draftRef.current.countdown === 10
        ? draftRef.current.countdown
        : 3;

    let left = seconds;
    setCountdownLeft(left);
    countdownTimerRef.current = window.setInterval(() => {
      left -= 1;
      if (left <= 0) {
        if (countdownTimerRef.current !== null) {
          window.clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        setCountdownLeft(null);
        startPlayingScroll();
        return;
      }
      setCountdownLeft(left);
    }, 1000);
  }, [startPlayingScroll]);

  /**
   * Prepare for a new take (“Bắt đầu quay”):
   * scroll frame into view, kill RAF, reset offset/progress to start.
   * Does not start scrolling — MediaRecorder countdown may still be running.
   */
  const prepareForRecording = useCallback(() => {
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdownLeft(null);
    // Invalidate prior loop even if mid-script or paused
    stopRafLoop();
    try {
      runnerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      /* ignore */
    }
    virtualOffsetRef.current = 0;
    draftRef.current = { ...draftRef.current, lastPosition: 0 };
    const applied = applyOffset(0);
    setScrollProgress(0);
    // Keep draft lastPosition in React state for “Đã đọc/Còn lại”
    updateDraft({ lastPosition: applied.offset });
  }, [stopRafLoop, applyOffset, updateDraft]);

  /**
   * After recorder countdown: start RAF from the top (always).
   * Safe if prepareForRecording already ran; forces single loop via startRafLoop.
   */
  const playFromStartImmediate = useCallback(() => {
    if (!draftRef.current.editedScript.trim()) return;
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdownLeft(null);
    try {
      runnerRef.current?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    } catch {
      /* ignore */
    }
    const el = scrollContainerRef.current;
    const body = scrollContentRef.current;
    if (!el || !body) return;

    ensureScrollPort(el, body, { fullscreen: fullscreenRef.current });
    virtualOffsetRef.current = 0;
    draftRef.current = { ...draftRef.current, lastPosition: 0 };
    applyOffset(0);
    setScrollProgress(0);
    updateDraft({ lastPosition: 0 });
    // startRafLoop cancels any previous rafId/runId first
    startRafLoop();
  }, [startRafLoop, applyOffset, updateDraft]);

  /** Resume from current virtualOffset — used by recorder pause→resume, not record-start. */
  const playImmediate = useCallback(() => {
    startPlayingScroll();
  }, [startPlayingScroll]);

  const pausePlayback = useCallback(() => {
    const applied = applyOffset(virtualOffsetRef.current);
    updateDraft({ lastPosition: applied.offset });
    setScrollProgress(applied.progress);
    stopRafLoop();
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdownLeft(null);
  }, [stopRafLoop, updateDraft, applyOffset]);

  const reset = useCallback(() => {
    stopRafLoop();
    if (countdownTimerRef.current !== null) window.clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = null;
    setCountdownLeft(null);
    virtualOffsetRef.current = 0;
    const applied = applyOffset(0);
    setScrollProgress(applied.progress);
    updateDraft({ lastPosition: 0 });
  }, [stopRafLoop, updateDraft, applyOffset]);

  const nudgeScroll = useCallback(
    (delta: number) => {
      if (isRunningRef.current) return;
      const el = scrollContainerRef.current;
      const base =
        el && el.scrollHeight - el.clientHeight > 24 ? el.scrollTop : virtualOffsetRef.current;
      const applied = applyOffset(Math.max(0, base + delta));
      setScrollProgress(applied.progress);
      updateDraft({ lastPosition: applied.offset });
    },
    [updateDraft, applyOffset],
  );

  const onScrollContainerScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    // Manual drag/wheel — always sync progress from native scrollTop
    // (While RAF runs it also sets scrollTop; adopting keeps drag usable mid-play.)
    const top = el.scrollTop;
    if (!isRunningRef.current) {
      virtualOffsetRef.current = top;
      const m = {
        scrollTop: top,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        maxScroll: Math.max(0, el.scrollHeight - el.clientHeight),
      };
      setScrollProgress(progressFromMetrics(m));
      if (Date.now() - positionSavedAt.current > 400) {
        positionSavedAt.current = Date.now();
        updateDraft({ lastPosition: top });
      }
    } else if (Math.abs(top - virtualOffsetRef.current) > 1.5) {
      virtualOffsetRef.current = top;
    }
  }, [updateDraft]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await runnerRef.current?.requestFullscreen();
    } catch {
      // Fullscreen may be disabled by the browser or embedding context.
    }
  }, []);

  const applyTool = (tool: (text: string) => string) =>
    updateDraft({ editedScript: tool(draft.editedScript) });

  const totalDuration = useMemo(
    () => estimateDurationSeconds(draft.editedScript),
    [draft.editedScript],
  );
  const readSeconds = Math.round(scrollProgress * totalDuration);
  const remainSeconds = Math.max(0, totalDuration - readSeconds);

  if (!loaded) {
    return <div className="p-6 text-sm text-slate-500">Đang mở Teleprompter…</div>;
  }

  const script = draft.editedScript;
  const canStart = Boolean(script.trim());
  const isCounting = countdownLeft !== null;
  const isPaused = !playing && !isCounting && draft.lastPosition > 0;
  const toolbarBtn =
    'border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700 hover:text-white';
  const portalHost = fullscreen ? runnerRef.current : null;

  return (
    <main className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4 md:p-6">
      {draft.sourceRoute && (
        <a className="w-fit text-sm text-[#0A3D30] underline" href={draft.sourceRoute}>
          ← Quay lại nguồn {draft.sourceTitle ? `· ${draft.sourceTitle}` : ''}
        </a>
      )}

      {showEditor && (
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Chỉnh sửa kịch bản</h2>
            <span className="text-xs tabular-nums text-muted-foreground">
              ~{formatClock(totalDuration)} ước tính
            </span>
          </div>
          <Input
            aria-label="Tiêu đề kịch bản"
            value={draft.title}
            onChange={(event) => updateDraft({ title: event.target.value })}
            placeholder="Tiêu đề kịch bản"
            className="border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => applyTool(stripScriptNoise)}
            >
              Bỏ nhiễu
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => applyTool(autoSplitParagraphs)}
            >
              Tách đoạn
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => applyTool(addBreathMarks)}
            >
              Dấu ngắt hơi
            </Button>
          </div>
          <TeleprompterScriptEditor
            value={script}
            onChange={(editedScript) => updateDraft({ editedScript })}
            fontSize={Math.min(draft.fontSize, 36)}
            lineHeight={draft.lineHeight}
            textAlign="left"
            theme="light"
          />
        </section>
      )}

      <section
        ref={runnerRef}
        className={cn(
          'relative flex min-h-0 flex-col overflow-hidden rounded-xl border-2 border-sky-600 bg-black text-white shadow-sm',
          fullscreen && 'h-screen rounded-none border-0',
        )}
      >
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-slate-800 bg-slate-950 px-3 py-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {!playing && !isCounting && (
              <Button
                type="button"
                size="sm"
                data-tp-action={isPaused ? 'resume' : 'start'}
                onClick={isPaused ? startPlayingScroll : beginPlayback}
                disabled={!canStart}
              >
                <Play className="mr-1 h-3.5 w-3.5" />
                {isPaused ? 'Tiếp tục' : 'Bắt đầu'}
              </Button>
            )}
            {playing && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                data-tp-action="pause"
                onClick={pausePlayback}
              >
                <Pause className="mr-1 h-3.5 w-3.5" />
                Tạm dừng
              </Button>
            )}
            {isCounting && (
              <span className="rounded-md bg-amber-500/90 px-3 py-1.5 text-sm font-semibold text-white">
                Đếm ngược {countdownLeft}s
              </span>
            )}

            <Button
              type="button"
              size="sm"
              variant="outline"
              className={toolbarBtn}
              onClick={reset}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Chạy lại
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={toolbarBtn}
              onClick={() => nudgeScroll(-80)}
            >
              <ArrowUp className="mr-1 h-3.5 w-3.5" />
              Lên
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={toolbarBtn}
              onClick={() => nudgeScroll(80)}
            >
              <ArrowDown className="mr-1 h-3.5 w-3.5" />
              Xuống
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={toolbarBtn}
              onClick={() => updateDraft({ mirrorMode: !draft.mirrorMode })}
            >
              <FlipHorizontal2 className="mr-1 h-3.5 w-3.5" />
              {draft.mirrorMode ? 'Tắt gương' : 'Lật gương'}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={toolbarBtn}
                  data-tp-action="playback-speed"
                  aria-label={`Tốc độ phát ${formatTeleprompterPlaybackSpeed(draft.playbackSpeed)}`}
                >
                  <span className="hidden sm:inline">
                    Tốc độ {formatTeleprompterPlaybackSpeed(draft.playbackSpeed)}
                  </span>
                  <span className="sm:hidden">
                    {formatTeleprompterPlaybackSpeed(draft.playbackSpeed)}
                  </span>
                  <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-70" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={6}
                container={portalHost}
                className="z-[200] min-w-[9.5rem] border-slate-700 bg-slate-900 text-slate-50"
                onCloseAutoFocus={(event) => event.preventDefault()}
              >
                {TELEPROMPTER_PLAYBACK_SPEEDS.map((speed) => (
                  <DropdownMenuItem
                    key={speed}
                    className={cn(
                      'cursor-pointer focus:bg-slate-800 focus:text-white',
                      draft.playbackSpeed === speed && 'bg-slate-800',
                    )}
                    onSelect={() =>
                      updateDraft({ playbackSpeed: speed as TeleprompterPlaybackSpeed })
                    }
                  >
                    {formatTeleprompterPlaybackSpeed(speed)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={toolbarBtn}
                  data-tp-action="font-size"
                  aria-label={`Cỡ chữ ${formatTeleprompterFontSize(draft.fontSize)}`}
                >
                  <span className="hidden sm:inline">
                    Cỡ chữ {formatTeleprompterFontSize(draft.fontSize)}
                  </span>
                  <span className="sm:hidden">{formatTeleprompterFontSize(draft.fontSize)}</span>
                  <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-70" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={6}
                container={portalHost}
                className="z-[200] min-w-[9.5rem] border-slate-700 bg-slate-900 text-slate-50"
                onCloseAutoFocus={(event) => event.preventDefault()}
              >
                {TELEPROMPTER_FONT_SIZES.map((size) => (
                  <DropdownMenuItem
                    key={size}
                    className={cn(
                      'cursor-pointer focus:bg-slate-800 focus:text-white',
                      normalizeTeleprompterFontSize(draft.fontSize) === size && 'bg-slate-800',
                    )}
                    onSelect={() => updateDraft({ fontSize: size })}
                  >
                    {formatTeleprompterFontSize(size)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <label
              className="flex h-8 shrink-0 items-center gap-2 rounded-md border border-slate-600 bg-slate-800 px-2 text-slate-100"
              title="Kéo để mở rộng khung chữ"
            >
              <span className="hidden whitespace-nowrap text-xs sm:inline">Rộng khung</span>
              <input
                type="range"
                min={400}
                max={1600}
                step={20}
                value={Math.min(1600, Math.max(400, draft.contentWidth || 720))}
                onChange={(event) =>
                  updateDraft({ contentWidth: Number(event.target.value) || 720 })
                }
                className="h-1.5 w-20 cursor-pointer accent-sky-400 sm:w-28"
                aria-label="Độ rộng khung nội dung kịch bản"
                data-tp-action="content-width"
              />
              <span className="w-9 text-right text-[11px] tabular-nums text-slate-300">
                {Math.min(1600, Math.max(400, draft.contentWidth || 720))}
              </span>
            </label>

            <Button
              type="button"
              size="sm"
              variant="outline"
              className={toolbarBtn}
              onClick={() => void toggleFullscreen()}
            >
              {fullscreen ? (
                <>
                  <Minimize2 className="mr-1 h-3.5 w-3.5" />
                  Thoát full
                </>
              ) : (
                <>
                  <Maximize2 className="mr-1 h-3.5 w-3.5" />
                  Toàn màn hình
                </>
              )}
            </Button>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-slate-200 hover:bg-slate-800 hover:text-white"
              onClick={() => setShowEditor((value) => !value)}
            >
              {showEditor ? (
                <>
                  <EyeOff className="mr-1 h-3.5 w-3.5" />
                  Ẩn form chỉnh sửa
                </>
              ) : (
                <>
                  <Eye className="mr-1 h-3.5 w-3.5" />
                  Hiện form chỉnh sửa
                </>
              )}
            </Button>
          </div>

          <div className="ml-auto flex shrink-0 flex-wrap gap-3 text-xs font-medium tabular-nums text-slate-300">
            <span>Đã đọc {formatClock(readSeconds)}</span>
            <span>Còn lại {formatClock(remainSeconds)}</span>
            <span>Tổng thời lượng {formatClock(totalDuration)}</span>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 bg-black">
          {isCounting && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/70">
              <span className="text-7xl font-bold text-white drop-shadow-sm sm:text-8xl">
                {countdownLeft}
              </span>
            </div>
          )}
          <div
            ref={scrollContainerRef}
            data-tp-scroll-container
            className={cn(
              'min-h-0 overflow-y-auto overscroll-contain px-4 py-16 sm:px-8',
              fullscreen ? 'h-full' : 'h-[min(62vh,640px)]',
            )}
            style={{
              height: fullscreen ? '100%' : 'min(62vh, 640px)',
              maxHeight: fullscreen ? '100%' : 'min(62vh, 640px)',
              overflowY: 'auto',
              overflowX: 'hidden',
              position: 'relative',
              WebkitOverflowScrolling: 'touch',
              backgroundColor: '#000000',
            }}
            onScroll={onScrollContainerScroll}
          >
            <div
              ref={scrollContentRef}
              data-tp-scroll-content
              className="mx-auto w-full select-none text-white"
              style={{
                fontSize: `${draft.fontSize}px`,
                lineHeight: draft.lineHeight,
                maxWidth: `${Math.min(1600, Math.max(400, draft.contentWidth || 720))}px`,
                width: '100%',
                textAlign: 'center',
                fontWeight: 600,
                letterSpacing: '0.01em',
                color: '#ffffff',
                // Tall content so native scrollbar always appears for long scripts
                paddingBottom: '140vh',
                minHeight: '160vh',
              }}
            >
              {draft.title ? (
                <p className="mb-8 text-base font-normal text-white/70">{draft.title}</p>
              ) : null}
              {script ? (
                script.split('\n').map((line, index) => (
                  <p key={`${index}-${line.slice(0, 24)}`} className="mb-6 min-h-[1em] text-white">
                    {parseScriptLine(line).map((segment, segmentIndex) =>
                      segment.emphasis ? (
                        <strong key={segmentIndex} className="font-bold text-amber-300">
                          {segment.text}
                        </strong>
                      ) : (
                        <span key={segmentIndex} className="text-white">
                          {segment.text}
                        </span>
                      ),
                    )}
                  </p>
                ))
              ) : (
                <p className="text-lg font-normal text-white/50">
                  Chưa có nội dung. Dán kịch bản ở form chỉnh sửa hoặc mở từ “Làm video”.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <Tabs
        value={studioTab}
        onValueChange={(v) => setStudioTab(v as 'record' | 'library')}
        className="w-full"
      >
        <TabsList className="mb-3">
          <TabsTrigger value="record">Quay video</TabsTrigger>
          <TabsTrigger value="library">Video đã quay</TabsTrigger>
        </TabsList>
        <TabsContent value="record" className="mt-0">
          <TeleprompterRecorder
            onSyncPrepareForRecord={prepareForRecording}
            onSyncPlayFromStart={playFromStartImmediate}
            onSyncPlay={playImmediate}
            onSyncPause={pausePlayback}
            teleprompterSourceId={draft.sourceContentId || contentId}
            scriptTitle={draft.title || draft.sourceTitle}
            onSavedToSystem={() => {
              setLibraryRefresh((n) => n + 1);
              setStudioTab('library');
            }}
          />
        </TabsContent>
        <TabsContent value="library" className="mt-0">
          <TeleprompterRecordingsLibrary refreshToken={libraryRefresh} />
        </TabsContent>
      </Tabs>
    </main>
  );
}

export default TeleprompterStudio;
