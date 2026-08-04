/**
 * Teleprompter script tools tests.
 * Run: node_modules/.pnpm/node_modules/.bin/tsx scripts/test-teleprompter-script-tools.ts
 */
import assert from 'node:assert/strict';
import {
  addBreathMarks,
  autoSplitParagraphs,
  countScriptWords,
  findReplaceAll,
  parseScriptLine,
  stripScriptNoise,
  wrapEmphasis,
} from '../apps/web/src/lib/teleprompter-script-tools';

function main() {
  assert.equal(countScriptWords('một hai ba **bốn**'), 4);
  assert.ok(stripScriptNoise('Góc nhìn: test\nKết luận: x').includes('test'));
  assert.ok(!stripScriptNoise('## Heading\n- bullet').includes('##'));
  assert.ok(!stripScriptNoise('## Heading\n- bullet').includes('- bullet'));
  assert.ok(addBreathMarks('Xin chào, các bạn.').includes('/'));
  assert.equal(findReplaceAll('foo bar foo', 'foo', 'baz'), 'baz bar baz');
  assert.equal(wrapEmphasis('hello world', 6, 11), 'hello **world**');
  const segs = parseScriptLine('Nói **thật** nhé');
  assert.ok(segs.some((s) => s.emphasis && s.text === 'thật'));
  const split = autoSplitParagraphs('Câu một. Câu hai.\n\nĐoạn mới.');
  assert.ok(split.includes('\n\n'));
  console.log('test-teleprompter-script-tools: PASS');
}

main();
