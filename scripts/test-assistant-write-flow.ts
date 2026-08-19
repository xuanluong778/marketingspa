/**
 * In-memory simulation of pending confirm pipeline for tenant isolation,
 * permission, cancel, expiry, replay — without DB.
 * Complements test-assistant-write.ts.
 */
import assert from 'node:assert/strict';
import {
  ASSISTANT_PENDING_STATUSES,
  ASSISTANT_TOOLS,
  assistantHasAllPermissions,
  assistantToolPermissionMap,
} from '../packages/shared/src/assistant-tools';
import {
  bindingMatches,
  generateConfirmSecret,
  hashConfirmSecret,
  isExpired,
  secretsEqual,
  type ConfirmBinding,
} from '../apps/api/src/assistant/write/confirmation.logic';

type Row = {
  id: string;
  organizationId: string;
  userId: string;
  toolName: string;
  requestId: string;
  status: string;
  confirmSecretHash: string;
  expiresAt: Date;
  executed: boolean;
  wrote: boolean;
  executeIdempotencyKey?: string;
  resultMeta?: { entityId: string };
};

function propose(store: Map<string, Row>, input: ConfirmBinding & { userRole: string; perms: string[] }): { actionId: string; token: string } {
  const perms = assistantToolPermissionMap[input.toolName as keyof typeof assistantToolPermissionMap];
  if (!assistantHasAllPermissions({ role: input.userRole, permissions: input.perms }, perms ?? [])) {
    throw new Error('FORBIDDEN');
  }
  const token = generateConfirmSecret();
  const id = `act-${store.size + 1}`;
  store.set(id, {
    id,
    organizationId: input.organizationId,
    userId: input.userId,
    toolName: input.toolName,
    requestId: input.requestId,
    status: ASSISTANT_PENDING_STATUSES.PROPOSED,
    confirmSecretHash: hashConfirmSecret(token),
    expiresAt: new Date(Date.now() + 60_000),
    executed: false,
    wrote: false,
  });
  return { actionId: id, token };
}

function confirm(
  store: Map<string, Row>,
  auth: { organizationId: string; userId: string; role: string; perms: string[] },
  actionId: string,
  token: string,
  idem?: string,
): { wrote: boolean; status: string } {
  const row = store.get(actionId);
  if (!row) throw new Error('NOT_FOUND');
  if (row.organizationId !== auth.organizationId || row.userId !== auth.userId) {
    throw new Error('TENANT');
  }
  if (row.status === ASSISTANT_PENDING_STATUSES.CONFIRMED && row.executed) {
    if (idem && row.executeIdempotencyKey && row.executeIdempotencyKey !== idem) {
      throw new Error('IDEMPOTENCY_CONFLICT');
    }
    return { wrote: false, status: 'already' }; // no second write
  }
  if (row.status === ASSISTANT_PENDING_STATUSES.CANCELLED) throw new Error('CANCELLED');
  if (isExpired(row.expiresAt)) {
    row.status = ASSISTANT_PENDING_STATUSES.EXPIRED;
    throw new Error('EXPIRED');
  }
  if (row.status !== ASSISTANT_PENDING_STATUSES.PROPOSED) throw new Error('BAD_STATE');
  if (!secretsEqual(row.confirmSecretHash, hashConfirmSecret(token))) throw new Error('BAD_TOKEN');
  if (
    !bindingMatches(
      {
        organizationId: row.organizationId,
        userId: row.userId,
        toolName: row.toolName,
        requestId: row.requestId,
      },
      {
        organizationId: auth.organizationId,
        userId: auth.userId,
        toolName: row.toolName,
        requestId: row.requestId,
      },
    )
  ) {
    throw new Error('BINDING');
  }
  const perms = assistantToolPermissionMap[row.toolName as keyof typeof assistantToolPermissionMap];
  if (!assistantHasAllPermissions({ role: auth.role, permissions: auth.perms }, perms ?? [])) {
    row.status = ASSISTANT_PENDING_STATUSES.FAILED;
    throw new Error('FORBIDDEN');
  }
  // one-time
  row.confirmSecretHash = hashConfirmSecret(`spent:${row.id}`);
  row.status = ASSISTANT_PENDING_STATUSES.CONFIRMED;
  row.executed = true;
  row.wrote = true;
  row.executeIdempotencyKey = idem ?? `exec:${row.id}`;
  row.resultMeta = { entityId: 'e1' };
  return { wrote: true, status: 'ok' };
}

function cancel(store: Map<string, Row>, auth: { organizationId: string; userId: string }, actionId: string) {
  const row = store.get(actionId);
  if (!row || row.organizationId !== auth.organizationId || row.userId !== auth.userId) {
    throw new Error('NOT_FOUND');
  }
  row.status = ASSISTANT_PENDING_STATUSES.CANCELLED;
  row.wrote = false;
}

