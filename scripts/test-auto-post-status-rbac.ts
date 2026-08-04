/**
 * RBAC payload checks for Auto Post status (USER vs SUPER_ADMIN/allowlist).
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-auto-post-status-rbac.ts
 */
import assert from 'node:assert/strict';
import { humanizeAutoPostFacebookError } from '../apps/api/src/auto-post/auto-post-user-facing-errors';

function main() {
  assert.equal(
    humanizeAutoPostFacebookError('MISSING_PERMISSION: pages_manage_posts'),
    'Bạn chưa cấp đủ quyền quản lý Fanpage. Vui lòng kết nối lại và cho phép các quyền được yêu cầu.',
  );
  assert.equal(
    humanizeAutoPostFacebookError('NEEDS_RECONNECT: Token Facebook đã hết hạn'),
    'Phiên đăng nhập Facebook đã hết hạn hoặc bị thu hồi. Vui lòng kết nối lại Facebook.',
  );
  const msg = humanizeAutoPostFacebookError(
    'Kết nối OAuth chưa bật — dùng SERVER_ENV allowlist',
  );
  assert.ok(msg && !/oauth|server_env|allowlist|token|config_id/i.test(msg));

  // Null/empty lastError must NOT invent the generic connect-failure banner
  assert.equal(humanizeAutoPostFacebookError(null, null), null);
  assert.equal(humanizeAutoPostFacebookError(undefined, null), null);
  assert.equal(humanizeAutoPostFacebookError('   ', null), null);

  console.log('test-auto-post-status-rbac: all passed');
}

main();
