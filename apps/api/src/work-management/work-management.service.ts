import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  WORK_COLUMN_KEYS,
  WORK_NOTIFICATION_TYPES,
  WORK_PRIORITIES,
  DEFAULT_WORK_COLUMNS,
} from './work-management.constants';
import {
  assertCanWriteTask,
  canManageAnyTask,
  isWorkOrgWideRole,
  resolveWorkScope,
  workTaskVisibilityWhere,
} from './work-management.scope';
import type {
  CreateWorkProjectDto,
  CreateWorkTaskDto,
  MoveWorkTaskDto,
  UpdateWorkProjectDto,
  UpdateWorkTaskDto,
  WorkTaskQueryDto,
} from './dto/work-management.dto';
import { WorkCollabService } from './work-collab.service';
import { WorkInsightsService } from './work-insights.service';
import { occurrenceKey } from './work-metrics';

const taskInclude = {
  column: true,
  assigner: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  lastSubmittedBy: { select: { id: true, name: true } },
  lastReviewedBy: { select: { id: true, name: true } },
  assignees: {
    include: { employee: { select: { id: true, name: true } } },
  },
  watchers: {
    include: { employee: { select: { id: true, name: true } } },
  },
  checklist: { orderBy: { sortOrder: 'asc' as const } },
} satisfies Prisma.WorkTaskInclude;

