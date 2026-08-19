import type { AssistantToolContext } from '@marketingspa/shared';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';

/** Map ToolContext → AuthUser for domain services that take user. Never trust client org. */
export function authUserFromToolContext(ctx: AssistantToolContext): AuthUser {
  return {
    id: ctx.userId,
    email: '',
    name: '',
    role: ctx.role,
    organizationId: ctx.organizationId,
    employeeId: ctx.employeeId ?? null,
    permissions: ctx.permissions ?? [],
  };
}
