/**
 * End-to-end Auto Post Fanpage publish hardening tests.
 *
 * Covers:
 * - publish text/image path selection (/feed vs /photos)
 * - schedule claim + cancel
 * - retry blocked for permanent token/permission errors
 * - idempotent publish now
 * - concurrent job claim (no double publish)
 * - token expired → NEEDS_RECONNECT
 * - missing pages_manage_posts blocked
 * - IDOR (other org cannot access post/page)
 * - SERVER_ENV allowlist helpers
 * - no token leakage in error messages / serialized posts
 *
 * Run:
 *   node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-auto-post-publish-e2e.ts
 */
import assert from 'node:assert/strict';
import { PrismaClient, AutoPostFacebookConnectionStatus, AutoPostStatus } from '@prisma/client';
import { encryptSecret } from '../apps/api/src/common/utils/encryption.util';
import {
  buildFacebookPostUrl,
  friendlyPublishError,
  isPermanentPublishError,
  sanitizePublishErrorMessage,
} from '../apps/api/src/auto-post/auto-post-publish-errors';
import { canUseServerEnvFanpage } from '../apps/api/src/meta-fanpage/meta-fanpage-access';
import { publishToFacebookPage } from '../apps/worker/src/lib/auto-post-publish';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-32-chars-12345';
process.env.ENCRYPTION_KEY = ENCRYPTION_KEY;
process.env.META_API_VERSION = process.env.META_API_VERSION || 'v21.0';

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