@Injectable()
export class WorkManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly collab: WorkCollabService,
    private readonly insights: WorkInsightsService,
  ) {}

  // ── Projects ─────────────────────────────────────────────────────────────

  async listProjects(organizationId: string, user: AuthUser, includeArchived = false) {
    await resolveWorkScope(this.prisma, organizationId, user);
    return this.prisma.workProject.findMany({
      where: {
        organizationId,
        ...(includeArchived ? {} : { isArchived: false }),
      },
      include: {
        columns: { orderBy: { sortOrder: 'asc' } },
        _count: {
          select: {
            tasks: { where: { deletedAt: null, isArchived: false } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getProject(organizationId: string, user: AuthUser, projectId: string) {
    const scope = await resolveWorkScope(this.prisma, organizationId, user);
    const project = await this.prisma.workProject.findFirst({
      where: { id: projectId, organizationId },
      include: {
        columns: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!project) throw new NotFoundException('Không tìm thấy dự án');

    const visibility = workTaskVisibilityWhere(scope, user);
    const tasks = await this.prisma.workTask.findMany({
      where: {
        organizationId,
        projectId,
        deletedAt: null,
        isArchived: false,
        ...visibility,
      },
      include: taskInclude,
      orderBy: [{ columnId: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return {
      ...project,
      tasks: tasks.map((t) => this.serializeTask(t)),
    };
  }

  async createProject(organizationId: string, user: AuthUser, dto: CreateWorkProjectDto) {
    if (!isWorkOrgWideRole(user.role) && user.role !== 'MANAGER') {
      // staff can create projects they own too (common product expectation)
    }
    const project = await this.prisma.workProject.create({
      data: {
        organizationId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        createdById: user.employeeId || null,
        columns: {
          create: DEFAULT_WORK_COLUMNS.map((c) => ({
            key: c.key,
            name: c.name,
            sortOrder: c.sortOrder,
          })),
        },
      },
      include: { columns: { orderBy: { sortOrder: 'asc' } } },
    });
    return project;
  }

  async updateProject(
    organizationId: string,
    user: AuthUser,
    projectId: string,
    dto: UpdateWorkProjectDto,
  ) {
    await this.ensureProject(organizationId, projectId);
    if (!canManageAnyTask(user.role) && !isWorkOrgWideRole(user.role)) {
      // Staff may only rename unshared projects they created
      const p = await this.prisma.workProject.findFirst({
        where: { id: projectId, organizationId },
      });
      if (p?.createdById && p.createdById !== user.employeeId) {
        throw new ForbiddenException('Không có quyền sửa dự án này');
      }
    }
    return this.prisma.workProject.update({
      where: { id: projectId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.isArchived !== undefined ? { isArchived: dto.isArchived } : {}),
      },
      include: { columns: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  // ── Tasks ────────────────────────────────────────────────────────────────

  async listTasks(organizationId: string, user: AuthUser, query: WorkTaskQueryDto) {
    const scope = await resolveWorkScope(this.prisma, organizationId, user);
    const visibility = workTaskVisibilityWhere(scope, user);

    const where: Prisma.WorkTaskWhereInput = {
      organizationId,
      deletedAt: null,
      ...(query.includeArchived ? {} : { isArchived: false }),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.label ? { labels: { has: query.label } } : {}),
      ...(query.assigneeId ? { assignees: { some: { employeeId: query.assigneeId } } } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { description: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...visibility,
    };

    const tasks = await this.prisma.workTask.findMany({
      where,
      include: taskInclude,
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
      take: 500,
    });
    return tasks.map((t) => this.serializeTask(t));
  }

  async getTask(organizationId: string, user: AuthUser, taskId: string) {
    const scope = await resolveWorkScope(this.prisma, organizationId, user);
    const task = await this.prisma.workTask.findFirst({
      where: { id: taskId, organizationId, deletedAt: null },
      include: taskInclude,
    });
    if (!task) throw new NotFoundException('Không tìm thấy công việc');
    this.assertTaskVisible(user, scope, task);
    return this.serializeTask(task);
  }

  async createTask(organizationId: string, user: AuthUser, dto: CreateWorkTaskDto) {
    const project = await this.ensureProject(organizationId, dto.projectId);
    const columns = await this.prisma.workBoardColumn.findMany({
      where: { projectId: project.id },
      orderBy: { sortOrder: 'asc' },
    });
    if (!columns.length) throw new BadRequestException('Dự án chưa có cột Kanban');

    let columnId = dto.columnId;
    if (columnId) {
      if (!columns.some((c) => c.id === columnId)) {
        throw new BadRequestException('Cột không thuộc dự án');
      }
    } else {
      columnId = columns[0]!.id;
    }

    const priority = this.normalizePriority(dto.priority);
    const maxOrder = await this.prisma.workTask.aggregate({
      where: { columnId, deletedAt: null },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;

    const assigneeIds = dto.assigneeIds ?? [];
    const watcherIds = dto.watcherIds ?? [];
    await this.assertEmployeesInOrg(organizationId, [
      ...(dto.assignerId ? [dto.assignerId] : []),
      ...assigneeIds,
      ...watcherIds,
    ]);

    const task = await this.prisma.workTask.create({
      data: {
        organizationId,
        projectId: project.id,
        columnId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        assignerId: dto.assignerId ?? user.employeeId ?? null,
        createdById: user.employeeId || null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        deadline: dto.deadline ? new Date(dto.deadline) : null,
        priority,
        labels: dto.labels ?? [],
        progress: dto.progress ?? 0,
        sortOrder,
        estimatedMinutes: dto.estimatedMinutes ?? null,
        recurrenceRule: dto.recurrenceRule || null,
        recurrenceInterval: dto.recurrenceInterval ?? 1,
        recurrenceUntil: dto.recurrenceUntil ? new Date(dto.recurrenceUntil) : null,
        isRecurrenceTemplate: Boolean(dto.recurrenceRule && dto.recurrenceRule !== 'NONE'),
        recurrenceSeriesId: undefined,
        assignees: {
          create: assigneeIds.map((employeeId) => ({ employeeId })),
        },
        watchers: {
          create: watcherIds.map((employeeId) => ({ employeeId })),
        },
        checklist: {
          create: (dto.checklist ?? []).map((c, i) => ({
            title: c.title.trim(),
            isDone: c.isDone ?? false,
            sortOrder: c.sortOrder ?? i,
          })),
        },
      },
      include: taskInclude,
    });

    // Template series id = self
    if (task.isRecurrenceTemplate) {
      await this.prisma.workTask.update({
        where: { id: task.id },
        data: {
          recurrenceSeriesId: task.id,
          recurrenceOccurrenceKey: occurrenceKey(task.id, 'template'),
        },
      });
    }

    if (assigneeIds.length) {
      await this.collab.notify(organizationId, assigneeIds, {
        type: WORK_NOTIFICATION_TYPES.TASK_ASSIGNED,
        title: `Được giao việc: ${task.title}`,
        body: 'Bạn được gán là người thực hiện',
        actorId: user.employeeId,
        taskId: task.id,
        projectId: task.projectId,
      });
    }

    const col = task.column;
    await this.collab.recordMoveHistory(
      organizationId,
      task.id,
      null,
      { id: col.id, key: col.key },
      user.employeeId,
    );

    await this.insights.audit(organizationId, user.employeeId, {
      action: 'CREATE_TASK',
      entityType: 'WorkTask',
      entityId: task.id,
      taskId: task.id,
      projectId: task.projectId,
      summary: `Tạo công việc: ${task.title}`,
    });

    return this.getTask(organizationId, user, task.id);
  }

  async updateTask(organizationId: string, user: AuthUser, taskId: string, dto: UpdateWorkTaskDto) {
    const scope = await resolveWorkScope(this.prisma, organizationId, user);
    const existing = await this.prisma.workTask.findFirst({
      where: { id: taskId, organizationId, deletedAt: null },
      include: { assignees: true, watchers: true },
    });
    if (!existing) throw new NotFoundException('Không tìm thấy công việc');

    assertCanWriteTask(
      user,
      {
        createdById: existing.createdById,
        assignerId: existing.assignerId,
        assigneeIds: existing.assignees.map((a) => a.employeeId),
        watcherIds: existing.watchers.map((w) => w.employeeId),
      },
      scope,
    );

    if (dto.assigneeIds || dto.watcherIds || dto.assignerId) {
      await this.assertEmployeesInOrg(organizationId, [
        ...(dto.assignerId ? [dto.assignerId] : []),
        ...(dto.assigneeIds ?? []),
        ...(dto.watcherIds ?? []),
      ]);
    }

    if (dto.assigneeIds) {
      const prev = new Set(existing.assignees.map((a) => a.employeeId));
      await this.prisma.workTaskAssignee.deleteMany({ where: { taskId } });
      if (dto.assigneeIds.length) {
        await this.prisma.workTaskAssignee.createMany({
          data: dto.assigneeIds.map((employeeId) => ({ taskId, employeeId })),
        });
      }
      const newly = dto.assigneeIds.filter((id) => !prev.has(id));
      if (newly.length) {
        await this.collab.notify(organizationId, newly, {
          type: WORK_NOTIFICATION_TYPES.TASK_ASSIGNED,
          title: `Được giao việc: ${existing.title}`,
          body: 'Bạn được gán là người thực hiện',
          actorId: user.employeeId,
          taskId,
          projectId: existing.projectId,
        });
      }
    }
    if (dto.watcherIds) {
      await this.prisma.workTaskWatcher.deleteMany({ where: { taskId } });
      if (dto.watcherIds.length) {
        await this.prisma.workTaskWatcher.createMany({
          data: dto.watcherIds.map((employeeId) => ({ taskId, employeeId })),
        });
      }
    }
    if (dto.checklist) {
      await this.prisma.workChecklistItem.deleteMany({ where: { taskId } });
      if (dto.checklist.length) {
        await this.prisma.workChecklistItem.createMany({
          data: dto.checklist.map((c, i) => ({
            taskId,
            title: c.title.trim(),
            isDone: c.isDone ?? false,
            sortOrder: c.sortOrder ?? i,
          })),
        });
      }
    }

    const task = await this.prisma.workTask.update({
      where: { id: taskId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.assignerId !== undefined ? { assignerId: dto.assignerId } : {}),
        ...(dto.startDate !== undefined
          ? { startDate: dto.startDate ? new Date(dto.startDate) : null }
          : {}),
        ...(dto.deadline !== undefined
          ? { deadline: dto.deadline ? new Date(dto.deadline) : null }
          : {}),
        ...(dto.priority !== undefined ? { priority: this.normalizePriority(dto.priority) } : {}),
        ...(dto.labels !== undefined ? { labels: dto.labels } : {}),
        ...(dto.progress !== undefined ? { progress: dto.progress } : {}),
        ...(dto.estimatedMinutes !== undefined ? { estimatedMinutes: dto.estimatedMinutes } : {}),
        ...(dto.recurrenceRule !== undefined
          ? {
              recurrenceRule: dto.recurrenceRule || null,
              isRecurrenceTemplate: Boolean(dto.recurrenceRule && dto.recurrenceRule !== 'NONE'),
            }
          : {}),
        ...(dto.recurrenceInterval !== undefined
          ? { recurrenceInterval: dto.recurrenceInterval }
          : {}),
        ...(dto.recurrenceUntil !== undefined
          ? { recurrenceUntil: dto.recurrenceUntil ? new Date(dto.recurrenceUntil) : null }
          : {}),
        ...(dto.isArchived !== undefined ? { isArchived: dto.isArchived } : {}),
      },
      include: taskInclude,
    });

    await this.insights.audit(organizationId, user.employeeId, {
      action: 'UPDATE_TASK',
      entityType: 'WorkTask',
      entityId: taskId,
      taskId,
      projectId: existing.projectId,
      summary: `Cập nhật: ${task.title}`,
    });

    return this.serializeTask(task);
  }

  /** Kéo thả: lưu column + sortOrder; reindex cùng cột để giữ thứ tự ổn định. */
  async moveTask(organizationId: string, user: AuthUser, taskId: string, dto: MoveWorkTaskDto) {
    const scope = await resolveWorkScope(this.prisma, organizationId, user);
    const task = await this.prisma.workTask.findFirst({
      where: { id: taskId, organizationId, deletedAt: null },
      include: { assignees: true, watchers: true },
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

    const column = await this.prisma.workBoardColumn.findFirst({
      where: { id: dto.columnId, projectId: task.projectId },
    });
    if (!column) throw new BadRequestException('Cột không thuộc dự án');

    const siblings = await this.prisma.workTask.findMany({
      where: {
        projectId: task.projectId,
        columnId: dto.columnId,
        deletedAt: null,
        id: { not: taskId },
      },
      orderBy: { sortOrder: 'asc' },
      select: { id: true },
    });

    const fromCol = await this.prisma.workBoardColumn.findFirst({
      where: { id: task.columnId },
    });

    const insertAt = Math.max(0, Math.min(dto.sortOrder, siblings.length));
    const ordered = [
      ...siblings.slice(0, insertAt).map((s) => s.id),
      taskId,
      ...siblings.slice(insertAt).map((s) => s.id),
    ];

    await this.prisma.$transaction([
      this.prisma.workTask.update({
        where: { id: taskId },
        data: {
          columnId: dto.columnId,
          sortOrder: insertAt,
          ...(column.key === WORK_COLUMN_KEYS.DONE
            ? { completedAt: new Date(), progress: 100 }
            : { completedAt: null }),
        },
      }),
      ...ordered.map((id, index) =>
        this.prisma.workTask.update({
          where: { id },
          data: { columnId: dto.columnId, sortOrder: index },
        }),
      ),
    ]);

    if (fromCol && fromCol.id !== column.id) {
      await this.collab.recordMoveHistory(
        organizationId,
        taskId,
        { id: fromCol.id, key: fromCol.key },
        { id: column.id, key: column.key },
        user.employeeId,
      );
      await this.insights.audit(organizationId, user.employeeId, {
        action: 'MOVE_TASK',
        entityType: 'WorkTask',
        entityId: taskId,
        taskId,
        projectId: task.projectId,
        summary: `${fromCol.key} → ${column.key}`,
      });
    }

    return this.getTask(organizationId, user, taskId);
  }

  async copyTask(organizationId: string, user: AuthUser, taskId: string) {
    const src = await this.getTask(organizationId, user, taskId);
    return this.createTask(organizationId, user, {
      projectId: src.projectId,
      columnId: src.columnId,
      title: `${src.title} (bản sao)`,
      description: src.description ?? undefined,
      assignerId: src.assignerId,
      assigneeIds: src.assignees.map((a) => a.id),
      watcherIds: src.watchers.map((w) => w.id),
      startDate: src.startDate,
      deadline: src.deadline,
      priority: src.priority,
      labels: src.labels,
      progress: 0,
      checklist: src.checklist.map((c) => ({
        title: c.title,
        isDone: false,
        sortOrder: c.sortOrder,
      })),
    }).then(async (created) => {
      await this.prisma.workTask.update({
        where: { id: created.id },
        data: { copiedFromId: taskId },
      });
      return this.getTask(organizationId, user, created.id);
    });
  }

  async archiveTask(organizationId: string, user: AuthUser, taskId: string, archived = true) {
    return this.updateTask(organizationId, user, taskId, { isArchived: archived });
  }

  async softDeleteTask(organizationId: string, user: AuthUser, taskId: string) {
    const scope = await resolveWorkScope(this.prisma, organizationId, user);
    const task = await this.prisma.workTask.findFirst({
      where: { id: taskId, organizationId, deletedAt: null },
      include: { assignees: true, watchers: true },
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
    await this.prisma.workTask.update({
      where: { id: taskId },
      data: { deletedAt: new Date(), isArchived: true },
    });
    return { ok: true };
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private serializeTask(task: Prisma.WorkTaskGetPayload<{ include: typeof taskInclude }>) {
    return {
      id: task.id,
      organizationId: task.organizationId,
      projectId: task.projectId,
      columnId: task.columnId,
      columnKey: task.column.key,
      columnName: task.column.name,
      title: task.title,
      description: task.description,
      assignerId: task.assignerId,
      assigner: task.assigner,
      createdById: task.createdById,
      createdBy: task.createdBy,
      startDate: task.startDate?.toISOString().slice(0, 10) ?? null,
      deadline: task.deadline?.toISOString().slice(0, 10) ?? null,
      priority: task.priority,
      labels: task.labels,
      progress: task.progress,
      sortOrder: task.sortOrder,
      estimatedMinutes: task.estimatedMinutes,
      completedAt: task.completedAt,
      recurrenceRule: task.recurrenceRule,
      recurrenceInterval: task.recurrenceInterval,
      isRecurrenceTemplate: task.isRecurrenceTemplate,
      isArchived: task.isArchived,
      copiedFromId: task.copiedFromId,
      revisionCount: task.revisionCount,
      lastSubmittedById: task.lastSubmittedById,
      lastSubmittedBy: task.lastSubmittedBy,
      lastSubmittedAt: task.lastSubmittedAt,
      lastReviewedById: task.lastReviewedById,
      lastReviewedBy: task.lastReviewedBy,
      lastReviewedAt: task.lastReviewedAt,
      lastReviewNote: task.lastReviewNote,
      lastReviewAction: task.lastReviewAction,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      assignees: task.assignees.map((a) => a.employee),
      watchers: task.watchers.map((w) => w.employee),
      checklist: task.checklist.map((c) => ({
        id: c.id,
        title: c.title,
        isDone: c.isDone,
        sortOrder: c.sortOrder,
      })),
      canSubmitReview:
        task.column.key === WORK_COLUMN_KEYS.IN_PROGRESS ||
        task.column.key === WORK_COLUMN_KEYS.NEEDS_FIX,
      canReview: task.column.key === WORK_COLUMN_KEYS.PENDING_REVIEW,
    };
  }

  private async ensureProject(organizationId: string, projectId: string) {
    const p = await this.prisma.workProject.findFirst({
      where: { id: projectId, organizationId },
    });
    if (!p) throw new NotFoundException('Không tìm thấy dự án');
    return p;
  }

  private normalizePriority(p?: string): string {
    const v = (p || 'MEDIUM').toUpperCase();
    if (!(WORK_PRIORITIES as readonly string[]).includes(v)) {
      throw new BadRequestException(`priority phải là ${WORK_PRIORITIES.join(', ')}`);
    }
    return v;
  }

  private async assertEmployeesInOrg(organizationId: string, employeeIds: string[]) {
    const unique = [...new Set(employeeIds.filter(Boolean))];
    if (!unique.length) return;
    const count = await this.prisma.employee.count({
      where: { organizationId, id: { in: unique } },
    });
    if (count !== unique.length) {
      throw new BadRequestException('Có nhân viên không thuộc tổ chức');
    }
  }

  private assertTaskVisible(
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
      // Staff may only view related — reuse relation check softer for read
      const me = user.employeeId;
      const related = [
        task.createdById,
        task.assignerId,
        ...task.assignees.map((a) => a.employeeId),
        ...task.watchers.map((w) => w.employeeId),
      ];
      if (scope.mode === 'ids') {
        if (related.some((id) => id && scope.employeeIds.includes(id))) return;
      }
      if (me && related.includes(me)) return;
      throw new ForbiddenException('Không có quyền xem công việc này');
    }
  }
}
