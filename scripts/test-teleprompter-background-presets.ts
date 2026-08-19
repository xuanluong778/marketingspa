/**
 * Unit tests for preset image backgrounds (catalog + cover math + lazy load).
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-teleprompter-background-presets.ts
 */
import assert from 'node:assert/strict';
import {
  clearPresetImageCache,
  computeCoverDrawRect,
  getTeleprompterBgPreset,
  loadPresetBackgroundImage,
  TELEPROMPTER_BG_PRESETS,
  type TeleprompterBgPresetId,
} from '../apps/web/src/lib/teleprompter-background/preset-backgrounds';

async function main() {
  assert.equal(TELEPROMPTER_BG_PRESETS.length, 5);
  const ids = TELEPROMPTER_BG_PRESETS.map((p) => p.id).sort();
  assert.deepEqual(ids, ['meeting', 'office', 'podcast', 'studio', 'tech'].sort());

  for (const p of TELEPROMPTER_BG_PRESETS) {
    assert.ok(p.label.length > 0);
    assert.ok(p.src.startsWith('/teleprompter/backgrounds/'));
    assert.ok(p.thumbSrc.includes('/thumbs/'));
    assert.equal(getTeleprompterBgPreset(p.id)?.id, p.id);
  }
  assert.equal(getTeleprompterBgPreset(null), null);
  assert.equal(getTeleprompterBgPreset('nope'), null);

  // Cover: landscape → square (scale by height, center X)
  {
    const r = computeCoverDrawRect(1600, 900, 800, 800);
    assert.ok(Math.abs(r.dw / r.dh - 1600 / 900) < 1e-9);
    assert.ok(r.dh >= 800 - 1e-6);
    assert.ok(r.dw >= 800 - 1e-6);
    assert.ok(r.dx < 0);
    assert.ok(Math.abs(r.dy) < 1e-6);
  }

  // Cover: tall → wide (scale by width, center Y)
  {
    const r = computeCoverDrawRect(400, 800, 1000, 500);
    assert.ok(r.dw >= 1000 - 1e-6);
    assert.ok(Math.abs(r.dx) < 1e-6);
    assert.ok(r.dy < 0);
  }

  // Identical aspect → exact fill
  {
    const r = computeCoverDrawRect(1280, 720, 640, 360);
    assert.ok(Math.abs(r.dx) < 1e-6);
    assert.ok(Math.abs(r.dy) < 1e-6);
    assert.ok(Math.abs(r.dw - 640) < 1e-6);
    assert.ok(Math.abs(r.dh - 360) < 1e-6);
  }

  clearPresetImageCache();

  await assert.rejects(
    async () => loadPresetBackgroundImage('not-real' as TeleprompterBgPresetId),
    /unknown_preset/,
  );

  let fetchCount = 0;
  const fetchedUrls: string[] = [];
  const mockFetch = (async (input: RequestInfo | URL) => {
    fetchCount += 1;
    const url = String(input);
    fetchedUrls.push(url);
    return {
      ok: true,
      blob: async () => new Blob([`<svg id="${url}"/>`], { type: 'image/svg+xml' }),
    } as Response;
  }) as typeof fetch;

  if (typeof createImageBitmap === 'function') {
    const g = globalThis as typeof globalThis & {
      createImageBitmap: typeof createImageBitmap;
    };
    const orig = g.createImageBitmap;
    g.createImageBitmap = async () =>
      ({
        width: 10,
        height: 10,
        close: () => undefined,
      }) as unknown as ImageBitmap;
    try {
      clearPresetImageCache();
      fetchCount = 0;
      fetchedUrls.length = 0;
      const a = await loadPresetBackgroundImage('studio', mockFetch);
      const b = await loadPresetBackgroundImage('studio', mockFetch);
      assert.equal(a, b);
      assert.equal(fetchCount, 1);
      assert.ok(fetchedUrls[0]?.includes('studio'));
      await loadPresetBackgroundImage('office', mockFetch);
      assert.equal(fetchCount, 2);
    } finally {
      g.createImageBitmap = orig;
      clearPresetImageCache();
    }
  }

  console.log('ALL_PASS teleprompter-background-presets');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
