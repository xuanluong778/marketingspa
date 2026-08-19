/**
 * Pure confirmation helpers (no Nest/DB) — token hash, binding, expiry.
 * Secrets never log; compare via timing-safe equality.
 */
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { ASSISTANT_TOOL_LIMITS } from '@marketingspa/shared';

export function hashConfirmSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

/** 32-byte hex token (64 chars) — returned once to client. */
export function generateConfirmSecret(): string {
  return randomBytes(32).toString('hex');
}

export function secretsEqual(aHash: string, bHash: string): boolean {
  try {
    const a = Buffer.from(aHash, 'hex');
    const b = Buffer.from(bHash, 'hex');
    if (a.length !== b.length || a.length === 0) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function confirmExpiresAt(
  from = new Date(),
  ttlMs = ASSISTANT_TOOL_LIMITS.writeConfirmTtlMs,
): Date {
  return new Date(from.getTime() + ttlMs);
}

export function isExpired(expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/** Bind identity for a pending write — all four must match on confirm. */
export type ConfirmBinding = {
  organizationId: string;
  userId: string;
  toolName: string;
  requestId: string;
};

export function bindingMatches(stored: ConfirmBinding, attempt: ConfirmBinding): boolean {
  return (
    stored.organizationId === attempt.organizationId &&
    stored.userId === attempt.userId &&
    stored.toolName === attempt.toolName &&
    stored.requestId === attempt.requestId
  );
}

/**
 * Strip secrets / confirm tokens from any object before LLM or logs.
 * Recursive, shallow-depth limited.
 */
export function stripConfirmSecrets<T>(value: T, depth = 0): T {
  if (depth > 8 || value == null) return value;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((v) => stripConfirmSecrets(v, depth + 1)) as T;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/confirmToken|confirmSecret|confirm_secret|secretHash|password|accessToken/i.test(k)) {
        continue;
      }
      out[k] = stripConfirmSecrets(v, depth + 1);
    }
    return out as T;
  }
  return value;
}

/** Banlist of operations that must never be registered as write tools. */
export function isForbiddenWriteToolName(name: string): boolean {
  return /send|publish|run[_.,-]?ads|run[_.,-]?campaign|delete|permission|payment|billing|purge|force.?ok|skip.?confirm|auto.?confirm/i.test(
    name,
  );
}
