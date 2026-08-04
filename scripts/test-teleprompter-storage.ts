/**
 * Teleprompter storage helpers.
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-teleprompter-storage.ts
 */
import assert from 'node:assert/strict';
import {
  DEFAULT_TELEPROMPTER_DRAFT,
  estimateDurationSeconds,
  formatClock,
  normalizeTeleprompterDraft,
} from '../apps/web/src/lib/teleprompter-storage';

function main() {
  assert.ok(estimateDurationSeconds('một hai ba bốn năm') >= 5);
  assert.equal(formatClock(65), '01:05');
  assert.equal(formatClock(-1), '00:00');

  const n = normalizeTeleprompterDraft({
    title: 'Test',
    editedScript: 'Nói thật. Chuyện này khiến tôi phải nghĩ.',
    fontSize: 999,
    scrollSpeed: 1,
    countdown: 5,
    theme: 'light',
    mirrorMode: true,
  });
  assert.equal(n.title, 'Test');
  assert.ok(n.fontSize <= 72);
  assert.ok(n.scrollSpeed >= 10);
  assert.equal(n.countdown, 5);
  assert.equal(n.theme, 'light');
  assert.equal(n.mirrorMode, true);
  assert.ok(n.estimatedDuration > 0);

  const d = normalizeTeleprompterDraft(null);
  assert.equal(d.fontSize, DEFAULT_TELEPROMPTER_DRAFT.fontSize);

  // Forbidden outline labels should not appear in default empty draft
  assert.equal(d.editedScript.includes('Tình huống tôi muốn bàn:'), false);

  console.log('test-teleprompter-storage: PASS');
}

main();
