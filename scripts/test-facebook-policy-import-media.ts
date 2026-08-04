/**
 * Facebook policy import / media / merge — SSRF, FB permissions, OCR VN, video no audio, landing mismatch.
 * Run: pnpm test:facebook-policy-import
 */
import assert from 'node:assert/strict';
import { CrawlValidationError } from '../apps/api/src/chatbot-cskh/utils/website-crawl.util';
import { assertPublicHttpUrl } from '../apps/api/src/content-marketing/facebook-policy/facebook-policy-ssrf-fetch';
import {
  detectPolicyUrlKind,
  parseFacebookContentUrl,
} from '../apps/api/src/content-marketing/facebook-policy/facebook-policy-url-parse';
import {
  analyzeLandingSignals,
  importPolicyUrl,
} from '../apps/api/src/content-marketing/facebook-policy/facebook-policy-import.logic';
import {
  analyzePolicyVideo,
  findingsFromMediaText,
  scanStrongMediaClaims,
} from '../apps/api/src/content-marketing/facebook-policy/facebook-policy-media.logic';
import { checkFacebookAdPolicyMerged } from '../apps/api/src/content-marketing/facebook-policy/facebook-policy-merge.logic';
import { checkFacebookAdPolicy } from '../apps/api/src/content-marketing/facebook-policy/facebook-policy.logic';

async function expectCrawlFail(url: string, label: string) {
  try {
    await assertPublicHttpUrl(url);
    assert.fail(`${label}: expected SSRF block for ${url}`);
  } catch (e) {
    assert.ok(
      e instanceof CrawlValidationError ||
        (e instanceof Error && /nội bộ|không hợp lệ|http/i.test(e.message)),
      `${label}: ${e instanceof Error ? e.message : e}`,
    );
  }
}

