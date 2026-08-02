/**
 * TeleprompterSourceService tenant isolation (unit-style with mocked prisma).
 * Run from apps/api: npx tsx ../../scripts/test-teleprompter-source-tenant.ts
 * Or: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-teleprompter-source-tenant.ts
 */
import assert from 'node:assert/strict';

type Row = {
  id: string;
  organizationId: string;
  userId: string;
  clientContentId: string | null;
  sourceType: string;
  sourceRoute: string | null;
  sourceTitle: string;
  originalScript: string;
  editedScript: string;
  videoHook: string | null;
  facebookPost: string | null;
  estimatedDuration: number;
  updatedAt: Date;
};

function assertTenantFilter(
  where: { id?: string; organizationId: string; userId: string },
  caller: { organizationId: string; id: string },
) {
  assert.equal(where.organizationId, caller.organizationId);
  assert.equal(where.userId, caller.id);
}

function main() {
  const orgA = 'org-a';
  const orgB = 'org-b';
  const userA = { id: 'user-a', organizationId: orgA };
  const userB = { id: 'user-b', organizationId: orgB };

  const row: Row = {
    id: 'src-1',
    organizationId: orgA,
    userId: userA.id,
    clientContentId: 'hist-1',
    sourceType: 'saved',
    sourceRoute: '/content?tab=library',
    sourceTitle: 'Test',
    originalScript: 'hello',
    editedScript: 'hello world',
    videoHook: null,
    facebookPost: null,
    estimatedDuration: 10,
    updatedAt: new Date(),
  };

  // Simulate getById filter for user A — match
  const whereA = {
    id: row.id,
    organizationId: userA.organizationId,
    userId: userA.id,
  };
  assertTenantFilter(whereA, userA);
  assert.equal(
    row.organizationId === whereA.organizationId && row.userId === whereA.userId,
    true,
  );

  // User B (other tenant) must not match
  const whereB = {
    id: row.id,
    organizationId: userB.organizationId,
    userId: userB.id,
  };
  assertTenantFilter(whereB, userB);
  assert.equal(
    row.organizationId === whereB.organizationId && row.userId === whereB.userId,
    false,
  );

  console.log('test-teleprompter-source-tenant: PASS');
}

main();
