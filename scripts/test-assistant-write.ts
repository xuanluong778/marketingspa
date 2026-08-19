/**
 * Unit + logic tests for assistant write confirmation pipeline.
 * Covers: mutates flags, token binding, expiry, one-time hash, strip secrets,
 * forbidden tools, listTools mutates. No production deploy gate.
 *
 * Run: pnpm test:assistant-write
 */
import assert from 'node:assert/strict';
import {
  ASSISTANT_PERMISSIONS,
  ASSISTANT_TOOLS,
  assistantHasAllPermissions,
  assistantToolMutatesMap,
  isAssistantWriteTool,
  listToolsForContext,
} from '../packages/shared/src/assistant-tools';
import {
  bindingMatches,
  confirmExpiresAt,
  generateConfirmSecret,
  hashConfirmSecret,
  isExpired,
  isForbiddenWriteToolName,
  secretsEqual,
  stripConfirmSecrets,
} from '../apps/api/src/assistant/write/confirmation.logic';
import { stripForbiddenToolArgs } from '../apps/api/src/assistant/assistant.prompt';
import { redactToolResultForLlm } from '../apps/api/src/assistant/assistant.prompt';

function main() {
  // mutates=true only for write tools
  for (const [name, mutates] of Object.entries(assistantToolMutatesMap)) {
    if (isAssistantWriteTool(name)) {
      assert.equal(mutates, true, `${name} should mutates`);
    } else {
      assert.equal(mutates, false, `${name} should be read-only`);
    }
  }

  assert.equal(isAssistantWriteTool(ASSISTANT_TOOLS.WORK_CREATE_TASK), true);
  assert.equal(isAssistantWriteTool(ASSISTANT_TOOLS.CRM_CREATE_LEAD), true);
  assert.equal(isAssistantWriteTool(ASSISTANT_TOOLS.CRM_CREATE_CARE_REMINDER), true);
  assert.equal(isAssistantWriteTool(ASSISTANT_TOOLS.INBOX_MARK_READ), true);
  assert.equal(isAssistantWriteTool(ASSISTANT_TOOLS.INBOX_DRAFT_REPLY), true);
  assert.equal(isAssistantWriteTool(ASSISTANT_TOOLS.FINANCE_DASHBOARD), false);

  const listed = listToolsForContext({
    role: 'OWNER',
    permissions: [],
  });
  const writes = listed.filter((t) => t.mutates);
  assert.ok(writes.length >= 5);
  assert.ok(writes.every((t) => t.mutates === true));

  // Permission: write needs lead.write / work.task.write
  assert.equal(
    assistantHasAllPermissions(
      { role: 'SALE', permissions: [ASSISTANT_PERMISSIONS.USE] },
      [ASSISTANT_PERMISSIONS.USE, 'lead.write'],
    ),
    false,
  );
  assert.equal(
    assistantHasAllPermissions(
      { role: 'SALE', permissions: [ASSISTANT_PERMISSIONS.USE, 'lead.write'] },
      [ASSISTANT_PERMISSIONS.USE, 'lead.write'],
    ),
    true,
  );

  // Token hash + one-time compare
  const secret = generateConfirmSecret();
  assert.ok(secret.length >= 32);
  const h1 = hashConfirmSecret(secret);
  const h2 = hashConfirmSecret(secret);
  assert.equal(h1, h2);
  assert.equal(secretsEqual(h1, h2), true);
  assert.equal(secretsEqual(h1, hashConfirmSecret('wrong')), false);

  // Expiry
  const past = new Date(Date.now() - 1000);
  assert.equal(isExpired(past), true);
  const future = confirmExpiresAt(new Date(), 60_000);
  assert.equal(isExpired(future), false);

  // Binding
  const b = {
    organizationId: 'org-a',
    userId: 'user-a',
    toolName: ASSISTANT_TOOLS.INBOX_MARK_READ,
    requestId: 'req-1',
  };
  assert.equal(bindingMatches(b, b), true);
  assert.equal(
    bindingMatches(b, { ...b, organizationId: 'org-b' }),
    false,
  );
  assert.equal(bindingMatches(b, { ...b, userId: 'user-b' }), false);
  assert.equal(bindingMatches(b, { ...b, toolName: 'evil' }), false);
  assert.equal(bindingMatches(b, { ...b, requestId: 'req-2' }), false);

  // strip secrets
  const stripped = stripConfirmSecrets({
    actionId: 'x',
    confirmToken: 'secret-token-value',
    preview: { action: 'ok' },
  });
  assert.equal('confirmToken' in stripped, false);
  assert.equal((stripped as { preview: { action: string } }).preview.action, 'ok');

  // Prompt-injection bypass stripped from tool args
  const cleaned = stripForbiddenToolArgs({
    conversationId: 'c1',
    confirmToken: 'SHOULD_NOT_PASS',
    skipConfirm: true,
    force: true,
    executeNow: true,
    organizationId: 'evil-org',
    draftText: 'hello',
  });
  assert.equal(cleaned.confirmToken, undefined);
  assert.equal(cleaned.skipConfirm, undefined);
  assert.equal(cleaned.organizationId, undefined);
  assert.equal(cleaned.draftText, 'hello');

  // LLM redaction of confirmToken
  const llm = redactToolResultForLlm({
    ok: true,
    data: { confirmToken: 'abc123secret', requiresConfirmation: true, actionId: 'a' },
  });
  assert.ok(!llm.includes('abc123secret'));
  assert.ok(llm.includes('REDACTED') || llm.includes('[REDACTED'));

  // Forbidden tool names
  assert.equal(isForbiddenWriteToolName('meta.send_message'), true);
  assert.equal(isForbiddenWriteToolName('ads.run_campaign'), true);
  assert.equal(isForbiddenWriteToolName('delete_customer'), true);
  assert.equal(isForbiddenWriteToolName('change_permissions'), true);
  assert.equal(isForbiddenWriteToolName('payment.charge'), true);
  assert.equal(isForbiddenWriteToolName(ASSISTANT_TOOLS.INBOX_DRAFT_REPLY), false);
  assert.equal(isForbiddenWriteToolName(ASSISTANT_TOOLS.WORK_CREATE_TASK), false);

  // Replay semantics (document): after spend, secret must not match stored spent hash
  const spent = hashConfirmSecret(`spent:action:${secret}`);
  assert.equal(secretsEqual(spent, h1), false);

  console.log('test-assistant-write: all passed');
}

main();
