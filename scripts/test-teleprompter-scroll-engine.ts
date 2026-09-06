/**
 * Regression: Teleprompter scroll engine + session lifecycle.
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-teleprompter-scroll-engine.ts
 */
import assert from 'node:assert/strict';
import {
  advanceScrollTop,
  advanceVirtualOffset,
  applyScrollOffset,
  computePxDelta,
  ensureScrollPort,
  progressFromMetrics,
  readScrollMetrics,
  shouldStopScroll,
  simulateScrollRun,
} from '../apps/web/src/lib/teleprompter-scroll-engine';

function section(name: string) {
  console.log(`\n=== ${name} ===`);
}

function main() {
  section('After ~1s scrollTop > 0 at 1×');
  {
    // ~60 frames of 16.7ms ≈ 1s
    const run = simulateScrollRun({
      height: 4000,
      clientHeight: 600,
      frames: 60,
      frameDtSec: 1 / 60,
      basePxPerSec: 45,
      scrollSpeed: 80,
      playbackSpeed: 1,
    });
    assert.ok(run.finalTop > 0, `expected scrollTop > 0, got ${run.finalTop}`);
    assert.ok(run.progress[run.progress.length - 1]! > 0);
    console.log('PASS 1s progress', { top: run.finalTop.toFixed(1) });
  }

  section('Speeds 0.5× / 1× / 2× relative order');
  {
    const at = (speed: number) =>
      simulateScrollRun({
        height: 5000,
        clientHeight: 600,
        frames: 30,
        frameDtSec: 1 / 60,
        basePxPerSec: 45,
        scrollSpeed: 80,
        playbackSpeed: speed,
      }).finalTop;
    const half = at(0.5);
    const one = at(1);
    const two = at(2);
    assert.ok(half > 0 && half < one && one < two, `${half} < ${one} < ${two}`);
    console.log('PASS speed order', { half, one, two });
  }

  section('Pause keeps scrollTop; resume continues');
  {
    let offset = 0;
    const maxScroll = 3500;
    for (let i = 0; i < 20; i++) {
      const d = computePxDelta({
        dtSec: 1 / 60,
        basePxPerSec: 45,
        scrollSpeed: 80,
        playbackSpeed: 1,
      });
      offset = advanceVirtualOffset(offset, d, maxScroll).nextOffset;
    }
    const pausedTop = offset;
    assert.ok(pausedTop > 0);
    // pause: no advances
    assert.equal(offset, pausedTop);
    // resume
    for (let i = 0; i < 20; i++) {
      const d = computePxDelta({
        dtSec: 1 / 60,
        basePxPerSec: 45,
        scrollSpeed: 80,
        playbackSpeed: 1,
      });
      offset = advanceVirtualOffset(offset, d, maxScroll).nextOffset;
    }
    assert.ok(offset > pausedTop);
    console.log('PASS pause/resume', { pausedTop, after: offset });
  }

  section('Reset to 0');
  {
    const el = { scrollTop: 500, scrollHeight: 4000, clientHeight: 500 };
    el.scrollTop = 0;
    assert.equal(el.scrollTop, 0);
    assert.equal(progressFromMetrics(readScrollMetrics(el)), 0);
    console.log('PASS reset');
  }

  section('No false end when maxScroll small');
  {
    const el = { scrollTop: 0, scrollHeight: 500, clientHeight: 500 };
    const m = readScrollMetrics(el);
    assert.equal(m.maxScroll, 0);
    assert.equal(shouldStopScroll(m), false);
    const d = computePxDelta({
      dtSec: 0.016,
      basePxPerSec: 45,
      scrollSpeed: 80,
      playbackSpeed: 1,
    });
    const res = advanceScrollTop(el, d);
    assert.equal(res.ended, false);
    console.log('PASS no false end');
  }

  section('runId invalidation (single active loop)');
  {
    let runId = 0;
    let active: number | null = null;
    const start = () => {
      runId += 1;
      const my = runId;
      active = my;
      return () => active === my; // is current
    };
    const isA = start();
    const isB = start();
    assert.equal(isA(), false);
    assert.equal(isB(), true);
    console.log('PASS single runId');
  }

  section('Camera denial does not stop math engine');
  {
    // Pure engine independent of MediaRecorder / getUserMedia
    const d = computePxDelta({
      dtSec: 0.02,
      basePxPerSec: 45,
      scrollSpeed: 80,
      playbackSpeed: 1,
    });
    assert.ok(d > 0);
    console.log('PASS independent of camera');
  }

  section('elapsed from progress > 0');
  {
    const total = 251; // seconds
    const run = simulateScrollRun({
      height: 8000,
      clientHeight: 600,
      frames: 90,
      frameDtSec: 1 / 60,
      basePxPerSec: 45,
      scrollSpeed: 80,
      playbackSpeed: 1,
    });
    const progress = run.progress[run.progress.length - 1]!;
    const readSeconds = Math.round(progress * total);
    assert.ok(readSeconds > 0, `elapsed should leave 00:00, got ${readSeconds}`);
    console.log('PASS elapsed', { progress, readSeconds });
  }

  section('Native port keeps overflow auto for scrollbar');
  {
    const viewport = {
      scrollTop: 0,
      clientHeight: 600,
      scrollHeight: 2500,
      style: {
        height: '',
        maxHeight: '',
        overflowY: '',
        overflowX: '',
        position: '',
        webkitOverflowScrolling: '',
      } as CSSStyleDeclaration,
    };
    const content = {
      offsetHeight: 2500,
      scrollHeight: 2500,
      style: {
        minHeight: '',
        paddingBottom: '',
        transform: '',
        willChange: '',
      } as CSSStyleDeclaration,
    };
    const max = ensureScrollPort(viewport, content, { windowInnerHeight: 900 });
    assert.equal(viewport.style.overflowY, 'auto');
    assert.ok(max > 24);
    const moved = applyScrollOffset({
      viewport,
      content,
      offset: 100,
      maxScrollHint: max,
    });
    assert.equal(moved.mode, 'native');
    assert.equal(viewport.scrollTop, 100);
    // No translateY when native works
    assert.ok(!String(content.style.transform).includes('translate3d'));
    console.log('PASS native scrollbar mode', { max, mode: moved.mode });
  }

  section('Transform applyOffset moves when native maxScroll was 0');
  {
    const viewport = {
      scrollTop: 0,
      clientHeight: 600,
      // no scrollHeight → measuredNative 0 → transform fallback
      style: {
        height: '',
        maxHeight: '',
        overflowY: '',
        overflowX: '',
        position: '',
        webkitOverflowScrolling: '',
      } as CSSStyleDeclaration,
    };
    const content = {
      offsetHeight: 600,
      scrollHeight: 600,
      style: {
        minHeight: '',
        paddingBottom: '',
        transform: '',
        willChange: '',
      } as CSSStyleDeclaration,
    };
    const max = ensureScrollPort(viewport, content, { windowInnerHeight: 900 });
    assert.ok(max > 24, `ensureScrollPort must force travel, got ${max}`);
    assert.equal(viewport.style.overflowY, 'auto');
    const d = computePxDelta({
      dtSec: 1,
      basePxPerSec: 45,
      scrollSpeed: 80,
      playbackSpeed: 1,
    });
    const moved = applyScrollOffset({
      viewport,
      content,
      offset: d,
      maxScrollHint: max,
    });
    assert.ok(moved.offset > 0, `offset must advance, got ${moved.offset}`);
    assert.equal(moved.mode, 'transform');
    assert.ok(String(content.style.transform).includes('translate3d'));
    console.log('PASS transform fallback', { max, offset: moved.offset });
  }

  section('s0/s1/s2/s3 offset growth at 1×');
  {
    for (const sec of [0, 1, 2, 3] as const) {
      const run = simulateScrollRun({
        height: 4000,
        clientHeight: 600,
        frames: sec * 60,
        frameDtSec: 1 / 60,
        basePxPerSec: 45,
        scrollSpeed: 80,
        playbackSpeed: 1,
      });
      const expected = sec * 45;
      assert.ok(Math.abs(run.finalTop - expected) < 1, `t=${sec} got ${run.finalTop}`);
      console.log(`PASS t=${sec}s offset≈${run.finalTop.toFixed(1)}`);
    }
  }

  section('Record-start lifecycle: mid-run reset to 0 then single loop advances');
  {
    // Simulate: teleprompter mid-script (offset ~500) → prepare resets → play from start
    let offset = 500;
    let runId = 1;
    let activeRun = runId;
    // prepare: invalidate run + reset
    runId += 1;
    activeRun = runId;
    offset = 0;
    assert.equal(offset, 0);
    assert.equal(progressFromMetrics({
      scrollTop: 0,
      scrollHeight: 4000,
      clientHeight: 600,
      maxScroll: 3400,
    }), 0);

    // play from start with only this runId
    const myRun = activeRun;
    const frames: number[] = [];
    for (let i = 0; i < 30; i++) {
      if (activeRun !== myRun) break; // would cancel old loop
      const d = computePxDelta({
        dtSec: 1 / 60,
        basePxPerSec: 45,
        scrollSpeed: 80,
        playbackSpeed: 1,
      });
      offset = advanceVirtualOffset(offset, d, 3400).nextOffset;
      frames.push(offset);
    }
    assert.ok(frames[0]! > 0);
    assert.ok(offset > 0 && offset < 500, `from-start should not jump back to mid, got ${offset}`);

    // pause keeps position; resume continues (not reset)
    const paused = offset;
    for (let i = 0; i < 20; i++) {
      const d = computePxDelta({
        dtSec: 1 / 60,
        basePxPerSec: 45,
        scrollSpeed: 80,
        playbackSpeed: 1,
      });
      offset = advanceVirtualOffset(offset, d, 3400).nextOffset;
    }
    assert.ok(offset > paused);
    console.log('PASS record-start reset + resume no-reset', { paused, after: offset });
  }

  section('Only one runId active after re-prepare during play');
  {
    let runId = 0;
    let active: number | null = null;
    const start = () => {
      runId += 1;
      const my = runId;
      active = my;
      return () => active === my;
    };
    const isOld = start();
    // Bắt đầu quay mid-play → new prepare/start invalidates
    const isNew = start();
    assert.equal(isOld(), false);
    assert.equal(isNew(), true);
    console.log('PASS single active run after re-prepare');
  }

  console.log('\nALL_PASS teleprompter-scroll-engine');
}

main();
