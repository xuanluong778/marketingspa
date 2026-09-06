/**
 * Unit tests: date-range / period / PII / RBAC / empty / timeout (read tools foundation).
 * Run: pnpm test:assistant-domain-tools
 */
import assert from 'node:assert/strict';
import {
  ASSISTANT_PERMISSIONS,
  ASSISTANT_TOOLS,
  assistantHasAllPermissions,
  assistantToolPermissionMap,
  maskPhone,
  maskSensitiveText,
  type AssistantToolContext,
} from '../packages/shared/src/assistant-tools';
import {
  resolveAssistantRange,
  ymdInTimeZone,
  zonedLocalToUtc,
} from '../apps/api/src/assistant/tools/date-range';
import {
  AssistantToolRegistry,
  emptyArgsSchema,
  looseObjectArgsSchema,
} from '../apps/api/src/assistant/tool-registry/tool-registry';
import { AssistantToolRuntime } from '../apps/api/src/assistant/tool-registry/tool-runtime';
import { maskObjectPii } from '../apps/api/src/assistant/tool-registry/pii';
import {
  emptyTool,
  okTool,
} from '../apps/api/src/assistant/tools/result-helpers';
import {
  assistantOkResult,
} from '../packages/shared/src/assistant-tools';

const ORG_A = '22222222-2222-2222-2222-222222222222';
const ORG_B = '33333333-3333-3333-3333-333333333333';
const USER = '11111111-1111-1111-1111-111111111111';

function baseCtx(over: Partial<AssistantToolContext> = {}): AssistantToolContext {
  return {
    userId: USER,
    organizationId: ORG_A,
    timezone: 'Asia/Ho_Chi_Minh',
    role: 'SALE',
    permissions: [
      ASSISTANT_PERMISSIONS.USE,
      ASSISTANT_PERMISSIONS.INBOX_READ,
      'customer.read',
      'lead.read',
      'order.read',
      'work.task.read',
      'work.project.read',
      'hrm.employee.read',
      'ads.read',
    ],
    employeeId: null,
    locale: 'vi',
    requestId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    piiReveal: { phone: false, email: false },
    ...over,
  };
}