function main() {
  const store = new Map<string, Row>();
  const userA = {
    organizationId: 'org-a',
    userId: 'user-a',
    userRole: 'SALE',
    perms: ['assistant.use', 'lead.write', 'chatbot.inbox.read', 'work.task.write'],
  };

  // Propose
  const p1 = propose(store, {
    organizationId: userA.organizationId,
    userId: userA.userId,
    toolName: ASSISTANT_TOOLS.INBOX_MARK_READ,
    requestId: 'req-1',
    userRole: userA.userRole,
    perms: userA.perms,
  });
  assert.equal(store.get(p1.actionId)!.wrote, false);

  // Permission denied on propose
  assert.throws(
    () =>
      propose(store, {
        organizationId: userA.organizationId,
        userId: userA.userId,
        toolName: ASSISTANT_TOOLS.WORK_CREATE_TASK,
        requestId: 'req-2',
        userRole: 'SALE',
        perms: ['assistant.use'], // missing work.task.write
      }),
    /FORBIDDEN/,
  );

  // Tenant isolation: other org cannot confirm
  assert.throws(
    () =>
      confirm(
        store,
        {
          organizationId: 'org-b',
          userId: userA.userId,
          role: userA.userRole,
          perms: userA.perms,
        },
        p1.actionId,
        p1.token,
      ),
    /TENANT/,
  );

  // Wrong user
  assert.throws(
    () =>
      confirm(
        store,
        {
          organizationId: userA.organizationId,
          userId: 'user-b',
          role: userA.userRole,
          perms: userA.perms,
        },
        p1.actionId,
        p1.token,
      ),
    /TENANT/,
  );

  // Confirm success → wrote once
  const c1 = confirm(
    store,
    {
      organizationId: userA.organizationId,
      userId: userA.userId,
      role: userA.userRole,
      perms: userA.perms,
    },
    p1.actionId,
    p1.token,
    'idem-1',
  );
  assert.equal(c1.wrote, true);
  assert.equal(store.get(p1.actionId)!.wrote, true);

  // Replay same token after spend: idempotent return (no second domain write)
  const replay = confirm(
    store,
    {
      organizationId: userA.organizationId,
      userId: userA.userId,
      role: userA.userRole,
      perms: userA.perms,
    },
    p1.actionId,
    p1.token,
  );
  assert.equal(replay.wrote, false);
  assert.equal(replay.status, 'already');

  // Idempotent re-confirm with same key → no second write
  const c2 = confirm(
    store,
    {
      organizationId: userA.organizationId,
      userId: userA.userId,
      role: userA.userRole,
      perms: userA.perms,
    },
    p1.actionId,
    'any',
    'idem-1',
  );
  assert.equal(c2.wrote, false);
  assert.equal(c2.status, 'already');
  // Cancel path: no write
  const p2 = propose(store, {
    organizationId: userA.organizationId,
    userId: userA.userId,
    toolName: ASSISTANT_TOOLS.CRM_CREATE_LEAD,
    requestId: 'req-3',
    userRole: userA.userRole,
    perms: userA.perms,
  });
  cancel(store, userA, p2.actionId);
  assert.throws(
    () =>
      confirm(
        store,
        {
          organizationId: userA.organizationId,
          userId: userA.userId,
          role: userA.userRole,
          perms: userA.perms,
        },
        p2.actionId,
        p2.token,
      ),
    /CANCELLED/,
  );
  assert.equal(store.get(p2.actionId)!.wrote, false);

  // Expiry → no write
  const p3 = propose(store, {
    organizationId: userA.organizationId,
    userId: userA.userId,
    toolName: ASSISTANT_TOOLS.INBOX_DRAFT_REPLY,
    requestId: 'req-4',
    userRole: userA.userRole,
    perms: userA.perms,
  });
  store.get(p3.actionId)!.expiresAt = new Date(Date.now() - 1);
  assert.throws(
    () =>
      confirm(
        store,
        {
          organizationId: userA.organizationId,
          userId: userA.userId,
          role: userA.userRole,
          perms: userA.perms,
        },
        p3.actionId,
        p3.token,
      ),
    /EXPIRED/,
  );
  assert.equal(store.get(p3.actionId)!.wrote, false);
  assert.equal(store.get(p3.actionId)!.status, ASSISTANT_PENDING_STATUSES.EXPIRED);

  // Wrong token → no write
  const p4 = propose(store, {
    organizationId: userA.organizationId,
    userId: userA.userId,
    toolName: ASSISTANT_TOOLS.CRM_CREATE_CARE_REMINDER,
    requestId: 'req-5',
    userRole: userA.userRole,
    perms: userA.perms,
  });
  assert.throws(
    () =>
      confirm(
        store,
        {
          organizationId: userA.organizationId,
          userId: userA.userId,
          role: userA.userRole,
          perms: userA.perms,
        },
        p4.actionId,
        'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      ),
    /BAD_TOKEN/,
  );
  assert.equal(store.get(p4.actionId)!.wrote, false);

  console.log('test-assistant-write-flow: all passed');
}

main();
