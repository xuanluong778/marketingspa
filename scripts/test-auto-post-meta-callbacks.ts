/**
 * Unit tests: Meta signed_request + Auto Post deauthorize / data-deletion helpers.
 * Run: node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-auto-post-meta-callbacks.ts
 *
 * Pure logic is imported from the API source tree (no Nest bootstrap).
 */
import assert from 'node:assert/strict';
import { createHmac } from 'crypto';
import {
  assertHttpsRequest,
  base64UrlEncode,
  buildDataDeletionConfirmationCode,
  buildSignedRequestForTest,
  maskFacebookUserId,
  parseAndVerifySignedRequest,
  SignedRequestError,
} from '../apps/api/src/auto-post/auto-post-signed-request';

const APP_SECRET = 'test-meta-app-secret-do-not-use-in-prod';

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

// --- signed_request verify ---
{
  section('parseAndVerifySignedRequest accepts valid HMAC-SHA256');
  const sr = buildSignedRequestForTest(
    { user_id: 'fb-user-12345', issued_at: 1_700_000_000 },
    APP_SECRET,
  );
  const payload = parseAndVerifySignedRequest(sr, APP_SECRET);
  assert.equal(payload.user_id, 'fb-user-12345');
  assert.equal(payload.algorithm, 'HMAC-SHA256');
  assert.equal(payload.issued_at, 1_700_000_000);
}

{
  section('rejects tampered signature');
  const sr = buildSignedRequestForTest(
    { user_id: 'fb-user-1', issued_at: 100 },
    APP_SECRET,
  );
  const [, payloadPart] = sr.split('.');
  const fakeSig = base64UrlEncode(Buffer.alloc(32, 7));
  const bad = `${fakeSig}.${payloadPart}`;
  assert.throws(
    () => parseAndVerifySignedRequest(bad, APP_SECRET),
    (e: unknown) => e instanceof SignedRequestError,
  );
}

{
  section('rejects wrong app secret');
  const sr = buildSignedRequestForTest(
    { user_id: 'fb-user-1', issued_at: 100 },
    APP_SECRET,
  );
  assert.throws(
    () => parseAndVerifySignedRequest(sr, 'wrong-secret'),
    (e: unknown) => e instanceof SignedRequestError && /mismatch/.test(e.message),
  );
}

{
  section('rejects missing / malformed signed_request');
  assert.throws(() => parseAndVerifySignedRequest('', APP_SECRET));
  assert.throws(() => parseAndVerifySignedRequest('onlyonepart', APP_SECRET));
  assert.throws(() => parseAndVerifySignedRequest('a.b', APP_SECRET));
}

{
  section('rejects unsupported algorithm');
  const encodedPayload = base64UrlEncode(
    Buffer.from(
      JSON.stringify({
        algorithm: 'HMAC-SHA1',
        issued_at: 1,
        user_id: 'u1',
      }),
      'utf8',
    ),
  );
  const sig = createHmac('sha256', APP_SECRET).update(encodedPayload).digest();
  const sr = `${base64UrlEncode(sig)}.${encodedPayload}`;
  assert.throws(
    () => parseAndVerifySignedRequest(sr, APP_SECRET),
    (e: unknown) => e instanceof SignedRequestError && /algorithm/.test(e.message),
  );
}

{
  section('does not require oauth_token and never needs to log secrets');
  const sr = buildSignedRequestForTest(
    {
      user_id: 'u99',
      issued_at: 42,
      oauth_token: 'EAA_SHOULD_NEVER_APPEAR_IN_LOGS',
    },
    APP_SECRET,
  );
  const payload = parseAndVerifySignedRequest(sr, APP_SECRET);
  assert.equal(payload.user_id, 'u99');
  // Sanity: helpers must not stringify secret into confirmation codes
  const code = buildDataDeletionConfirmationCode(payload.user_id);
  assert.ok(!code.includes(APP_SECRET));
  assert.ok(!code.includes('EAA_'));
}

// --- confirmation code idempotency ---
{
  section('confirmation_code is deterministic per facebook user');
  const a = buildDataDeletionConfirmationCode('111');
  const b = buildDataDeletionConfirmationCode('111');
  const c = buildDataDeletionConfirmationCode('222');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^apd_[a-f0-9]{24}$/);
}

{
  section('maskFacebookUserId keeps only last 4');
  assert.equal(maskFacebookUserId('1234567890'), '••••7890');
  assert.equal(maskFacebookUserId('ab'), '••••');
}

// --- HTTPS gate ---
{
  section('assertHttpsRequest enforces HTTPS in production');
  assert.doesNotThrow(() =>
    assertHttpsRequest({
      nodeEnv: 'development',
      secure: false,
      forwardedProto: 'http',
    }),
  );
  assert.doesNotThrow(() =>
    assertHttpsRequest({
      nodeEnv: 'production',
      secure: true,
      forwardedProto: 'http',
    }),
  );
  assert.doesNotThrow(() =>
    assertHttpsRequest({
      nodeEnv: 'production',
      secure: false,
      forwardedProto: 'https',
    }),
  );
  assert.throws(
    () =>
      assertHttpsRequest({
        nodeEnv: 'production',
        secure: false,
        forwardedProto: 'http',
      }),
    (e: unknown) => e instanceof SignedRequestError && /HTTPS/.test(e.message),
  );
}

// --- endpoint path contract (documented for Meta App Dashboard) ---
{
  section('Meta callback path contract');
  const base = 'https://marketingautoaz.com/api/v1/auto-post/facebook';
  assert.equal(`${base}/deauthorize`, 'https://marketingautoaz.com/api/v1/auto-post/facebook/deauthorize');
  assert.equal(
    `${base}/data-deletion`,
    'https://marketingautoaz.com/api/v1/auto-post/facebook/data-deletion',
  );
  const code = buildDataDeletionConfirmationCode('fb');
  const statusUrl = `https://marketingautoaz.com/facebook/data-deletion/status/${code}`;
  assert.ok(statusUrl.includes(code));
}

console.log('\ntest-auto-post-meta-callbacks: all passed');
