import { ForbiddenException } from '@nestjs/common';
import { SYSTEM_ROLES } from '../common/constants/roles';
import type { AuthUser } from '../common/interfaces/auth-user.interface';

/**
 * SERVER_ENV Fanpage publish (META_PAGE_ID + META_PAGE_ACCESS_TOKEN)
 * chỉ dành cho SUPER_ADMIN hoặc org trong allowlist.
 * Env: META_FANPAGE_ALLOWED_ORG_IDS (comma-separated organization UUIDs)
 * Alias: META_PAGE_ALLOWED_ORG_IDS
 */
export function parseMetaFanpageAllowedOrgIds(
  getEnv: (key: string) => string | undefined,
): string[] {
  const raw =
    getEnv('META_FANPAGE_ALLOWED_ORG_IDS')?.trim() ||
    getEnv('META_PAGE_ALLOWED_ORG_IDS')?.trim() ||
    '';
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function assertCanUseServerEnvFanpage(
  user: AuthUser,
  getEnv: (key: string) => string | undefined,
): void {
  if (user.role === 'SUPER_ADMIN') return;

  const allowlist = parseMetaFanpageAllowedOrgIds(getEnv);
  if (user.organizationId && allowlist.includes(user.organizationId)) return;

  throw new ForbiddenException(
    'Tính năng này chỉ dành cho quản trị viên hệ thống.',
  );
}

export function canUseServerEnvFanpage(
  user: Pick<AuthUser, 'role' | 'organizationId'>,
  allowedOrgIds: string[],
): boolean {
  if (user.role === 'SUPER_ADMIN') return true;
  return Boolean(user.organizationId && allowedOrgIds.includes(user.organizationId));
}
