/**
 * Opinion analyze API — unit tests (SSRF, single-source warning, schema, paste fallback).
 * Run: pnpm test:opinion-analyze
 */
import assert from 'node:assert/strict';
import { CrawlValidationError } from '../apps/api/src/chatbot-cskh/utils/website-crawl.util';
import { assertPublicHttpUrl } from '../apps/api/src/content-marketing/facebook-policy/facebook-policy-ssrf-fetch';
import {
  __test,
  analyzeOpinionSource,
} from '../apps/api/src/content-marketing/opinion-analyze.logic';

async function expectSsrfFail(url: string) {
  try {
    await assertPublicHttpUrl(url);
    assert.fail(`expected SSRF block for ${url}`);
  } catch (e) {
    assert.ok(
      e instanceof CrawlValidationError ||
        (e instanceof Error && /nội bộ|không hợp lệ|http/i.test(e.message)),
    );
  }
}

async function main() {
  const { templateOpinionAnalyze, ensureSingleSourceWarning, SINGLE_SOURCE_WARNING, emptyResult } =
    __test;

  const empty = emptyResult({ message: 'Thiếu nội dung' });
  assert.equal(empty.insufficientData, true);
  assert.equal(empty.sourceSummary, '');
  assert.ok(Array.isArray(empty.confirmedFacts));

  await expectSsrfFail('http://127.0.0.1/');
  await expectSsrfFail('http://localhost/x');
  await expectSsrfFail('http://192.168.0.10/');

  const sample = templateOpinionAnalyze(
    'Ngày 1/7 tại Hà Nội xảy ra sự việc. Người ta nói rằng nhân vật A cố ý. Bị tố gian lận.',
  );
  assert.ok(sample.sourceSummary.length > 0);
  assert.ok(sample.confirmedFacts.length >= 1);
  assert.ok(sample.unverifiedClaims.length >= 1);
  assert.ok(sample.mainControversy.length > 0);
  assert.ok(sample.suggestedAngles.length >= 3 && sample.suggestedAngles.length <= 5);
  assert.ok(sample.missingInformation.length >= 1);
  assert.ok(
    sample.warnings.some(
      (w) => w.includes(SINGLE_SOURCE_WARNING) || w.includes('kiểm chứng'),
    ),
  );
  assert.ok(!/đúng là|sai hoàn toàn|thủ phạm/i.test(sample.mainControversy));

  const w1 = ensureSingleSourceWarning([], 1);
  assert.ok(w1.includes(SINGLE_SOURCE_WARNING));

  const mockPrisma = { autoPostFacebookPage: { findMany: async () => [] } };
  const mockConfig = { get: () => '' };

  const pasted = await analyzeOpinionSource({
    dto: {
      sourceText:
        'Theo báo cáo ngày 2/5 tại TP.HCM. Có ý kiến cho rằng bên B thiếu trách nhiệm.',
      transcript: 'Transcript: diễn biến được tường thuật lại.',
    },
    userId: 'u1',
    organizationId: 'org1',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma: mockPrisma as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: mockConfig as any,
    openai: undefined,
  });
  assert.ok(pasted.sourceSummary);
  assert.ok(pasted.suggestedAngles.length >= 3);
  assert.ok(pasted.warnings.some((w) => w.includes('kiểm chứng')));
  assert.equal(pasted.analysisSource, 'template');

  const fbOnly = await analyzeOpinionSource({
    dto: { sourceUrl: 'https://www.facebook.com/SomePage/posts/123456' },
    userId: 'u1',
    organizationId: 'org1',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma: mockPrisma as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: mockConfig as any,
  });
  assert.equal(fbOnly.insufficientData, true);
  assert.ok(
    /dán|transcript|OAuth|Fanpage|thủ công|PERMISSION|MISSING/i.test(
      [...fbOnly.warnings, fbOnly.message || ''].join(' '),
    ),
  );

  const fbPlusPaste = await analyzeOpinionSource({
    dto: {
      sourceUrl: 'https://www.facebook.com/SomePage/posts/123456',
      sourceText: 'Tôi dán caption thủ công vì thiếu quyền Graph. Ngày 3 xảy ra sự việc X.',
    },
    userId: 'u1',
    organizationId: 'org1',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma: mockPrisma as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: mockConfig as any,
  });
  assert.ok(fbPlusPaste.sourceSummary.length > 0);
  assert.ok(fbPlusPaste.extractedText?.includes('dán caption'));

  console.log('test-opinion-analyze: PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
