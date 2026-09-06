/**
 * Pure layout math for recording canvas PiP (no DOM).
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-teleprompter-layout-compositor.ts
 */
import assert from 'node:assert/strict';
import {
  DEFAULT_CAMERA_ONLY_LAYOUT,
  DEFAULT_SCREEN_PIP_LAYOUT,
  clamp01 as clampOverlay01,
  coverDrawSource,
  layoutToPixelRect,
  normalizeCameraOverlayLayout,
} from '../apps/web/src/lib/teleprompter-background/camera-overlay-layout';
import {
  displayMediaConstraints,
  modeIncludesCamera,
  modeIncludesScreenShare,
  estimateBitrateBps,
  pickRecorderMimeType,
} from '../apps/web/src/lib/teleprompter-media';

function section(name: string) {
  console.log(`\n=== ${name} ===`);
}

section('normalizeCameraOverlayLayout');
{
  const full = normalizeCameraOverlayLayout(null, { screenActive: false });
  assert.equal(full.width, 1);
  assert.equal(full.height, 1);
  assert.equal(full.flipX, DEFAULT_CAMERA_ONLY_LAYOUT.flipX);

  const pip = normalizeCameraOverlayLayout(null, { screenActive: true });
  assert.ok(pip.width < 1);
  assert.ok(pip.x > 0);
  assert.equal(pip.borderRadius, DEFAULT_SCREEN_PIP_LAYOUT.borderRadius);

  const clamped = normalizeCameraOverlayLayout(
    { x: -1, y: 2, width: 0.01, height: 2, borderRadius: 9, flipX: false },
    { screenActive: true },
  );
  assert.ok(clamped.width >= 0.12);
  assert.ok(clamped.x >= 0);
  assert.ok(clamped.x + clamped.width <= 1 + 1e-9);
  assert.ok(clamped.borderRadius <= 0.5);
  assert.equal(clamped.flipX, false);
  console.log('PASS normalize');
}

section('layoutToPixelRect + coverDrawSource');
{
  const layout = normalizeCameraOverlayLayout(
    { x: 0.5, y: 0.5, width: 0.25, height: 0.3, borderRadius: 0.5, flipX: true },
    { screenActive: true },
  );
  const rect = layoutToPixelRect(layout, 1280, 720);
  assert.ok(rect.w >= 2 && rect.h >= 2);
  assert.ok(rect.x + rect.w <= 1280);
  assert.ok(rect.y + rect.h <= 720);
  assert.ok(rect.radiusPx >= 0);

  const src = coverDrawSource(1920, 1080, rect.w, rect.h);
  assert.ok(src.sw > 0 && src.sh > 0);
  assert.ok(src.sx >= 0 && src.sy >= 0);
  console.log('PASS pixel + cover');
}

section('clampOverlay01');
{
  assert.equal(clampOverlay01(-3), 0);
  assert.equal(clampOverlay01(0.5), 0.5);
  assert.equal(clampOverlay01(3), 1);
  assert.equal(clampOverlay01(Number.NaN), 0);
  console.log('PASS clamp');
}

section('mode helpers screen_camera');
{
  assert.equal(modeIncludesScreenShare('screen_camera'), true);
  assert.equal(modeIncludesScreenShare('video_audio'), false);
  assert.equal(modeIncludesCamera('screen_camera'), true);
  assert.equal(modeIncludesCamera('audio_only'), false);

  const d = displayMediaConstraints('economy');
  assert.equal(d.audio, false);
  assert.ok(d.video && typeof d.video === 'object');

  assert.ok(estimateBitrateBps('screen_camera', 'economy') >= estimateBitrateBps('video_audio', 'economy'));
  assert.ok(estimateBitrateBps('video_audio', 'standard') >= 8_000_000);
  assert.ok(pickRecorderMimeType('screen_camera', () => true)?.startsWith('video/'));
  console.log('PASS media helpers');
}

console.log('\nAll layout compositor pure tests passed.');
