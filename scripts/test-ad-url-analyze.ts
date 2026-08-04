/**
 * Tests: ad URL analyze — SSRF, unsupported hosts, apply empty-only (mirrored).
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-ad-url-analyze.ts
 */
import assert from 'assert';
import {
  detectUnsupportedCommerceHost,
  AD_URL_ANALYZE_LIMITS,
} from '../packages/shared/src/index';
import {
  assertPublicHttpUrl,
  SsrfValidationError,
  FetchPublicError,
  fetchPublicHtmlSafe,
} from '../packages/shared/src/ssrf-fetch';

assert.ok(detectUnsupportedCommerceHost('www.facebook.com'));
assert.ok(detectUnsupportedCommerceHost('tiktok.com'));
assert.ok(detectUnsupportedCommerceHost('shopee.vn'));
assert.strictEqual(detectUnsupportedCommerceHost('example.com'), null);

async function expectSsrf(url: string, code?: string) {
  try {
    await assertPublicHttpUrl(url);
    throw new Error(`Expected SSRF block for ${url}`);
  } catch (e) {
    assert.ok(e instanceof SsrfValidationError, `Expected SsrfValidationError for ${url}`);
    if (code) assert.strictEqual((e as SsrfValidationError).code, code);
  }
}

/** Mirror of apps/web/src/lib/ad-url-analyze-apply.ts (empty-only contract) */
function applyEmptyOnly(
  form: {
    brandName: string;
    productDetails: Record<string, string>;
    serviceDetails: Record<string, string>;
    adPostKind: 'product' | 'service';
  },
  fields: Array<{ path: string; value: string }>,
  allowOverwrite: boolean,
) {
  const next = {
    ...form,
    productDetails: { ...form.productDetails },
    serviceDetails: { ...form.serviceDetails },
  };
  const get = (path: string) => {
    if (path === 'brandName') return next.brandName || '';
    if (path.startsWith('product.')) return next.productDetails[path.slice(8)] || '';
    if (path.startsWith('service.')) return next.serviceDetails[path.slice(8)] || '';
    return '';
  };
  for (const f of fields) {
    if (get(f.path).trim() && !allowOverwrite) continue;
    if (f.path === 'brandName') next.brandName = f.value;
    else if (f.path.startsWith('product.')) {
      next.productDetails[f.path.slice(8)] = f.value;
    } else if (f.path.startsWith('service.')) {
      next.serviceDetails[f.path.slice(8)] = f.value;
    }
  }
  if (next.adPostKind === 'product') {
    next.serviceDetails = Object.fromEntries(
      Object.keys(next.serviceDetails).map((k) => [k, '']),
    );
  } else {
    next.productDetails = Object.fromEntries(
      Object.keys(next.productDetails).map((k) => [k, '']),
    );
  }
  return next;
}

async function main() {
  await expectSsrf('http://127.0.0.1/x', 'PRIVATE_IP');
  await expectSsrf('http://localhost/admin', 'LOCALHOST');
  await expectSsrf('http://169.254.169.254/latest/meta-data/', 'PRIVATE_IP');
  await expectSsrf('ftp://example.com/a', 'BAD_SCHEME');
  await expectSsrf('https://facebook.com/page', 'UNSUPPORTED_HOST');
  await expectSsrf('https://www.tiktok.com/@x/video/1', 'UNSUPPORTED_HOST');
  await expectSsrf('https://shopee.vn/product/1', 'UNSUPPORTED_HOST');
  await expectSsrf('https://lazada.vn/p/1', 'UNSUPPORTED_HOST');
  console.log('SSRF / unsupported host OK');

  try {
    const u = await assertPublicHttpUrl('https://example.com/product');
    assert.strictEqual(u.hostname, 'example.com');
    console.log('valid example.com OK');
  } catch (e) {
    if (e instanceof SsrfValidationError && e.code === 'DNS_FAILED') {
      console.log('skip example.com (DNS)');
    } else {
      throw e;
    }
  }

  try {
    await fetchPublicHtmlSafe('https://example.com/', {
      timeoutMs: 1,
      maxBytes: AD_URL_ANALYZE_LIMITS.maxHtmlBytes,
      maxRedirects: 1,
    });
    console.log('fetch example.com completed (timeout not triggered)');
  } catch (e) {
    assert.ok(
      e instanceof FetchPublicError || e instanceof SsrfValidationError,
      'fetch error type',
    );
    console.log('fetch error/timeout OK:', (e as Error).message.slice(0, 80));
  }

  const productFields = [
    { path: 'brandName', value: 'Brand A' },
    { path: 'product.name', value: 'Serum X' },
    { path: 'product.price', value: '100k' },
    { path: 'product.features', value: 'Vitamin C' },
  ];
  const form = {
    adPostKind: 'product' as const,
    brandName: 'Existing Brand',
    productDetails: { name: 'Old name', price: '', features: '' },
    serviceDetails: { name: '' },
  };
  const filled = applyEmptyOnly(form, productFields, false);
  assert.strictEqual(filled.brandName, 'Existing Brand', 'no overwrite brand');
  assert.strictEqual(filled.productDetails.name, 'Old name', 'no overwrite name');
  assert.strictEqual(filled.productDetails.price, '100k', 'fill empty price');
  assert.strictEqual(filled.productDetails.features, 'Vitamin C');

  const overwritten = applyEmptyOnly(form, productFields, true);
  assert.strictEqual(overwritten.brandName, 'Brand A');
  assert.strictEqual(overwritten.productDetails.name, 'Serum X');

  const serviceFields = [
    { path: 'service.name', value: 'Massage đá nóng' },
    { path: 'service.duration', value: '60 phút' },
  ];
  const sForm = {
    adPostKind: 'service' as const,
    brandName: '',
    productDetails: { name: 'Should clear' },
    serviceDetails: { name: '', duration: '' },
  };
  const sFilled = applyEmptyOnly(sForm, serviceFields, false);
  assert.strictEqual(sFilled.serviceDetails.name, 'Massage đá nóng');
  assert.strictEqual(sFilled.serviceDetails.duration, '60 phút');
  assert.strictEqual(sFilled.productDetails.name, '', 'product cleared for service');

  // Invalid URL format
  await expectSsrf('not-a-url', 'INVALID_URL');
  await expectSsrf('', 'EMPTY_URL');

  console.log('product/service apply + no-overwrite OK');
  console.log('✅ ad-url-analyze tests PASSED');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
