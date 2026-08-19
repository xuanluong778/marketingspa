/**
 * Unit tests for segmentation mask polarity / person weight (fix inverted blur).
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-teleprompter-background-mask.ts
 */
import assert from 'node:assert/strict';
import {
  clamp01,
  inferMaskPolarity,
  normalizeCategorySample,
  personWeightFromNormalized,
  samplePersonWeight,
  softenPersonWeight,
} from '../apps/web/src/lib/teleprompter-background/segmentation-mask';
import { blurRadiusForLevel } from '../apps/web/src/lib/teleprompter-background/blur-levels';

function main() {
  assert.equal(clamp01(-1), 0);
  assert.equal(clamp01(2), 1);
  assert.equal(clamp01(0.4), 0.4);

  // Category 0/1
  assert.equal(normalizeCategorySample(0), 0);
  assert.equal(normalizeCategorySample(1), 1);
  // 0/255 style
  assert.equal(normalizeCategorySample(0), 0);
  assert.equal(normalizeCategorySample(255), 1);
  assert.equal(normalizeCategorySample(200), 1);
  assert.equal(normalizeCategorySample(10), 0);

  // Correct polarity: high = person → person opaque on high
  assert.equal(personWeightFromNormalized(1, 'high-is-person'), 1);
  assert.equal(personWeightFromNormalized(0, 'high-is-person'), 0);

  // Inverted polarity (the production bug): high = background → invert
  assert.equal(personWeightFromNormalized(1, 'high-is-background'), 0);
  assert.equal(personWeightFromNormalized(0, 'high-is-background'), 1);
  assert.ok(Math.abs(personWeightFromNormalized(0.2, 'high-is-background') - 0.8) < 1e-9);

  // Soften is continuous, midpoint compressed toward edges of soft band
  assert.equal(softenPersonWeight(0), 0);
  assert.equal(softenPersonWeight(1), 1);
  assert.ok(softenPersonWeight(0.5) > 0.4 && softenPersonWeight(0.5) < 0.6);

  // Infer polarity: person in center as high values → high-is-person
  {
    const w = 10;
    const h = 10;
    const buf = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const center = x >= 3 && x <= 6 && y >= 3 && y <= 6;
        buf[y * w + x] = center ? 1 : 0;
      }
    }
    assert.equal(inferMaskPolarity(buf, w, h), 'high-is-person');
  }

  // Infer polarity: inverted (person=0 in center) → high-is-background
  {
    const w = 10;
    const h = 10;
    const buf = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const center = x >= 3 && x <= 6 && y >= 3 && y <= 6;
        buf[y * w + x] = center ? 0 : 1;
      }
    }
    assert.equal(inferMaskPolarity(buf, w, h), 'high-is-background');
  }

  // Sample maps correct person weight after invert (2×2 average at corners softens extremes)
  {
    const mw = 4;
    const mh = 4;
    // Left half person=0 (inverted encoding), right half background=1
    const mask = new Float32Array(16);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        mask[y * 4 + x] = x < 2 ? 0 : 1;
      }
    }
    const wPerson = samplePersonWeight(mask, mw, mh, 0, 1, 4, 4, 'high-is-background', false);
    const wBg = samplePersonWeight(mask, mw, mh, 3, 1, 4, 4, 'high-is-background', false);
    assert.ok(wPerson > 0.9, `expected person high, got ${wPerson}`);
    assert.ok(wBg < 0.1, `expected bg low, got ${wBg}`);
  }

  // Levels only change blur radius (BG), not person
  assert.ok(blurRadiusForLevel('light') < blurRadiusForLevel('medium'));
  assert.ok(blurRadiusForLevel('medium') < blurRadiusForLevel('strong'));
  assert.equal(blurRadiusForLevel('none'), 0);

  console.log('ALL_PASS teleprompter-background-mask');
}

main();
