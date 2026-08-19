/**
 * Adaptive quality (rolling window) unit tests.
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-teleprompter-background-adaptive.ts
 */
import assert from 'node:assert/strict';
import {
  FrameTimeWindow,
  QUALITY_AVG_SLOW_MS,
  QUALITY_MIN_SAMPLES,
  QUALITY_MIN_SPAN_MS,
  clampQualityTier,
  effectiveSegmentIntervalMs,
  isBenignVisionRuntimeMessage,
  nextQualityTier,
  paramsForQualityTier,
  segmentIntervalForPaintKind,
} from '../apps/web/src/lib/teleprompter-background/adaptive-quality';
import {
  OUTPUT_MAX_WIDTH,
  OUTPUT_MIN_WIDTH,
  hardenPersonAlpha,
} from '../apps/web/src/lib/teleprompter-background/blur-compose';

function main() {
  assert.ok(OUTPUT_MAX_WIDTH >= 1920, '1080p cameras must stay near-native');
  assert.ok(OUTPUT_MIN_WIDTH >= 1280, 'min output class 720p');

  // Adaptive must NOT expose maxWidth / output width (segmentation only)
  const p0 = paramsForQualityTier(0);
  assert.equal('maxWidth' in p0, false);
  assert.ok(p0.segmentIntervalMs <= 50);
  assert.ok(p0.maxMaskAgeFrames <= 2, 'never reuse mask >1–2 frames (ghost limbs)');
  assert.ok(p0.motionSegmentIntervalMs <= 33);
  assert.ok(p0.motionSegmentIntervalMs <= p0.segmentIntervalMs);

  const p3 = paramsForQualityTier(3);
  assert.ok(p3.segmentIntervalMs >= p0.segmentIntervalMs);
  assert.ok(p3.maxMaskAgeFrames <= 2);

  // Motion tightens interval
  const still = effectiveSegmentIntervalMs(p0, 0, 'image');
  const moving = effectiveSegmentIntervalMs(p0, 0.8, 'image');
  assert.ok(moving <= still, `${moving} should be <= ${still}`);
  assert.ok(moving <= 33, 'high motion near 30fps+ mask');

  assert.equal(nextQualityTier(0), 1);
  assert.equal(nextQualityTier(3), 3);
  assert.equal(clampQualityTier(-1), 0);
  assert.equal(segmentIntervalForPaintKind('image', 50), 50);

  assert.equal(isBenignVisionRuntimeMessage('OpenGL error checking is disabled'), true);
  assert.equal(isBenignVisionRuntimeMessage(new Error('segment_failed')), false);

  // Tight alpha edge (not whole-body soft)
  assert.equal(hardenPersonAlpha(0), 0);
  assert.equal(hardenPersonAlpha(0.4), 0);
  assert.equal(hardenPersonAlpha(0.44), 0);
  assert.equal(hardenPersonAlpha(0.85), 1);
  assert.ok(hardenPersonAlpha(0.5) > 0 && hardenPersonAlpha(0.5) < 1);

  const w = new FrameTimeWindow();
  for (let i = 0; i < 10; i++) w.push(i * 16, 90);
  assert.equal(w.shouldDegrade(), false);

  w.reset();
  const start = 1_000_000;
  const n = Math.max(QUALITY_MIN_SAMPLES + 5, Math.ceil(QUALITY_MIN_SPAN_MS / 16) + 5);
  for (let i = 0; i < n; i++) {
    w.push(start + i * 16, QUALITY_AVG_SLOW_MS + 20);
  }
  assert.equal(w.shouldDegrade(), true);

  console.log('ALL_PASS teleprompter-background-adaptive');
}

main();