async function main() {
  // --- Bad URL / SSRF ---
  await expectCrawlFail('not-a-url', 'bad url');
  await expectCrawlFail('ftp://example.com/x', 'bad protocol');
  await expectCrawlFail('http://localhost/admin', 'localhost');
  await expectCrawlFail('http://127.0.0.1/', 'loopback');
  await expectCrawlFail('http://192.168.1.10/secret', 'private lan');
  await expectCrawlFail('http://10.0.0.5/', 'private 10.x');
  await expectCrawlFail('http://169.254.169.254/latest/meta-data/', 'link-local metadata');

  // Redirect hop into private IP is blocked by assertPublicHttpUrl on each hop
  await expectCrawlFail('http://[::1]/', 'ipv6 loopback');

  // --- URL kind detection ---
  assert.equal(detectPolicyUrlKind('https://example.com/blog/a'), 'website');
  assert.equal(
    detectPolicyUrlKind('https://www.facebook.com/foo/posts/123'),
    'facebook_post',
  );
  assert.equal(
    detectPolicyUrlKind('https://www.facebook.com/reel/987654321'),
    'facebook_reel',
  );
  assert.equal(
    detectPolicyUrlKind('https://www.facebook.com/watch/?v=111'),
    'facebook_video',
  );
  assert.equal(
    detectPolicyUrlKind('https://example.com/lp', 'landing_page'),
    'landing_page',
  );

  const parsed = parseFacebookContentUrl(
    'https://www.facebook.com/MySpa/posts/pfbid0abc',
  );
  assert.ok(parsed);
  assert.equal(parsed!.kind, 'facebook_post');

  // --- Facebook missing OAuth / permissions ---
  const mockPrisma = {
    autoPostFacebookPage: {
      findMany: async () => [],
    },
  };
  const mockConfig = {
    get: () => '',
  };
  const fbMissing = await importPolicyUrl({
    url: 'https://www.facebook.com/MySpa/posts/123456789',
    userId: 'user-1',
    organizationId: 'org-1',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma: mockPrisma as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: mockConfig as any,
  });
  assert.equal(fbMissing.editable, true);
  // No OAuth: either PERMISSION_REQUIRED, or public scrape result / insufficient
  if (!fbMissing.primaryText?.trim()) {
    assert.equal(fbMissing.insufficientData, true);
    assert.ok(
      fbMissing.statusHint === 'PERMISSION_REQUIRED' ||
        fbMissing.statusHint === 'INSUFFICIENT_DATA',
    );
    assert.ok(
      /OAuth|Fanpage|caption|transcript|nội dung|INSUFFICIENT|PERMISSION/i.test(
        [...fbMissing.warnings, fbMissing.message || ''].join(' '),
      ),
    );
  } else {
    assert.equal(fbMissing.statusHint, 'OK');
  }

  // Pages connected but missing scopes → PERMISSION_REQUIRED
  const mockPrismaNoScope = {
    autoPostFacebookPage: {
      findMany: async () => [
        {
          id: 'row1',
          pageId: '111',
          pageName: 'MySpa',
          encryptedPageAccessToken: 'cipher',
          connection: { organizationId: 'org-1', scopes: [] },
        },
      ],
    },
  };
  const mockConfigKey = {
    get: (k: string) => (k === 'ENCRYPTION_KEY' ? 'x'.repeat(32) : ''),
  };
  // decrypt will fail → empty pages → MISSING_OAUTH or failed import
  const fbDecryptFail = await importPolicyUrl({
    url: 'https://www.facebook.com/111/posts/222',
    userId: 'user-1',
    organizationId: 'org-1',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma: mockPrismaNoScope as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: mockConfigKey as any,
  });
  assert.equal(fbDecryptFail.insufficientData, true);
  assert.ok(
    fbDecryptFail.statusHint === 'PERMISSION_REQUIRED' ||
      fbDecryptFail.statusHint === 'INSUFFICIENT_DATA',
  );

  // --- OCR tiếng Việt: weight+time claim ---
  const ocr = 'Giảm 10 kg trong 7 ngày';
  const strong = scanStrongMediaClaims(ocr, 'img');
  assert.ok(
    strong.some((f) => f.id.includes('weight-time-claim')),
    'VN OCR weight claim must flag',
  );
  const mediaFindings = findingsFromMediaText(ocr, 'img');
  assert.ok(mediaFindings.length >= 1);

  // Caption safe + OCR risky → merge still high risk (never treat as safe)
  const safeOnly = await checkFacebookAdPolicy(
    {
      headline: 'Chăm sóc da dịu nhẹ',
      primaryText: 'Serum dưỡng ẩm cho da nhạy cảm, dùng hàng ngày.',
      productService: 'Serum dưỡng ẩm',
      brandName: 'Spa Demo',
      organizationId: 'org-merge',
    },
    undefined,
  );
  const merged = await checkFacebookAdPolicyMerged({
    input: {
      headline: 'Chăm sóc da dịu nhẹ',
      primaryText: 'Serum dưỡng ẩm cho da nhạy cảm, dùng hàng ngày.',
      productService: 'Serum dưỡng ẩm',
      brandName: 'Spa Demo',
      organizationId: 'org-merge',
    },
    media: [
      {
        mediaType: 'image',
        ocrText: ocr,
        transcript: '',
        caption: '',
        visualNotes: [],
        regions: [],
        findings: mediaFindings,
        insufficientData: false,
        statusHint: 'OK',
        warnings: [],
      },
    ],
  });
  assert.ok(merged.findings.some((f) => /weight-time|HEALTH|img:/i.test(f.id + f.policyGroup)));
  assert.notEqual(merged.overallStatus, 'PASS_CANDIDATE');
  assert.ok(
    merged.riskScore >= safeOnly.riskScore,
    'OCR claim must not lower risk vs caption-only',
  );

  // --- Video không có audio / transcript → INSUFFICIENT_DATA (không an toàn) ---
  const noAudio = await analyzePolicyVideo({
    buffer: Buffer.from('fake-video-bytes'),
    mimeType: 'video/mp4',
    filename: 'silent.mp4',
    caption: '',
    manualTranscript: '',
    openai: undefined,
  });
  assert.equal(noAudio.insufficientData, true);
  assert.equal(noAudio.statusHint, 'INSUFFICIENT_DATA');
  assert.ok(/INSUFFICIENT_DATA/i.test(noAudio.message || ''));

  const mergedInsufficient = await checkFacebookAdPolicyMerged({
    input: {
      headline: 'Video demo',
      primaryText: 'Xem video để biết thêm.',
      organizationId: 'org-vid',
    },
    media: [noAudio],
  });
  assert.equal(mergedInsufficient.overallStatus, 'INSUFFICIENT_DATA');

  // --- Landing page mismatch ---
  const landingHtml = `
    <html><body>
      <form><input type="password" name="card" /><input name="cvv" /></form>
      <p>Sản phẩm: Máy lọc không khí XYZ Pro</p>
      <p>Giá chỉ 9.900.000đ — Mua ngay</p>
      <p>Nhập OTP ngân hàng để xác minh tài khoản PayPal</p>
    </body></html>
  `;
  const landingText =
    'Sản phẩm: Máy lọc không khí XYZ Pro. Giá chỉ 9.900.000đ. Mua ngay. Nhập OTP ngân hàng để xác minh tài khoản PayPal.';
  const landing = analyzeLandingSignals(landingHtml, landingText);
  assert.ok(landing.productHints.length >= 1 || landing.priceHints.length >= 1);
  assert.equal(landing.hasSensitiveForm, true);
  assert.ok(landing.phishingSignals.length >= 1);

  const landingMerged = await checkFacebookAdPolicyMerged({
    input: {
      headline: 'Serum nám ABC',
      primaryText: 'Serum nám ABC chỉ 499.000đ — Inbox ngay',
      productService: 'Serum nám ABC',
      cta: 'Inbox ngay',
      organizationId: 'org-lp',
    },
    landingImport: {
      sourceType: 'landing_page',
      url: 'https://example.com/lp',
      editable: true,
      primaryText: landingText,
      warnings: [],
      insufficientData: false,
      landing,
    },
  });
  assert.ok(
    landingMerged.findings.some(
      (f) =>
        f.id.includes('landing-product-mismatch') ||
        f.id.includes('landing-phishing') ||
        f.id.includes('landing-price'),
    ),
    'landing mismatch / phishing must flag',
  );
  assert.ok(
    ['REVIEW_REQUIRED', 'HIGH_RISK', 'PROHIBITED'].includes(landingMerged.overallStatus),
  );

  // --- Caption extract from FB HTML (public) ---
  const {
    extractFacebookCaptionFromHtml,
  } = await import(
    '../apps/api/src/content-marketing/facebook-policy/facebook-policy-import.logic'
  );
  const fakeHtml = `
    <html><head><title>Fanpage Demo</title></head>
    <body>
      <script>{"message":{"__typename":"TextWithEntities","text":"Serum dưỡng ẩm cho da nhạy cảm — dùng hàng ngày nhẹ nhàng."}}</script>
    </body></html>
  `;
  const cap = extractFacebookCaptionFromHtml(fakeHtml);
  assert.ok(cap.text.includes('Serum dưỡng ẩm'));

  console.log('test-facebook-policy-import-media: PASS');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
