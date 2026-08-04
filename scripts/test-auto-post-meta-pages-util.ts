/**
 * Unit tests for auto-post-meta-pages.util (no Nest/DB).
 * Run: node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/test-auto-post-meta-pages-util.ts
 */
import assert from 'node:assert/strict';
import {
  AUTO_POST_REQUIRED_PAGE_SCOPES,
  buildOAuthPagesListResult,
  fetchAllManagedPages,
  missingRequiredPageScopes,
  parseMetaPageAccount,
  toOAuthPagesListItem,
} from '../apps/api/src/auto-post/auto-post-meta-pages.util';

function section(name: string) {
  console.log(`\n✓ ${name}`);
}

async function main() {
  section('missingRequiredPageScopes');
  assert.deepEqual(missingRequiredPageScopes(['public_profile']), [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
  ]);
  assert.deepEqual(missingRequiredPageScopes([...AUTO_POST_REQUIRED_PAGE_SCOPES]), []);

  section('parseMetaPageAccount keeps Business/New Pages rows');
  const page = parseMetaPageAccount({
    id: '123',
    name: 'Spa Demo',
    access_token: 'PAGE_TOKEN',
    picture: { data: { url: 'https://example.com/p.jpg' } },
    tasks: ['CREATE_CONTENT', 'MANAGE'],
  });
  assert.ok(page);
  assert.equal(page!.id, '123');
  assert.equal(page!.access_token, 'PAGE_TOKEN');
  assert.deepEqual(page!.tasks, ['CREATE_CONTENT', 'MANAGE']);

  section('fetchAllManagedPages pagination');
  let calls = 0;
  const pages = await fetchAllManagedPages(async (url) => {
    calls += 1;
    if (calls === 1) {
      assert.match(url, /me\/accounts/);
      return {
        data: [{ id: 'p1', name: 'Page 1', access_token: 't1', tasks: ['MANAGE'] }],
        paging: { next: 'https://graph.facebook.com/v21.0/next' },
      };
    }
    return {
      data: [{ id: 'p2', name: 'Page 2', access_token: 't2', tasks: ['CREATE_CONTENT'] }],
    };
  }, 'v21.0');
  assert.equal(pages.length, 2);
  assert.equal(calls, 2);

  section('buildOAuthPagesListResult no token in output');
  const result = buildOAuthPagesListResult({
    status: 'OK',
    facebookUserName: 'User A',
    grantedScopes: ['pages_show_list'],
    pages: [
      {
        id: 'p1',
        name: 'Page 1',
        access_token: 'SECRET_PAGE_TOKEN',
        tasks: ['MANAGE'],
      },
    ],
  });
  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0]!.pageName, 'Page 1');
  assert.ok(!JSON.stringify(result).includes('SECRET_PAGE_TOKEN'));
  assert.equal(toOAuthPagesListItem(pages[0]!).canManagePosts, true);

  console.log('\ntest-auto-post-meta-pages-util: all passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
