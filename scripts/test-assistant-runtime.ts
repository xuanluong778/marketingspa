/**
 * Unit tests: Assistant ToolRuntime basline (tenant, PII mask path).
 * Prefer test:assistant-domain-tools for full coverage.
 */
import assert from 'node:assert/strict';
import {
  ASSISTANT_PERMISSIONS,
  ASSISTANT_TOOLS,
  assistantOkResult,
  type AssistantToolContext,
} from '../packages/shared/src/assistant-tools';
import {
  AssistantToolRegistry,
  emptyArgsSchema,
} from '../apps/api/src/assistant/tool-registry/tool-registry';
import { AssistantToolRuntime } from '../apps/api/src/assistant/tool-registry/tool-runtime';
import { buildAssistantToolContext } from '../apps/api/src/assistant/tool-registry/context';
import { maskObjectPii } from '../apps/api/src/assistant/tool-registry/pii';

async function main() {
  const registry = new AssistantToolRegistry();
  registry.register({
    name: ASSISTANT_TOOLS.LIST_CAPABILITIES,
    description: 'test',
    permissions: [ASSISTANT_PERMISSIONS.USE],
    mutates: false,
    argsSchema: emptyArgsSchema,
    handler: async (ctx) =>
      assistantOkResult({
        tool: ASSISTANT_TOOLS.LIST_CAPABILITIES,
        organizationId: ctx.organizationId,
        timezone: ctx.timezone,
        data: { ok: true },
        links: [
          {
            rel: 'list',
            label: 'Trợ lý',
            href: '/assistant',
            entityType: 'assistant',
          },
        ],
      }),
  });
  const runtime = new AssistantToolRuntime(registry);

  const baseCtx: AssistantToolContext = {
    userId: '11111111-1111-1111-1111-111111111111',
    organizationId: '22222222-2222-2222-2222-222222222222',
    timezone: 'Asia/Ho_Chi_Minh',
    role: 'SALE',
    permissions: [ASSISTANT_PERMISSIONS.USE],
    employeeId: null,
    locale: 'vi',
    requestId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    piiReveal: { phone: false, email: false },
  };

  const cap = await runtime.invoke(ASSISTANT_TOOLS.LIST_CAPABILITIES, {}, baseCtx);
  assert.equal(cap.ok, true);

  registry.register({
    name: 'test.evil_org',
    description: 'test',
    permissions: [ASSISTANT_PERMISSIONS.USE],
    mutates: false,
    argsSchema: emptyArgsSchema,
    handler: async () =>
      assistantOkResult({
        tool: 'test.evil_org',
        organizationId: '33333333-3333-3333-3333-333333333333',
        timezone: 'Asia/Ho_Chi_Minh',
        data: { x: 1 },
      }),
  });
  const evil = await runtime.invoke('test.evil_org', {}, baseCtx);
  assert.equal(evil.ok, false);
  if (!evil.ok) assert.equal(evil.code, 'UPSTREAM');

  const jwtCtx = buildAssistantToolContext({
    id: baseCtx.userId,
    email: 'a@b.c',
    name: 'A',
    role: 'MANAGER',
    organizationId: baseCtx.organizationId,
    permissions: [ASSISTANT_PERMISSIONS.USE],
  });
  assert.equal(jwtCtx.organizationId, baseCtx.organizationId);

  const masked = maskObjectPii(
    { phone: '0912345678', email: 'nguyen@example.com', name: 'OK' },
    { phone: false, email: false },
  ) as Record<string, string>;
  assert.ok(masked.phone.includes('****'));
  assert.equal(masked.name, 'OK');

  console.log('ALL_PASS assistant-runtime');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
