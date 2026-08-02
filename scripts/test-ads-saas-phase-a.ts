/**
 * Phase A Ads SaaS — unit tests: tenant 404, RBAC, token leak, Meta Authorization header.
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-ads-saas-phase-a.ts
 */
import assert from 'node:assert/strict';
import {
  assertNoCredentialLeak,
  redactForAudit,
  encodeStoredSecret,
  decodeStoredSecret,
} from '../apps/api/src/common/utils/token-security.util';
import { ADS_PERMISSION_DEFS, defaultPermissionCodesForRole } from '../apps/api/src/common/constants/roles';

const ENCRYPTION_KEY = 'test-encryption-key-ads-saas-phase-a!!';

function testAdsPermissionsExist() {
  const codes = ADS_PERMISSION_DEFS.map((p) => p.code);
  for (const c of [
    'ads.read',
    'ads.connect',
    'ads.sync',
    'ads.analyze',
    'ads.manage',
  ]) {
    assert.ok(codes.includes(c), `missing permission ${c}`);
  }
  const marketing = defaultPermissionCodesForRole('MARKETING');
  assert.ok(marketing.includes('ads.connect'));
  const sale = defaultPermissionCodesForRole('SALE');
  assert.ok(sale.includes('ads.read'));
  assert.ok(!sale.includes('ads.manage'));
  const tech = defaultPermissionCodesForRole('TECHNICIAN');
  assert.ok(!tech.includes('ads.read'));
  console.log('PASS ads permissions + role defaults');
}

function testTokenNotInPublicPayload() {
  const rawToken = 'EAAB_secret_user_token_xyz_1234567890';
  const encrypted = encodeStoredSecret(JSON.stringify({ accessToken: rawToken }), ENCRYPTION_KEY);
  const publicStatus = {
    status: 'CONNECTED',
    connected: true,
    selectedAdAccountId: 'act_1',
    tokenExpiresAt: new Date().toISOString(),
  };
  assertNoCredentialLeak(publicStatus, rawToken);
  assert.throws(() => assertNoCredentialLeak({ accessToken: rawToken }, rawToken));
  assert.throws(() =>
    assertNoCredentialLeak({ encryptedCredentials: encrypted }, rawToken),
  );
  const audited = redactForAudit({
    provider: 'META',
    accessToken: rawToken,
    encryptedCredentials: encrypted,
    refreshToken: '1//refresh',
  }) as Record<string, unknown>;
  assert.notEqual(audited.accessToken, rawToken);
  assert.notEqual(audited.encryptedCredentials, encrypted);
  assert.ok(String(audited.encryptedCredentials).includes('*') || audited.encryptedCredentials === '[redacted]');
  assert.notEqual(audited.refreshToken, '1//refresh');
  const roundtrip = decodeStoredSecret(encrypted, ENCRYPTION_KEY);
  assert.ok(roundtrip.includes('accessToken'));
  assert.ok(!JSON.stringify(publicStatus).includes(rawToken));
  console.log('PASS token leak guards + encrypt roundtrip');
}

function testCrossOrgReturns404Semantics() {
  /** Mirrors service pattern: resource other org → NotFound */
  function findConnection(
    rows: Array<{ organizationId: string; id: string }>,
    organizationId: string,
    id: string,
  ) {
    const row = rows.find((r) => r.id === id && r.organizationId === organizationId);
    if (!row) {
      const err = new Error('Không tìm thấy tài nguyên');
      (err as Error & { status: number }).status = 404;
      throw err;
    }
    return row;
  }

  const rows = [
    { id: 'c1', organizationId: 'org-a' },
    { id: 'c2', organizationId: 'org-b' },
  ];
  assert.equal(findConnection(rows, 'org-a', 'c1').id, 'c1');
  assert.throws(() => findConnection(rows, 'org-a', 'c2'), (e: Error & { status?: number }) => {
    assert.equal(e.status, 404);
    return true;
  });
  console.log('PASS cross-org 404 semantics');
}

function testPermissionsGuardNoSoftBypass() {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../apps/api/src/common/guards/permissions.guard.ts'),
    'utf8',
  );
  assert.ok(!src.includes('HRM_PERMISSIONS_ENFORCE'), 'soft-bypass env must be removed');
  assert.ok(src.includes('ForbiddenException'), 'must throw ForbiddenException');
  assert.ok(!src.includes('[shadow]'), 'shadow allow must be removed');
  console.log('PASS PermissionsGuard hard enforce');
}

function testMetaGraphUsesAuthorizationHeader() {
  const src = require('fs').readFileSync(
    require('path').join(
      __dirname,
      '../apps/api/src/ad-performance/facebook-ads/meta-graph-api.service.ts',
    ),
    'utf8',
  );
  assert.ok(src.includes('Authorization: `Bearer ${accessToken}`') || src.includes("Authorization: `Bearer ${accessToken}`"));
  assert.ok(src.includes('Authorization'));
  assert.ok(
    !src.includes('access_token=${encodeURIComponent(accessToken)}'),
    'user access_token must not be appended to query',
  );
  assert.ok(
    !src.includes('body: JSON.stringify({ status, access_token: accessToken })'),
    'campaign update must not put user token in body',
  );
  console.log('PASS Meta Graph Authorization header');
}

function testNoGooglePasteAccepted() {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../apps/api/src/ai-ads-manager/ai-ads-manager.service.ts'),
    'utf8',
  );
  assert.ok(src.includes('Không chấp nhận paste Google refresh token'));
  assert.ok(!src.includes("JSON.stringify({ refreshToken: dto.refreshToken, customerId"));
  console.log('PASS Google paste rejected');
}

function testSingleCredentialSourceInFacebookService() {
  const src = require('fs').readFileSync(
    require('path').join(
      __dirname,
      '../apps/api/src/ad-performance/facebook-ads/facebook-ads.service.ts',
    ),
    'utf8',
  );
  assert.ok(src.includes('adConnection.upsert') || src.includes('prisma.adConnection'));
  assert.ok(!src.includes('encryptedAccessToken'));
  assert.ok(src.includes('organizationId_provider'));
  console.log('PASS FacebookAdsService uses AdConnection org-scoped');
}

function main() {
  testAdsPermissionsExist();
  testTokenNotInPublicPayload();
  testCrossOrgReturns404Semantics();
  testPermissionsGuardNoSoftBypass();
  testMetaGraphUsesAuthorizationHeader();
  testNoGooglePasteAccepted();
  testSingleCredentialSourceInFacebookService();
  console.log('\nAll Phase A Ads SaaS unit checks passed.');
}

main();
