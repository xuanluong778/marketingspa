/**
 * Unit tests for custom background validation (no DOM decode).
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-teleprompter-background-custom.ts
 */
import assert from 'node:assert/strict';
import {
  CUSTOM_BG_IMAGE_MAX_BYTES,
  CUSTOM_BG_VIDEO_MAX_BYTES,
  CUSTOM_BG_VIDEO_MAX_SECONDS,
  classifyCustomBgMime,
  guessMimeFromFileName,
  resolveCustomBgMime,
  validateCustomBackgroundFileSync,
} from '../apps/web/src/lib/teleprompter-background/custom-background';
import {
  CUSTOM_BG_IDB_KEY,
  CUSTOM_BG_IDB_NAME,
  CUSTOM_BG_IDB_STORE,
  fileFromPersistedCustomBg,
  type PersistedCustomBgRecord,
} from '../apps/web/src/lib/teleprompter-background/custom-background-persist';

function fakeFile(name: string, type: string, size: number): File {
  const buf = new Uint8Array(8);
  const f = new File([buf], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

function main() {
  assert.equal(guessMimeFromFileName('a.JPG'), 'image/jpeg');
  assert.equal(guessMimeFromFileName('x.webp'), 'image/webp');
  assert.equal(guessMimeFromFileName('v.webm'), 'video/webm');
  assert.equal(classifyCustomBgMime('image/png'), 'image');
  assert.equal(classifyCustomBgMime('video/mp4'), 'video');
  assert.equal(classifyCustomBgMime('application/pdf'), null);

  assert.equal(validateCustomBackgroundFileSync(null).ok, false);
  {
    const r = validateCustomBackgroundFileSync(fakeFile('x.gif', 'image/gif', 100));
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 'type');
  }
  {
    const r = validateCustomBackgroundFileSync(
      fakeFile('big.jpg', 'image/jpeg', CUSTOM_BG_IMAGE_MAX_BYTES + 1),
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 'size_image');
  }
  {
    const r = validateCustomBackgroundFileSync(
      fakeFile('big.mp4', 'video/mp4', CUSTOM_BG_VIDEO_MAX_BYTES + 1),
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 'size_video');
  }
  {
    const r = validateCustomBackgroundFileSync(fakeFile('ok.png', 'image/png', 1024));
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.kind, 'image');
      assert.equal(r.mime, 'image/png');
    }
  }
  {
    const r = validateCustomBackgroundFileSync(fakeFile('shot.webp', '', 2048));
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.mime, 'image/webp');
  }
  assert.equal(resolveCustomBgMime({ type: '', name: 'a.mp4' }), 'video/mp4');
  assert.ok(CUSTOM_BG_VIDEO_MAX_SECONDS >= 30);

  assert.ok(CUSTOM_BG_IDB_NAME.length > 0);
  assert.equal(CUSTOM_BG_IDB_STORE, 'applied');
  assert.equal(CUSTOM_BG_IDB_KEY, 'current');
  {
    const blob = new Blob([Uint8Array.of(1, 2, 3)], { type: 'image/png' });
    const rec: PersistedCustomBgRecord = {
      kind: 'image',
      fileName: 'desk.png',
      mime: 'image/png',
      sizeBytes: 3,
      width: 100,
      height: 80,
      savedAt: 1_700_000_000_000,
      blob,
    };
    const f = fileFromPersistedCustomBg(rec);
    assert.equal(f.name, 'desk.png');
    assert.equal(f.type, 'image/png');
  }

  console.log('ALL_PASS teleprompter-background-custom');
}

main();
