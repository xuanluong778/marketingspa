import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { SYSTEM_ROLES } from '../common/constants/roles';

export type HrmAccessScope =
  | { mode: 'all' }
  | { mode: 'ids'; employeeIds: string[] };

/** @deprecated alias — dùng HrmAccessScope */
export type AttendanceScope = HrmAccessScope;

/** OWNER / HR xem toàn org; MANAGER xem cây cấp dưới; còn lại chỉ bản thân. */
export function isHrmOrgWideRole(role: string): boolean {
  return role === SYSTEM_ROLES.OWNER || role === SYSTEM_ROLES.HR;
}

/** @deprecated */
export function isAttendanceOrgWideRole(role: string): boolean {
  return isHrmOrgWideRole(role);
}

export function canCorrectAttendanceDay(role: string): boolean {
  return role === SYSTEM_ROLES.OWNER || role === SYSTEM_ROLES.HR;
}

export function canApproveLeaveOt(role: string): boolean {
  return (
    role === SYSTEM_ROLES.OWNER ||
    role === SYSTEM_ROLES.HR ||
    role === SYSTEM_ROLES.MANAGER
  );
}

export async function resolveHrmAccessScope(
  prisma: PrismaService,
  organizationId: string,
  user: Pick<AuthUser, 'role' | 'employeeId'>,
): Promise<HrmAccessScope> {
  if (isHrmOrgWideRole(user.role)) {
    return { mode: 'all' };
  }

  if (user.role === SYSTEM_ROLES.MANAGER) {
    if (!user.employeeId) {
      return { mode: 'ids', employeeIds: [] };
    }
    const ids = await collectReportEmployeeIds(prisma, organizationId, user.employeeId);
    return { mode: 'ids', employeeIds: ids };
  }

  if (!user.employeeId) {
    return { mode: 'ids', employeeIds: [] };
  }
  return { mode: 'ids', employeeIds: [user.employeeId] };
}

/** @deprecated */
export async function resolveAttendanceScope(
  prisma: PrismaService,
  organizationId: string,
  user: Pick<AuthUser, 'role' | 'employeeId'>,
): Promise<HrmAccessScope> {
  return resolveHrmAccessScope(prisma, organizationId, user);
}

async function collectReportEmployeeIds(
  prisma: PrismaService,
  organizationId: string,
  managerEmployeeId: string,
): Promise<string[]> {
  const result = new Set<string>([managerEmployeeId]);
  let frontier = [managerEmployeeId];

  while (frontier.length) {
    const reports = await prisma.employee.findMany({
      where: {
        organizationId,
        managerId: { in: frontier },
        isActive: true,
      },
      select: { id: true },
    });
    const next: string[] = [];
    for (const r of reports) {
      if (!result.has(r.id)) {
        result.add(r.id);
        next.push(r.id);
      }
    }
    frontier = next;
  }

  return [...result];
}

export function assertEmployeeInScope(
  scope: HrmAccessScope,
  employeeId: string,
  verb = 'truy cập',
): void {
  if (scope.mode === 'all') return;
  if (!scope.employeeIds.includes(employeeId)) {
    throw new ForbiddenException(`Không có quyền ${verb} nhân viên này`);
  }
}

/** Nhân viên thường chỉ được punch chính mình; HR/Owner/Manager (trong scope) được punch hộ. */
export function assertCanPunchForEmployee(
  user: Pick<AuthUser, 'role' | 'employeeId'>,
  targetEmployeeId: string,
  scope: HrmAccessScope,
): void {
  assertEmployeeInScope(scope, targetEmployeeId, 'xem/chấm công');

  if (isHrmOrgWideRole(user.role) || user.role === SYSTEM_ROLES.MANAGER) {
    return;
  }

  if (user.employeeId !== targetEmployeeId) {
    throw new ForbiddenException('Bạn chỉ được chấm công cho chính mình');
  }
}

/** Tạo đơn phép/OT: staff chỉ cho mình; Manager/HR/Owner trong scope. */
export function assertCanCreateLeaveOt(
  user: Pick<AuthUser, 'role' | 'employeeId'>,
  targetEmployeeId: string,
  scope: HrmAccessScope,
): void {
  assertEmployeeInScope(scope, targetEmployeeId, 'tạo đơn cho');

  if (isHrmOrgWideRole(user.role) || user.role === SYSTEM_ROLES.MANAGER) {
    return;
  }

  if (user.employeeId !== targetEmployeeId) {
    throw new ForbiddenException('Bạn chỉ được tạo đơn cho chính mình');
  }
}

/** Duyệt: Owner/HR/Manager và đơn thuộc scope (Manager không tự duyệt chính mình). */
export function assertCanApproveLeaveOt(
  user: Pick<AuthUser, 'role' | 'employeeId'>,
  targetEmployeeId: string,
  scope: HrmAccessScope,
): void {
  if (!canApproveLeaveOt(user.role)) {
    throw new ForbiddenException('Không có quyền duyệt phép/OT');
  }
  assertEmployeeInScope(scope, targetEmployeeId, 'duyệt đơn của');

  if (user.role === SYSTEM_ROLES.MANAGER && user.employeeId === targetEmployeeId) {
    throw new ForbiddenException('Quản lý không tự duyệt đơn của chính mình');
  }
}
