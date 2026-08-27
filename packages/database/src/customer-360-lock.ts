import type { Prisma } from '@prisma/client';

type LockClient = {
  $executeRaw: Prisma.TransactionClient['$executeRaw'];
};

/** Deterministic lock order — never change without auditing all callers. */
export const CUSTOMER_360_LOCK_KIND_ORDER = {
  EMAIL: 0,
  PHONE: 1,
  ZALO: 2,
  FACEBOOK: 3,
} as const;

export type Customer360LockKind = keyof typeof CUSTOMER_360_LOCK_KIND_ORDER;

export type Customer360IdentityLock = {
  kind: Customer360LockKind;
  valueNormalized: string;
  /** Required for ZALO/FACEBOOK scope; always forced to '' for EMAIL/PHONE. */
  channelAccountRef?: string | null;
};

function normalizeLock(lock: Customer360IdentityLock): Customer360IdentityLock | null {
  const value = String(lock.valueNormalized || '').trim();
  if (!value) return null;
  const kind = lock.kind;
  const channelAccountRef =
    kind === 'EMAIL' || kind === 'PHONE' ? '' : String(lock.channelAccountRef ?? '').trim();
  return { kind, valueNormalized: value, channelAccountRef };
}

function lockSortKey(lock: Customer360IdentityLock): string {
  const order = CUSTOMER_360_LOCK_KIND_ORDER[lock.kind];
  const ref = lock.channelAccountRef ?? '';
  // kind-rank first, then value, then channel ref — never lexicographic kind names alone
  return `${order}:${lock.kind}:${lock.valueNormalized}:${ref}`;
}

function advisoryKey(lock: Customer360IdentityLock): string {
  const ref = lock.channelAccountRef ?? '';
  return `c360:${lock.kind}:${lock.valueNormalized}:${ref}`;
}

/**
 * Acquire transaction-scoped advisory locks in EMAIL → PHONE → ZALO → FACEBOOK order
 * (then valueNormalized, then channelAccountRef). Callers MUST pass every identity
 * they will read/write in this transaction.
 */
export async function lockCustomer360Identities(
  tx: LockClient,
  organizationId: string,
  locks: Array<Customer360IdentityLock | null | undefined>,
): Promise<Customer360IdentityLock[]> {
  const map = new Map<string, Customer360IdentityLock>();
  for (const raw of locks) {
    if (!raw) continue;
    const n = normalizeLock(raw);
    if (!n) continue;
    map.set(lockSortKey(n), n);
  }
  const ordered = [...map.values()].sort((a, b) =>
    lockSortKey(a).localeCompare(lockSortKey(b), 'en'),
  );
  for (const lock of ordered) {
    const key = advisoryKey(lock);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}), hashtext(${key}))`;
  }
  return ordered;
}

/** @deprecated Prefer lockCustomer360Identities with typed kind. Kept for transitional callers. */
export async function lockCustomer360Keys(
  tx: LockClient,
  organizationId: string,
  keys: Array<string | null | undefined>,
): Promise<void> {
  const locks: Customer360IdentityLock[] = [];
  for (const key of keys) {
    if (!key) continue;
    const m = /^(email|phone|zalo|facebook|customer):(.+)$/i.exec(key);
    if (!m) continue;
    const prefix = (m[1] || '').toLowerCase();
    const value = m[2] || '';
    if (!value || prefix === 'customer') continue; // never lock by customer id — not an identity key
    locks.push({
      kind: prefix.toUpperCase() as Customer360LockKind,
      valueNormalized: value,
      channelAccountRef: '',
    });
  }
  await lockCustomer360Identities(tx, organizationId, locks);
}

export function customer360EmailLockKey(emailNormalized: string | null | undefined): string | null {
  return emailNormalized ? `email:${emailNormalized}` : null;
}

export function customer360PhoneLockKey(phoneNormalized: string | null | undefined): string | null {
  return phoneNormalized ? `phone:${phoneNormalized}` : null;
}

export function customer360CustomerLockKey(_customerId: string | null | undefined): string | null {
  // Deprecated: customer-id locks are not part of the identity lock order.
  return null;
}

export function emailIdentityLock(
  emailNormalized: string | null | undefined,
): Customer360IdentityLock | null {
  return emailNormalized
    ? { kind: 'EMAIL', valueNormalized: emailNormalized, channelAccountRef: '' }
    : null;
}

export function phoneIdentityLock(
  phoneNormalized: string | null | undefined,
): Customer360IdentityLock | null {
  return phoneNormalized
    ? { kind: 'PHONE', valueNormalized: phoneNormalized, channelAccountRef: '' }
    : null;
}

export function messagingIdentityLock(
  kind: 'ZALO' | 'FACEBOOK',
  valueNormalized: string | null | undefined,
  channelAccountRef?: string | null,
): Customer360IdentityLock | null {
  return valueNormalized
    ? { kind, valueNormalized, channelAccountRef: channelAccountRef ?? '' }
    : null;
}
