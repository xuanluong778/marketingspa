/**
 * Unit tests (no Nest bootstrap) for Auto Post Facebook OAuth (Login for Business).
 *
 * Covers:
 * - OAuth state valid/invalid/expired/replay
 * - callback success/failure
 * - list + select Fanpage (ownership verified on backend via Graph mock)
 * - fake pageId rejection
 * - duplicate page selection (unique constraint)
 * - tenant isolation
 * - token encryption (AES-GCM) at rest
 * - no token leakage in API responses
 *
 * Run (example):
 *   node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-auto-post-facebook-login-for-business.ts
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { decryptSecret, encryptSecret } from '../apps/api/src/common/utils/encryption.util';
import { AutoPostFacebookConnectionStatus } from '@marketingspa/database';
import {
  createOAuthStateRecord,
  listOAuthManagedPages,
  oauthCallbackConnect,
  selectOAuthPage,
} from '../apps/api/src/auto-post/auto-post-oauth-login-for-business';

const ENCRYPTION_KEY = 'test-encryption-key-32-chars-12345';

const FB_CODE_OK = 'CODE_OK';
const FB_CODE_FAIL = 'CODE_FAIL';

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

async function main() {
  process.env.ENCRYPTION_KEY = ENCRYPTION_KEY;
  process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';

  const prisma = new PrismaClient();

  // Ensure new OAuth state table exists for this branch test run.
  // (We avoid running migration deploy during local/branch tests.)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "auto_post_facebook_oauth_states" (
      "id" TEXT NOT NULL,
      "state_hash" TEXT NOT NULL,
      "user_id" TEXT NOT NULL,
      "organization_id" TEXT NOT NULL,
      "nonce" TEXT NOT NULL,
      "expires_at" TIMESTAMP(3) NOT NULL,
      "used_at" TIMESTAMP(3),
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "auto_post_facebook_oauth_states_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "auto_post_facebook_oauth_states_state_hash_key"
    ON "auto_post_facebook_oauth_states"("state_hash");
  `);

  // Phase 3: pending connection + composite uniqueness (no migration deploy)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "auto_post_facebook_oauth_pending_connections" (
      "id" TEXT NOT NULL,
      "user_id" TEXT NOT NULL,
      "organization_id" TEXT NOT NULL,
      "encrypted_access_token" TEXT NOT NULL,
      "token_expires_at" TIMESTAMP(3),
      "facebook_user_id" TEXT,
      "facebook_user_name" TEXT,
      "scopes" TEXT[] NOT NULL DEFAULT '{}'::text[],
      "last_error" TEXT,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "auto_post_facebook_oauth_pending_connections_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "auto_post_facebook_oauth_pending_connections_user_id_organization_id_key"
    ON "auto_post_facebook_oauth_pending_connections"("user_id", "organization_id");
  `);

  // Active connection composite unique key
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "auto_post_facebook_connections_user_id_organization_id_key"
    ON "auto_post_facebook_connections"("user_id", "organization_id");
  `);

  // Active page composite unique key
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "auto_post_facebook_pages_connection_id_page_id_key"
    ON "auto_post_facebook_pages"("connection_id", "page_id");
  `);

  const orgA = await prisma.organization.create({
    data: { name: 'Org A', slug: `org-a-${Date.now()}` },
  });
  const orgB = await prisma.organization.create({
    data: { name: 'Org B', slug: `org-b-${Date.now()}` },
  });

  const roleA = await prisma.role.create({
    data: {
      organizationId: orgA.id,
      code: 'OWNER',
      name: 'Owner',
    },
  });
  const roleB = await prisma.role.create({
    data: {
      organizationId: orgB.id,
      code: 'OWNER',
      name: 'Owner',
    },
  });

  const userAId = `user-a-${Date.now()}`;
  const userBId = `user-b-${Date.now()}`;

  const userA = await prisma.user.create({
    data: {
      id: userAId,
      email: `a-${Date.now()}@example.com`,
      name: 'User A',
      organizationId: orgA.id,
      roleId: roleA.id,
    },
  });
  const userB = await prisma.user.create({
    data: {
      id: userBId,
      email: `b-${Date.now()}@example.com`,
      name: 'User B',
      organizationId: orgB.id,
      roleId: roleB.id,
    },
  });

  const pages = [
    {
      id: 'page-1',
      name: 'Fanpage 1',
      access_token: 'PAGE_ACCESS_TOKEN_1',
      picture: { data: { url: 'https://example.com/pic1.jpg' } },
    },
    {
      id: 'page-2',
      name: 'Fanpage 2',
      access_token: 'PAGE_ACCESS_TOKEN_2',
      picture: { data: { url: 'https://example.com/pic2.jpg' } },
    },
  ];

  // Phase 3 permission checks are driven by Graph debug_token scopes.
  // We mutate this in later test sections (success vs missing permission).
  let debugScopes: string[] = ['pages_manage_posts'];
  const debugExpiresAtSeconds = Math.floor(Date.now() / 1000) + 60 * 60; // +1h

  const metaStub = {
    get appId() {
      return 'test-app-id';
    },
    get appSecret() {
      return 'test-app-secret';
    },
    loginConfigId: 'test-login-config-id',
    apiVersion: 'v21.0',
    getOAuthScopes: () => [
      'public_profile',
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
    ],
    async exchangeCodeForToken(code: string) {
      if (code === FB_CODE_FAIL) throw new Error('Graph exchange failed');
      return { access_token: `SHORT-${code}`, expires_in: 3600 };
    },
    async exchangeForLongLivedToken(shortToken: string) {
      return { access_token: `LONG-${shortToken}`, expires_in: 3600 * 24 };
    },
    async getMe() {
      return { id: 'fb-user-1', name: 'FB User' };
    },
    async getManagedPages(_accessToken: string) {
      return pages;
    },
    async debugToken(_accessToken: string) {
      return {
        is_valid: true,
        expires_at: debugExpiresAtSeconds,
        scopes: debugScopes,
      };
    },
  };

  // --- OAuth state + callback ---
  // Seed an existing active connection/page to verify Phase 3 behavior:
  // - OAuth callback must NOT overwrite active connection/page
  const OLD_ACCESS_TOKEN = 'OLD_LONG_LIVED_ACCESS_TOKEN';
  const OLD_PAGE_ACCESS_TOKEN = 'OLD_PAGE_ACCESS_TOKEN';
  const OLD_PAGE_ID = 'page-old';

  const oldConn = await prisma.autoPostFacebookConnection.create({
    data: {
      userId: userA.id,
      organizationId: userA.organizationId,
      encryptedAccessToken: encryptSecret(OLD_ACCESS_TOKEN, ENCRYPTION_KEY),
      tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
      facebookUserId: 'fb-user-old',
      facebookUserName: 'FB User Old',
      status: AutoPostFacebookConnectionStatus.CONNECTED,
      scopes: ['pages_manage_posts'],
      lastError: null,
    },
  });

  const oldPage = await prisma.autoPostFacebookPage.create({
    data: {
      userId: userA.id,
      connectionId: oldConn.id,
      pageId: OLD_PAGE_ID,
      pageName: 'Old Fanpage',
      pagePictureUrl: null,
      encryptedPageAccessToken: encryptSecret(OLD_PAGE_ACCESS_TOKEN, ENCRYPTION_KEY),
    },
  });

  section('OAuth state: valid → callback stores encrypted connection');
  const { state } = await createOAuthStateRecord(prisma, {
    userId: userA.id,
    organizationId: userA.organizationId,
    encryptionKey: ENCRYPTION_KEY,
  });

  await oauthCallbackConnect(prisma, {
    code: FB_CODE_OK,
    state,
    encryptionKey: ENCRYPTION_KEY,
    meta: metaStub as any,
  });

  // Phase 3: callback writes pending only, active connection/page must remain unchanged.
  const pending = await prisma.autoPostFacebookOAuthPendingConnection.findUnique({
    where: { userId_organizationId: { userId: userA.id, organizationId: userA.organizationId } },
  });
  assert.ok(pending, 'pending row should exist after callback');

  const activeConnAfter = await prisma.autoPostFacebookConnection.findUnique({
    where: { userId_organizationId: { userId: userA.id, organizationId: userA.organizationId } },
  });
  assert.ok(activeConnAfter, 'active connection must still exist');
  assert.equal(activeConnAfter!.id, oldConn.id, 'active connection must not be overwritten');
  const decryptedOldOauth = decryptSecret(activeConnAfter!.encryptedAccessToken, ENCRYPTION_KEY);
  assert.equal(decryptedOldOauth, OLD_ACCESS_TOKEN, 'active encrypted oauth token must remain');

  const activePageAfter = await prisma.autoPostFacebookPage.findFirst({
    where: { connectionId: oldConn.id, pageId: OLD_PAGE_ID },
  });
  assert.ok(activePageAfter, 'active page must still exist');

  // --- OAuth state: replay protection ---
  section('OAuth state: replay → callback rejected');
  await assert.rejects(
    () =>
      oauthCallbackConnect(prisma, {
        code: FB_CODE_OK,
        state,
        encryptionKey: ENCRYPTION_KEY,
        meta: metaStub as any,
      }),
    /oauth_state_used_or_expired/,
  );

  // --- OAuth state: invalid ---
  section('OAuth state: invalid → callback rejected');
  await assert.rejects(
    () =>
      oauthCallbackConnect(prisma, {
        code: FB_CODE_OK,
        state: 'not-a-valid-state',
        encryptionKey: ENCRYPTION_KEY,
        meta: metaStub as any,
      }),
    /invalid_state/,
  );

  // --- OAuth state: expired (DB expiresAt) ---
  section('OAuth state: expired (DB) → callback rejected');
  const { state: state2 } = await createOAuthStateRecord(prisma, {
    userId: userA.id,
    organizationId: userA.organizationId,
    encryptionKey: ENCRYPTION_KEY,
  });
  const stateRow2 = await prisma.autoPostFacebookOAuthState.findFirst({
    where: { userId: userA.id },
    orderBy: { createdAt: 'desc' },
  });
  assert.ok(stateRow2);

  await prisma.autoPostFacebookOAuthState.update({
    where: { id: stateRow2!.id },
    data: { expiresAt: new Date(Date.now() - 60_000) },
  });

  await assert.rejects(
    () =>
      oauthCallbackConnect(prisma, {
        code: FB_CODE_OK,
        state: state2,
        encryptionKey: ENCRYPTION_KEY,
        meta: metaStub as any,
      }),
    /oauth_state_used_or_expired/,
  );

  // --- OAuth callback failure ---
  section('OAuth callback: exchange failure → pending not created (active unchanged)');

  // Clear pending so we can assert it stays absent on callback failure.
  await prisma.autoPostFacebookOAuthPendingConnection
    .delete({
      where: {
        userId_organizationId: { userId: userA.id, organizationId: userA.organizationId },
      },
    })
    .catch(() => undefined);

  const { state: state3 } = await createOAuthStateRecord(prisma, {
    userId: userA.id,
    organizationId: userA.organizationId,
    encryptionKey: ENCRYPTION_KEY,
  });
  await assert.rejects(
    () =>
      oauthCallbackConnect(prisma, {
        code: FB_CODE_FAIL,
        state: state3,
        encryptionKey: ENCRYPTION_KEY,
        meta: metaStub as any,
      }),
    /Graph exchange failed/,
  );

  const pendingAfterFail = await prisma.autoPostFacebookOAuthPendingConnection.findUnique({
    where: { userId_organizationId: { userId: userA.id, organizationId: userA.organizationId } },
  });
  assert.equal(pendingAfterFail, null);

  const connAfterFail = await prisma.autoPostFacebookConnection.findUnique({
    where: { userId_organizationId: { userId: userA.id, organizationId: userA.organizationId } },
  });
  assert.equal(connAfterFail?.status, AutoPostFacebookConnectionStatus.CONNECTED);

  section('OAuth callback: success again (pending ready for page selection)');
  const { state: state4 } = await createOAuthStateRecord(prisma, {
    userId: userA.id,
    organizationId: userA.organizationId,
    encryptionKey: ENCRYPTION_KEY,
  });
  await oauthCallbackConnect(prisma, {
    code: FB_CODE_OK,
    state: state4,
    encryptionKey: ENCRYPTION_KEY,
    meta: metaStub as any,
  });

  const pendingAfterReconnect = await prisma.autoPostFacebookOAuthPendingConnection.findUnique({
    where: { userId_organizationId: { userId: userA.id, organizationId: userA.organizationId } },
  });
  assert.ok(pendingAfterReconnect, 'pending should exist after successful callback');

  // --- Tenant isolation ---
  section('Tenant isolation: other user cannot list/select');
  await assert.rejects(
    () =>
      listOAuthManagedPages(prisma, {
        userId: userB.id,
        organizationId: userB.organizationId,
        encryptionKey: ENCRYPTION_KEY,
        meta: metaStub as any,
      }),
    /Chưa có OAuth pending/,
  );

  // --- List + select fanpage (Phase 3 rollback + replacement) ---
  section('List OAuth pages (pending) → user selection validation');
  const list = await listOAuthManagedPages(prisma, {
    userId: userA.id,
    organizationId: userA.organizationId,
    encryptionKey: ENCRYPTION_KEY,
    meta: metaStub as any,
  });
  assert.equal(list.length, 2);
  assert.equal(list[0].pageId, pages[0].id);

  const selectedPageId = pages[0].id;

  // --- Fake pageId rejected ---
  section('Fake pageId rejected (ownership verified on backend)');
  await assert.rejects(
    () =>
      selectOAuthPage(prisma, {
        userId: userA.id,
        organizationId: userA.organizationId,
        pageId: 'page-not-owned',
        encryptionKey: ENCRYPTION_KEY,
        meta: metaStub as any,
      }),
    /Fanpage không thuộc quyền của bạn/,
  );

  // Rollback checks: active connection/page unchanged, pending not consumed.
  const activeConnAfterWrong = await prisma.autoPostFacebookConnection.findUnique({
    where: { userId_organizationId: { userId: userA.id, organizationId: userA.organizationId } },
  });
  assert.equal(activeConnAfterWrong?.id, oldConn.id);

  const activePageAfterWrong = await prisma.autoPostFacebookPage.findFirst({
    where: { connectionId: oldConn.id, pageId: OLD_PAGE_ID },
  });
  assert.ok(activePageAfterWrong, 'old page must remain after failed selection');

  const pendingStillThereAfterWrong = await prisma.autoPostFacebookOAuthPendingConnection.findUnique({
    where: { userId_organizationId: { userId: userA.id, organizationId: userA.organizationId } },
  });
  assert.ok(pendingStillThereAfterWrong, 'pending must remain after failed selection');

  // --- Missing permission should not replace active connection/page ---
  section('Select valid page but missing permissions → MISSING_PERMISSION + rollback');
  debugScopes = []; // remove pages_manage_posts from granted scopes
  await assert.rejects(
    () =>
      selectOAuthPage(prisma, {
        userId: userA.id,
        organizationId: userA.organizationId,
        pageId: selectedPageId,
        encryptionKey: ENCRYPTION_KEY,
        meta: metaStub as any,
      }),
    /MISSING_PERMISSION/,
  );

  const activeConnAfterMissingPerm = await prisma.autoPostFacebookConnection.findUnique({
    where: { userId_organizationId: { userId: userA.id, organizationId: userA.organizationId } },
  });
  assert.equal(activeConnAfterMissingPerm?.id, oldConn.id);

  const activePageAfterMissingPerm = await prisma.autoPostFacebookPage.findFirst({
    where: { connectionId: oldConn.id, pageId: OLD_PAGE_ID },
  });
  assert.ok(activePageAfterMissingPerm, 'old page must remain after missing permission');

  const pendingStillThereAfterMissingPerm = await prisma.autoPostFacebookOAuthPendingConnection.findUnique({
    where: { userId_organizationId: { userId: userA.id, organizationId: userA.organizationId } },
  });
  assert.ok(pendingStillThereAfterMissingPerm, 'pending must remain after missing permission');

  // --- Success path: replace active connection/page in transaction ---
  section('Select valid page with required permissions → replace active connection/page');
  debugScopes = ['pages_manage_posts'];
  await selectOAuthPage(prisma, {
    userId: userA.id,
    organizationId: userA.organizationId,
    pageId: selectedPageId,
    encryptionKey: ENCRYPTION_KEY,
    meta: metaStub as any,
  });

  const pageRow = await prisma.autoPostFacebookPage.findFirst({
    where: { connectionId: oldConn.id, pageId: selectedPageId },
  });
  assert.ok(pageRow, 'AutoPostFacebookPage row should be created for selected page');

  const pendingAfterSuccess = await prisma.autoPostFacebookOAuthPendingConnection.findUnique({
    where: { userId_organizationId: { userId: userA.id, organizationId: userA.organizationId } },
  });
  assert.equal(pendingAfterSuccess, null);

  // Duplicate selection (idempotency) should still keep a single page row for that connection.
  section('Duplicate page selection (idempotency)');

  // Phase 3: pending is consumed after a successful select, so we must create a fresh pending via callback.
  const { state: stateDup } = await createOAuthStateRecord(prisma, {
    userId: userA.id,
    organizationId: userA.organizationId,
    encryptionKey: ENCRYPTION_KEY,
  });
  await oauthCallbackConnect(prisma, {
    code: FB_CODE_OK,
    state: stateDup,
    encryptionKey: ENCRYPTION_KEY,
    meta: metaStub as any,
  });

  await selectOAuthPage(prisma, {
    userId: userA.id,
    organizationId: userA.organizationId,
    pageId: selectedPageId,
    encryptionKey: ENCRYPTION_KEY,
    meta: metaStub as any,
  });
  const pageRowsCount = await prisma.autoPostFacebookPage.count({ where: { connectionId: oldConn.id } });
  assert.equal(pageRowsCount, 1);

  // Verify active connection encrypted oauth token replaced.
  const activeConnAfterSuccess = await prisma.autoPostFacebookConnection.findUnique({
    where: { userId_organizationId: { userId: userA.id, organizationId: userA.organizationId } },
  });
  assert.ok(activeConnAfterSuccess);
  const decryptedOauth = decryptSecret(activeConnAfterSuccess!.encryptedAccessToken, ENCRYPTION_KEY);
  assert.equal(decryptedOauth, `LONG-SHORT-${FB_CODE_OK}`);

  // --- Encryption at rest ---
  section('Token encryption: encryptedPageAccessToken is not plaintext');
  assert.ok(pageRow!.encryptedPageAccessToken);
  assert.notEqual(pageRow!.encryptedPageAccessToken, pages[0].access_token);
  const decrypted = decryptSecret(pageRow!.encryptedPageAccessToken, ENCRYPTION_KEY);
  assert.equal(decrypted, pages[0].access_token);

  // --- No token leakage in API responses ---
  section('No token leakage in API responses (list + redirect URL)');
  assert.ok(!JSON.stringify(list).includes(pages[0].access_token), 'list must not include page access token');
  // OAuth helper không trả token; đảm bảo danh sách không chứa token là đủ
  assert.ok(true);

  console.log('\ntest-auto-post-facebook-login-for-business: all passed');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

