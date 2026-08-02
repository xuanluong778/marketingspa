/**
 * Teleprompter script rewrite logic tests (API module).
 */
import assert from 'node:assert/strict';
import { __teleprompterScriptTest } from '../apps/api/src/content-marketing/teleprompter-script.logic';

const { countWords, stripScriptOutlineLabels, trimToWordRange, applyTemplateRewrite } =
  __teleprompterScriptTest;

function main() {
  const sample =
    'Góc nhìn: Đây là bài viết dài. ' +
    'Theo quan điểm của tôi, chúng ta cần nhìn kỹ hơn. ' +
    'Kết luận: hãy bình tĩnh.';
  const clean = stripScriptOutlineLabels(sample);
  assert.ok(!clean.includes('Góc nhìn:'));
  const short = trimToWordRange(clean.repeat(20), 130, 180);
  const wc = countWords(short);
  assert.ok(wc <= 180, `expected <=180 got ${wc}`);
  const spoken = applyTemplateRewrite(clean, 'to_spoken');
  assert.ok(spoken.length > 10);
  console.log('test-teleprompter-script-api: PASS');
}

main();
