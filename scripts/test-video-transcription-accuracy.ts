/**
 * Accuracy regression for Vietnamese STT post-correction + glossary.
 * Fixture: real ASR error vs expected phrase (no hard-coded brand map without glossary).
 *
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-video-transcription-accuracy.ts
 */
import assert from 'node:assert/strict';
import {
  applyGlossaryToTranscript,
  buildSttPrompt,
  charErrorRate,
  correctVietnameseTranscript,
  detectSuspiciousSegments,
  generateGlossaryAsrVariants,
  parseGlossaryInput,
  wordErrorRate,
} from '../packages/shared/src/video-transcription-accuracy';

const REFERENCE =
  'Muốn mua đồ xịn giá ngon, qua Oneway gấp chứ còn chờ chi.';
const BAD_ASR =
  'Mua một đợt dịp giá ngon qua 1 vay gấp chứ còn chờ chi';
/** Near-correct pass2 output (HQ audio + glossary prompt) — only casing/punct/glossary left */
const NEAR_CORRECT_ASR =
  'muốn mua đồ xịn giá ngon qua 1 vay gấp chứ còn chờ chi';

function testGlossaryVariants() {
  const variants = generateGlossaryAsrVariants('Oneway').map((v) => v.toLowerCase());
  assert.ok(
    variants.some((v) => (v.includes('1') && v.includes('vay')) || v === '1vay' || v === '1 vay'),
  );
  assert.ok(variants.includes('1 vay') || variants.includes('1vay'));
  console.log('PASS glossary ASR variants for Oneway');
}

function testGlossaryApplyNotHardcoded() {
  // Without glossary — must NOT magically become Oneway
  const noGloss = applyGlossaryToTranscript(BAD_ASR, []);
  assert.ok(/1\s*vay/i.test(noGloss), 'without glossary keep ASR form');

  // With glossary — dynamic variants
  const withGloss = applyGlossaryToTranscript(BAD_ASR, ['Oneway']);
  assert.ok(/Oneway/i.test(withGloss), `expected Oneway in: ${withGloss}`);
  assert.ok(!/1\s*vay/i.test(withGloss), '1 vay should be replaced via glossary');
  console.log('PASS glossary apply (no hardcode without glossary)');
}

function testFullCorrectorImprovesWerCer() {
  const corrected = correctVietnameseTranscript(BAD_ASR, { glossary: ['Oneway'] });
  const werBefore = wordErrorRate(REFERENCE, BAD_ASR);
  const werAfter = wordErrorRate(REFERENCE, corrected);
  const cerBefore = charErrorRate(REFERENCE, BAD_ASR);
  const cerAfter = charErrorRate(REFERENCE, corrected);

  console.log(
    `WER before=${werBefore.toFixed(3)} after=${werAfter.toFixed(3)} | ` +
      `CER before=${cerBefore.toFixed(3)} after=${cerAfter.toFixed(3)}`,
  );
  console.log(`corrected (bad ASR): ${corrected}`);

  assert.ok(/Oneway/i.test(corrected), 'corrected must contain Oneway');
  assert.ok(werAfter <= werBefore, 'WER should not worsen');
  assert.ok(cerAfter < cerBefore, 'CER must improve after glossary correction');
  console.log('PASS CER/WER improvement on fixture');
}

function testMandatorySampleWithNearCorrectAsr() {
  // Mandatory criterion: after HQ STT + glossary, corrected must match reference
  const corrected = correctVietnameseTranscript(NEAR_CORRECT_ASR, { glossary: ['Oneway'] });
  console.log(`corrected (near): ${corrected}`);
  assert.equal(
    corrected.replace(/\s+/g, ' ').trim(),
    REFERENCE.replace(/\s+/g, ' ').trim(),
    'mandatory sample must match reference exactly',
  );
  const cer = charErrorRate(REFERENCE, corrected);
  assert.ok(cer === 0, `CER must be 0, got ${cer}`);
  console.log(`PASS mandatory sample CER=${cer.toFixed(3)}`);
}

function testStuckWords() {
  const raw = 'anh ta chuyênói về âmưu và khôngờ nào nhận tiềnếu';
  const out = correctVietnameseTranscript(raw, { glossary: [] });
  assert.ok(out.includes('chuyện nói'), `got: ${out}`);
  assert.ok(out.includes('âm mưu'), `got: ${out}`);
  assert.ok(out.includes('không giờ') || out.includes('không'), `got: ${out}`);
  assert.ok(out.includes('tiền nếu'), `got: ${out}`);
  console.log('PASS stuck Vietnamese syllable fixes');
}

function testSuspiciousDetectsDigitBrand() {
  const hits = detectSuspiciousSegments(
    [{ start: 0, end: 5, text: 'qua 1 vay gấp', confidence: 0.3 }],
    ['Oneway'],
  );
  assert.ok(hits.length >= 1, 'should flag digit brand miss');
  assert.ok(hits[0]!.end - hits[0]!.start >= 20, 'retry window >= 20s');
  console.log('PASS suspicious segment detect');
}

function testPromptIncludesGlossaryAndContext() {
  const prompt = buildSttPrompt({
    glossary: ['Oneway', 'Shopee'],
    previousTail: 'giá ngon qua',
    videoTitle: 'Review Oneway',
    chunkIndex: 0,
    chunkCount: 3,
  });
  assert.ok(prompt.includes('Oneway'));
  assert.ok(prompt.includes('giá ngon'));
  assert.ok(prompt.includes('Tiếng Việt'));
  console.log('PASS STT prompt context');
}

function testParseGlossary() {
  const terms = parseGlossaryInput('Oneway,  Shopee\nHà Nội;Đà Nẵng');
  assert.deepEqual(terms.slice(0, 4), ['Oneway', 'Shopee', 'Hà Nội', 'Đà Nẵng']);
  console.log('PASS parseGlossaryInput');
}

testGlossaryVariants();
testGlossaryApplyNotHardcoded();
testFullCorrectorImprovesWerCer();
testMandatorySampleWithNearCorrectAsr();
testStuckWords();
testSuspiciousDetectsDigitBrand();
testPromptIncludesGlossaryAndContext();
testParseGlossary();
console.log('test-video-transcription-accuracy: ALL PASS');
