/**
 * Unit tests for AI Assistant shared contracts (no Nest, no DB).
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-assistant-tools.ts
 */
import assert from 'node:assert/strict';
import {
  ASSISTANT_PERMISSIONS,
  ASSISTANT_TOOLS,
  ASSISTANT_TOOL_LIMITS,
  assistantDateRangeSchema,
  assistantErrResult,
  assistantHasAllPermissions,
  assistantOkResult,
  assistantRoleBypassesPermission,
  assistantToolContextSchema,
  assistantToolPermissionMap,
  assertAssistantTenantMatches,
  listToolsForContext,
  maskEmail,
  maskPhone,
  sanitizeAssistantAuditMeta,
} from '../packages/shared/src/assistant-tools';

function main() {
  // Role bypass = permission only
  assert.equal(assistantRoleBypassesPermission('OWNER'), true);
  assert.equal(assistantRoleBypassesPermission('SUPER_ADMIN'), true);
  assert.equal(assistantRoleBypassesPermission('MANAGER'), false);

  const ownerCtx = {
    role: 'OWNER',
    permissions: [] as string[],
  };
  assert.equal(
    assistantHasAllPermissions(ownerCtx, [ASSISTANT_PERMISSIONS.USE, 'customer.read']),
    true,
  );

  const saleCtx = {
    role: 'SALE',
    permissions: [ASSISTANT_PERMISSIONS.USE, 'customer.read'],
  };
  assert.equal(assistantHasAllPermissions(saleCtx, [ASSISTANT_PERMISSIONS.USE, 'customer.read']), true);
  assert.equal(
    assistantHasAllPermissions(saleCtx, [ASSISTANT_PERMISSIONS.USE, 'lead.read']),
    false,
  );

  // Inbox requires both assistant.use AND chatbot.inbox.read
  const inboxPerms = assistantToolPermissionMap[ASSISTANT_TOOLS.INBOX_LIST_CONVERSATIONS];
  assert.ok(inboxPerms.includes(ASSISTANT_PERMISSIONS.USE));
  assert.ok(inboxPerms.includes(ASSISTANT_PERMISSIONS.INBOX_READ));
  assert.equal(
    assistantHasAllPermissions(
      { role: 'SALE', permissions: [ASSISTANT_PERMISSIONS.USE] },
      inboxPerms,
    ),
    false,
  );

  // Tenant assert
  assert.throws(() =>
    assertAssistantTenantMatches(
      {
        userId: '11111111-1111-1111-1111-111111111111',
        organizationId: '22222222-2222-2222-2222-222222222222',
      },
      {
        id: '11111111-1111-1111-1111-111111111111',
        organizationId: '33333333-3333-3333-3333-333333333333',
      },
    ),
  );

  // Context schema
  const ctx = assistantToolContextSchema.parse({
    userId: '11111111-1111-1111-1111-111111111111',
    organizationId: '22222222-2222-2222-2222-222222222222',
    timezone: 'Asia/Ho_Chi_Minh',
    role: 'MANAGER',
    permissions: [ASSISTANT_PERMISSIONS.USE],
    requestId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  });
  assert.equal(ctx.locale, 'vi');
  assert.equal(ctx.piiReveal.phone, false);

  // PII
  assert.equal(maskPhone('0912345678')?.includes('****'), true);
  assert.ok(maskEmail('nguyen@example.com')?.startsWith('ng***@'));

  // Audit sanitize
  const clean = sanitizeAssistantAuditMeta({
    tool: 'crm.search_customers',
    phone: '0912',
    email: 'a@b.c',
    count: 3,
    accessToken: 'secret',
  });
  assert.ok(clean);
  assert.equal('phone' in (clean ?? {}), false);
  assert.equal('email' in (clean ?? {}), false);
  assert.equal('accessToken' in (clean ?? {}), false);
  assert.equal(clean?.count, 3);

  // Envelope
  const ok = assistantOkResult({
    tool: ASSISTANT_TOOLS.LIST_CAPABILITIES,
    organizationId: ctx.organizationId,
    timezone: ctx.timezone,
    data: { tools: 1 },
    evidence: [{ label: 'tools', value: 1 }],
    links: [
      {
        rel: 'list',
        label: 'Trợ lý',
        href: '/assistant',
        entityType: 'assistant',
      },
    ],
  });
  assert.equal(ok.ok, true);
  assert.ok(ok.links?.length === 1);

  const err = assistantErrResult({
    code: 'EMPTY',
    message: 'Không có dữ liệu',
    tool: ASSISTANT_TOOLS.CRM_LIST_LEADS,
    organizationId: ctx.organizationId,
  });
  assert.equal(err.ok, false);
  assert.equal(err.code, 'EMPTY');

  // Date range
  assert.throws(() =>
    assistantDateRangeSchema.parse({ dateFrom: '2026-01-01', dateTo: '2025-01-01' }),
  );
  assistantDateRangeSchema.parse({ dateFrom: '2026-01-01', dateTo: '2026-01-15' });

  // list tools filter by perm
  const listed = listToolsForContext({
    role: 'SALE',
    permissions: [ASSISTANT_PERMISSIONS.USE, ASSISTANT_PERMISSIONS.INBOX_READ],
  });
  assert.ok(listed.some((t) => t.name === ASSISTANT_TOOLS.LIST_CAPABILITIES));
  assert.ok(listed.some((t) => t.name === ASSISTANT_TOOLS.INBOX_LIST_CONVERSATIONS));
  assert.ok(!listed.some((t) => t.name === ASSISTANT_TOOLS.CRM_SEARCH_CUSTOMERS));

  assert.equal(ASSISTANT_TOOL_LIMITS.maxRows, 50);
  assert.equal(ASSISTANT_TOOL_LIMITS.maxDateSpanDays, 90);

  console.log('ALL_PASS assistant-tools');
}

main();
