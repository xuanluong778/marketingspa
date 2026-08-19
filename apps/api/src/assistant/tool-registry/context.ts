import { randomUUID } from 'crypto';
import {
  ASSISTANT_DEFAULT_TIMEZONE,
  ASSISTANT_PERMISSIONS,
  assistantToolContextSchema,
  type AssistantToolContext,
} from '@marketingspa/shared';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';

const IANA_TZ = /^[A-Za-z0-9_+/-]{1,64}$/;

/**
 * Build ToolContext only from JWT AuthUser (+ safe timezone header).
 * Never reads organizationId / userId from client body or LLM args.
 */
export function buildAssistantToolContext(
  user: AuthUser,
  opts: {
    timezoneHeader?: string | null;
    requestId?: string;
    orgTimezone?: string | null;
  } = {},
): AssistantToolContext {
  const tzCandidate =
    (opts.orgTimezone && IANA_TZ.test(opts.orgTimezone) ? opts.orgTimezone : null) ||
    (opts.timezoneHeader && IANA_TZ.test(opts.timezoneHeader.trim())
      ? opts.timezoneHeader.trim()
      : null) ||
    ASSISTANT_DEFAULT_TIMEZONE;

  const canReveal = (user.permissions ?? []).includes(ASSISTANT_PERMISSIONS.PII_REVEAL);
  // Mặc định mask; OWNER không auto-reveal (chỉ bypass check permission code khi có request reveal ở phase sau).

  return assistantToolContextSchema.parse({
    userId: user.id,
    organizationId: user.organizationId,
    timezone: tzCandidate,
    role: user.role,
    permissions: user.permissions ?? [],
    employeeId: user.employeeId ?? null,
    locale: 'vi',
    requestId: opts.requestId ?? randomUUID(),
    piiReveal: {
      phone: Boolean(canReveal),
      email: Boolean(canReveal),
    },
  });
}

/** Assert tool handlers cannot see a foreign org even if LLM fabricates one. */
export function assertCtxMatchesAuth(ctx: AssistantToolContext, user: AuthUser): void {
  if (ctx.organizationId !== user.organizationId) {
    throw new Error('assistant_tenant_mismatch');
  }
  if (ctx.userId !== user.id) {
    throw new Error('assistant_user_mismatch');
  }
}