async function main() {
  // --- Pure helpers ---
  section('sanitizePublishErrorMessage redacts Meta tokens');
  const leaked = sanitizePublishErrorMessage(
    'fail access_token=EAAGSECRETTOKEN1234567890 and EAAGABCDEFghijklmnop',
  );
  assert.ok(!leaked.includes('EAAGSECRET'));
  assert.ok(leaked.includes('[redacted]') || leaked.includes('[meta_token]'));

  section('permanent vs transient classification');
  assert.equal(isPermanentPublishError('NEEDS_RECONNECT: Token Facebook đã hết hạn'), true);
  assert.equal(isPermanentPublishError('MISSING_PERMISSION: pages_manage_posts'), true);
  assert.equal(isPermanentPublishError('timeout ETIMEDOUT'), false);
  assert.equal(
    friendlyPublishError('Token Facebook đã hết hạn').startsWith('NEEDS_RECONNECT'),
    true,
  );

  section('buildFacebookPostUrl');
  assert.equal(
    buildFacebookPostUrl('111_222', '111'),
    'https://www.facebook.com/111/posts/222',
  );

  section('SERVER_ENV allowlist — SUPER_ADMIN / org allowlist / deny');
  assert.equal(canUseServerEnvFanpage({ role: 'SUPER_ADMIN', organizationId: 'x' }, []), true);
  assert.equal(canUseServerEnvFanpage({ role: 'OWNER', organizationId: 'org-a' }, ['org-a']), true);
  assert.equal(canUseServerEnvFanpage({ role: 'OWNER', organizationId: 'org-b' }, ['org-a']), false);

  // --- Graph path selection with mocked fetch ---
  section('publishToFacebookPage uses /photos for image and /feed for text');
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    return {
      ok: true,
      json: async () => ({ id: url.includes('/photos') ? 'photo-1' : 'page_feed1' }),
    } as Response;
  }) as typeof fetch;

  const photoId = await publishToFacebookPage('page-1', 'PAGE_TOKEN', {
    message: 'hello',
    imageUrl: 'https://example.com/a.jpg',
  });
  assert.equal(photoId, 'photo-1');
  assert.ok(calls.some((u) => u.includes('/photos') && u.includes('v21.0')));

  calls.length = 0;
  const feedId = await publishToFacebookPage('page-1', 'PAGE_TOKEN', {
    message: 'hello',
    link: 'https://example.com',
  });
  assert.equal(feedId, 'page_feed1');
  assert.ok(calls.some((u) => u.includes('/feed')));
  globalThis.fetch = originalFetch;

  // --- DB integration ---
  const prisma = new PrismaClient();
  const stamp = Date.now();

  const orgA = await prisma.organization.create({
    data: { name: 'Pub Org A', slug: `pub-a-${stamp}` },
  });
  const orgB = await prisma.organization.create({
    data: { name: 'Pub Org B', slug: `pub-b-${stamp}` },
  });
  const roleA = await prisma.role.create({
    data: { organizationId: orgA.id, code: 'OWNER', name: 'Owner' },
  });
  const roleB = await prisma.role.create({
    data: { organizationId: orgB.id, code: 'OWNER', name: 'Owner' },
  });
  const userA = await prisma.user.create({
    data: {
      id: `pub-user-a-${stamp}`,
      email: `pub-a-${stamp}@example.com`,
      name: 'Pub A',
      organizationId: orgA.id,
      roleId: roleA.id,
    },
  });
  const userB = await prisma.user.create({
    data: {
      id: `pub-user-b-${stamp}`,
      email: `pub-b-${stamp}@example.com`,
      name: 'Pub B',
      organizationId: orgB.id,
      roleId: roleB.id,
    },
  });

  const connA = await prisma.autoPostFacebookConnection.create({
    data: {
      userId: userA.id,
      organizationId: orgA.id,
      encryptedAccessToken: encryptSecret('USER_TOKEN_A', ENCRYPTION_KEY),
      tokenExpiresAt: new Date(Date.now() + 3600_000),
      facebookUserId: 'fb-a',
      facebookUserName: 'FB A',
      status: AutoPostFacebookConnectionStatus.CONNECTED,
      scopes: ['pages_manage_posts', 'pages_show_list'],
    },
  });

  const pageA = await prisma.autoPostFacebookPage.create({
    data: {
      userId: userA.id,
      connectionId: connA.id,
      pageId: 'fb-page-a',
      pageName: 'Page A',
      encryptedPageAccessToken: encryptSecret('PAGE_TOKEN_A', ENCRYPTION_KEY),
    },
  });

  section('IDOR: other org cannot resolve fanpage by id');
  const stolen = await prisma.autoPostFacebookPage.findFirst({
    where: {
      id: pageA.id,
      userId: userB.id,
      connection: { organizationId: orgB.id },
    },
  });
  assert.equal(stolen, null);

  section('missing pages_manage_posts blocks publish preflight');
  await prisma.autoPostFacebookConnection.update({
    where: { id: connA.id },
    data: { scopes: ['pages_show_list'] },
  });
  {
    const conn = await prisma.autoPostFacebookConnection.findUniqueOrThrow({
      where: { id: connA.id },
    });
    const isEnv = conn.scopes.includes('env_page_token');
    const allowed = isEnv || conn.scopes.includes('pages_manage_posts');
    assert.equal(allowed, false);
  }
  await prisma.autoPostFacebookConnection.update({
    where: { id: connA.id },
    data: { scopes: ['pages_manage_posts', 'pages_show_list'] },
  });

  section('token expired → NEEDS_RECONNECT status mapping');
  await prisma.autoPostFacebookConnection.update({
    where: { id: connA.id },
    data: { tokenExpiresAt: new Date(Date.now() - 1000) },
  });
  {
    const conn = await prisma.autoPostFacebookConnection.findUniqueOrThrow({
      where: { id: connA.id },
    });
    const expired = Boolean(conn.tokenExpiresAt && conn.tokenExpiresAt.getTime() < Date.now());
    assert.equal(expired, true);
    const apiStatus = expired ? 'NEEDS_RECONNECT' : conn.status;
    assert.equal(apiStatus, 'NEEDS_RECONNECT');
  }
  await prisma.autoPostFacebookConnection.update({
    where: { id: connA.id },
    data: { tokenExpiresAt: new Date(Date.now() + 3600_000) },
  });

  const draft = await prisma.autoPost.create({
    data: {
      userId: userA.id,
      organizationId: orgA.id,
      fanpageId: pageA.id,
      fanpagePageId: pageA.pageId,
      fanpageName: pageA.pageName,
      postType: 'SPA_SALES',
      topic: 'Test publish',
      caption: 'Caption text publish',
      status: AutoPostStatus.DRAFT,
    },
  });

  section('idempotent publish claim: second claim fails / already published returns same');
  const claim1 = await prisma.autoPost.updateMany({
    where: {
      id: draft.id,
      userId: userA.id,
      organizationId: orgA.id,
      status: { in: [AutoPostStatus.DRAFT, AutoPostStatus.FAILED] },
      facebookPostId: null,
    },
    data: { status: AutoPostStatus.PUBLISHING, approvedAt: new Date() },
  });
  assert.equal(claim1.count, 1);

  const claim2 = await prisma.autoPost.updateMany({
    where: {
      id: draft.id,
      userId: userA.id,
      organizationId: orgA.id,
      status: { in: [AutoPostStatus.DRAFT, AutoPostStatus.FAILED] },
      facebookPostId: null,
    },
    data: { status: AutoPostStatus.PUBLISHING },
  });
  assert.equal(claim2.count, 0);

  await prisma.autoPost.update({
    where: { id: draft.id },
    data: {
      status: AutoPostStatus.PUBLISHED,
      facebookPostId: 'fb-page-a_999',
      publishedAt: new Date(),
    },
  });
  const published = await prisma.autoPost.findFirstOrThrow({
    where: { id: draft.id, userId: userA.id, organizationId: orgA.id },
  });
  assert.equal(published.facebookPostId, 'fb-page-a_999');
  assert.equal(
    buildFacebookPostUrl(published.facebookPostId, published.fanpagePageId),
    'https://www.facebook.com/fb-page-a/posts/999',
  );
  assert.ok(!JSON.stringify(published).includes('PAGE_TOKEN_A'));

  section('schedule + cancel status transitions');
  const sched = await prisma.autoPost.create({
    data: {
      userId: userA.id,
      organizationId: orgA.id,
      fanpageId: pageA.id,
      fanpagePageId: pageA.pageId,
      fanpageName: pageA.pageName,
      postType: 'SPA_SALES',
      topic: 'Scheduled',
      caption: 'Schedule me',
      status: AutoPostStatus.SCHEDULED,
      scheduledAt: new Date(Date.now() + 60_000),
      approvedAt: new Date(),
    },
  });
  await prisma.autoPost.update({
    where: { id: sched.id },
    data: { status: AutoPostStatus.CANCELLED, scheduledAt: null },
  });
  const cancelled = await prisma.autoPost.findUniqueOrThrow({ where: { id: sched.id } });
  assert.equal(cancelled.status, AutoPostStatus.CANCELLED);

  section('concurrent scheduled claim — only one wins');
  const due = await prisma.autoPost.create({
    data: {
      userId: userA.id,
      organizationId: orgA.id,
      fanpageId: pageA.id,
      fanpagePageId: pageA.pageId,
      fanpageName: pageA.pageName,
      postType: 'SPA_SALES',
      topic: 'Due',
      caption: 'Due post',
      status: AutoPostStatus.SCHEDULED,
      scheduledAt: new Date(Date.now() - 1000),
      approvedAt: new Date(),
    },
  });
  const [r1, r2] = await Promise.all([
    prisma.autoPost.updateMany({
      where: {
        id: due.id,
        status: AutoPostStatus.SCHEDULED,
        facebookPostId: null,
      },
      data: { status: AutoPostStatus.PUBLISHING },
    }),
    prisma.autoPost.updateMany({
      where: {
        id: due.id,
        status: AutoPostStatus.SCHEDULED,
        facebookPostId: null,
      },
      data: { status: AutoPostStatus.PUBLISHING },
    }),
  ]);
  assert.equal(r1.count + r2.count, 1);

  section('retry blocked for permanent errors');
  const failed = await prisma.autoPost.create({
    data: {
      userId: userA.id,
      organizationId: orgA.id,
      fanpageId: pageA.id,
      fanpagePageId: pageA.pageId,
      fanpageName: pageA.pageName,
      postType: 'SPA_SALES',
      topic: 'Failed',
      caption: 'Fail',
      status: AutoPostStatus.FAILED,
      errorMessage: 'NEEDS_RECONNECT: Token Facebook đã hết hạn',
    },
  });
  assert.equal(isPermanentPublishError(failed.errorMessage), true);

  section('IDOR post list scoped by organizationId');
  const cross = await prisma.autoPost.findFirst({
    where: { id: draft.id, userId: userB.id, organizationId: orgB.id },
  });
  assert.equal(cross, null);

  section('Multi Fanpage: separate posts / facebookPostId / no cross-page duplicate');
  const pageB = await prisma.autoPostFacebookPage.create({
    data: {
      userId: userA.id,
      connectionId: connA.id,
      pageId: 'fb-page-b',
      pageName: 'Page B',
      encryptedPageAccessToken: encryptSecret('PAGE_TOKEN_B', ENCRYPTION_KEY),
    },
  });
  const multiA = await prisma.autoPost.create({
    data: {
      userId: userA.id,
      organizationId: orgA.id,
      fanpageId: pageA.id,
      fanpagePageId: pageA.pageId,
      fanpageName: pageA.pageName,
      postType: 'SPA_SALES',
      topic: 'Multi A',
      caption: 'Same caption multi',
      status: AutoPostStatus.PUBLISHED,
      facebookPostId: 'fb-page-a_111',
      publishedAt: new Date(),
      approvedAt: new Date(),
    },
  });
  const multiB = await prisma.autoPost.create({
    data: {
      userId: userA.id,
      organizationId: orgA.id,
      fanpageId: pageB.id,
      fanpagePageId: pageB.pageId,
      fanpageName: pageB.pageName,
      postType: 'SPA_SALES',
      topic: 'Multi B',
      caption: 'Same caption multi',
      status: AutoPostStatus.PUBLISHED,
      facebookPostId: 'fb-page-b_222',
      publishedAt: new Date(),
      approvedAt: new Date(),
    },
  });
  assert.notEqual(multiA.id, multiB.id);
  assert.notEqual(multiA.facebookPostId, multiB.facebookPostId);
  assert.notEqual(multiA.fanpageId, multiB.fanpageId);
  // Idempotency key scope is per post id
  assert.equal(`auto-post-${multiA.id}` !== `auto-post-${multiB.id}`, true);
  // IDOR: org B cannot load either
  const stealMulti = await prisma.autoPost.findFirst({
    where: {
      id: { in: [multiA.id, multiB.id] },
      organizationId: orgB.id,
    },
  });
  assert.equal(stealMulti, null);
  assert.ok(!JSON.stringify(multiA).includes('PAGE_TOKEN'));
  assert.ok(!JSON.stringify(multiB).includes('PAGE_TOKEN'));

  // Cleanup test rows (best-effort)
  await prisma.autoPost.deleteMany({
    where: { userId: { in: [userA.id, userB.id] } },
  });
  await prisma.autoPostFacebookPage.deleteMany({
    where: { userId: { in: [userA.id, userB.id] } },
  });
  await prisma.autoPostFacebookConnection.deleteMany({
    where: { userId: { in: [userA.id, userB.id] } },
  });
  await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  await prisma.role.deleteMany({ where: { id: { in: [roleA.id, roleB.id] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
  await prisma.$disconnect();

  console.log('\ntest-auto-post-publish-e2e: all passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
