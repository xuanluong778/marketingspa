/**
 * Teleprompter handoff bridge tests.
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-teleprompter-bridge.ts
 */
import assert from 'node:assert/strict';
import {
  buildTeleprompterHandoff,
  type TeleprompterHandoff,
} from '../apps/web/src/lib/teleprompter-bridge';
import { estimateDurationSeconds } from '../apps/web/src/lib/teleprompter-storage';

function main() {
  // Prefer videoScript over content
  const h1 = buildTeleprompterHandoff({
    title: 'T1',
    videoScript: 'Kịch bản camera',
    content: 'Bài facebook dài hơn',
    sourceType: 'opinion',
    sourceRoute: '/content?tab=create&section=personal',
  });
  assert.ok(h1);
  assert.equal(h1!.editedScript, 'Kịch bản camera');
  assert.equal(h1!.sourceType, 'opinion');
  assert.equal(h1!.sourceTitle, 'T1');
  assert.ok(h1!.estimatedDuration >= 5);

  // Fallback to content when no videoScript
  const h2 = buildTeleprompterHandoff({
    title: 'Ad',
    content: 'Nội dung quảng cáo bán hàng',
    sourceType: 'ad',
  });
  assert.ok(h2);
  assert.equal(h2!.editedScript, 'Nội dung quảng cáo bán hàng');

  // Empty → null
  const h3 = buildTeleprompterHandoff({
    title: 'X',
    sourceType: 'draft',
  });
  assert.equal(h3, null);

  // Meta fields preserved
  const h4 = buildTeleprompterHandoff({
    title: 'Saved',
    videoScript: 'Script đã lưu',
    sourceType: 'saved',
    sourceContentId: 'abc-123',
    sourceRoute: '/content?tab=library',
    originalScript: 'Script gốc',
    editedScript: 'Script đã lưu',
  });
  assert.ok(h4);
  assert.equal(h4!.sourceContentId, 'abc-123');
  assert.equal(h4!.originalScript, 'Script gốc');
  assert.equal(h4!.sourceRoute, '/content?tab=library');

  // Duration matches storage helper
  const script = 'một hai ba bốn năm sáu bảy tám chín mười';
  const d = estimateDurationSeconds(script);
  const h5 = buildTeleprompterHandoff({
    title: 'D',
    content: script,
    sourceType: 'advanced',
  }) as TeleprompterHandoff;
  assert.equal(h5.estimatedDuration, d);

  console.log('test-teleprompter-bridge: PASS');
}

main();
