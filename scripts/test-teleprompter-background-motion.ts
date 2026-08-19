/**
 * Unit tests for motion (3D loop video) background catalog + quality selection.
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-teleprompter-background-motion.ts
 */
import assert from 'node:assert/strict';
import {
  MOTION_BG_MAX_FPS_FULL,
  MOTION_BG_MAX_FPS_LOW,
  MOTION_BG_MAX_HEIGHT,
  MOTION_BG_MAX_WIDTH,
  TELEPROMPTER_MOTION_BG_PRESETS,
  getTeleprompterMotionBgPreset,
  motionSourceUrls,
  selectMotionBgQuality,
  shouldFallbackMotionToImage,
} from '../apps/web/src/lib/teleprompter-background/motion-backgrounds';

function main() {
  assert.equal(TELEPROMPTER_MOTION_BG_PRESETS.length, 5);
  assert.ok(MOTION_BG_MAX_WIDTH <= 640);
  assert.ok(MOTION_BG_MAX_HEIGHT <= 360);
  assert.ok(MOTION_BG_MAX_FPS_FULL <= 15);
  assert.ok(MOTION_BG_MAX_FPS_LOW <= 12);

  for (const p of TELEPROMPTER_MOTION_BG_PRESETS) {
    assert.ok(p.label.length > 0);
    assert.ok(p.srcWebm.endsWith('.webm'));
    assert.ok(p.srcMp4.endsWith('.mp4'));
    assert.ok(p.srcWebmLow.includes('-low'));
    assert.ok(p.fallbackImagePresetId);
    assert.equal(getTeleprompterMotionBgPreset(p.id)?.id, p.id);
    const full = motionSourceUrls(p, 'full');
    const low = motionSourceUrls(p, 'low');
    assert.equal(full.webm, p.srcWebm);
    assert.equal(low.mp4, p.srcMp4Low);
  }
  assert.equal(getTeleprompterMotionBgPreset(null), null);
  assert.equal(getTeleprompterMotionBgPreset('nope'), null);

  assert.equal(selectMotionBgQuality({ hardwareConcurrency: 8, deviceMemory: 8 }), 'full');
  assert.equal(selectMotionBgQuality({ hardwareConcurrency: 6, deviceMemory: 8 }), 'full');
  assert.equal(selectMotionBgQuality({ hardwareConcurrency: 4, deviceMemory: 4 }), 'full');
  assert.equal(shouldFallbackMotionToImage({ hardwareConcurrency: 2 }), true);
  assert.equal(shouldFallbackMotionToImage({ hardwareConcurrency: 8, deviceMemory: 8 }), false);

  console.log('ALL_PASS teleprompter-background-motion');
}

main();
