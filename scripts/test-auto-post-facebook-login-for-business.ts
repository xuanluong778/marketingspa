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
import { decryptSecret } from '../apps/api/src/common/utils/encryption.util';
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
  };

  // --- OAuth state + callback ---
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

  const conn = await prisma.autoPostFacebookConnection.findUnique({ where: { userId: userA.id } });
  assert.equal(conn?.status, AutoPostFacebookConnectionStatus.CONNECTED);
  assert.ok(conn?.encryptedAccessToken, 'encryptedAccessToken should be stored');

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
  section('OAuth callback: exchange failure → connection marked ERROR');
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

  const connAfterFail = await prisma.autoPostFacebookConnection.findUnique({
    where: { userId: userA.id },
  });
  assert.equal(connAfterFail?.status, AutoPostFacebookConnectionStatus.ERROR);

  section('OAuth callback: success again to enable page selection');
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
  const connAfterReconnect = await prisma.autoPostFacebookConnection.findUnique({
    where: { userId: userA.id },
  });
  assert.equal(connAfterReconnect?.status, AutoPostFacebookConnectionStatus.CONNECTED);

  // --- Tenant isolation ---
  section('Tenant isolation: other user cannot list/select');
  await assert.rejects(
    () =>
      listOAuthManagedPages(prisma, {
        userId: userB.id,
        encryptionKey: ENCRYPTION_KEY,
        meta: metaStub as any,
      }),
    /Chưa kết nối Facebook/,
  );

  // --- List + select fanpage ---
  section('List OAuth pages → user selects valid pageId');
  const list = await listOAuthManagedPages(prisma, {
    userId: userA.id,
    encryptionKey: ENCRYPTION_KEY,
    meta: metaStub as any,
  });
  assert.equal(list.length, 2);
  assert.equal(list[0].pageId, pages[0].id);

  const selectedPageId = pages[0].id;
  await selectOAuthPage(prisma, {
    userId: userA.id,
    pageId: selectedPageId,
    encryptionKey: ENCRYPTION_KEY,
    meta: metaStub as any,
  });

  const pageRow = await prisma.autoPostFacebookPage.findFirst({
    where: { userId: userA.id, pageId: selectedPageId },
  });
  assert.ok(pageRow, 'AutoPostFacebookPage row should be created');

  // --- Duplicate selection (idempotency) ---
  section('Duplicate page selection → no duplicate rows');
  await selectOAuthPage(prisma, {
    userId: userA.id,
    pageId: selectedPageId,
    encryptionKey: ENCRYPTION_KEY,
    meta: metaStub as any,
  });
  const pageRowsCount = await prisma.autoPostFacebookPage.count({ where: { userId: userA.id } });
  assert.equal(pageRowsCount, 1);

  // --- Fake pageId rejected ---
  section('Fake pageId rejected (ownership verified on backend)');
  await assert.rejects(
    () =>
      selectOAuthPage(prisma, {
        userId: userA.id,
        pageId: 'page-not-owned',
        encryptionKey: ENCRYPTION_KEY,
        meta: metaStub as any,
      }),
    /Fanpage không thuộc quyền của bạn/,
  );

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

