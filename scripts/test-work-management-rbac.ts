/**
 * Unit tests: work management RBAC scope + default columns.
 * Run: pnpm --filter @marketingspa/database exec tsx ../../scripts/test-work-management-rbac.ts
 */
import assert from 'node:assert/strict';
import {
  isWorkOrgWideRole,
  canManageAnyTask,
  workTaskVisibilityWhere,
  assertCanWriteTask,
} from '../apps/api/src/work-management/work-management.scope';
import { DEFAULT_WORK_COLUMNS, WORK_PERMISSIONS } from '../apps/api/src/work-management/work-management.constants';
import { defaultPermissionCodesForRole, SYSTEM_ROLES } from '../apps/api/src/common/constants/roles';

// --- Default columns ---
assert.equal(DEFAULT_WORK_COLUMNS.length, 7);
assert.deepEqual(
  DEFAULT_WORK_COLUMNS.map((c) => c.name),
  ['Việc mới', 'Đã giao', 'Đang làm', 'Chờ duyệt', 'Cần sửa', 'Hoàn thành', 'Tạm dừng'],
);

// --- Org-wide roles ---
assert.equal(isWorkOrgWideRole(SYSTEM_ROLES.OWNER), true);
assert.equal(isWorkOrgWideRole(SYSTEM_ROLES.HR), true);
assert.equal(isWorkOrgWideRole('SUPER_ADMIN'), true);
assert.equal(isWorkOrgWideRole(SYSTEM_ROLES.MANAGER), false);
assert.equal(isWorkOrgWideRole(SYSTEM_ROLES.TECHNICIAN), false);

assert.equal(canManageAnyTask(SYSTEM_ROLES.MANAGER), true);
assert.equal(canManageAnyTask(SYSTEM_ROLES.TECHNICIAN), false);

// --- Visibility ---
const allVis = workTaskVisibilityWhere({ mode: 'all' }, { role: 'OWNER', employeeId: 'e1' });
assert.deepEqual(allVis, {});

const staffVis = workTaskVisibilityWhere(
  { mode: 'ids', employeeIds: ['e1'] },
  { role: 'TECHNICIAN', employeeId: 'e1' },
);
assert.ok(staffVis.OR);
assert.ok(
  JSON.stringify(staffVis).includes('e1'),
  'staff visibility must reference self employeeId',
);

// --- Write assert: staff only related ---
assert.throws(
  () =>
    assertCanWriteTask(
      { role: SYSTEM_ROLES.TECHNICIAN, employeeId: 'e1' },
      {
        createdById: 'e2',
        assignerId: 'e3',
        assigneeIds: ['e4'],
        watcherIds: [],
      },
      { mode: 'ids', employeeIds: ['e1'] },
    ),
  /liên quan/,
);

assert.doesNotThrow(() =>
  assertCanWriteTask(
    { role: SYSTEM_ROLES.TECHNICIAN, employeeId: 'e1' },
    {
      createdById: 'e2',
      assignerId: null,
      assigneeIds: ['e1'],
      watcherIds: [],
    },
    { mode: 'ids', employeeIds: ['e1'] },
  ),
);

assert.doesNotThrow(() =>
  assertCanWriteTask(
    { role: SYSTEM_ROLES.HR, employeeId: 'e9' },
    {
      createdById: 'e2',
      assignerId: null,
      assigneeIds: [],
      watcherIds: [],
    },
    { mode: 'all' },
  ),
);

// Manager outside team
assert.throws(
  () =>
    assertCanWriteTask(
      { role: SYSTEM_ROLES.MANAGER, employeeId: 'm1' },
      {
        createdById: 'out1',
        assignerId: null,
        assigneeIds: ['out2'],
        watcherIds: [],
      },
      { mode: 'ids', employeeIds: ['m1', 'm2'] },
    ),
  /phạm vi/,
);

// Manager in team
assert.doesNotThrow(() =>
  assertCanWriteTask(
    { role: SYSTEM_ROLES.MANAGER, employeeId: 'm1' },
    {
      createdById: 'm2',
      assignerId: null,
      assigneeIds: [],
      watcherIds: [],
    },
    { mode: 'ids', employeeIds: ['m1', 'm2'] },
  ),
);

// --- Role permission seeds ---
const owner = defaultPermissionCodesForRole(SYSTEM_ROLES.OWNER);
assert.ok(owner.includes(WORK_PERMISSIONS.TASK_MANAGE));
assert.ok(owner.includes(WORK_PERMISSIONS.PROJECT_WRITE));

const hr = defaultPermissionCodesForRole(SYSTEM_ROLES.HR);
assert.ok(hr.includes(WORK_PERMISSIONS.TASK_MANAGE));
assert.ok(hr.includes(WORK_PERMISSIONS.PROJECT_READ));

const manager = defaultPermissionCodesForRole(SYSTEM_ROLES.MANAGER);
assert.ok(manager.includes(WORK_PERMISSIONS.TASK_WRITE));
assert.ok(manager.includes(WORK_PERMISSIONS.TASK_MANAGE));

const staff = defaultPermissionCodesForRole(SYSTEM_ROLES.TECHNICIAN);
assert.ok(staff.includes(WORK_PERMISSIONS.TASK_READ));
assert.ok(staff.includes(WORK_PERMISSIONS.TASK_WRITE));
assert.ok(!staff.includes(WORK_PERMISSIONS.TASK_MANAGE));

console.log('test-work-management-rbac: ALL_PASS');
