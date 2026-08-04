/**
 * Fanpage permissions taxonomy + Login Config ID.
 * Run: pnpm test:fanpage-permissions
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  classifyMetaGraphError,
  toLegacyErrorCode,
} from '../apps/api/src/auto-post/auto-post-facebook-page-details.logic';
import { MARKETINGAUTOAZ_META_LOGIN_CONFIG_ID } from '../apps/api/src/auto-post/assert-auto-post-meta-oauth';

const root = path.join(__dirname, '..');

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function main() {
  assert.equal(MARKETINGAUTOAZ_META_LOGIN_CONFIG_ID, '2006772376877449');

  const meta = read('apps/api/src/auto-post/auto-post-meta.service.ts');
  assert.ok(meta.includes('getPermissionStatuses'));
  assert.ok(meta.includes('diagnoseUserPermissions'));
  assert.ok(meta.includes('me/permissions'));
  assert.ok(meta.includes('granted=['));

  const cb = read('apps/api/src/auto-post/auto-post-facebook.service.ts');
  assert.ok(cb.includes('diagnoseUserPermissions'));
  assert.ok(cb.includes('PERMISSION_DECLINED'));
  assert.ok(cb.includes('getPermissionsDiagnostics'));
  assert.ok(cb.includes('invalidateOrgCache'));

  const details = read('apps/api/src/auto-post/auto-post-facebook-page-details.service.ts');
  assert.ok(details.includes('getManagedPages'));
  assert.ok(details.includes('encryptedPageAccessToken'));
  assert.ok(details.includes('permission_missing') || details.includes('permission_declined'));
  assert.ok(details.includes('pageTokenRefreshed'));
  assert.ok(details.includes('FANPAGE_DETAILS_SAFE_POST_FIELDS') || details.includes('mergeConnectionScopes'));
  assert.ok(!details.includes('likes.summary(true)'));
  assert.ok(!details.includes('pages_read_engagement: true,'));

  const logic = read('apps/api/src/auto-post/auto-post-facebook-page-details.logic.ts');
  assert.ok(logic.includes('FANPAGE_DETAILS_SAFE_POST_FIELDS'));
  assert.ok(logic.includes('mergeConnectionScopes'));
  assert.ok(!logic.includes("likes.summary(true)"));

  const ctrl = read('apps/api/src/auto-post/auto-post.controller.ts');
  assert.ok(ctrl.includes('permissions-diagnostics'));

  const missing = classifyMetaGraphError({
    code: 10,
    message: '(#10) Application does not have permission for this action: pages_read_engagement',
  });
  assert.equal(missing.code, 'permission_missing');

  const generic = classifyMetaGraphError({
    code: 200,
    message: 'Permissions error',
  });
  assert.equal(generic.code, 'META_API_ERROR');

  assert.equal(toLegacyErrorCode('permission_missing'), 'MISSING_PAGES_READ_ENGAGEMENT');
  assert.equal(toLegacyErrorCode('expired_token'), 'TOKEN_EXPIRED');
  assert.equal(toLegacyErrorCode('rate_limited'), 'META_RATE_LIMIT');

  console.log('PASS login config 2006772376877449');
  console.log('PASS /me/permissions diag + declined + missing');
  console.log('PASS page token refresh + no forced engagement flag');
  console.log('PASS error taxonomy not lumped');
  console.log('PASS permissions-diagnostics endpoint');
  console.log('\nALL fanpage-permissions checks PASS');
}

main();
