/**
 * Foundation tests for Teleprompter Background Effects module.
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-teleprompter-background-foundation.ts
 */
import assert from 'node:assert/strict';
import {
  createPassthroughBackgroundProcessor,
  createPassthroughCameraPreview,
  createPassthroughRecordingCompositor,
  isTeleprompterBackgroundEffectsEnabled,
  TELEPROMPTER_BACKGROUND_EFFECTS_ENV_KEYS,
} from '../apps/web/src/lib/teleprompter-background';

function section(name: string) {
  console.log(`\n=== ${name} ===`);
}

function main() {
  section('feature flag default OFF');
  assert.equal(isTeleprompterBackgroundEffectsEnabled({}), false);
  assert.equal(
    isTeleprompterBackgroundEffectsEnabled({ TELEPROMPTER_BACKGROUND_EFFECTS: 'false' }),
    false,
  );
  assert.equal(
    isTeleprompterBackgroundEffectsEnabled({ TELEPROMPTER_BACKGROUND_EFFECTS: '0' }),
    false,
  );
  assert.equal(
    isTeleprompterBackgroundEffectsEnabled({ TELEPROMPTER_BACKGROUND_EFFECTS: 'true' }),
    true,
  );
  assert.equal(
    isTeleprompterBackgroundEffectsEnabled({ TELEPROMPTER_BACKGROUND_EFFECTS: '1' }),
    true,
  );
  assert.equal(
    isTeleprompterBackgroundEffectsEnabled({
      NEXT_PUBLIC_TELEPROMPTER_BACKGROUND_EFFECTS: 'on',
    }),
    true,
  );
  // Node (no window): unset stays off
  assert.equal(isTeleprompterBackgroundEffectsEnabled({}), false);
  assert.ok(TELEPROMPTER_BACKGROUND_EFFECTS_ENV_KEYS.includes('TELEPROMPTER_BACKGROUND_EFFECTS'));
  console.log('PASS flag');

  section('processor passthrough same stream ref');
  const proc = createPassthroughBackgroundProcessor();
  assert.equal(proc.kind, 'background-processor');
  // Fake stream object in Node — module must not require real MediaStream for process
  const fake = { id: 'fake-stream' } as unknown as MediaStream;
  proc.configure({ mode: 'blur', blurStrength: 0.5 });
  const out = proc.process(fake);
  assert.equal(out.stream, fake);
  assert.equal(out.mode, 'blur');
  assert.equal(proc.process(null).stream, null);
  proc.dispose();
  console.log('PASS processor');

  section('compositor empty → null without MediaStream tracks');
  const comp = createPassthroughRecordingCompositor();
  assert.equal(comp.kind, 'recording-compositor');
  assert.equal(comp.compose({ videoStream: null, audioStream: null }), null);
  console.log('PASS compositor empty');

  section('camera preview controller shape');
  const cam = createPassthroughCameraPreview();
  assert.equal(cam.kind, 'camera-preview');
  cam.attach({ stream: null, videoElement: null });
  cam.detach();
  cam.dispose();
  console.log('PASS camera preview');

  console.log('\nALL_PASS teleprompter-background-foundation');
}

main();
