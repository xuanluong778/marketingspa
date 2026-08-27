/**
 * WAVE2 precheck — singleton worker, upload validation/UI, Zalo webhook, platform-admin RBAC.
 * Run: node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-wave2-precheck.ts
 */
import assert from 'node:assert/strict';
import { createHmac, createHash, randomUUID } from 'crypto';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import {
  assertUploadFile,
  PUBLIC_UPLOAD_PREFIX,
} from '../apps/api/src/common/uploads/upload-policy';
import {
  signUploadPath,
  verifyUploadSignature,
  withSignedUploadUrl,
} from '../apps/api/src/common/uploads/upload-signed-url';
import {
  buildZaloWebhookMacHex,
  verifyZaloWebhookSignature,
} from '../packages/shared/src/zalo-webhook-signature';

const results: Array<{ name: string; pass: boolean; detail: string }> = [];
function record(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
}

function testUploadPolicy() {
  assert.throws(() => assertUploadFile('document', { originalname: 'x.exe', size: 10, mimetype: 'application/octet-stream' }));
  assert.throws(() => assertUploadFile('document', { originalname: 'x.php.pdf', size: 10, mimetype: 'application/pdf' }));
  assert.throws(() => assertUploadFile('image', { originalname: 'a.png', size: 0, mimetype: 'image/png' }));
  const ok = assertUploadFile('image', { originalname: 'a.png', size: 100, mimetype: 'image/png' });
  assert.equal(ok.ext, '.png');
  const { exp, sig } = signUploadPath('hrm/org/file.png', 60);
  assert.ok(verifyUploadSignature('hrm/org/file.png', exp, sig));
  assert.ok(!verifyUploadSignature('hrm/org/file.png', exp, '0'.repeat(64)));
  const signed = withSignedUploadUrl('/uploads/hrm/org/file.png');
  assert.ok(signed.includes('sig='));
  record('UPLOAD_POLICY_UNIT', true, 'MIME/ext/signed-url OK');
}

function testZaloMacUnit() {
  const appId = 'app';
  const secret = 'oa-secret';
  const body = Buffer.from(JSON.stringify({ oa_id: '1', timestamp: '123', event_name: 'user_send_text' }));
  const mac = buildZaloWebhookMacHex({ appId, rawBody: body, timestamp: '123', oaSecretKey: secret });
  assert.ok(
    verifyZaloWebhookSignature({
      rawBody: body,
      signature: `mac=${mac}`,
      appId,
      timestamp: '123',
      oaSecretKey: secret,
    }),
  );
  assert.ok(
    !verifyZaloWebhookSignature({
      rawBody: body,
      signature: `mac=${'ab'.repeat(32)}`,
      appId,
      timestamp: '123',
      oaSecretKey: secret,
    }),
  );
  record('ZALO_MAC_UNIT', true, 'official MAC verify OK');
}

async function main() {
  try {
    testUploadPolicy();
    testZaloMacUnit();
  } catch (e) {
    record('FATAL', false, e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  } finally {
    console.log('\n--- unit summary ---');
    for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}`);
    if (results.some((r) => !r.pass)) process.exitCode = 1;
  }
}

main();
