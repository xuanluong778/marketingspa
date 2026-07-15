/**
 * Validation helpers mirrored from Meta Fanpage publish rules (no network).
 * Run: node scripts/test-meta-fanpage.cjs
 */
const assert = require('assert');

function assertHttpUrl(value, label) {
  if (!value) return;
  const u = new URL(value);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`${label} must be http/https`);
  }
}

function validatePublishPayload({ message, link, imageUrl }) {
  const msg = (message || '').trim();
  if (!msg) throw new Error('empty message');
  const l = (link || '').trim() || undefined;
  const img = (imageUrl || '').trim() || undefined;
  if (l && img) throw new Error('link and image exclusive');
  assertHttpUrl(l, 'Link');
  assertHttpUrl(img, 'Ảnh');
  return { message: msg, link: l, imageUrl: img };
}

function maskPageId(pageId) {
  if (pageId.length <= 8) return `${pageId.slice(0, 2)}***`;
  return `${pageId.slice(0, 4)}***${pageId.slice(-4)}`;
}

function responseHasTokenLeak(payload) {
  const raw = JSON.stringify(payload).toLowerCase();
  return (
    raw.includes('access_token') ||
    raw.includes('page_access_token') ||
    raw.includes('meta_page_access_token')
  );
}

assert.throws(() => validatePublishPayload({ message: '  ' }));
assert.throws(() =>
  validatePublishPayload({
    message: 'hi',
    link: 'https://a.com',
    imageUrl: 'https://b.com/x.jpg',
  }),
);
assert.throws(() => validatePublishPayload({ message: 'hi', link: 'ftp://x' }));
assert.deepStrictEqual(
  validatePublishPayload({ message: ' Hello ', link: 'https://spa.vn' }),
  { message: 'Hello', link: 'https://spa.vn', imageUrl: undefined },
);
assert.strictEqual(maskPageId('1328676135903477'), '1328***3477');
assert.strictEqual(
  responseHasTokenLeak({ connected: true, pageIdMasked: '1328***3477' }),
  false,
);
assert.strictEqual(
  responseHasTokenLeak({ token: 'EAA...', access_token: 'secret' }),
  true,
);

console.log('test-meta-fanpage: all passed');
