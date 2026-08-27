/**
 * Pure helpers for Teleprompter auto-scroll (unit-testable, minimal DOM).
 *
 * Primary movement uses a virtual offset + CSS transform so auto-scroll works
 * even when native scrollHeight === clientHeight (common when parent layouts
 * expand the "viewport" or overflow styles fail).
 */

export type ScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  maxScroll: number;
};

export type ScrollPort = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

export function readScrollMetrics(el: ScrollPort): ScrollMetrics {
  const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
  return {
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    maxScroll,
  };
}

export function computePxDelta(args: {
  dtSec: number;
  basePxPerSec: number;
  scrollSpeed: number;
  playbackSpeed: number;
  rateScale?: number;
}): number {
  const speed = Number(args.playbackSpeed) > 0 ? Number(args.playbackSpeed) : 1;
  const scrollSpeed = Number(args.scrollSpeed) > 0 ? Number(args.scrollSpeed) : 80;
  const rate = args.rateScale ?? 1;
  const pxPerSecond = Math.max(12, args.basePxPerSec * (scrollSpeed / 80) * speed * rate);
  const dt = args.dtSec > 0 ? Math.min(0.05, args.dtSec) : 1 / 60;
  return pxPerSecond * dt;
}

export function progressFromMetrics(m: ScrollMetrics): number {
  if (m.maxScroll <= 0) return 0;
  return Math.min(1, Math.max(0, m.scrollTop / m.maxScroll));
}

export function shouldStopScroll(m: ScrollMetrics, pad = 2): boolean {
  return m.maxScroll > 24 && m.scrollTop >= m.maxScroll - pad;
}

/**
 * Mutates a scrollTop-like container. Returns next metrics + whether content ended.
 * Note: when maxScroll is 0 this cannot move — prefer advanceVirtualOffset.
 */
export function advanceScrollTop(
  el: ScrollPort,
  deltaPx: number,
): { metrics: ScrollMetrics; ended: boolean; nextTop: number } {
  const metrics = readScrollMetrics(el);
  if (metrics.maxScroll <= 0) {
    return { metrics, ended: false, nextTop: metrics.scrollTop };
  }
  const nextTop = Math.min(metrics.maxScroll, Math.max(0, metrics.scrollTop + deltaPx));
  el.scrollTop = nextTop;
  const after = readScrollMetrics(el);
  return { metrics: after, ended: shouldStopScroll(after), nextTop };
}

/** Clamp virtual offset into travel range. */
export function clampOffset(offset: number, maxScroll: number): number {
  if (maxScroll <= 0) return 0;
  return Math.min(maxScroll, Math.max(0, offset));
}

/**
 * Measure travel from viewport + content box sizes (works without overflow).
 */
export function measureVirtualMaxScroll(viewportH: number, contentH: number): number {
  return Math.max(0, contentH - viewportH);
}

/**
 * Advance virtual offset; maxScroll of 0 leaves offset at 0 and does not end.
 */
export function advanceVirtualOffset(
  offset: number,
  deltaPx: number,
  maxScroll: number,
): { nextOffset: number; metrics: ScrollMetrics; ended: boolean } {
  const nextOffset = clampOffset(offset + deltaPx, maxScroll);
  const metrics: ScrollMetrics = {
    scrollTop: nextOffset,
    scrollHeight: maxScroll + 1,
    clientHeight: 1,
    maxScroll,
  };
  return {
    nextOffset,
    metrics,
    ended: shouldStopScroll(metrics),
  };
}

/**
 * Apply viewport constraints + ensure content taller than viewport.
 * Returns live maxScroll after measurement/adjustment.
 * Uses native overflow scroll so the browser scrollbar + wheel/drag work;
 * RAF writes scrollTop (transform only as last-resort fallback).
 */
export function ensureScrollPort(
  viewport: {
    style: CSSStyleDeclaration;
    clientHeight: number;
    scrollHeight?: number;
  },
  content: {
    style: CSSStyleDeclaration;
    offsetHeight: number;
    scrollHeight: number;
  },
  opts?: { fullscreen?: boolean; windowInnerHeight?: number },
): number {
  const winH =
    opts?.windowInnerHeight ?? (typeof window !== 'undefined' ? window.innerHeight : 800);
  const fullscreen = opts?.fullscreen ?? false;

  if (fullscreen) {
    viewport.style.height = '100%';
    viewport.style.maxHeight = '100%';
  } else {
    const h = `min(62vh, 640px)`;
    viewport.style.height = h;
    viewport.style.maxHeight = h;
  }

  // Native scrollport — scrollbar + wheel/drag (do not use overflow:hidden)
  viewport.style.overflowY = 'auto';
  viewport.style.overflowX = 'hidden';
  viewport.style.position = viewport.style.position || 'relative';
  try {
    viewport.style.setProperty('-webkit-overflow-scrolling', 'touch');
  } catch {
    /* ignore */
  }

  let viewH = viewport.clientHeight;
  if (viewH < 80) {
    viewH = Math.min(winH * 0.62, 640);
  }

  // Always enforce enough travel so RAF can move even when layout is late
  const forcedMin = Math.ceil(viewH + winH * 1.25);
  const contentH = Math.max(content.offsetHeight, content.scrollHeight);
  if (contentH <= viewH + 48) {
    content.style.minHeight = `${forcedMin}px`;
    content.style.paddingBottom = `${Math.ceil(viewH + winH)}px`;
  }

  const afterH = Math.max(content.offsetHeight, content.scrollHeight, contentH, forcedMin);
  const virtualMax = Math.max(24, measureVirtualMaxScroll(viewH, afterH));
  const nativeMax =
    typeof viewport.scrollHeight === 'number' ? Math.max(0, viewport.scrollHeight - viewH) : 0;
  return Math.max(virtualMax, nativeMax, 24);
}

