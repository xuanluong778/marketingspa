/**
 * Unit tests: work file policy, review column flow constants, comment/notify types.
 * Run: pnpm test:work-management-collab
 */
import assert from 'node:assert/strict';
import { classifyWorkUpload, sanitizeOriginalName } from '../apps/api/src/work-management/work-file-policy';
import {
  DEFAULT_WORK_COLUMNS,
  WORK_COLUMN_KEYS,
  WORK_NOTIFICATION_TYPES,
  WORK_REVIEW_TYPES,
  WORK_STATUS_ACTIONS,
} from '../apps/api/src/work-management/work-management.constants';
import {
  assertCanWriteTask,
  canManageAnyTask,
} from '../apps/api/src/work-management/work-management.scope';
import { SYSTEM_ROLES } from '../apps/api/src/common/constants/roles';

// --- Columns include review states ---
const keys = DEFAULT_WORK_COLUMNS.map((c) => c.key);
assert.ok(keys.includes(WORK_COLUMN_KEYS.IN_PROGRESS));
assert.ok(keys.includes(WORK_COLUMN_KEYS.PENDING_REVIEW));
assert.ok(keys.includes(WORK_COLUMN_KEYS.NEEDS_FIX));
assert.ok(keys.includes(WORK_COLUMN_KEYS.DONE));

// Review flow sequence
const FLOW = [
  WORK_COLUMN_KEYS.IN_PROGRESS,
  WORK_COLUMN_KEYS.PENDING_REVIEW,
  WORK_COLUMN_KEYS.DONE,
] as const;
assert.deepEqual(
  FLOW,
  ['IN_PROGRESS', 'PENDING_REVIEW', 'DONE'],
);
assert.equal(WORK_REVIEW_TYPES.SUBMIT, 'SUBMIT');
assert.equal(WORK_STATUS_ACTIONS.REQUEST_FIX, 'REQUEST_FIX');
assert.ok(WORK_NOTIFICATION_TYPES.MENTION);
assert.ok(WORK_NOTIFICATION_TYPES.FILE);
assert.ok(WORK_NOTIFICATION_TYPES.SUBMIT_REVIEW);

// --- Safe upload policy ---
assert.throws(() => classifyWorkUpload('evil.exe', 'application/octet-stream', 100), /không được phép/i);
const pathy = sanitizeOriginalName('../../x.png');
assert.ok(!pathy.includes('/'));
assert.ok(!pathy.includes('\\'));
assert.ok(pathy.includes('x.png'));
assert.throws(() => sanitizeOriginalName(''), /không hợp lệ/i);

const png = classifyWorkUpload('photo.PNG', 'image/png', 1024);
assert.equal(png.kind, 'image');
assert.equal(png.ext, '.png');

const pdf = classifyWorkUpload('spec.pdf', 'application/pdf', 5000);
assert.equal(pdf.kind, 'pdf');

const zip = classifyWorkUpload('pack.zip', 'application/zip', 1000);
assert.equal(zip.kind, 'zip');

assert.throws(
  () => classifyWorkUpload('big.png', 'image/png', 20 * 1024 * 1024),
  /dung lượng/i,
);

// --- Comment edit ACL: staff only own related tasks (reuses scope write) ---
assert.throws(
  () =>
    assertCanWriteTask(
      { role: SYSTEM_ROLES.TECHNICIAN, employeeId: 'e1' },
      { createdById: 'x', assignerId: 'y', assigneeIds: [], watcherIds: [] },
      { mode: 'ids', employeeIds: ['e1'] },
    ),
  /liên quan/,
);

assert.equal(canManageAnyTask(SYSTEM_ROLES.MANAGER), true);
assert.equal(canManageAnyTask(SYSTEM_ROLES.TECHNICIAN), false);

// Soft ACL helper simulation for comment author
function canEditComment(
  role: string,
  employeeId: string | undefined,
  authorId: string,
): boolean {
  if (authorId === employeeId) return true;
  return canManageAnyTask(role);
}
assert.equal(canEditComment(SYSTEM_ROLES.TECHNICIAN, 'e1', 'e1'), true);
assert.equal(canEditComment(SYSTEM_ROLES.TECHNICIAN, 'e1', 'e2'), false);
assert.equal(canEditComment(SYSTEM_ROLES.MANAGER, 'm1', 'e2'), true);

console.log('test-work-management-collab: ALL_PASS');
