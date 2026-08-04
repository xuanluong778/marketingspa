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
import { Button } from '@/components/ui/button';
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

function readScrollProgress(el: HTMLDivElement | null): number {
  if (!el) return 0;
  const max = el.scrollHeight - el.clientHeight;
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, el.scrollTop / max));
}

export function TeleprompterStudio() {
  const searchParams = useSearchParams();
  const contentId = searchParams.get('contentId');
  const [draft, setDraft] = useState<TeleprompterDraft>(DEFAULT_TELEPROMPTER_DRAFT);
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [countdownLeft, setCountdownLeft] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  /** Form tiêu đề/kịch bản mặc định ẩn — chỉ mở khi bấm “Hiện form chỉnh sửa”. */
  const [showEditor, setShowEditor] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const runnerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const draftRef = useRef(draft);
  const playingRef = useRef(false);
  const positionSavedAt = useRef(0);
  const progressSavedAt = useRef(0);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

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
            /* keep null — fall through to draft */
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
        if (scrollRef.current) {
          scrollRef.current.scrollTop = next.lastPosition;
          setScrollProgress(readScrollProgress(scrollRef.current));
        }
      });
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [contentId]);

  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(() => saveTeleprompterDraft(draft), 500);
    return () => window.clearTimeout(timer);
  }, [draft, loaded]);

  const stopScroll = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastFrameRef.current = null;
  }, []);

  useEffect(() => {
    if (!playing) {
      stopScroll();
      return;
    }
    const tick = (now: number) => {
      const container = scrollRef.current;
      const current = draftRef.current;
      if (!container || !playingRef.current) return;
      const dt = Math.min(100, now - (lastFrameRef.current ?? now)) / 1000;
      lastFrameRef.current = now;
      const pxPerSecond =
        TELEPROMPTER_BASE_SCROLL_PX *
        (current.scrollSpeed / 80) *
        current.playbackSpeed *
        TELEPROMPTER_SCROLL_RATE_SCALE;
      container.scrollTop += pxPerSecond * dt;
      if (now - progressSavedAt.current > 250) {
        progressSavedAt.current = now;
        setScrollProgress(readScrollProgress(container));
      }
      if (now - positionSavedAt.current > 1000) {
        positionSavedAt.current = now;
        const updated = { ...current, lastPosition: container.scrollTop };
        draftRef.current = updated;
        setDraft(updated);
      }
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 2) {
        setPlaying(false);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return stopScroll;
  }, [playing, stopScroll]);

  useEffect(
    () => () => {
      stopScroll();
      if (countdownTimerRef.current !== null) window.clearInterval(countdownTimerRef.current);
    },
    [stopScroll],
  );

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(document.fullscreenElement === runnerRef.current);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  /** Giữ vị trí đọc khi ẩn/hiện form hoặc đổi kích thước — không reset scroll. */
  useEffect(() => {
    if (!loaded) return;
    const el = scrollRef.current;
    if (!el) return;
    const restore = el.scrollTop || draftRef.current.lastPosition;
    const id = requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = restore;
        setScrollProgress(readScrollProgress(scrollRef.current));
      }
    });
    return () => cancelAnimationFrame(id);
  }, [loaded, showEditor, fullscreen]);

  const updateDraft = useCallback((update: Partial<TeleprompterDraft>) => {
    setDraft((previous) => ({
      ...previous,
      ...update,
      estimatedDuration:
        update.editedScript === undefined
          ? previous.estimatedDuration
          : estimateDurationSeconds(update.editedScript),
    }));
  }, []);

  const beginPlayback = useCallback(() => {
    if (!draft.editedScript.trim()) return;
    if (countdownLeft !== null) return;
    setCountdownLeft(draft.countdown);
    countdownTimerRef.current = window.setInterval(() => {
      setCountdownLeft((value) => {
        if (value === null || value <= 1) {
          if (countdownTimerRef.current !== null) window.clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
          setPlaying(true);
          return null;
        }
        return value - 1;
      });
    }, 1000);
  }, [countdownLeft, draft.countdown, draft.editedScript]);

  const pausePlayback = useCallback(() => {
    if (scrollRef.current) {
      updateDraft({ lastPosition: scrollRef.current.scrollTop });
      setScrollProgress(readScrollProgress(scrollRef.current));
    }
    setPlaying(false);
  }, [updateDraft]);

  const reset = useCallback(() => {
    stopScroll();
    if (countdownTimerRef.current !== null) window.clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = null;
    setPlaying(false);
    setCountdownLeft(null);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setScrollProgress(0);
    updateDraft({ lastPosition: 0 });
  }, [stopScroll, updateDraft]);

  const nudgeScroll = useCallback(
    (delta: number) => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop += delta;
      setScrollProgress(readScrollProgress(el));
      updateDraft({ lastPosition: el.scrollTop });
    },
    [updateDraft],
  );

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
  const portalHost = fullscreen ? runnerRef.current : null;
  const toolbarBtnDark =
    'border-white/20 bg-black/20 text-white hover:bg-white/10 hover:text-white';

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
            <Button type="button" size="sm" variant="outline" onClick={() => applyTool(stripScriptNoise)}>
              Bỏ nhiễu
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => applyTool(autoSplitParagraphs)}>
              Tách đoạn
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => applyTool(addBreathMarks)}>
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
          'relative flex min-h-0 flex-col overflow-hidden rounded-xl border-2 border-sky-500 bg-[#050505] text-white shadow-sm',
          fullscreen && 'h-screen rounded-none border-0',
        )}
      >
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-white/10 px-3 py-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {!playing && !isCounting && (
              <Button
                type="button"
                size="sm"
                data-tp-action={isPaused ? 'resume' : 'start'}
                onClick={isPaused ? () => setPlaying(true) : beginPlayback}
                disabled={!canStart}
              >
                <Play className="mr-1 h-3.5 w-3.5" />
                {isPaused ? 'Tiếp tục' : 'Bắt đầu'}
              </Button>
            )}
            {playing && (
              <Button type="button" size="sm" variant="secondary" data-tp-action="pause" onClick={pausePlayback}>
                <Pause className="mr-1 h-3.5 w-3.5" />
                Tạm dừng
              </Button>
            )}
            {isCounting && (
              <span className="rounded-md bg-amber-500/90 px-3 py-1.5 text-sm font-semibold text-white">
                Đếm ngược {countdownLeft}s
              </span>
            )}

            <Button type="button" size="sm" variant="outline" className={toolbarBtnDark} onClick={reset}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Chạy lại
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={toolbarBtnDark}
              onClick={() => nudgeScroll(-80)}
            >
              <ArrowUp className="mr-1 h-3.5 w-3.5" />
              Lên
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={toolbarBtnDark}
              onClick={() => nudgeScroll(80)}
            >
              <ArrowDown className="mr-1 h-3.5 w-3.5" />
              Xuống
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={toolbarBtnDark}
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
                  className={toolbarBtnDark}
                  data-tp-action="playback-speed"
                  aria-label={`Tốc độ phát ${formatTeleprompterPlaybackSpeed(draft.playbackSpeed)}`}
                >
                  <span className="hidden sm:inline">
                    Tốc độ {formatTeleprompterPlaybackSpeed(draft.playbackSpeed)}
                  </span>
                  <span className="sm:hidden">{formatTeleprompterPlaybackSpeed(draft.playbackSpeed)}</span>
                  <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-70" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={6}
                container={portalHost}
                className="z-[200] min-w-[9.5rem] border-white/15 bg-zinc-950 text-zinc-50"
                onCloseAutoFocus={(event) => event.preventDefault()}
              >
                {TELEPROMPTER_PLAYBACK_SPEEDS.map((speed) => (
                  <DropdownMenuItem
                    key={speed}
                    className={cn(
                      'cursor-pointer focus:bg-white/10 focus:text-white',
                      draft.playbackSpeed === speed && 'bg-white/5',
                    )}
                    onSelect={() => updateDraft({ playbackSpeed: speed as TeleprompterPlaybackSpeed })}
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
                  className={toolbarBtnDark}
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
                className="z-[200] min-w-[9.5rem] border-white/15 bg-zinc-950 text-zinc-50"
                onCloseAutoFocus={(event) => event.preventDefault()}
              >
                {TELEPROMPTER_FONT_SIZES.map((size) => (
                  <DropdownMenuItem
                    key={size}
                    className={cn(
                      'cursor-pointer focus:bg-white/10 focus:text-white',
                      normalizeTeleprompterFontSize(draft.fontSize) === size && 'bg-white/5',
                    )}
                    onSelect={() => updateDraft({ fontSize: size })}
                  >
                    {formatTeleprompterFontSize(size)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              type="button"
              size="sm"
              variant="outline"
              className={toolbarBtnDark}
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
              className="text-white hover:bg-white/10 hover:text-white"
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

          <div className="ml-auto flex shrink-0 flex-wrap gap-3 text-xs font-medium tabular-nums text-white/80">
            <span>Đã đọc {formatClock(readSeconds)}</span>
            <span>Còn lại {formatClock(remainSeconds)}</span>
            <span>Tổng thời lượng {formatClock(totalDuration)}</span>
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
          {isCounting && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/40">
              <span className="text-7xl font-bold text-white drop-shadow-lg sm:text-8xl">{countdownLeft}</span>
            </div>
          )}
          <div
            ref={scrollRef}
            className={cn(
              'min-h-0 overflow-y-scroll overscroll-contain px-4 py-16 sm:px-8',
              fullscreen ? 'h-full' : 'h-[min(62vh,640px)]',
            )}
            onScroll={() => {
              const el = scrollRef.current;
              if (!el) return;
              setScrollProgress(readScrollProgress(el));
              if (!playing) updateDraft({ lastPosition: el.scrollTop });
            }}
          >
            <div
              className="mx-auto select-none"
              style={{
                fontSize: `${draft.fontSize}px`,
                lineHeight: draft.lineHeight,
                maxWidth: draft.contentWidth,
                transform: draft.mirrorMode ? 'scaleX(-1)' : undefined,
                textAlign: 'center',
                fontWeight: 600,
                letterSpacing: '0.01em',
                paddingBottom: 'max(80vh, 480px)',
                minHeight: 'calc(100% + 80vh)',
              }}
            >
              {draft.title ? (
                <p className="mb-8 text-base font-normal opacity-60">{draft.title}</p>
              ) : null}
              {script ? (
                script.split('\n').map((line, index) => (
                  <p key={`${index}-${line.slice(0, 24)}`} className="mb-6 min-h-[1em]">
                    {parseScriptLine(line).map((segment, segmentIndex) =>
                      segment.emphasis ? (
                        <strong key={segmentIndex} className="text-orange-400">
                          {segment.text}
                        </strong>
                      ) : (
                        <span key={segmentIndex}>{segment.text}</span>
                      ),
                    )}
                  </p>
                ))
              ) : (
                <p className="text-lg font-normal opacity-50">
                  Chưa có nội dung. Dán kịch bản ở form chỉnh sửa hoặc mở từ “Làm video”.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default TeleprompterStudio;
