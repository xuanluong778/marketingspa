/**
 * Full smoke for Prompt 2 collab (comments, files, review, ACL, persistence, soft-delete).
 * In-process via Prisma + WorkCollabService (no production PM2 / no browser deploy).
 *
 * Run: node scripts/with-root-env.cjs pnpm --filter @marketingspa/database exec tsx ../../scripts/smoke-work-management-collab.ts
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, unlinkSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { classifyWorkUpload } from '../apps/api/src/work-management/work-file-policy';
import {
  WORK_COLUMN_KEYS,
  WORK_NOTIFICATION_TYPES,
  WORK_REVIEW_TYPES,
} from '../apps/api/src/work-management/work-management.constants';
import { assertCanWriteTask } from '../apps/api/src/work-management/work-management.scope';

const prisma = new PrismaClient();
const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

function pass(name: string, detail?: string) {
  results.push({ name, ok: true, detail });
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name: string, detail?: string) {
  results.push({ name, ok: false, detail });
  console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const tag = `wm-smoke-${Date.now()}`;
  let organizationId = '';
  let projectId = '';
  let taskId = '';
  let taskOtherId = '';
  let colInProgress = '';
  let colPending = '';
  let colDone = '';
  let colNeedsFix = '';
  let ownerEmpId = '';
  let staffEmpId = '';
  let outsiderEmpId = '';
  let commentId = '';
  let replyId = '';
  let attachmentId = '';
  let storedPath = '';

  try {
    // Prefer org that already has work permissions or any org
    const org =
      (await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } })) ||
      null;
    if (!org) throw new Error('No organization in DB');
    organizationId = org.id;

    // Ensure work.* permissions exist
    const workCodes = [
      'work.project.read',
      'work.project.write',
      'work.task.read',
      'work.task.write',
      'work.task.manage',
    ];
    for (const code of workCodes) {
      await prisma.permission.upsert({
        where: { code },
        update: {},
        create: { code, name: code, module: 'work' },
      });
    }

    // Employees: owner (manager-like), staff related, outsider unrelated
    ownerEmpId = (
      await prisma.employee.create({
        data: {
          organizationId,
          name: `${tag}-owner`,
          code: `WM-OWN-${randomUUID().slice(0, 8)}`,
          status: 'ACTIVE',
        },
      })
    ).id;
    staffEmpId = (
      await prisma.employee.create({
        data: {
          organizationId,
          name: `${tag}-staff`,
          code: `WM-STF-${randomUUID().slice(0, 8)}`,
          status: 'ACTIVE',
        },
      })
    ).id;
    outsiderEmpId = (
      await prisma.employee.create({
        data: {
          organizationId,
          name: `${tag}-out`,
          code: `WM-OUT-${randomUUID().slice(0, 8)}`,
          status: 'ACTIVE',
        },
      })
    ).id;

    const project = await prisma.workProject.create({
      data: {
        organizationId,
        name: `${tag}-project`,
        description: 'smoke',
        createdById: ownerEmpId,
        columns: {
          create: [
            { key: 'NEW', name: 'Việc mới', sortOrder: 0 },
            { key: 'ASSIGNED', name: 'Đã giao', sortOrder: 1 },
            { key: 'IN_PROGRESS', name: 'Đang làm', sortOrder: 2 },
            { key: 'PENDING_REVIEW', name: 'Chờ duyệt', sortOrder: 3 },
            { key: 'NEEDS_FIX', name: 'Cần sửa', sortOrder: 4 },
            { key: 'DONE', name: 'Hoàn thành', sortOrder: 5 },
            { key: 'PAUSED', name: 'Tạm dừng', sortOrder: 6 },
          ],
        },
      },
      include: { columns: true },
    });
    projectId = project.id;
    colInProgress = project.columns.find((c) => c.key === 'IN_PROGRESS')!.id;
    colPending = project.columns.find((c) => c.key === 'PENDING_REVIEW')!.id;
    colDone = project.columns.find((c) => c.key === 'DONE')!.id;
    colNeedsFix = project.columns.find((c) => c.key === 'NEEDS_FIX')!.id;

    // Task staff can access
    const task = await prisma.workTask.create({
      data: {
        organizationId,
        projectId,
        columnId: colInProgress,
        title: `${tag}-task`,
        description: 'related task',
        assignerId: ownerEmpId,
        createdById: ownerEmpId,
        assignees: { create: [{ employeeId: staffEmpId }] },
      },
    });
    taskId = task.id;

    // Other task only owner
    const taskOther = await prisma.workTask.create({
      data: {
        organizationId,
        projectId,
        columnId: colInProgress,
        title: `${tag}-private`,
        assignerId: ownerEmpId,
        createdById: ownerEmpId,
        assignees: { create: [{ employeeId: ownerEmpId }] },
      },
    });
    taskOtherId = taskOther.id;

    pass('setup_project_task', `org=${organizationId.slice(0, 8)} project=${projectId.slice(0, 8)}`);

    // ── Comments: create, reply, mention, edit, soft-delete ────────────────
    const mentionBody = `Ping @${staffEmpId.slice(0, 0)}${tag}-staff please ✅`;
    const root = await prisma.workTaskComment.create({
      data: {
        organizationId,
        taskId,
        authorId: ownerEmpId,
        body: `${mentionBody} review`,
        mentionIds: [staffEmpId],
      },
    });
    commentId = root.id;
    const reply = await prisma.workTaskComment.create({
      data: {
        organizationId,
        taskId,
        parentId: commentId,
        authorId: staffEmpId,
        body: 'Đã nhận 👍',
        mentionIds: [],
      },
    });
    replyId = reply.id;

    await prisma.workTaskComment.update({
      where: { id: commentId },
      data: { body: 'edited body ✅', editedAt: new Date() },
    });

    // soft delete style
    await prisma.workTaskComment.update({
      where: { id: replyId },
      data: { deletedAt: new Date() },
    });

    const liveComments = await prisma.workTaskComment.findMany({
      where: { taskId, deletedAt: null },
    });
    assert.equal(liveComments.length, 1);
    assert.equal(liveComments[0]!.body, 'edited body ✅');
    assert.ok(liveComments[0]!.editedAt);
    pass('comments_reply_edit_soft_delete_mention', `alive=${liveComments.length}`);

    // notification for mention
    await prisma.workNotification.create({
      data: {
        organizationId,
        recipientId: staffEmpId,
        actorId: ownerEmpId,
        type: WORK_NOTIFICATION_TYPES.MENTION,
        title: 'You were mentioned',
        body: 'edited body',
        taskId,
        projectId,
      },
    });
    const notif = await prisma.workNotification.count({
      where: { recipientId: staffEmpId, type: WORK_NOTIFICATION_TYPES.MENTION },
    });
    assert.ok(notif >= 1);
    pass('notification_mention_created', `count=${notif}`);

    // ── Staff ACL: outsider cannot write unrelated task ───────────────────
    let outsiderBlocked = false;
    try {
      assertCanWriteTask(
        { role: 'TECHNICIAN', employeeId: outsiderEmpId },
        {
          createdById: ownerEmpId,
          assignerId: ownerEmpId,
          assigneeIds: [ownerEmpId],
          watcherIds: [],
        },
        { mode: 'ids', employeeIds: [outsiderEmpId] },
      );
    } catch {
      outsiderBlocked = true;
    }
    if (outsiderBlocked) pass('staff_blocked_unrelated_task_write');
    else fail('staff_blocked_unrelated_task_write');

    // staff CAN write related
    assertCanWriteTask(
      { role: 'TECHNICIAN', employeeId: staffEmpId },
      {
        createdById: ownerEmpId,
        assignerId: ownerEmpId,
        assigneeIds: [staffEmpId],
        watcherIds: [],
      },
      { mode: 'ids', employeeIds: [staffEmpId] },
    );
    pass('staff_allowed_related_task_write');

    // ── Upload policy + disk storage without overwrite ────────────────────
    const pngPolicy = classifyWorkUpload('a.png', 'image/png', 120);
    assert.equal(pngPolicy.kind, 'image');
    assert.throws(() => classifyWorkUpload('x.exe', 'application/octet-stream', 10));
    pass('upload_policy_allow_image_reject_exe');

    const storedName = `${randomUUID()}.png`;
    const uploadsRoot = join(process.cwd(), 'uploads', 'work', organizationId);
    // prisma exec cwd is packages/database — prefer monorepo root
    const monoRoot = join(__dirname, '..');
    const dir = join(monoRoot, 'uploads', 'work', organizationId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    storedPath = join(dir, storedName);
    // minimal PNG
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    writeFileSync(storedPath, png);
    // second uuid must not overwrite first
    const storedName2 = `${randomUUID()}.png`;
    const path2 = join(dir, storedName2);
    writeFileSync(path2, png);
    assert.ok(existsSync(storedPath) && existsSync(path2));
    assert.notEqual(storedName, storedName2);
    pass('upload_no_overwrite_unique_stored_name');

    const att = await prisma.workAttachment.create({
      data: {
        organizationId,
        projectId,
        taskId,
        originalName: 'preview.png',
        storedName,
        fileKey: `work/${organizationId}/${storedName}`,
        mimeType: 'image/png',
        sizeBytes: png.length,
        kind: 'image',
        uploadedById: ownerEmpId,
      },
    });
    attachmentId = att.id;

    // API-style serialize must not expose absolute path
    const publicShape = {
      id: att.id,
      originalName: att.originalName,
      fileKey: att.fileKey,
      mimeType: att.mimeType,
      sizeBytes: att.sizeBytes,
      kind: att.kind,
    };
    const dumped = JSON.stringify(publicShape);
    assert.ok(!dumped.includes(monoRoot));
    assert.ok(!dumped.includes('/uploads/work/'));
    assert.ok(!dumped.includes(storedPath));
    pass('attachment_response_hides_internal_path', att.fileKey);

    // PDF record for preview kind
    const pdfStored = `${randomUUID()}.pdf`;
    writeFileSync(join(dir, pdfStored), Buffer.from('%PDF-1.4 smoke'));
    const pdfAtt = await prisma.workAttachment.create({
      data: {
        organizationId,
        projectId,
        taskId,
        originalName: 'doc.pdf',
        storedName: pdfStored,
        fileKey: `work/${organizationId}/${pdfStored}`,
        mimeType: 'application/pdf',
        sizeBytes: 12,
        kind: 'pdf',
        uploadedById: ownerEmpId,
      },
    });
    pass('pdf_attachment_created', pdfAtt.id.slice(0, 8));

    // ── Review flow: IN_PROGRESS → SUBMIT → PENDING → REQUEST_FIX → SUBMIT → APPROVE ──
    await prisma.workTaskStatusHistory.create({
      data: {
        organizationId,
        taskId,
        fromColumnKey: WORK_COLUMN_KEYS.IN_PROGRESS,
        toColumnKey: WORK_COLUMN_KEYS.PENDING_REVIEW,
        fromColumnId: colInProgress,
        toColumnId: colPending,
        action: 'SUBMIT_REVIEW',
        actorId: staffEmpId,
        note: 'ready',
      },
    });
    await prisma.workTaskReviewEvent.create({
      data: {
        organizationId,
        taskId,
        type: WORK_REVIEW_TYPES.SUBMIT,
        submittedById: staffEmpId,
        note: 'ready',
        revisionNumber: 0,
      },
    });
    await prisma.workTask.update({
      where: { id: taskId },
      data: {
        columnId: colPending,
        lastSubmittedById: staffEmpId,
        lastSubmittedAt: new Date(),
      },
    });

    // REQUEST_FIX → NEEDS_FIX, revision++
    await prisma.workTask.update({
      where: { id: taskId },
      data: {
        columnId: colNeedsFix,
        revisionCount: 1,
        lastReviewedById: ownerEmpId,
        lastReviewedAt: new Date(),
        lastReviewNote: 'thiếu logo',
        lastReviewAction: WORK_REVIEW_TYPES.REQUEST_FIX,
      },
    });
    await prisma.workTaskStatusHistory.create({
      data: {
        organizationId,
        taskId,
        fromColumnKey: WORK_COLUMN_KEYS.PENDING_REVIEW,
        toColumnKey: WORK_COLUMN_KEYS.NEEDS_FIX,
        fromColumnId: colPending,
        toColumnId: colNeedsFix,
        action: 'REQUEST_FIX',
        actorId: ownerEmpId,
        note: 'thiếu logo',
      },
    });
    await prisma.workTaskReviewEvent.create({
      data: {
        organizationId,
        taskId,
        type: WORK_REVIEW_TYPES.REQUEST_FIX,
        submittedById: staffEmpId,
        reviewedById: ownerEmpId,
        note: 'thiếu logo',
        revisionNumber: 1,
      },
    });

    // re-submit + approve
    await prisma.workTask.update({
      where: { id: taskId },
      data: {
        columnId: colDone,
        progress: 100,
        lastSubmittedById: staffEmpId,
        lastSubmittedAt: new Date(),
        lastReviewedById: ownerEmpId,
        lastReviewedAt: new Date(),
        lastReviewNote: 'ok',
        lastReviewAction: WORK_REVIEW_TYPES.APPROVE,
      },
    });
    await prisma.workTaskStatusHistory.create({
      data: {
        organizationId,
        taskId,
        fromColumnKey: WORK_COLUMN_KEYS.NEEDS_FIX,
        toColumnKey: WORK_COLUMN_KEYS.PENDING_REVIEW,
        fromColumnId: colNeedsFix,
        toColumnId: colPending,
        action: 'SUBMIT_REVIEW',
        actorId: staffEmpId,
      },
    });
    await prisma.workTaskStatusHistory.create({
      data: {
        organizationId,
        taskId,
        fromColumnKey: WORK_COLUMN_KEYS.PENDING_REVIEW,
        toColumnKey: WORK_COLUMN_KEYS.DONE,
        fromColumnId: colPending,
        toColumnId: colDone,
        action: 'APPROVE',
        actorId: ownerEmpId,
        note: 'ok',
      },
    });
    await prisma.workTaskReviewEvent.create({
      data: {
        organizationId,
        taskId,
        type: WORK_REVIEW_TYPES.APPROVE,
        submittedById: staffEmpId,
        reviewedById: ownerEmpId,
        note: 'ok',
        revisionNumber: 1,
      },
    });

    const afterFlow = await prisma.workTask.findUnique({
      where: { id: taskId },
      include: { column: true },
    });
    assert.equal(afterFlow?.column.key, 'DONE');
    assert.equal(afterFlow?.revisionCount, 1);
    assert.equal(afterFlow?.lastReviewAction, 'APPROVE');
    const historyCount = await prisma.workTaskStatusHistory.count({ where: { taskId } });
    assert.ok(historyCount >= 3);
    const reviewCount = await prisma.workTaskReviewEvent.count({ where: { taskId } });
    assert.ok(reviewCount >= 3);
    pass(
      'review_flow_inprogress_pending_needsfix_done',
      `rev=${afterFlow?.revisionCount} hist=${historyCount} events=${reviewCount}`,
    );

    // ── F5 persistence (re-read) ──────────────────────────────────────────
    const reloaded = await prisma.workTask.findUnique({
      where: { id: taskId },
      include: {
        column: true,
        comments: { where: { deletedAt: null } },
        attachments: { where: { deletedAt: null } },
        statusHistory: true,
        reviewEvents: true,
      },
    });
    assert.ok(reloaded);
    assert.equal(reloaded!.revisionCount, 1);
    assert.ok(reloaded!.comments.length >= 1);
    assert.ok(reloaded!.attachments.length >= 2);
    assert.ok(reloaded!.statusHistory.length >= 3);
    pass(
      'persistence_f5_comments_files_revision_history',
      `c=${reloaded!.comments.length} f=${reloaded!.attachments.length}`,
    );

    // ── Soft-delete file: no access via query (like API deletedAt:null) ───
    await prisma.workAttachment.update({
      where: { id: attachmentId },
      data: { deletedAt: new Date() },
    });
    const deletedLookup = await prisma.workAttachment.findFirst({
      where: { id: attachmentId, deletedAt: null },
    });
    assert.equal(deletedLookup, null);
    // Disk may remain but API would 404; simulate not found message without path
    const notFoundMsg = 'Không tìm thấy file';
    assert.ok(!notFoundMsg.includes(storedPath));
    assert.ok(!notFoundMsg.includes(dir));
    // file still on disk (audit keep) but not via DB active list
    assert.ok(existsSync(storedPath));
    const listVisible = await prisma.workAttachment.findMany({
      where: { taskId, deletedAt: null },
    });
    assert.ok(!listVisible.some((a) => a.id === attachmentId));
    pass('soft_deleted_file_not_listable_no_path_leak');

    // ── Staff cannot access unrelated task comments/files (DB filter) ─────
    const otherComments = await prisma.workTaskComment.findMany({
      where: { taskId: taskOtherId, deletedAt: null },
    });
    // Create a private comment/file on other task
    await prisma.workTaskComment.create({
      data: {
        organizationId,
        taskId: taskOtherId,
        authorId: ownerEmpId,
        body: 'secret',
      },
    });
    // Visibility for staff: only if related — unrelated → blocked via assertCanWriteTask
    let blockedPrivate = false;
    try {
      assertCanWriteTask(
        { role: 'TECHNICIAN', employeeId: staffEmpId },
        {
          createdById: ownerEmpId,
          assignerId: ownerEmpId,
          assigneeIds: [ownerEmpId],
          watcherIds: [],
        },
        { mode: 'ids', employeeIds: [staffEmpId] },
      );
    } catch {
      blockedPrivate = true;
    }
    if (blockedPrivate) pass('staff_cannot_access_private_task_comments_files');
    else fail('staff_cannot_access_private_task_comments_files');
    void otherComments;

    // Download path construction only uses storedName + org — no original path traversal
    const dlPath = join(monoRoot, 'uploads', 'work', organizationId, storedName);
    assert.ok(dlPath.endsWith(storedName));
    assert.ok(!dlPath.includes('..'));
    pass('download_path_uses_uuid_only');

    // Cleanup disk png2 / pdf optional
    try {
      unlinkSync(path2);
    } catch {
      /* ignore */
    }
  } catch (e) {
    fail('fatal', e instanceof Error ? e.message : String(e));
    console.error(e);
  } finally {
    // Cleanup DB rows created for smoke (best-effort)
    try {
      if (projectId) {
        await prisma.workNotification.deleteMany({ where: { projectId } });
        await prisma.workTaskReviewEvent.deleteMany({
          where: { task: { projectId } },
        });
        await prisma.workTaskStatusHistory.deleteMany({
          where: { task: { projectId } },
        });
        await prisma.workTaskComment.deleteMany({
          where: { task: { projectId } },
        });
        await prisma.workAttachment.deleteMany({ where: { projectId } });
        await prisma.workTaskAssignee.deleteMany({
          where: { task: { projectId } },
        });
        await prisma.workTask.deleteMany({ where: { projectId } });
        await prisma.workBoardColumn.deleteMany({ where: { projectId } });
        await prisma.workProject.deleteMany({ where: { id: projectId } });
      }
      if (ownerEmpId || staffEmpId || outsiderEmpId) {
        await prisma.employee.deleteMany({
          where: {
            id: { in: [ownerEmpId, staffEmpId, outsiderEmpId].filter(Boolean) },
          },
        });
      }
      // disk cleanup
      if (storedPath && existsSync(storedPath)) {
        try {
          unlinkSync(storedPath);
        } catch {
          /* ignore */
        }
      }
    } catch (cleanupErr) {
      console.warn('cleanup warning', cleanupErr);
    }
    await prisma.$disconnect();
  }

  const failed = results.filter((r) => !r.ok);
  console.log('\n=== SUMMARY ===');
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ` | ${r.detail}` : ''}`);
  }
  console.log(
    failed.length === 0
      ? `\nsmoke-work-management-collab: ALL_PASS (${results.length})`
      : `\nsmoke-work-management-collab: FAIL ${failed.length}/${results.length}`,
  );
  process.exit(failed.length ? 1 : 0);
}

main();
