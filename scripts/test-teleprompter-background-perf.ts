/**
 * Quality + compose unit tests (sharp person / soft bg only).
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-teleprompter-background-perf.ts
 */
import assert from 'node:assert/strict';
import {
  blurDownscaleFactor,
  blurDownscaleFactorForDevice,
  computeOutputSize,
  hardenPersonAlpha,
  packPersonMaskRgba,
  rehardUpscaledMaskAlpha,
  morphClosePersonAlpha,
  fillInteriorPersonHoles,
  SEGMENT_INTERVAL_MS,
  OUTPUT_MAX_WIDTH,
  OUTPUT_MIN_WIDTH,
  EFFECT_PROCESS_MAX_WIDTH,
} from '../apps/web/src/lib/teleprompter-background/blur-compose';
import { personWeightFromNormalized } from '../apps/web/src/lib/teleprompter-background/segmentation-mask';
import {
  VIDEO_BITS_PER_SECOND_1080P,
  VIDEO_BITS_PER_SECOND_720P,
  estimateBitrateBps,
  mediaRecorderOptionsForQuality,
  videoBitsPerSecondForQuality,
} from '../apps/web/src/lib/teleprompter-media';

function main() {
  assert.ok(OUTPUT_MAX_WIDTH >= 1920, 'output must stay near-native (1080p class)');
  assert.ok(OUTPUT_MIN_WIDTH >= 1280, 'min width class for 720p targets');
  assert.equal(EFFECT_PROCESS_MAX_WIDTH, OUTPUT_MAX_WIDTH);
  assert.ok(SEGMENT_INTERVAL_MS <= 50, 'segment near 20–30fps when still');
  assert.ok(SEGMENT_INTERVAL_MS >= 33);

  assert.ok(blurDownscaleFactor('light') < blurDownscaleFactor('medium'));
  assert.ok(blurDownscaleFactor('medium') < blurDownscaleFactor('strong'));
  assert.ok(
    blurDownscaleFactorForDevice('strong', true) < blurDownscaleFactorForDevice('strong', false),
  );

  // Under cap: exact 1:1 camera pixels
  {
    const s = computeOutputSize(1280, 720, OUTPUT_MAX_WIDTH);
    assert.equal(s.width, 1280);
    assert.equal(s.height, 720);
    assert.equal(s.scale, 1);
  }
  {
    const s = computeOutputSize(1920, 1080, OUTPUT_MAX_WIDTH);
    assert.equal(s.width, 1920);
    assert.equal(s.height, 1080);
    assert.equal(s.scale, 1);
  }
  // Never invent above source
  {
    const s = computeOutputSize(640, 480, OUTPUT_MAX_WIDTH);
    assert.equal(s.width, 640);
    assert.equal(s.height, 480);
    assert.equal(s.scale, 1);
  }
  // Exact odd sizes kept (no forced even-round shrink → soft rescale)
  {
    const s = computeOutputSize(641, 481, OUTPUT_MAX_WIDTH);
    assert.equal(s.width, 641);
    assert.equal(s.height, 481);
    assert.equal(s.scale, 1);
  }
  // Memory guard for 4K+ only
  {
    const s = computeOutputSize(3840, 2160, OUTPUT_MAX_WIDTH);
    assert.equal(s.width, 1920);
    assert.ok(s.scale < 1);
  }

  // Harden: inclusive body + narrow soft edge
  assert.equal(hardenPersonAlpha(0), 0);
  assert.equal(hardenPersonAlpha(1), 1);
  assert.equal(hardenPersonAlpha(0.2), 0);
  assert.equal(hardenPersonAlpha(0.4), 0);
  assert.equal(hardenPersonAlpha(0.44), 0);
  assert.equal(hardenPersonAlpha(0.85), 1);
  assert.ok(hardenPersonAlpha(0.5) > 0 && hardenPersonAlpha(0.5) < 1);
  const mask = new Float32Array([0, 1, 0, 1]);
  const rgba = new Uint8ClampedArray(16);
  packPersonMaskRgba(rgba, mask, 4, 'high-is-background');
  assert.equal(rgba[3], 255);
  assert.equal(rgba[7], 0);
  packPersonMaskRgba(rgba, mask, 4, 'high-is-person');
  assert.equal(rgba[3], 0);
  assert.equal(rgba[7], 255);
  assert.equal(personWeightFromNormalized(1, 'high-is-background'), 0);

  // Interior hole fill: 1px hole enclosed by person → solid; outer rim unchanged
  {
    const w = 5;
    const h = 5;
    const rgba2 = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      rgba2[i * 4] = 255;
      rgba2[i * 4 + 1] = 255;
      rgba2[i * 4 + 2] = 255;
      rgba2[i * 4 + 3] = 255;
    }
    rgba2[(2 * w + 2) * 4 + 3] = 0;
    fillInteriorPersonHoles(rgba2, w, h);
    assert.equal(rgba2[(2 * w + 2) * 4 + 3], 255);
    // corner stays person (was solid)
    assert.equal(rgba2[3], 255);
  }

  // Rehard keeps solid body/empty and mid-soft only on the rim
  const alpha = new Uint8ClampedArray([255, 255, 255, 20, 255, 255, 255, 128, 255, 255, 255, 240]);
  rehardUpscaledMaskAlpha(alpha);
  assert.equal(alpha[3], 0);
  assert.ok(alpha[7]! > 0 && alpha[7]! < 255);
  assert.equal(alpha[11], 255);

  // Encoder contract: 1080p ≥ 8 Mbps
  assert.ok(VIDEO_BITS_PER_SECOND_1080P >= 8_000_000);
  assert.equal(videoBitsPerSecondForQuality('standard'), VIDEO_BITS_PER_SECOND_1080P);
  assert.equal(videoBitsPerSecondForQuality('economy'), VIDEO_BITS_PER_SECOND_720P);
  assert.ok(estimateBitrateBps('video_audio', 'standard') >= 8_000_000);
  const opts = mediaRecorderOptionsForQuality(
    'video/webm;codecs=vp9,opus',
    'video_audio',
    'standard',
  );
  assert.ok((opts.videoBitsPerSecond ?? 0) >= 8_000_000);

  console.log('ALL_PASS teleprompter-background-perf');
}

main();
