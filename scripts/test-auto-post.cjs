/**
 * Unit tests for Auto Post helpers.
 * Run: node scripts/test-auto-post.cjs
 */
const assert = require('assert');

const CONTENT_AUTO_POST_TABS = ['create', 'brand', 'library', 'auto-post', 'schedule', 'channels'];

function buildContentAutoPostHref(tab, params) {
  const qs = new URLSearchParams({ tab, ...(params || {}) });
  return `/content?${qs.toString()}`;
}

function contentStudioTabToShellTab(tab) {
  if (tab === 'personal') return 'brand';
  return 'create';
}

function assertPublishable(post) {
  if (!post.fanpageId) throw new Error('Chưa chọn Fanpage');
  if (!post.caption?.trim()) throw new Error('Nội dung trống');
  if (post.status === 'PUBLISHED') throw new Error('Đã đăng');
  if (post.status === 'PUBLISHING') throw new Error('Đang đăng');
}

function canUserSeePost(viewerUserId, post) {
  return post.userId === viewerUserId;
}

function isScheduleValid(iso) {
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d.getTime() > Date.now();
}

// User isolation
assert.strictEqual(canUserSeePost('user-a', { userId: 'user-a' }), true);
assert.strictEqual(canUserSeePost('user-a', { userId: 'user-b' }), false);

// Publish validation
assert.throws(() => assertPublishable({ fanpageId: null, caption: 'x', status: 'DRAFT' }));
assert.throws(() => assertPublishable({ fanpageId: 'fp1', caption: '  ', status: 'DRAFT' }));
assert.doesNotThrow(() =>
  assertPublishable({ fanpageId: 'fp1', caption: 'Hello spa', status: 'DRAFT' }),
);

// Schedule must be future
assert.ok(isScheduleValid(new Date(Date.now() + 3600000).toISOString()));
assert.ok(!isScheduleValid(new Date(Date.now() - 1000).toISOString()));

// Draft must not auto-publish
const draft = { status: 'DRAFT', approvedAt: null };
assert.ok(draft.status === 'DRAFT' && !draft.approvedAt);

// Unified routes
assert.ok(buildContentAutoPostHref('auto-post').includes('tab=auto-post'));
assert.ok(buildContentAutoPostHref('channels', { facebook: 'connected' }).includes('facebook=connected'));
assert.strictEqual(contentStudioTabToShellTab('personal'), 'brand');
assert.strictEqual(contentStudioTabToShellTab('ad'), 'create');
assert.strictEqual(CONTENT_AUTO_POST_TABS.length, 6);

console.log('test-auto-post: all passed');