/**
 * Write offset: prefer native scrollTop (scrollbar tracks correctly).
 * Transform translateY only if the browser cannot move scrollTop.
 * Mirror always via scaleX on content (never double-moves travel).
 */
export function applyScrollOffset(args: {
  viewport: { scrollTop: number; clientHeight: number; scrollHeight?: number };
  content: { style: CSSStyleDeclaration; offsetHeight: number; scrollHeight: number };
  offset: number;
  mirror?: boolean;
  /** Optional pre-measured maxScroll from ensureScrollPort */
  maxScrollHint?: number;
}): { metrics: ScrollMetrics; offset: number; mode: 'native' | 'transform' } {
  let viewH = args.viewport.clientHeight;
  if (viewH < 80 && typeof window !== 'undefined') {
    viewH = Math.min(window.innerHeight * 0.62, 640);
  }
  viewH = Math.max(1, viewH);

  const contentH = Math.max(args.content.offsetHeight, args.content.scrollHeight, viewH + 200);
  const measuredNative =
    typeof args.viewport.scrollHeight === 'number'
      ? Math.max(0, args.viewport.scrollHeight - viewH)
      : 0;
  const maxScroll = Math.max(
    measureVirtualMaxScroll(viewH, contentH),
    args.maxScrollHint ?? 0,
    measuredNative,
    24,
  );
  const offset = clampOffset(args.offset, maxScroll);
  const mirrorPart = args.mirror ? 'scaleX(-1)' : '';

  // Try native first so the scrollbar thumb moves with auto-play and drag works
  let mode: 'native' | 'transform' = 'native';
  try {
    args.viewport.scrollTop = offset;
  } catch {
    /* ignore */
  }

  const appliedTop = typeof args.viewport.scrollTop === 'number' ? args.viewport.scrollTop : 0;
  const nativeWorked = Math.abs(appliedTop - offset) <= 2 && measuredNative > 24;

  if (nativeWorked) {
    // Keep transform free for mirror only — no translateY (avoid double scroll)
    args.content.style.transform = mirrorPart || 'none';
    args.content.style.willChange = mirrorPart ? 'transform' : 'auto';
  } else {
    // Fallback: transform drive (still keep overflow:auto so track can appear after layout)
    mode = 'transform';
    const t = `translate3d(0, ${-offset}px, 0)${mirrorPart ? ` ${mirrorPart}` : ''}`;
    args.content.style.transform = t;
    args.content.style.willChange = 'transform';
    try {
      args.viewport.scrollTop = offset;
    } catch {
      /* ignore */
    }
  }

  return {
    offset,
    mode,
    metrics: {
      scrollTop: offset,
      scrollHeight: viewH + maxScroll,
      clientHeight: viewH,
      maxScroll,
    },
  };
}

/** Simulate RAF clock for regression tests (no browser). */
export function simulateScrollRun(args: {
  height: number;
  clientHeight: number;
  frames: number;
  frameDtSec: number;
  basePxPerSec: number;
  scrollSpeed: number;
  playbackSpeed: number;
  startTop?: number;
}): { scrollTops: number[]; finalTop: number; progress: number[] } {
  const maxScroll = measureVirtualMaxScroll(args.clientHeight, args.height);
  let offset = args.startTop ?? 0;
  const scrollTops: number[] = [offset];
  const progress: number[] = [
    progressFromMetrics({
      scrollTop: offset,
      scrollHeight: args.height,
      clientHeight: args.clientHeight,
      maxScroll,
    }),
  ];

  for (let i = 0; i < args.frames; i++) {
    const delta = computePxDelta({
      dtSec: args.frameDtSec,
      basePxPerSec: args.basePxPerSec,
      scrollSpeed: args.scrollSpeed,
      playbackSpeed: args.playbackSpeed,
    });
    const res = advanceVirtualOffset(offset, delta, maxScroll);
    offset = res.nextOffset;
    scrollTops.push(offset);
    progress.push(
      progressFromMetrics({
        scrollTop: offset,
        scrollHeight: args.height,
        clientHeight: args.clientHeight,
        maxScroll,
      }),
    );
    if (res.ended) break;
  }
  return { scrollTops, finalTop: offset, progress };
}
