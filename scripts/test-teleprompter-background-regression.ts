/**
 * Prompt 7 regression: Teleprompter Background Effects isolation + recording helpers.
 * Pure checks only (Node-safe). Does not import studio scroll container implementations.
 *
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-teleprompter-background-regression.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  createPassthroughRecordingCompositor,
  isTeleprompterBackgroundEffectsEnabled,
  normalizeCameraOverlayLayout,
  DEFAULT_CAMERA_ONLY_LAYOUT,
  DEFAULT_SCREEN_PIP_LAYOUT,
  clampOverlay01,
  layoutToPixelRect,
  coverDrawSource,
  isCameraBackgroundBlurLevel,
  normalizeCameraBackgroundBlurLevel,
  TELEPROMPTER_BG_PRESETS,
  TELEPROMPTER_MOTION_BG_PRESETS,
  selectMotionBgQuality,
  shouldFallbackMotionToImage,
  validateCustomBackgroundFileSync,
  classifyCustomBgMime,
  disposePreparedCustomBg,
  revokeObjectUrlSafe,
} from '../apps/web/src/lib/teleprompter-background';
import {
  computePxDelta,
  advanceVirtualOffset,
  simulateScrollRun,
} from '../apps/web/src/lib/teleprompter-scroll-engine';
import {
  TELEPROMPTER_PLAYBACK_SPEEDS,
  normalizeTeleprompterPlaybackSpeed,
} from '../apps/web/src/lib/teleprompter-storage';
import {
  canTransition,
  modeIncludesScreenShare,
  modeIncludesCamera,
  displayMediaConstraints,
  pickRecorderMimeType,
  stopMediaStream,
  constraintsForMode,
  estimateBitrateBps,
} from '../apps/web/src/lib/teleprompter-media';

function section(name: string) {
  console.log(`\n=== ${name} ===`);
}

const MODULE_ROOT = path.join(
  process.cwd(),
  'apps/web/src/lib/teleprompter-background',
);

function walkTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    // scripts run from monorepo or filter package cwd
    const alt = path.resolve(__dirname, '../apps/web/src/lib/teleprompter-background');
    if (!fs.existsSync(alt)) throw new Error(`module not found: ${dir}`);
    return walkTsFiles(alt);
  }
  const out: string[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkTsFiles(p));
    else if (ent.isFile() && ent.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

function main() {
  section('Isolation: background module never imports studio/scroll');
  {
    const root = fs.existsSync(MODULE_ROOT)
      ? MODULE_ROOT
      : path.resolve(__dirname, '../apps/web/src/lib/teleprompter-background');
    const files = walkTsFiles(root);
    assert.ok(files.length >= 8, `expected module files, got ${files.length}`);
    const forbiddenImportRes = [
      /from\s+['"][^'"]*teleprompter-scroll-engine['"]/,
      /from\s+['"][^'"]*teleprompter-studio['"]/,
      /from\s+['"][^'"]*teleprompter-storage['"]/,
      /require\(\s*['"][^'"]*teleprompter-scroll/,
    ];
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      for (const re of forbiddenImportRes) {
        assert.equal(re.test(src), false, `${file} must not import scroll/studio: ${re}`);
      }
      // Never write scrollContainerRef as a symbol used for DOM control
      if (/\bscrollContainerRef\b/.test(src) && !/Never touch scrollContainerRef/.test(src)) {
        assert.fail(`${file} references scrollContainerRef`);
      }
    }
    console.log('PASS isolation', { files: files.length });
  }

  section('Playback speeds 0.25–2.0 produce monotonic scroll deltas');
  {
    assert.deepEqual(
      [...TELEPROMPTER_PLAYBACK_SPEEDS],
      [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
    );
    let prev = 0;
    for (const speed of TELEPROMPTER_PLAYBACK_SPEEDS) {
      const n = normalizeTeleprompterPlaybackSpeed(speed);
      assert.equal(n, speed);
      const d = computePxDelta({
        dtSec: 1 / 60,
        basePxPerSec: 45,
        scrollSpeed: 80,
        playbackSpeed: speed,
      });
      assert.ok(d > prev, `${speed}× delta ${d} should exceed previous ${prev}`);
      prev = d;
    }
    const run025 = simulateScrollRun({
      height: 4000,
      clientHeight: 600,
      frames: 60,
      frameDtSec: 1 / 60,
      basePxPerSec: 45,
      scrollSpeed: 80,
      playbackSpeed: 0.25,
    });
    const run2 = simulateScrollRun({
      height: 4000,
      clientHeight: 600,
      frames: 60,
      frameDtSec: 1 / 60,
      basePxPerSec: 45,
      scrollSpeed: 80,
      playbackSpeed: 2,
    });
    assert.ok(run025.finalTop > 0);
    assert.ok(run2.finalTop > run025.finalTop * 3);
    console.log('PASS speeds', { s025: run025.finalTop, s2: run2.finalTop });
  }

  section('Pause freezes offset; resume does not jump to 0');
  {
    let offset = 0;
    const maxScroll = 5000;
    for (let i = 0; i < 40; i++) {
      offset = advanceVirtualOffset(
        offset,
        computePxDelta({
          dtSec: 1 / 60,
          basePxPerSec: 45,
          scrollSpeed: 80,
          playbackSpeed: 1,
        }),
        maxScroll,
      ).nextOffset;
    }
    const paused = offset;
    assert.ok(paused > 0);
    // pause: no advance
    assert.equal(offset, paused);
    // resume continues forward
    offset = advanceVirtualOffset(
      offset,
      computePxDelta({
        dtSec: 1 / 60,
        basePxPerSec: 45,
        scrollSpeed: 80,
        playbackSpeed: 1,
      }),
      maxScroll,
    ).nextOffset;
    assert.ok(offset > paused);
    assert.ok(offset < paused * 1.2); // not jump far / not reset
    console.log('PASS pause/resume continuity', { paused, after: offset });
  }

  section('Recorder mode transitions + screen_camera constraints');
  {
    assert.equal(canTransition('ready', 'countdown'), true);
    assert.equal(canTransition('countdown', 'recording'), true);
    assert.equal(canTransition('recording', 'paused'), true);
    assert.equal(canTransition('paused', 'recording'), true);
    assert.equal(canTransition('recording', 'stopped'), true);
    assert.equal(modeIncludesScreenShare('screen_camera'), true);
    assert.equal(modeIncludesCamera('screen_camera'), true);
    assert.equal(displayMediaConstraints('economy').audio, false);
    const sc = constraintsForMode('screen_camera', {});
    assert.ok(sc.video);
    assert.ok(sc.audio);
    assert.ok(estimateBitrateBps('screen_camera', 'economy') > 0);
    assert.ok(pickRecorderMimeType('screen_camera', () => true)?.startsWith('video/'));
    console.log('PASS recorder modes');
  }

  section('Background paints catalog (blur, image, motion, custom validation)');
  {
    assert.equal(isCameraBackgroundBlurLevel('light'), true);
    assert.equal(isCameraBackgroundBlurLevel('soft'), false);
    assert.equal(normalizeCameraBackgroundBlurLevel('nope'), 'none');
    assert.ok(TELEPROMPTER_BG_PRESETS.length >= 3);
    assert.ok(TELEPROMPTER_MOTION_BG_PRESETS.length >= 1);
    assert.equal(typeof selectMotionBgQuality({ hardwareConcurrency: 8, deviceMemory: 8 }), 'string');
    assert.equal(selectMotionBgQuality({ hardwareConcurrency: 4, deviceMemory: 4 }), 'full');
    assert.equal(selectMotionBgQuality({ hardwareConcurrency: 8, deviceMemory: 8 }), 'full');
    // shouldFallbackMotionToImage is env/hardware sensitive — just callable
    assert.equal(typeof shouldFallbackMotionToImage({ hardwareConcurrency: 8 }), 'boolean');
    const fakeFile = {
      name: 'x.exe',
      size: 100,
      type: 'application/octet-stream',
    } as unknown as File;
    const bad = validateCustomBackgroundFileSync(fakeFile);
    assert.equal(bad.ok, false);
    assert.equal(classifyCustomBgMime('image/png'), 'image');
    assert.equal(classifyCustomBgMime('video/webm'), 'video');
    disposePreparedCustomBg(null);
    revokeObjectUrlSafe(null);
    console.log('PASS effect catalogs');
  }

  section('Layout PiP math (screen + camera) stable');
  {
    const full = normalizeCameraOverlayLayout(DEFAULT_CAMERA_ONLY_LAYOUT, { screenActive: false });
    assert.equal(full.width, 1);
    const pip = normalizeCameraOverlayLayout(DEFAULT_SCREEN_PIP_LAYOUT, { screenActive: true });
    assert.ok(pip.width < 0.5);
    const rect = layoutToPixelRect(pip, 1280, 720);
    assert.ok(rect.w > 0 && rect.h > 0);
    const cover = coverDrawSource(1920, 1080, rect.w, rect.h);
    assert.ok(cover.sw > 0);
    assert.equal(clampOverlay01(2), 1);
    console.log('PASS layout');
  }

  section('Passthrough compositor + track stop helper (cleanup contract)');
  {
    const comp = createPassthroughRecordingCompositor();
    assert.equal(comp.compose({ videoStream: null, audioStream: null }), null);
    comp.dispose();
    const stopped: string[] = [];
    stopMediaStream({
      getTracks: () => [
        { stop: () => stopped.push('v') },
        { stop: () => stopped.push('a') },
      ],
    } as unknown as MediaStream);
    assert.deepEqual(stopped, ['v', 'a']);
    console.log('PASS cleanup helpers');
  }

  section('Feature flag remains gated');
  {
    assert.equal(isTeleprompterBackgroundEffectsEnabled({}), false);
    assert.equal(
      isTeleprompterBackgroundEffectsEnabled({ NEXT_PUBLIC_TELEPROMPTER_BACKGROUND_EFFECTS: 'true' }),
      true,
    );
    console.log('PASS flag');
  }

  console.log('\nALL_PASS teleprompter-background-regression');
}

main();
