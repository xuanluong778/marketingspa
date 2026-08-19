/**
 * Unit tests for camera blur helpers (no MediaPipe / no browser canvas).
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-teleprompter-background-blur.ts
 */
import assert from 'node:assert/strict';
import {
  blurRadiusForLevel,
  CAMERA_BACKGROUND_BLUR_LEVELS,
  isDisplayCaptureTrack,
  isWeakClientForBackgroundEffects,
  normalizeCameraBackgroundBlurLevel,
} from '../apps/web/src/lib/teleprompter-background/blur-levels';
import { isTeleprompterBackgroundEffectsEnabled } from '../apps/web/src/lib/teleprompter-background/feature-flag';

function main() {
  assert.equal(blurRadiusForLevel('none'), 0);
  assert.ok(blurRadiusForLevel('light') < blurRadiusForLevel('medium'));
  assert.ok(blurRadiusForLevel('medium') < blurRadiusForLevel('strong'));
  assert.equal(CAMERA_BACKGROUND_BLUR_LEVELS.length, 4);
  assert.equal(normalizeCameraBackgroundBlurLevel('nope'), 'none');
  assert.equal(normalizeCameraBackgroundBlurLevel('strong'), 'strong');

  assert.equal(isWeakClientForBackgroundEffects({ hardwareConcurrency: 8, deviceMemory: 8 }), false);
  assert.equal(isWeakClientForBackgroundEffects({ hardwareConcurrency: 2 }), true);
  assert.equal(isWeakClientForBackgroundEffects({ hardwareConcurrency: 8, deviceMemory: 2 }), true);

  assert.equal(
    isDisplayCaptureTrack({ getSettings: () => ({ displaySurface: 'monitor' }) }),
    true,
  );
  assert.equal(isDisplayCaptureTrack({ getSettings: () => ({}) }), false);
  assert.equal(isDisplayCaptureTrack(null), false);

  assert.equal(
    isTeleprompterBackgroundEffectsEnabled({ NEXT_PUBLIC_TELEPROMPTER_BACKGROUND_EFFECTS: 'true' }),
    true,
  );

  console.log('ALL_PASS teleprompter-background-blur');
}

main();