async function main() {
  // --- Timezone periods (fixed now: 2026-08-06 10:00+07 ≈ same UTC day boundary)
  const now = new Date('2026-08-06T03:00:00.000Z'); // 10:00 VN
  assert.equal(ymdInTimeZone(now, 'Asia/Ho_Chi_Minh'), '2026-08-06');

  const today = resolveAssistantRange({ period: 'today' }, 'Asia/Ho_Chi_Minh', 90, now);
  assert.equal(today.dateFrom, '2026-08-06');
  assert.equal(today.dateTo, '2026-08-06');

  const yesterday = resolveAssistantRange({ period: 'yesterday' }, 'Asia/Ho_Chi_Minh', 90, now);
  assert.equal(yesterday.dateFrom, '2026-08-05');
  assert.equal(yesterday.dateTo, '2026-08-05');

  const last7 = resolveAssistantRange({ period: 'last_7_days' }, 'Asia/Ho_Chi_Minh', 90, now);
  assert.equal(last7.dateFrom, '2026-07-31');
  assert.equal(last7.dateTo, '2026-08-06');

  const month = resolveAssistantRange({ period: 'this_month' }, 'Asia/Ho_Chi_Minh', 90, now);
  assert.equal(month.dateFrom, '2026-08-01');
  assert.equal(month.dateTo, '2026-08-06');

  const custom = resolveAssistantRange(
    { period: 'custom', dateFrom: '2026-08-01', dateTo: '2026-08-03' },
    'Asia/Ho_Chi_Minh',
    90,
    now,
  );
  assert.equal(custom.dateFrom, '2026-08-01');
  // Start of day VN is 17:00 previous UTC for ICT
  const start = zonedLocalToUtc('2026-08-01', 0, 0, 0, 0, 'Asia/Ho_Chi_Minh');
  assert.ok(start.toISOString().includes('2026-07-31') || start.toISOString().includes('2026-08-01'));

  assert.throws(() =>
    resolveAssistantRange(
      { period: 'custom', dateFrom: '2026-01-01', dateTo: '2026-12-31' },
      'Asia/Ho_Chi_Minh',
      90,
      now,
    ),
  );

  // --- RBAC inbox needs both
  const saleNoInbox = baseCtx({
    permissions: [ASSISTANT_PERMISSIONS.USE, 'customer.read'],
  });
  assert.equal(
    assistantHasAllPermissions(
      saleNoInbox,
      assistantToolPermissionMap[ASSISTANT_TOOLS.INBOX_LIST_CONVERSATIONS],
    ),
    false,
  );
  assert.equal(
    assistantHasAllPermissions(
      baseCtx(),
      assistantToolPermissionMap[ASSISTANT_TOOLS.INBOX_LIST_CONVERSATIONS],
    ),
    true,
  );
  // OWNER bypass permission strings only
  assert.equal(
    assistantHasAllPermissions(
      baseCtx({ role: 'OWNER', permissions: [] }),
      assistantToolPermissionMap[ASSISTANT_TOOLS.INBOX_PAGE_STATS],
    ),
    true,
  );

  // --- Runtime: empty, timeout, tenant org echo, PII mask
  const registry = new AssistantToolRegistry();
  registry.register({
    name: 'test.empty',
    description: 'empty',
    permissions: [ASSISTANT_PERMISSIONS.USE],
    mutates: false,
    argsSchema: emptyArgsSchema,
    handler: async (ctx) => emptyTool(ctx, 'test.empty', 'Không có dữ liệu trong khoảng'),
  });
  registry.register({
    name: 'test.slow',
    description: 'timeout',
    permissions: [ASSISTANT_PERMISSIONS.USE],
    mutates: false,
    argsSchema: emptyArgsSchema,
    timeoutMs: 50,
    handler: async () => {
      await new Promise((r) => setTimeout(r, 200));
      return assistantOkResult({
        tool: 'test.slow',
        organizationId: ORG_A,
        timezone: 'Asia/Ho_Chi_Minh',
        data: {},
      });
    },
  });
  registry.register({
    name: 'test.pii',
    description: 'pii',
    permissions: [ASSISTANT_PERMISSIONS.USE],
    mutates: false,
    argsSchema: looseObjectArgsSchema,
    handler: async (ctx) =>
      okTool(ctx, 'test.pii', {
        phone: '0912345678',
        email: 'nguyen@example.com',
        visitorPhone: '0987654321',
        messagePreview: 'Gọi 0912345678 hoặc mail a@b.com',
        fanpagePageId: 'PAGE_1',
        customerPsid: 'PSID_XYZ',
      }),
  });
  registry.register({
    name: 'test.evil_org',
    description: 'tenant',
    permissions: [ASSISTANT_PERMISSIONS.USE],
    mutates: false,
    argsSchema: emptyArgsSchema,
    handler: async () =>
      assistantOkResult({
        tool: 'test.evil_org',
        organizationId: ORG_B,
        timezone: 'Asia/Ho_Chi_Minh',
        data: { x: 1 },
      }),
  });
  registry.register({
    name: 'test.finance_ok',
    description: 'finance sample',
    permissions: [ASSISTANT_PERMISSIONS.USE, 'order.read'],
    mutates: false,
    argsSchema: looseObjectArgsSchema,
    handler: async (ctx) =>
      okTool(
        ctx,
        'test.finance_ok',
        { revenue: 1_000_000 },
        {
          evidence: [{ label: 'revenue', value: 1_000_000, unit: 'VND' }],
          links: [
            { rel: 'report', label: 'Tài chính', href: '/finance', entityType: 'report' },
          ],
        },
      ),
  });

  const runtime = new AssistantToolRuntime(registry);
  const ctx = baseCtx();

  const empty = await runtime.invoke('test.empty', {}, ctx);
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.code, 'EMPTY');

  const slow = await runtime.invoke('test.slow', {}, ctx);
  assert.equal(slow.ok, false);
  if (!slow.ok) assert.equal(slow.code, 'TIMEOUT');

  const forbidden = await runtime.invoke(
    'test.finance_ok',
    {},
    baseCtx({ permissions: [ASSISTANT_PERMISSIONS.USE] }),
  );
  assert.equal(forbidden.ok, false);
  if (!forbidden.ok) assert.equal(forbidden.code, 'FORBIDDEN');

  const ownerOk = await runtime.invoke(
    'test.finance_ok',
    {},
    baseCtx({ role: 'OWNER', permissions: [] }),
  );
  assert.equal(ownerOk.ok, true);
  if (ownerOk.ok) {
    assert.equal(ownerOk.organizationId, ORG_A);
    assert.ok(ownerOk.evidence?.some((e) => e.label === 'revenue'));
    assert.ok(ownerOk.links?.length);
  }

  const pii = await runtime.invoke('test.pii', {}, ctx);
  assert.equal(pii.ok, true);
  if (pii.ok) {
    const d = pii.data as Record<string, string>;
    assert.ok(String(d.phone).includes('****'));
    assert.ok(String(d.email).includes('***'));
    assert.ok(String(d.visitorPhone).includes('****'));
    assert.ok(!String(d.messagePreview).includes('0912345678'));
    assert.equal(d.fanpagePageId, 'PAGE_1');
    assert.equal(d.customerPsid, 'PSID_XYZ');
  }

  const evil = await runtime.invoke('test.evil_org', {}, ctx);
  assert.equal(evil.ok, false);
  if (!evil.ok) assert.equal(evil.code, 'UPSTREAM');

  // pure mask
  assert.ok(maskPhone('0912345678')?.includes('****'));
  assert.ok(maskSensitiveText('Call 0912345678')?.includes('****'));
  const masked = maskObjectPii(
    { visitorPhone: '0900111222', note: 'email me x@y.com' },
    { phone: false, email: false },
  ) as Record<string, string>;
  assert.ok(String(masked.visitorPhone).includes('****'));

  // New tools present in permission map
  assert.ok(assistantToolPermissionMap[ASSISTANT_TOOLS.INBOX_PAGE_STATS]);
  assert.ok(assistantToolPermissionMap[ASSISTANT_TOOLS.ADS_LIST_CAMPAIGNS]);
  assert.ok(assistantToolPermissionMap[ASSISTANT_TOOLS.CRM_LIST_STALE_LEADS]);
  assert.ok(assistantToolPermissionMap[ASSISTANT_TOOLS.WORK_EMPLOYEE_STATS]);

  console.log('ALL_PASS assistant-domain-tools');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
