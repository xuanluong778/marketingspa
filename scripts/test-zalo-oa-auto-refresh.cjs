/**
 * E2E: Zalo OA auto-refresh
 *
 * 1) Tạo connection giả với tokenExpiresAt = now+20 phút (trong skew 45p)
 * 2) Chạy refreshZaloOaConnection với ZALO_TOKEN_REFRESH_STUB=1
 * 3) Kiểm tra DB: status ACTIVE, tokenExpiresAt mới, credentials đổi (encrypted)
 * 4) Cleanup
 *
 * Run:
 *   ZALO_TOKEN_REFRESH_STUB=1 node scripts/with-root-env.cjs node scripts/test-zalo-oa-auto-refresh.cjs
 */
const crypto = require('crypto');
const path = require('path');

// Load worker encryption + refresh after building worker dist — use inline encrypt matching salt
function encryptSecret(plaintext, encryptionKey) {
  const key = crypto.scryptSync(encryptionKey, 'marketingspa-integration-v1', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decryptSecret(ciphertext, encryptionKey) {
  const key = crypto.scryptSync(encryptionKey, 'marketingspa-integration-v1', 32);
  const data = Buffer.from(ciphertext, 'base64');
  const iv = data.subarray(0, 16);
  const authTag = data.subarray(16, 32);
  const encrypted = data.subarray(32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass: Boolean(pass), detail: String(detail || '') });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`);
}

async function main() {
  process.env.ZALO_TOKEN_REFRESH_STUB = '1';

  const { prisma } = require('../packages/database/dist');
  // Prefer built worker lib
  let refreshZaloOaConnection;
  let listZaloOaConnectionsDueForRefresh;
  let ZALO_OA_REFRESH_SKEW_MS;
  try {
    const mod = require('../apps/worker/dist/lib/zalo-token-refresh');
    refreshZaloOaConnection = mod.refreshZaloOaConnection;
    listZaloOaConnectionsDueForRefresh = mod.listZaloOaConnectionsDueForRefresh;
    ZALO_OA_REFRESH_SKEW_MS = mod.ZALO_OA_REFRESH_SKEW_MS;
  } catch (e) {
    record('load_worker_refresh_lib', false, e.message);
    await prisma.$disconnect();
    process.exit(1);
  }

  record(
    'skew_45_minutes',
    ZALO_OA_REFRESH_SKEW_MS === 45 * 60_000,
    `skewMs=${ZALO_OA_REFRESH_SKEW_MS}`,
  );

  const encKey = process.env.ENCRYPTION_KEY || '';
  if (encKey.length < 16) {
    record('encryption_key', false, 'ENCRYPTION_KEY missing');
    await prisma.$disconnect();
    process.exit(1);
  }
  record('encryption_key', true, 'present');

  const org = await prisma.organization.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  });
  if (!org) {
    record('org_fixture', false, 'no organization');
    await prisma.$disconnect();
    process.exit(1);
  }
  record('org_fixture', true, org.name);

  const oaId = `ZALO_AUTO_REFRESH_${Date.now()}`;
  const oldAccess = 'old-access-token-xxxxxxxxxxxx';
  const oldRefresh = 'old-refresh-token-xxxxxxxxxxx';
  const nearExpiry = new Date(Date.now() + 20 * 60_000); // 20 phút — trong skew 45p

  const encrypted = encryptSecret(
    JSON.stringify({
      accessToken: oldAccess,
      refreshToken: oldRefresh,
      oaId,
      oaName: 'Auto Refresh Test OA',
      accessTokenExpiresAt: nearExpiry.toISOString(),
    }),
    encKey,
  );

  const conn = await prisma.messagingChannelConnection.create({
    data: {
      organizationId: org.id,
      channel: 'ZALO',
      providerKind: 'ZALO_OA',
      accountRef: oaId,
      displayName: 'Auto Refresh Test OA',
      encryptedCredentials: encrypted,
      status: 'ACTIVE',
      tokenExpiresAt: nearExpiry,
      isPaused: false,
    },
  });
  record('create_near_expiry_connection', true, `expiresIn=20m id=${conn.id.slice(0, 8)}…`);

  const due = await listZaloOaConnectionsDueForRefresh(100);
  const listed = due.some((d) => d.id === conn.id);
  record('listed_in_due_scan', listed, `dueCount=${due.length}`);

  const beforeCreds = JSON.parse(decryptSecret(conn.encryptedCredentials, encKey));
  const result = await refreshZaloOaConnection(conn.id);
  record('refresh_ran', result.refreshed === true, JSON.stringify({
    refreshed: result.refreshed,
    status: result.status,
    reason: result.reason,
  }));

  const after = await prisma.messagingChannelConnection.findUnique({ where: { id: conn.id } });
  const afterCreds = JSON.parse(decryptSecret(after.encryptedCredentials, encKey));

  record(
    'status_active',
    after.status === 'ACTIVE',
    `status=${after.status}`,
  );
  record(
    'expires_at_extended',
    after.tokenExpiresAt && after.tokenExpiresAt.getTime() > nearExpiry.getTime() + 60_000,
    `before=${nearExpiry.toISOString()} after=${after.tokenExpiresAt?.toISOString()}`,
  );
  record(
    'access_token_rotated',
    afterCreds.accessToken !== beforeCreds.accessToken &&
      String(afterCreds.accessToken).startsWith('stub-access-'),
    'access token changed (stub, not logged)',
  );
  record(
    'refresh_token_overwritten',
    afterCreds.refreshToken !== beforeCreds.refreshToken &&
      String(afterCreds.refreshToken).startsWith('stub-refresh-'),
    'refresh token overwritten when provider returns new one',
  );
  record(
    'no_plaintext_in_db_column',
    !String(after.encryptedCredentials).includes(oldAccess) &&
      !String(after.encryptedCredentials).includes('stub-access-'),
    'credentials column remains ciphertext',
  );

  // Tenant isolation: refresh only touches this connection's org
  record(
    'tenant_scoped',
    after.organizationId === org.id,
    `org=${after.organizationId.slice(0, 8)}…`,
  );

  // "Kết nối PASS" (stub): credentials hợp lệ + ACTIVE + còn hạn dài — tương đương test connection structural
  const connectionReady =
    after.status === 'ACTIVE' &&
    Boolean(afterCreds.accessToken) &&
    Boolean(afterCreds.refreshToken) &&
    after.tokenExpiresAt &&
    after.tokenExpiresAt.getTime() > Date.now() + 20 * 3600_000;
  record(
    'connection_ready_pass',
    connectionReady,
    connectionReady
      ? 'ACTIVE + tokens present + expires>~20h (stub, no Zalo call)'
      : 'connection not ready after refresh',
  );

  // Due list không còn chứa connection sau khi expiresAt đã kéo dài
  const dueAfter = await listZaloOaConnectionsDueForRefresh(100);
  record(
    'no_longer_due_after_refresh',
    !dueAfter.some((d) => d.id === conn.id),
    `dueCount=${dueAfter.length}`,
  );

  await prisma.messagingChannelConnection.delete({ where: { id: conn.id } }).catch(() => undefined);

  const failed = results.filter((r) => !r.pass).length;
  const passed = results.filter((r) => r.pass).length;
  console.log('\n=== AUTO REFRESH SUMMARY ===');
  console.log(`PASS=${passed} FAIL=${failed}`);
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}\t${r.name}\t${r.detail}`);
  }
  console.log(failed === 0 ? '\nAUTO REFRESH PASS' : '\nAUTO REFRESH FAIL');
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  try {
    const { prisma } = require('../packages/database/dist');
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  console.log('\nAUTO REFRESH FAIL');
  process.exit(1);
});
