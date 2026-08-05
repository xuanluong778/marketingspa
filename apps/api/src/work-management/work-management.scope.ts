import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { SYSTEM_ROLES } from '../common/constants/roles';
import {
  isHrmOrgWideRole,
  resolveHrmAccessScope,
  type HrmAccessScope,
} from '../hrm/hrm-attendance-scope';

/**
 * Super Admin / OWNER / HR → org-wide.
 * MANAGER (Trưởng phòng) → self + reports tree.
 * Nhân viên khác → related tasks only (self employeeId).
 */
export function isWorkOrgWideRole(role: string): boolean {
  return isHrmOrgWideRole(role) || role === 'SUPER_ADMIN';
}

export function canManageAnyTask(role: string): boolean {
  return isWorkOrgWideRole(role) || role === SYSTEM_ROLES.MANAGER;
}

export async function resolveWorkScope(
  prisma: PrismaService,
  organizationId: string,
  user: Pick<AuthUser, 'role' | 'employeeId'>,
): Promise<HrmAccessScope> {
  if (isWorkOrgWideRole(user.role)) {
    return { mode: 'all' };
  }
  return resolveHrmAccessScope(prisma, organizationId, user);
}

/** Prisma where: task visible to user under scope. */
export function workTaskVisibilityWhere(
  scope: HrmAccessScope,
  user: Pick<AuthUser, 'employeeId' | 'role'>,
): Prisma.WorkTaskWhereInput {
  if (scope.mode === 'all') {
    return {};
  }

  const ids = scope.employeeIds;
  if (!ids.length) {
    // No employee link → only empty (staff with no employeeId sees nothing unless they create as null)
    return {
      OR: [
        ...(user.employeeId
          ? [
              { createdById: user.employeeId },
              { assignerId: user.employeeId },
              { assignees: { some: { employeeId: user.employeeId } } },
              { watchers: { some: { employeeId: user.employeeId } } },
            ]
          : [{ id: '__none__' }]),
      ],
    };
  }

  // Manager/staff: related if any linked person is in scope
  return {
    OR: [
      { createdById: { in: ids } },
      { assignerId: { in: ids } },
      { assignees: { some: { employeeId: { in: ids } } } },
      { watchers: { some: { employeeId: { in: ids } } } },
    ],
  };
}

export function assertCanWriteTask(
  user: Pick<AuthUser, 'role' | 'employeeId'>,
  task: {
    createdById?: string | null;
    assignerId?: string | null;
    assigneeIds: string[];
    watcherIds: string[];
  },
  scope: HrmAccessScope,
): void {
  if (canManageAnyTask(user.role)) {
    if (scope.mode === 'all') return;
    // Manager: task must touch someone in management scope (incl. self)
    const related = [
      task.createdById,
      task.assignerId,
      ...task.assigneeIds,
      ...task.watcherIds,
    ].filter(Boolean) as string[];
    if (related.some((id) => scope.employeeIds.includes(id))) return;
    throw new ForbiddenException('Không có quyền sửa công việc ngoài phạm vi quản lý');
  }

  // Staff: must be related personally
  const me = user.employeeId;
  if (!me) throw new ForbiddenException('Tài khoản chưa gắn nhân viên');
  if (
    task.createdById === me ||
    task.assignerId === me ||
    task.assigneeIds.includes(me) ||
    task.watcherIds.includes(me)
  ) {
    return;
  }
  throw new ForbiddenException('Bạn chỉ được sửa công việc liên quan đến mình');
}
