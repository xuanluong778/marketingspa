/**
 * Encryption audit tests — AES-256-GCM for Facebook/Meta tokens.
 * Không in plaintext/ciphertext đầy đủ ra stdout.
 *
 * Run: pnpm exec tsx scripts/test-encryption-aes-gcm.ts
 */
import assert from 'node:assert/strict';
import {
  encryptSecret,
  decryptSecret,
} from '../apps/api/src/common/utils/encryption.util';
import { decryptSecret as workerDecrypt } from '../apps/worker/src/lib/encryption';
import { decryptSecret as workerAutoPostDecrypt } from '../apps/worker/src/lib/auto-post-publish';
import {
  assertNoCredentialLeak,
  redactForAudit,
} from '../apps/api/src/common/utils/token-security.util';
import { toOAuthPagesListItem } from '../apps/api/src/auto-post/auto-post-meta-pages.util';
import { assertEncryptionKeyConfigured } from '../apps/api/src/common/utils/assert-encryption-key';

const KEY = 'audit-test-encryption-key-32chars!!';
const SAMPLE = 'EAA_TEST_TOKEN_VALUE_DO_NOT_LOG_FULL';

function mask(s: string): string {
  if (s.length <= 8) return '****';
  return `${s.slice(0, 4)}…${s.slice(-4)} (len=${s.length})`;
}

function main() {
  console.log('1) encrypt → decrypt roundtrip');
  const c1 = encryptSecret(SAMPLE, KEY);
  const plain = decryptSecret(c1, KEY);
  assert.equal(plain, SAMPLE);
  console.log('   PASS roundtrip', mask(c1));

  console.log('2) same plaintext → different ciphertext (random IV)');
  const c2 = encryptSecret(SAMPLE, KEY);
  assert.notEqual(c1, c2);
  assert.equal(decryptSecret(c2, KEY), SAMPLE);
  console.log('   PASS unique ciphertext');

  console.log('3) tampered ciphertext / auth tag must fail');
  const buf = Buffer.from(c1, 'base64');
  buf[buf.length - 1] ^= 0xff;
  const tampered = buf.toString('base64');
  assert.throws(() => decryptSecret(tampered, KEY));
  const buf2 = Buffer.from(c1, 'base64');
  // flip a byte inside auth tag region (bytes 16..31)
  buf2[20] ^= 0xff;
  assert.throws(() => decryptSecret(buf2.toString('base64'), KEY));
  console.log('   PASS tamper detection');

  console.log('4) API oauth/pages DTO must not include access_token');
  const item = toOAuthPagesListItem({
    id: '111',
    name: 'Test Page',
    access_token: SAMPLE,
    tasks: ['CREATE_CONTENT'],
  });
  const json = JSON.stringify(item);
  assert.ok(!json.includes(SAMPLE));
  assert.ok(!('access_token' in item));
  assertNoCredentialLeak(item, SAMPLE);
  console.log('   PASS no token in OAuth pages DTO');

  console.log('5) audit redact must not leak encrypted fields / tokens');
  const redacted = redactForAudit({
    encryptedAccessToken: c1,
    encryptedPageAccessToken: c2,
    accessToken: SAMPLE,
    pageAccessToken: SAMPLE,
    note: 'ok',
  }) as Record<string, unknown>;
  const redactedJson = JSON.stringify(redacted);
  assert.ok(!redactedJson.includes(SAMPLE));
  assert.ok(!redactedJson.includes(c1));
  assert.equal(redacted.encryptedAccessToken, '[redacted]');
  assert.equal(redacted.note, 'ok');
  console.log('   PASS audit redact');

  console.log('6) API encrypt ↔ worker decrypt compatibility');
  process.env.ENCRYPTION_KEY = KEY;
  const fromApi = encryptSecret(SAMPLE, KEY);
  assert.equal(workerDecrypt(fromApi, KEY), SAMPLE);
  assert.equal(workerAutoPostDecrypt(fromApi), SAMPLE);
  console.log('   PASS API↔worker decrypt');

  console.log('7) assertEncryptionKeyConfigured');
  assert.throws(() => assertEncryptionKeyConfigured(''));
  assert.throws(() => assertEncryptionKeyConfigured('short'));
  assert.throws(() => assertEncryptionKeyConfigured('change_me_encryption_key_min_32_chars'));
  assert.equal(assertEncryptionKeyConfigured(KEY), KEY);
  console.log('   PASS key validation');

  console.log('\nALL ENCRYPTION TESTS PASSED');
}

main();
