import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { assertCanWriteTask, canManageAnyTask, resolveWorkScope } from './work-management.scope';
import {
  WORK_COLUMN_KEYS,
  WORK_NOTIFICATION_TYPES,
  WORK_REVIEW_TYPES,
  WORK_STATUS_ACTIONS,
} from './work-management.constants';
import { classifyWorkUpload, WORK_UPLOAD_MAX_BYTES } from './work-file-policy';
import { withSignedUploadUrl } from '../common/uploads/upload-signed-url';
import type {
  CreateWorkCommentDto,
  ReviewDecisionDto,
  SubmitReviewDto,
  UpdateWorkCommentDto,
} from './dto/work-management.dto';

type UploadedFile = {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
};

@Injectable()
export class WorkCollabService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Notifications ────────────────────────────────────────────────────────

  async notify(
    organizationId: string,
    recipientIds: string[],
    input: {
      type: string;
      title: string;
      body?: string;
      actorId?: string | null;
      taskId?: string | null;
      projectId?: string | null;
    },
  ) {
    const unique = [...new Set(recipientIds.filter(Boolean))];
    const me = input.actorId;
    const targets = unique.filter((id) => id !== me);
    if (!targets.length) return { created: 0 };
    await this.prisma.workNotification.createMany({
      data: targets.map((recipientId) => ({
        organizationId,
        recipientId,
        actorId: me || null,
        type: input.type,
        title: input.title,
        body: input.body || null,
        taskId: input.taskId || null,
        projectId: input.projectId || null,
      })),
    });
    return { created: targets.length };
  }

  async listNotifications(organizationId: string, user: AuthUser, unreadOnly = false) {
    if (!user.employeeId) return [];
    return this.prisma.workNotification.findMany({
      where: {
        organizationId,
        recipientId: user.employeeId,
        ...(unreadOnly ? { isRead: false } : {}),
      },
      include: {
        actor: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async markNotificationRead(organizationId: string, user: AuthUser, id: string) {
    if (!user.employeeId) throw new ForbiddenException('Tài khoản chưa gắn nhân viên');
    const n = await this.prisma.workNotification.findFirst({
      where: { id, organizationId, recipientId: user.employeeId },
    });
    if (!n) throw new NotFoundException('Không tìm thấy thông báo');
    return this.prisma.workNotification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllNotificationsRead(organizationId: string, user: AuthUser) {
    if (!user.employeeId) return { ok: true };
    await this.prisma.workNotification.updateMany({
      where: { organizationId, recipientId: user.employeeId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { ok: true };
  }

  // ── Comments ─────────────────────────────────────────────────────────────

  async listComments(organizationId: string, user: AuthUser, taskId: string) {
    const task = await this.requireVisibleTask(organizationId, user, taskId);
    const rows = await this.prisma.workTaskComment.findMany({
      where: { organizationId, taskId: task.id, deletedAt: null, parentId: null },
      include: {
        author: { select: { id: true, name: true } },
        replies: {
          where: { deletedAt: null },
          include: { author: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((c) => this.serializeComment(c));
  }

  async createComment(
    organizationId: string,
    user: AuthUser,
    taskId: string,
    dto: CreateWorkCommentDto,
  ) {
    if (!user.employeeId) throw new ForbiddenException('Tài khoản chưa gắn nhân viên');
    const task = await this.requireWriteTask(organizationId, user, taskId);
    if (dto.parentId) {
      const parent = await this.prisma.workTaskComment.findFirst({
        where: {
          id: dto.parentId,
          taskId,
          organizationId,
          deletedAt: null,
          parentId: null,
        },
      });
      if (!parent) throw new BadRequestException('Bình luận gốc không hợp lệ');
    }

    const mentionIds = await this.resolveMentions(organizationId, dto.body, dto.mentionIds ?? []);

    const comment = await this.prisma.workTaskComment.create({
      data: {
        organizationId,
        taskId,
        parentId: dto.parentId || null,
        authorId: user.employeeId,
        body: dto.body.trim(),
        mentionIds,
      },
      include: {
        author: { select: { id: true, name: true } },
        replies: {
          where: { deletedAt: null },
          include: { author: { select: { id: true, name: true } } },
        },
      },
    });

    const stakeholders = await this.taskStakeholderIds(task.id);
    await this.notify(organizationId, stakeholders, {
      type: WORK_NOTIFICATION_TYPES.COMMENT,
      title: `Bình luận mới: ${task.title}`,
      body: dto.body.trim().slice(0, 200),
      actorId: user.employeeId,
      taskId: task.id,
      projectId: task.projectId,
    });
    if (mentionIds.length) {
      await this.notify(organizationId, mentionIds, {
        type: WORK_NOTIFICATION_TYPES.MENTION,
        title: `Bạn được nhắc tên trong: ${task.title}`,
        body: dto.body.trim().slice(0, 200),
        actorId: user.employeeId,
        taskId: task.id,
        projectId: task.projectId,
      });
    }

    return this.serializeComment(comment);
  }

  async updateComment(
    organizationId: string,
    user: AuthUser,
    commentId: string,
    dto: UpdateWorkCommentDto,
  ) {
    const comment = await this.prisma.workTaskComment.findFirst({
      where: { id: commentId, organizationId, deletedAt: null },
      include: { task: true },
    });
    if (!comment) throw new NotFoundException('Không tìm thấy bình luận');
    await this.requireWriteTask(organizationId, user, comment.taskId);
    const isAuthor = comment.authorId === user.employeeId;
    if (!isAuthor && !canManageAnyTask(user.role)) {
      throw new ForbiddenException('Chỉ được sửa bình luận của mình');
    }
    const mentionIds = await this.resolveMentions(
      organizationId,
      dto.body,
      dto.mentionIds ?? comment.mentionIds,
    );
    const updated = await this.prisma.workTaskComment.update({
      where: { id: commentId },
      data: {
        body: dto.body.trim(),
        mentionIds,
        editedAt: new Date(),
      },
      include: {
        author: { select: { id: true, name: true } },
        replies: {
          where: { deletedAt: null },
          include: { author: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (mentionIds.length) {
      await this.notify(organizationId, mentionIds, {
        type: WORK_NOTIFICATION_TYPES.MENTION,
        title: `Bạn được nhắc tên trong: ${comment.task.title}`,
        body: dto.body.trim().slice(0, 200),
        actorId: user.employeeId,
        taskId: comment.taskId,
        projectId: comment.task.projectId,
      });
    }
    return this.serializeComment(updated);
  }

  async deleteComment(organizationId: string, user: AuthUser, commentId: string) {
    const comment = await this.prisma.workTaskComment.findFirst({
      where: { id: commentId, organizationId, deletedAt: null },
    });
    if (!comment) throw new NotFoundException('Không tìm thấy bình luận');
    await this.requireWriteTask(organizationId, user, comment.taskId);
    const isAuthor = comment.authorId === user.employeeId;
    if (!isAuthor && !canManageAnyTask(user.role)) {
      throw new ForbiddenException('Chỉ được xóa bình luận của mình hoặc quản trị');
    }
    await this.prisma.workTaskComment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }

  // ── Files ────────────────────────────────────────────────────────────────

  private uploadsRoot() {
    return join(process.cwd(), 'uploads', 'work');
  }

  async listProjectDocuments(organizationId: string, user: AuthUser, projectId: string) {
    await resolveWorkScope(this.prisma, organizationId, user);
    const project = await this.prisma.workProject.findFirst({
      where: { id: projectId, organizationId },
    });
    if (!project) throw new NotFoundException('Không tìm thấy dự án');

    const files = await this.prisma.workAttachment.findMany({
      where: { organizationId, projectId, deletedAt: null },
      include: {
        uploadedBy: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const visible: typeof files = [];
    for (const f of files) {
      try {
        await this.assertAttachmentAccess(organizationId, user, f);
        visible.push(f);
      } catch {
        // skip inaccessible
      }
    }
    return visible.map((f) => this.serializeAttachment(f));
  }

  async listTaskFiles(organizationId: string, user: AuthUser, taskId: string) {
    const task = await this.requireVisibleTask(organizationId, user, taskId);
    const files = await this.prisma.workAttachment.findMany({
      where: { organizationId, taskId: task.id, deletedAt: null },
      include: {
        uploadedBy: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return files.map((f) => this.serializeAttachment(f));
  }

  async uploadFile(
    organizationId: string,
    user: AuthUser,
    file: UploadedFile | undefined,
    opts: { projectId: string; taskId?: string },
  ) {
    if (!file?.buffer) throw new BadRequestException('Thiếu file upload');
    if ((file.size ?? file.buffer.length) > WORK_UPLOAD_MAX_BYTES) {
      throw new BadRequestException('File vượt dung lượng tối đa 100MB');
    }

    const project = await this.prisma.workProject.findFirst({
      where: { id: opts.projectId, organizationId },
    });
    if (!project) throw new NotFoundException('Không tìm thấy dự án');

    let task: { id: string; title: string; projectId: string } | null = null;
    if (opts.taskId) {
      task = await this.requireWriteTask(organizationId, user, opts.taskId);
      if (task.projectId !== opts.projectId) {
        throw new BadRequestException('Task không thuộc dự án');
      }
    } else if (!canManageAnyTask(user.role) && !user.employeeId) {
      throw new ForbiddenException('Không có quyền upload tài liệu dự án');
    }

    const classified = classifyWorkUpload(
      file.originalname || 'file',
      file.mimetype,
      file.size ?? file.buffer.length,
    );

    const storedName = `${randomUUID()}${classified.ext}`;
    const dir = join(this.uploadsRoot(), organizationId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const absPath = join(dir, storedName);
    // Always new uuid path — never overwrite existing
    if (existsSync(absPath)) {
      throw new BadRequestException('Xung đột tên file lưu trữ, thử lại');
    }
    writeFileSync(absPath, file.buffer);

    const fileKey = `work/${organizationId}/${storedName}`;
    const row = await this.prisma.workAttachment.create({
      data: {
        organizationId,
        projectId: opts.projectId,
        taskId: opts.taskId || null,
        originalName: classified.originalName,
        storedName,
        fileKey,
        mimeType: file.mimetype || 'application/octet-stream',
        sizeBytes: file.size ?? file.buffer.length,
        kind: classified.kind,
        uploadedById: user.employeeId || null,
      },
      include: {
        uploadedBy: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
      },
    });

    if (task) {
      const stakeholders = await this.taskStakeholderIds(task.id);
      await this.notify(organizationId, stakeholders, {
        type: WORK_NOTIFICATION_TYPES.FILE,
        title: `File mới: ${task.title}`,
        body: classified.originalName,
        actorId: user.employeeId,
        taskId: task.id,
        projectId: task.projectId,
      });
    }

    return this.serializeAttachment(row);
  }

  async downloadAttachment(organizationId: string, user: AuthUser, id: string) {
    const att = await this.prisma.workAttachment.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!att) throw new NotFoundException('Không tìm thấy file');
    await this.assertAttachmentAccess(organizationId, user, att);

    const absPath = join(this.uploadsRoot(), organizationId, att.storedName);
    if (!existsSync(absPath)) throw new NotFoundException('File không còn trên ổ đĩa');
    const stream = createReadStream(absPath);
    return {
      file: new StreamableFile(stream),
      mimeType: att.mimeType,
      originalName: att.originalName,
      kind: att.kind,
    };
  }

  async softDeleteAttachment(organizationId: string, user: AuthUser, id: string) {
    const att = await this.prisma.workAttachment.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!att) throw new NotFoundException('Không tìm thấy file');
    await this.assertAttachmentAccess(organizationId, user, att);
    const isUploader = att.uploadedById && att.uploadedById === user.employeeId;
    if (!isUploader && !canManageAnyTask(user.role)) {
      throw new ForbiddenException('Chỉ người upload hoặc quản trị được xóa file');
    }
    await this.prisma.workAttachment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    // keep disk file for audit (no overwrite semantics)
    return { ok: true };
  }

  // ── Review flow ──────────────────────────────────────────────────────────

  async submitForReview(
    organizationId: string,
    user: AuthUser,
    taskId: string,
    dto: SubmitReviewDto,
  ) {
    const task = await this.requireWriteTask(organizationId, user, taskId);
    const columns = await this.prisma.workBoardColumn.findMany({
      where: { projectId: task.projectId },
    });
    const pending = columns.find((c) => c.key === WORK_COLUMN_KEYS.PENDING_REVIEW);
    const inProgress = columns.find((c) => c.key === WORK_COLUMN_KEYS.IN_PROGRESS);
    if (!pending) throw new BadRequestException('Thiếu cột Chờ duyệt');
    if (
      task.columnKey !== WORK_COLUMN_KEYS.IN_PROGRESS &&
      task.columnKey !== WORK_COLUMN_KEYS.NEEDS_FIX
    ) {
      throw new BadRequestException('Chỉ gửi duyệt từ Đang làm hoặc Cần sửa');
    }

    const fromKey = task.columnKey;
    const fromId = task.columnId;
    await this.prisma.$transaction([
      this.prisma.workTask.update({
        where: { id: taskId },
        data: {
          columnId: pending.id,
          lastSubmittedById: user.employeeId || null,
          lastSubmittedAt: new Date(),
        },
      }),
      this.prisma.workTaskReviewEvent.create({
        data: {
          organizationId,
          taskId,
          type: WORK_REVIEW_TYPES.SUBMIT,
          submittedById: user.employeeId || null,
          note: dto.note?.trim() || null,
          revisionNumber: task.revisionCount,
        },
      }),
      this.prisma.workTaskStatusHistory.create({
        data: {
          organizationId,
          taskId,
          fromColumnKey: fromKey,
          toColumnKey: WORK_COLUMN_KEYS.PENDING_REVIEW,
          fromColumnId: fromId,
          toColumnId: pending.id,
          action: WORK_STATUS_ACTIONS.SUBMIT_REVIEW,
          actorId: user.employeeId || null,
          note: dto.note?.trim() || null,
        },
      }),
    ]);

    const reviewers = await this.reviewerCandidateIds(taskId);
    await this.notify(organizationId, reviewers, {
      type: WORK_NOTIFICATION_TYPES.SUBMIT_REVIEW,
      title: `Gửi duyệt: ${task.title}`,
      body: dto.note?.trim() || 'Công việc đang chờ duyệt',
      actorId: user.employeeId,
      taskId,
      projectId: task.projectId,
    });

    // silence unused
    void inProgress;
    return this.reloadTask(organizationId, user, taskId);
  }

  async approveTask(
    organizationId: string,
    user: AuthUser,
    taskId: string,
    dto: ReviewDecisionDto,
  ) {
    if (!canManageAnyTask(user.role) && user.role !== 'MANAGER') {
      // assigner or org-wide also allowed
      const taskPeek = await this.requireVisibleTask(organizationId, user, taskId);
      if (taskPeek.assignerId !== user.employeeId && !canManageAnyTask(user.role)) {
        throw new ForbiddenException('Chỉ người giao / quản lý được duyệt');
      }
    }
    const task = await this.requireWriteTask(organizationId, user, taskId);
    if (task.columnKey !== WORK_COLUMN_KEYS.PENDING_REVIEW) {
      throw new BadRequestException('Công việc không ở trạng thái Chờ duyệt');
    }
    const done = await this.prisma.workBoardColumn.findFirst({
      where: { projectId: task.projectId, key: WORK_COLUMN_KEYS.DONE },
    });
    if (!done) throw new BadRequestException('Thiếu cột Hoàn thành');

    await this.prisma.$transaction([
      this.prisma.workTask.update({
        where: { id: taskId },
        data: {
          columnId: done.id,
          progress: 100,
          lastReviewedById: user.employeeId || null,
          lastReviewedAt: new Date(),
          lastReviewNote: dto.note?.trim() || null,
          lastReviewAction: WORK_REVIEW_TYPES.APPROVE,
        },
      }),
      this.prisma.workTaskReviewEvent.create({
        data: {
          organizationId,
          taskId,
          type: WORK_REVIEW_TYPES.APPROVE,
          submittedById: task.lastSubmittedById,
          reviewedById: user.employeeId || null,
          note: dto.note?.trim() || null,
          revisionNumber: task.revisionCount,
        },
      }),
      this.prisma.workTaskStatusHistory.create({
        data: {
          organizationId,
          taskId,
          fromColumnKey: task.columnKey,
          toColumnKey: WORK_COLUMN_KEYS.DONE,
          fromColumnId: task.columnId,
          toColumnId: done.id,
          action: WORK_STATUS_ACTIONS.APPROVE,
          actorId: user.employeeId || null,
          note: dto.note?.trim() || null,
        },
      }),
    ]);

    const stakeholders = await this.taskStakeholderIds(taskId);
    await this.notify(organizationId, stakeholders, {
      type: WORK_NOTIFICATION_TYPES.APPROVED,
      title: `Đã duyệt: ${task.title}`,
      body: dto.note?.trim() || 'Công việc đã hoàn thành',
      actorId: user.employeeId,
      taskId,
      projectId: task.projectId,
    });

    return this.reloadTask(organizationId, user, taskId);
  }

  async requestFix(organizationId: string, user: AuthUser, taskId: string, dto: ReviewDecisionDto) {
    const taskPeek = await this.requireVisibleTask(organizationId, user, taskId);
    if (
      !canManageAnyTask(user.role) &&
      taskPeek.assignerId !== user.employeeId &&
      user.role !== 'MANAGER'
    ) {
      throw new ForbiddenException('Chỉ người giao / quản lý được yêu cầu sửa');
    }
    const task = await this.requireWriteTask(organizationId, user, taskId);
    if (task.columnKey !== WORK_COLUMN_KEYS.PENDING_REVIEW) {
      throw new BadRequestException('Công việc không ở trạng thái Chờ duyệt');
    }
    const needsFix = await this.prisma.workBoardColumn.findFirst({
      where: { projectId: task.projectId, key: WORK_COLUMN_KEYS.NEEDS_FIX },
    });
    if (!needsFix) throw new BadRequestException('Thiếu cột Cần sửa');

    const rev = task.revisionCount + 1;
    await this.prisma.$transaction([
      this.prisma.workTask.update({
        where: { id: taskId },
        data: {
          columnId: needsFix.id,
          revisionCount: rev,
          lastReviewedById: user.employeeId || null,
          lastReviewedAt: new Date(),
          lastReviewNote: dto.note?.trim() || null,
          lastReviewAction: WORK_REVIEW_TYPES.REQUEST_FIX,
        },
      }),
      this.prisma.workTaskReviewEvent.create({
        data: {
          organizationId,
          taskId,
          type: WORK_REVIEW_TYPES.REQUEST_FIX,
          submittedById: task.lastSubmittedById,
          reviewedById: user.employeeId || null,
          note: dto.note?.trim() || null,
          revisionNumber: rev,
        },
      }),
      this.prisma.workTaskStatusHistory.create({
        data: {
          organizationId,
          taskId,
          fromColumnKey: task.columnKey,
          toColumnKey: WORK_COLUMN_KEYS.NEEDS_FIX,
          fromColumnId: task.columnId,
          toColumnId: needsFix.id,
          action: WORK_STATUS_ACTIONS.REQUEST_FIX,
          actorId: user.employeeId || null,
          note: dto.note?.trim() || null,
        },
      }),
    ]);

    const stakeholders = await this.taskStakeholderIds(taskId);
    await this.notify(organizationId, stakeholders, {
      type: WORK_NOTIFICATION_TYPES.REQUEST_FIX,
      title: `Cần sửa: ${task.title}`,
      body: dto.note?.trim() || 'Yêu cầu chỉnh sửa',
      actorId: user.employeeId,
      taskId,
      projectId: task.projectId,
    });

    return this.reloadTask(organizationId, user, taskId);
  }

  async listStatusHistory(organizationId: string, user: AuthUser, taskId: string) {
    await this.requireVisibleTask(organizationId, user, taskId);
    return this.prisma.workTaskStatusHistory.findMany({
      where: { organizationId, taskId },
      include: { actor: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async listReviewEvents(organizationId: string, user: AuthUser, taskId: string) {
    await this.requireVisibleTask(organizationId, user, taskId);
    return this.prisma.workTaskReviewEvent.findMany({
      where: { organizationId, taskId },
      include: {
        submittedBy: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async recordMoveHistory(
    organizationId: string,
    taskId: string,
    from: { id: string; key: string } | null,
    to: { id: string; key: string },
    actorId?: string | null,
  ) {
    if (from && from.id === to.id) return;
    await this.prisma.workTaskStatusHistory.create({
      data: {
        organizationId,
        taskId,
        fromColumnKey: from?.key ?? null,
        toColumnKey: to.key,
        fromColumnId: from?.id ?? null,
        toColumnId: to.id,
        action: WORK_STATUS_ACTIONS.MOVE,
        actorId: actorId || null,
      },
    });
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private serializeComment(c: {
    id: string;
    taskId: string;
    parentId: string | null;
    authorId: string;
    body: string;
    mentionIds: string[];
    editedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    author: { id: string; name: string };
    replies?: Array<{
      id: string;
      taskId: string;
      parentId: string | null;
      authorId: string;
      body: string;
      mentionIds: string[];
      editedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      author: { id: string; name: string };
    }>;
  }) {
    return {
      id: c.id,
      taskId: c.taskId,
      parentId: c.parentId,
      authorId: c.authorId,
      author: c.author,
      body: c.body,
      mentionIds: c.mentionIds,
      editedAt: c.editedAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      replies: (c.replies ?? []).map((r) => ({
        id: r.id,
        taskId: r.taskId,
        parentId: r.parentId,
        authorId: r.authorId,
        author: r.author,
        body: r.body,
        mentionIds: r.mentionIds,
        editedAt: r.editedAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    };
  }

  private serializeAttachment(f: {
    id: string;
    organizationId: string;
    projectId: string;
    taskId: string | null;
    originalName: string;
    storedName: string;
    fileKey: string;
    mimeType: string;
    sizeBytes: number;
    kind: string;
    uploadedById: string | null;
    createdAt: Date;
    uploadedBy?: { id: string; name: string } | null;
    task?: { id: string; title: string } | null;
  }) {
    return {
      id: f.id,
      organizationId: f.organizationId,
      projectId: f.projectId,
      taskId: f.taskId,
      originalName: f.originalName,
      storedName: f.storedName,
      fileKey: f.fileKey,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      kind: f.kind,
      uploadedById: f.uploadedById,
      uploadedBy: f.uploadedBy ?? null,
      task: f.task ?? null,
      createdAt: f.createdAt,
      canPreview: f.kind === 'image' || f.kind === 'pdf',
      // Signed /uploads URL for <img>/preview without Bearer header
      url: withSignedUploadUrl(`/uploads/${f.fileKey}`),
    };
  }

  private async resolveMentions(
    organizationId: string,
    body: string,
    explicit: string[],
  ): Promise<string[]> {
    const ids = new Set(explicit.filter(Boolean));
    // @uuid pattern
    for (const m of body.matchAll(
      /@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi,
    )) {
      ids.add(m[1]!);
    }
    // @Name token → match employees by name (case-insensitive contains)
    const names = [...body.matchAll(/@([^\s@]{2,80})/g)]
      .map((m) => m[1]!)
      .filter((n) => !n.includes('-') || n.length < 36);
    if (names.length) {
      const employees = await this.prisma.employee.findMany({
        where: {
          organizationId,
          OR: names.map((n) => ({ name: { equals: n, mode: 'insensitive' as const } })),
        },
        select: { id: true },
        take: 50,
      });
      for (const e of employees) ids.add(e.id);
    }
    if (!ids.size) return [];
    const valid = await this.prisma.employee.findMany({
      where: { organizationId, id: { in: [...ids] } },
      select: { id: true },
    });
    return valid.map((e) => e.id);
  }

  private async taskStakeholderIds(taskId: string): Promise<string[]> {
    const task = await this.prisma.workTask.findFirst({
      where: { id: taskId },
      include: { assignees: true, watchers: true },
    });
    if (!task) return [];
    return [
      task.createdById,
      task.assignerId,
      task.lastSubmittedById,
      ...task.assignees.map((a) => a.employeeId),
      ...task.watchers.map((w) => w.employeeId),
    ].filter(Boolean) as string[];
  }

  private async reviewerCandidateIds(taskId: string): Promise<string[]> {
    const task = await this.prisma.workTask.findFirst({
      where: { id: taskId },
      include: { watchers: true },
    });
    if (!task) return [];
    const ids = [
      task.assignerId,
      task.createdById,
      ...task.watchers.map((w) => w.employeeId),
    ].filter(Boolean) as string[];
    return ids;
  }

  private async assertAttachmentAccess(
    organizationId: string,
    user: AuthUser,
    att: { taskId: string | null; projectId: string; uploadedById: string | null },
  ) {
    if (att.taskId) {
      await this.requireVisibleTask(organizationId, user, att.taskId);
      return;
    }
    // Project-only document: uploader, org-wide, or manager scope
    if (att.uploadedById && att.uploadedById === user.employeeId) return;
    if (canManageAnyTask(user.role)) return;
    const scope = await resolveWorkScope(this.prisma, organizationId, user);
    if (scope.mode === 'all') return;
    throw new ForbiddenException('Không có quyền truy cập file này');
  }

  private async requireVisibleTask(organizationId: string, user: AuthUser, taskId: string) {
    const scope = await resolveWorkScope(this.prisma, organizationId, user);
    const task = await this.prisma.workTask.findFirst({
      where: { id: taskId, organizationId, deletedAt: null },
      include: {
        column: true,
        assignees: true,
        watchers: true,
      },
    });
    if (!task) throw new NotFoundException('Không tìm thấy công việc');
    this.assertVisible(user, scope, task);
    return {
      id: task.id,
      title: task.title,
      projectId: task.projectId,
      columnId: task.columnId,
      columnKey: task.column.key,
      assignerId: task.assignerId,
      createdById: task.createdById,
      revisionCount: task.revisionCount,
      lastSubmittedById: task.lastSubmittedById,
    };
  }

  private async requireWriteTask(organizationId: string, user: AuthUser, taskId: string) {
    const scope = await resolveWorkScope(this.prisma, organizationId, user);
    const task = await this.prisma.workTask.findFirst({
      where: { id: taskId, organizationId, deletedAt: null },
      include: {
        column: true,
        assignees: true,
        watchers: true,
      },
    });
    if (!task) throw new NotFoundException('Không tìm thấy công việc');
    assertCanWriteTask(
      user,
      {
        createdById: task.createdById,
        assignerId: task.assignerId,
        assigneeIds: task.assignees.map((a) => a.employeeId),
        watcherIds: task.watchers.map((w) => w.employeeId),
      },
      scope,
    );
    return {
      id: task.id,
      title: task.title,
      projectId: task.projectId,
      columnId: task.columnId,
      columnKey: task.column.key,
      assignerId: task.assignerId,
      createdById: task.createdById,
      revisionCount: task.revisionCount,
      lastSubmittedById: task.lastSubmittedById,
    };
  }

  private assertVisible(
    user: AuthUser,
    scope: Awaited<ReturnType<typeof resolveWorkScope>>,
    task: {
      createdById: string | null;
      assignerId: string | null;
      assignees: { employeeId: string }[];
      watchers: { employeeId: string }[];
    },
  ) {
    if (scope.mode === 'all') return;
    try {
      assertCanWriteTask(
        user,
        {
          createdById: task.createdById,
          assignerId: task.assignerId,
          assigneeIds: task.assignees.map((a) => a.employeeId),
          watcherIds: task.watchers.map((w) => w.employeeId),
        },
        scope,
      );
    } catch {
      const me = user.employeeId;
      const related = [
        task.createdById,
        task.assignerId,
        ...task.assignees.map((a) => a.employeeId),
        ...task.watchers.map((w) => w.employeeId),
      ];
      if (scope.mode === 'ids' && related.some((id) => id && scope.employeeIds.includes(id))) {
        return;
      }
      if (me && related.includes(me)) return;
      throw new ForbiddenException('Không có quyền xem công việc này');
    }
  }

  private async reloadTask(organizationId: string, user: AuthUser, taskId: string) {
    // Return lean review snapshot (full serialize lives in main service)
    void user;
    const task = await this.prisma.workTask.findFirst({
      where: { id: taskId, organizationId },
      include: {
        column: true,
        lastSubmittedBy: { select: { id: true, name: true } },
        lastReviewedBy: { select: { id: true, name: true } },
        assignees: { include: { employee: { select: { id: true, name: true } } } },
      },
    });
    if (!task) throw new NotFoundException('Không tìm thấy công việc');
    return {
      id: task.id,
      projectId: task.projectId,
      columnId: task.columnId,
      columnKey: task.column.key,
      columnName: task.column.name,
      title: task.title,
      progress: task.progress,
      revisionCount: task.revisionCount,
      lastSubmittedById: task.lastSubmittedById,
      lastSubmittedBy: task.lastSubmittedBy,
      lastSubmittedAt: task.lastSubmittedAt,
      lastReviewedById: task.lastReviewedById,
      lastReviewedBy: task.lastReviewedBy,
      lastReviewedAt: task.lastReviewedAt,
      lastReviewNote: task.lastReviewNote,
      lastReviewAction: task.lastReviewAction,
    };
  }
}
