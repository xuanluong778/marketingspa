import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@marketingspa/database';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  assertCanWriteTask,
  canManageAnyTask,
  resolveWorkScope,
  workTaskVisibilityWhere,
} from './work-management.scope';
import { WORK_COLUMN_KEYS } from './work-management.constants';
import {
  classifyRisk,
  computeWorkloadScore,
  nextOccurrenceDates,
  occurrenceKey,
  toCsv,
  toSpreadsheetMl,
  vnDateString,
  WORK_TZ,
  type WorkloadTaskSnapshot,
} from './work-metrics';
import { WorkCollabService } from './work-collab.service';

@Injectable()
export class WorkInsightsService {
  private readonly logger = new Logger(WorkInsightsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly collab: WorkCollabService,
  ) {}

  // ── Audit ────────────────────────────────────────────────────────────────

  async audit(
    organizationId: string,
    actorId: string | null | undefined,
    input: {
      action: string;
      entityType: string;
      entityId?: string | null;
      taskId?: string | null;
      projectId?: string | null;
      summary?: string;
      metadata?: Prisma.InputJsonValue;
    },
  ) {
    try {
      await this.prisma.workAuditLog.create({
        data: {
          organizationId,
          actorId: actorId || null,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId || null,
          taskId: input.taskId || null,
          projectId: input.projectId || null,
          summary: input.summary?.slice(0, 500) || null,
          metadata: input.metadata ?? undefined,
        },
      });
    } catch (e) {
      this.logger.warn(`audit failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  async listAuditLogs(
    organizationId: string,
    user: AuthUser,
    q: { taskId?: string; projectId?: string; limit?: number },
  ) {
    await resolveWorkScope(this.prisma, organizationId, user);
    return this.prisma.workAuditLog.findMany({
      where: {
        organizationId,
        ...(q.taskId ? { taskId: q.taskId } : {}),
        ...(q.projectId ? { projectId: q.projectId } : {}),
      },
      include: { actor: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(q.limit ?? 100, 500),
    });
  }

  // ── My work ──────────────────────────────────────────────────────────────

  /**
   * Resolve employeeId for current user: User.employeeId first, then Employee by email.
   * Owners often have account without HR link — still allow empty "Việc của tôi".
   */
  private async resolveActorEmployeeId(
    organizationId: string,
    user: AuthUser,
  ): Promise<string | null> {
    if (user.employeeId) return user.employeeId;
    if (!user.email) return null;
    const emp = await this.prisma.employee.findFirst({
      where: {
        organizationId,
        email: { equals: user.email, mode: 'insensitive' },
        isActive: true,
      },
      select: { id: true },
    });
    return emp?.id ?? null;
  }

  private emptyMyWork(today: string, warning?: string) {
    const empty: Record<string, never[]> = {
      today: [],
      upcoming: [],
      overdue: [],
      inProgress: [],
      pendingReview: [],
      done: [],
      assignedByMe: [],
    };
    return {
      timezone: WORK_TZ,
      today,
      warning: warning || null,
      buckets: empty,
      counts: {
        today: 0,
        upcoming: 0,
        overdue: 0,
        inProgress: 0,
        pendingReview: 0,
        done: 0,
        assignedByMe: 0,
      },
    };
  }

  async myWork(organizationId: string, user: AuthUser) {
    const today = vnDateString();
    const me = await this.resolveActorEmployeeId(organizationId, user);
    if (!me) {
      // Do not 401/403 — render empty buckets so page loads for accounts without HR profile
      return this.emptyMyWork(
        today,
        'Tài khoản chưa gắn hồ sơ nhân viên — chưa có việc gán cho bạn. Liên hệ HR để liên kết tài khoản.',
      );
    }
    const soon = (() => {
      const d = new Date(`${today}T00:00:00+07:00`);
      d.setUTCDate(d.getUTCDate() + 3);
      return vnDateString(d);
    })();

    const baseWhere: Prisma.WorkTaskWhereInput = {
      organizationId,
      deletedAt: null,
      isArchived: false,
      isRecurrenceTemplate: false,
    };

    const related: Prisma.WorkTaskWhereInput = {
      ...baseWhere,
      OR: [
        { assignees: { some: { employeeId: me } } },
        { assignerId: me },
        { createdById: me },
        { watchers: { some: { employeeId: me } } },
      ],
    };

    const include = {
      column: true,
      project: { select: { id: true, name: true } },
      assignees: { include: { employee: { select: { id: true, name: true } } } },
    } satisfies Prisma.WorkTaskInclude;

    const allMine = await this.prisma.workTask.findMany({
      where: related,
      include,
      orderBy: [{ deadline: 'asc' }, { updatedAt: 'desc' }],
      take: 400,
    });

    const isMineAssigned = (t: (typeof allMine)[0]) => t.assignees.some((a) => a.employeeId === me);
    const isIAssigned = (t: (typeof allMine)[0]) => t.assignerId === me;

    const ser = (t: (typeof allMine)[0]) => this.serializeLite(t, today);

    const todayDue = allMine.filter(
      (t) => isMineAssigned(t) && t.deadline && vnDateString(t.deadline) === today,
    );
    const upcoming = allMine.filter((t) => {
      if (!isMineAssigned(t) || !t.deadline) return false;
      const d = vnDateString(t.deadline);
      return d > today && d <= soon && t.column.key !== WORK_COLUMN_KEYS.DONE;
    });
    const overdue = allMine.filter((t) => {
      if (!isMineAssigned(t) || !t.deadline) return false;
      return vnDateString(t.deadline) < today && t.column.key !== WORK_COLUMN_KEYS.DONE;
    });
    const inProgress = allMine.filter(
      (t) =>
        isMineAssigned(t) &&
        (t.column.key === WORK_COLUMN_KEYS.IN_PROGRESS ||
          t.column.key === WORK_COLUMN_KEYS.NEEDS_FIX),
    );
    const pendingReview = allMine.filter(
      (t) => isMineAssigned(t) && t.column.key === WORK_COLUMN_KEYS.PENDING_REVIEW,
    );
    const done = allMine.filter((t) => isMineAssigned(t) && t.column.key === WORK_COLUMN_KEYS.DONE);
    const iAssigned = allMine.filter((t) => isIAssigned(t));

    return {
      timezone: WORK_TZ,
      today: today,
      buckets: {
        today: todayDue.map(ser),
        upcoming: upcoming.map(ser),
        overdue: overdue.map(ser),
        inProgress: inProgress.map(ser),
        pendingReview: pendingReview.map(ser),
        done: done.slice(0, 50).map(ser),
        assignedByMe: iAssigned.map(ser),
      },
      counts: {
        today: todayDue.length,
        upcoming: upcoming.length,
        overdue: overdue.length,
        inProgress: inProgress.length,
        pendingReview: pendingReview.length,
        done: done.length,
        assignedByMe: iAssigned.length,
      },
    };
  }

  // ── Employee profile stats ───────────────────────────────────────────────

  async employeeStats(organizationId: string, user: AuthUser, employeeId: string) {
    const scope = await resolveWorkScope(this.prisma, organizationId, user);
    if (
      scope.mode === 'ids' &&
      !scope.employeeIds.includes(employeeId) &&
      !canManageAnyTask(user.role)
    ) {
      if (user.employeeId !== employeeId) {
        throw new ForbiddenException('Không có quyền xem thống kê nhân viên này');
      }
    }
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId },
      select: { id: true, name: true, departmentId: true, department: { select: { name: true } } },
    });
    if (!emp) throw new NotFoundException('Không tìm thấy nhân viên');

    const today = vnDateString();

    // Tasks assigned to employee
    const asAssignee = await this.prisma.workTask.findMany({
      where: {
        organizationId,
        deletedAt: null,
        isArchived: false,
        isRecurrenceTemplate: false,
        assignees: { some: { employeeId } },
      },
      include: {
        column: true,
        project: { select: { id: true, name: true } },
        timeLogs: true,
      },
      take: 500,
    });

    const snapshots: WorkloadTaskSnapshot[] = asAssignee.map((t) => ({
      columnKey: t.column.key,
      priority: t.priority,
      deadline: t.deadline ? vnDateString(t.deadline) : null,
      completedAt: t.completedAt?.toISOString() ?? null,
      estimatedMinutes: t.estimatedMinutes,
      actualMinutes: Math.round(t.timeLogs.reduce((s, l) => s + this.liveDuration(l), 0) / 60),
    }));

    const workload = computeWorkloadScore(snapshots, today);
    const projects = [...new Map(asAssignee.map((t) => [t.project.id, t.project])).values()];
    const inProgress = asAssignee.filter((t) =>
      [WORK_COLUMN_KEYS.IN_PROGRESS, WORK_COLUMN_KEYS.NEEDS_FIX].includes(t.column.key as never),
    );
    const overdue = asAssignee.filter(
      (t) =>
        t.deadline && vnDateString(t.deadline) < today && t.column.key !== WORK_COLUMN_KEYS.DONE,
    );
    const done = asAssignee.filter((t) => t.column.key === WORK_COLUMN_KEYS.DONE);

    return {
      employee: emp,
      timezone: WORK_TZ,
      today,
      counts: {
        inProgress: inProgress.length,
        overdue: overdue.length,
        done: done.length,
        total: asAssignee.length,
      },
      projects,
      workload,
      recent: asAssignee.slice(0, 30).map((t) => this.serializeLite(t, today)),
    };
  }

  // ── Calendar ─────────────────────────────────────────────────────────────

  async calendar(organizationId: string, user: AuthUser, q: { from: string; to: string }) {
    const scope = await resolveWorkScope(this.prisma, organizationId, user);
    const visibility = workTaskVisibilityWhere(scope, user);
    if (!q.from || !q.to) throw new BadRequestException('Cần from/to (YYYY-MM-DD)');
    const tasks = await this.prisma.workTask.findMany({
      where: {
        organizationId,
        deletedAt: null,
        isArchived: false,
        isRecurrenceTemplate: false,
        ...visibility,
        OR: [
          { deadline: { gte: new Date(q.from), lte: new Date(q.to) } },
          { startDate: { gte: new Date(q.from), lte: new Date(q.to) } },
        ],
      },
      include: {
        column: true,
        project: { select: { id: true, name: true } },
        assignees: { include: { employee: { select: { id: true, name: true } } } },
      },
      take: 500,
    });
    const today = vnDateString();
    return {
      timezone: WORK_TZ,
      from: q.from,
      to: q.to,
      events: tasks.map((t) => ({
        ...this.serializeLite(t, today),
        date: t.deadline
          ? vnDateString(t.deadline)
          : t.startDate
            ? vnDateString(t.startDate)
            : null,
      })),
    };
  }

  // ── Dashboard / reports ──────────────────────────────────────────────────

  async dashboard(
    organizationId: string,
    user: AuthUser,
    groupBy: 'project' | 'department' | 'employee' = 'project',
  ) {
    const scope = await resolveWorkScope(this.prisma, organizationId, user);
    const visibility = workTaskVisibilityWhere(scope, user);
    const today = vnDateString();
    const tasks = await this.prisma.workTask.findMany({
      where: {
        organizationId,
        deletedAt: null,
        isArchived: false,
        isRecurrenceTemplate: false,
        ...visibility,
      },
      include: {
        column: true,
        project: { select: { id: true, name: true } },
        assignees: {
          include: {
            employee: {
              select: {
                id: true,
                name: true,
                departmentId: true,
                department: { select: { id: true, name: true } },
              },
            },
          },
        },
        timeLogs: true,
      },
      take: 1000,
    });

    const summary = this.summarizeTasks(tasks, today);
    const groups: Array<{
      id: string;
      name: string;
      counts: ReturnType<WorkInsightsService['summarizeTasks']>;
      workload?: ReturnType<typeof computeWorkloadScore>;
    }> = [];

    if (groupBy === 'project') {
      const map = new Map<string, typeof tasks>();
      for (const t of tasks) {
        const list = map.get(t.projectId) ?? [];
        list.push(t);
        map.set(t.projectId, list);
      }
      for (const [id, list] of map) {
        groups.push({
          id,
          name: list[0]!.project.name,
          counts: this.summarizeTasks(list, today),
        });
      }
    } else if (groupBy === 'employee') {
      const map = new Map<string, { name: string; list: typeof tasks }>();
      for (const t of tasks) {
        for (const a of t.assignees) {
          const cur = map.get(a.employeeId) ?? { name: a.employee.name, list: [] };
          cur.list.push(t);
          map.set(a.employeeId, cur);
        }
      }
      for (const [id, { name, list }] of map) {
        const snaps: WorkloadTaskSnapshot[] = list.map((t) => ({
          columnKey: t.column.key,
          priority: t.priority,
          deadline: t.deadline ? vnDateString(t.deadline) : null,
          completedAt: t.completedAt?.toISOString() ?? null,
          estimatedMinutes: t.estimatedMinutes,
          actualMinutes: Math.round(t.timeLogs.reduce((s, l) => s + this.liveDuration(l), 0) / 60),
        }));
        groups.push({
          id,
          name,
          counts: this.summarizeTasks(list, today),
          workload: computeWorkloadScore(snaps, today),
        });
      }
    } else {
      const map = new Map<string, { name: string; list: typeof tasks }>();
      for (const t of tasks) {
        for (const a of t.assignees) {
          const depId = a.employee.departmentId || '__none__';
          const depName = a.employee.department?.name || 'Chưa gán phòng ban';
          const cur = map.get(depId) ?? { name: depName, list: [] };
          cur.list.push(t);
          map.set(depId, cur);
        }
      }
      for (const [id, { name, list }] of map) {
        groups.push({ id, name, counts: this.summarizeTasks(list, today) });
      }
    }

    return { timezone: WORK_TZ, today, summary, groupBy, groups };
  }

  async exportReport(organizationId: string, user: AuthUser, format: 'csv' | 'xlsx' = 'csv') {
    const dash = await this.dashboard(organizationId, user, 'employee');
    const columns = [
      'employee',
      'inProgress',
      'pendingReview',
      'overdue',
      'done',
      'onTimeRate',
      'workloadScore',
      'atRisk',
    ];
    const rows = dash.groups.map((g) => ({
      employee: g.name,
      inProgress: g.counts.inProgress,
      pendingReview: g.counts.pendingReview,
      overdue: g.counts.overdue,
      done: g.counts.done,
      onTimeRate: g.workload?.onTimeRate ?? '',
      workloadScore: g.workload?.score ?? '',
      atRisk: g.counts.atRisk,
    }));
    await this.audit(organizationId, user.employeeId, {
      action: 'EXPORT_REPORT',
      entityType: 'WorkReport',
      summary: `Xuất báo cáo ${format}`,
      metadata: { format, rows: rows.length },
    });
    if (format === 'xlsx') {
      return {
        contentType: 'application/vnd.ms-excel',
        filename: `work-report-${dash.today}.xls`,
        body: toSpreadsheetMl(rows, columns),
      };
    }
    return {
      contentType: 'text/csv; charset=utf-8',
      filename: `work-report-${dash.today}.csv`,
      body: toCsv(rows, columns),
    };
  }

  // ── Time tracking ────────────────────────────────────────────────────────

  async startTimer(organizationId: string, user: AuthUser, taskId: string) {
    if (!user.employeeId) throw new ForbiddenException('Tài khoản chưa gắn nhân viên');
    await this.assertTaskWrite(organizationId, user, taskId);
    // pause any running of this user
    const running = await this.prisma.workTimeLog.findMany({
      where: {
        organizationId,
        employeeId: user.employeeId,
        status: 'RUNNING',
      },
    });
    for (const r of running) {
      const dur = this.liveDuration(r);
      await this.prisma.workTimeLog.update({
        where: { id: r.id },
        data: { status: 'PAUSED', durationSeconds: dur, endedAt: new Date() },
      });
    }
    const log = await this.prisma.workTimeLog.create({
      data: {
        organizationId,
        taskId,
        employeeId: user.employeeId,
        status: 'RUNNING',
        startedAt: new Date(),
        durationSeconds: 0,
      },
    });
    await this.audit(organizationId, user.employeeId, {
      action: 'TIME_START',
      entityType: 'WorkTimeLog',
      entityId: log.id,
      taskId,
      summary: 'Bắt đầu đếm giờ',
    });
    return log;
  }

  async pauseTimer(organizationId: string, user: AuthUser, taskId: string) {
    if (!user.employeeId) throw new ForbiddenException('Tài khoản chưa gắn nhân viên');
    await this.assertTaskWrite(organizationId, user, taskId);
    const running = await this.prisma.workTimeLog.findFirst({
      where: {
        organizationId,
        taskId,
        employeeId: user.employeeId,
        status: 'RUNNING',
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!running) throw new BadRequestException('Không có timer đang chạy');
    const dur = this.liveDuration(running);
    const log = await this.prisma.workTimeLog.update({
      where: { id: running.id },
      data: { status: 'PAUSED', durationSeconds: dur, endedAt: new Date() },
    });
    await this.audit(organizationId, user.employeeId, {
      action: 'TIME_PAUSE',
      entityType: 'WorkTimeLog',
      entityId: log.id,
      taskId,
      summary: 'Tạm dừng timer',
      metadata: { durationSeconds: dur },
    });
    return log;
  }

  async stopTimer(organizationId: string, user: AuthUser, taskId: string) {
    if (!user.employeeId) throw new ForbiddenException('Tài khoản chưa gắn nhân viên');
    await this.assertTaskWrite(organizationId, user, taskId);
    const open = await this.prisma.workTimeLog.findFirst({
      where: {
        organizationId,
        taskId,
        employeeId: user.employeeId,
        status: { in: ['RUNNING', 'PAUSED'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!open) throw new BadRequestException('Không có timer để kết thúc');
    const dur = this.liveDuration(open);
    const log = await this.prisma.workTimeLog.update({
      where: { id: open.id },
      data: { status: 'STOPPED', durationSeconds: dur, endedAt: new Date() },
    });
    await this.audit(organizationId, user.employeeId, {
      action: 'TIME_STOP',
      entityType: 'WorkTimeLog',
      entityId: log.id,
      taskId,
      summary: 'Kết thúc timer',
      metadata: { durationSeconds: dur },
    });
    return log;
  }

  async manualTime(
    organizationId: string,
    user: AuthUser,
    taskId: string,
    dto: { durationMinutes: number; note?: string; startedAt?: string },
  ) {
    if (!user.employeeId) throw new ForbiddenException('Tài khoản chưa gắn nhân viên');
    await this.assertTaskWrite(organizationId, user, taskId);
    if (!dto.durationMinutes || dto.durationMinutes <= 0) {
      throw new BadRequestException('durationMinutes phải > 0');
    }
    const startedAt = dto.startedAt ? new Date(dto.startedAt) : new Date();
    const durationSeconds = Math.round(dto.durationMinutes * 60);
    const endedAt = new Date(startedAt.getTime() + durationSeconds * 1000);
    const log = await this.prisma.workTimeLog.create({
      data: {
        organizationId,
        taskId,
        employeeId: user.employeeId,
        status: 'MANUAL',
        startedAt,
        endedAt,
        durationSeconds,
        note: dto.note?.slice(0, 500) || null,
      },
    });
    await this.audit(organizationId, user.employeeId, {
      action: 'TIME_MANUAL',
      entityType: 'WorkTimeLog',
      entityId: log.id,
      taskId,
      summary: `Nhập thủ công ${dto.durationMinutes} phút`,
    });
    return log;
  }

  async listTimeLogs(organizationId: string, user: AuthUser, taskId: string) {
    const scope = await resolveWorkScope(this.prisma, organizationId, user);
    const task = await this.prisma.workTask.findFirst({
      where: { id: taskId, organizationId, deletedAt: null },
      include: { assignees: true, watchers: true },
    });
    if (!task) throw new NotFoundException('Không tìm thấy công việc');
    this.assertVisible(user, scope, task);
    return this.prisma.workTimeLog.findMany({
      where: { organizationId, taskId },
      include: { employee: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  // ── Recurrence ───────────────────────────────────────────────────────────

  /**
   * Materialize upcoming occurrences for templates — skips existing occurrence keys.
   */
  async materializeRecurrences(organizationId?: string) {
    const today = vnDateString();
    const templates = await this.prisma.workTask.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        deletedAt: null,
        isRecurrenceTemplate: true,
        recurrenceRule: { in: ['DAILY', 'WEEKLY', 'MONTHLY'] },
      },
      include: {
        assignees: true,
        watchers: true,
        checklist: true,
        column: true,
      },
      take: 200,
    });

    let created = 0;
    for (const tpl of templates) {
      const rule = (tpl.recurrenceRule || 'WEEKLY') as 'DAILY' | 'WEEKLY' | 'MONTHLY';
      const until = tpl.recurrenceUntil ? vnDateString(tpl.recurrenceUntil) : null;
      const seriesId = tpl.recurrenceSeriesId || tpl.id;
      const dates = nextOccurrenceDates(rule, tpl.recurrenceInterval || 1, today, 7, until);
      const defaultCol = await this.prisma.workBoardColumn.findFirst({
        where: {
          projectId: tpl.projectId,
          key: { in: [WORK_COLUMN_KEYS.NEW, WORK_COLUMN_KEYS.ASSIGNED] },
        },
        orderBy: { sortOrder: 'asc' },
      });
      if (!defaultCol) continue;

      for (const dateStr of dates) {
        const key = occurrenceKey(seriesId, dateStr);
        try {
          await this.prisma.workTask.create({
            data: {
              organizationId: tpl.organizationId,
              projectId: tpl.projectId,
              columnId: defaultCol.id,
              title: tpl.title,
              description: tpl.description,
              assignerId: tpl.assignerId,
              createdById: tpl.createdById,
              startDate: new Date(dateStr),
              deadline: new Date(dateStr),
              priority: tpl.priority,
              labels: tpl.labels,
              estimatedMinutes: tpl.estimatedMinutes,
              recurrenceRule: null,
              isRecurrenceTemplate: false,
              recurrenceSeriesId: seriesId,
              recurrenceOccurrenceKey: key,
              assignees: {
                create: tpl.assignees.map((a) => ({ employeeId: a.employeeId })),
              },
              watchers: {
                create: tpl.watchers.map((w) => ({ employeeId: w.employeeId })),
              },
              checklist: {
                create: tpl.checklist.map((c, i) => ({
                  title: c.title,
                  isDone: false,
                  sortOrder: c.sortOrder ?? i,
                })),
              },
            },
          });
          created += 1;
        } catch (e) {
          // unique violation = already exists (no duplicate)
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            continue;
          }
          this.logger.warn(`recurrence skip ${key}: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
    return { created, templates: templates.length, today, timezone: WORK_TZ };
  }

  // ── Reminders (VN timezone) ──────────────────────────────────────────────

  @Cron('*/15 * * * *', { timeZone: WORK_TZ })
  async cronReminders() {
    try {
      await this.sendDeadlineReminders();
      await this.sendOverdueNotifications();
      await this.materializeRecurrences();
    } catch (e) {
      this.logger.error(`cronReminders: ${e instanceof Error ? e.message : e}`);
    }
  }

  async sendDeadlineReminders() {
    const today = vnDateString();
    const d1 = (() => {
      const x = new Date(`${today}T00:00:00+07:00`);
      x.setUTCDate(x.getUTCDate() + 1);
      return vnDateString(x);
    })();
    const tasks = await this.prisma.workTask.findMany({
      where: {
        deletedAt: null,
        isArchived: false,
        isRecurrenceTemplate: false,
        deadline: { gte: new Date(today), lte: new Date(d1) },
        column: { key: { not: WORK_COLUMN_KEYS.DONE } },
        OR: [
          { lastReminderSentAt: null },
          { lastReminderSentAt: { lt: new Date(`${today}T00:00:00+07:00`) } },
        ],
      },
      include: { assignees: true, column: true },
      take: 300,
    });
    for (const t of tasks) {
      const recipients = [
        t.assignerId,
        t.createdById,
        ...t.assignees.map((a) => a.employeeId),
      ].filter(Boolean) as string[];
      await this.collab.notify(t.organizationId, recipients, {
        type: 'DEADLINE_REMINDER',
        title: `Sắp đến hạn: ${t.title}`,
        body: `Deadline ${vnDateString(t.deadline!)} (timezone ${WORK_TZ})`,
        taskId: t.id,
        projectId: t.projectId,
      });
      await this.prisma.workTask.update({
        where: { id: t.id },
        data: { lastReminderSentAt: new Date() },
      });
      await this.audit(t.organizationId, null, {
        action: 'DEADLINE_REMINDER',
        entityType: 'WorkTask',
        entityId: t.id,
        taskId: t.id,
        projectId: t.projectId,
        summary: 'Nhắc deadline',
      });
    }
    return { sent: tasks.length };
  }

  async sendOverdueNotifications() {
    const today = vnDateString();
    const tasks = await this.prisma.workTask.findMany({
      where: {
        deletedAt: null,
        isArchived: false,
        isRecurrenceTemplate: false,
        deadline: { lt: new Date(today) },
        column: { key: { not: WORK_COLUMN_KEYS.DONE } },
        OR: [
          { lastOverdueNotifiedAt: null },
          { lastOverdueNotifiedAt: { lt: new Date(`${today}T00:00:00+07:00`) } },
        ],
      },
      include: { assignees: true },
      take: 300,
    });
    for (const t of tasks) {
      const recipients = [
        t.assignerId,
        t.createdById,
        ...t.assignees.map((a) => a.employeeId),
      ].filter(Boolean) as string[];
      await this.collab.notify(t.organizationId, recipients, {
        type: 'OVERDUE',
        title: `Quá hạn: ${t.title}`,
        body: `Deadline ${vnDateString(t.deadline!)} đã qua (${WORK_TZ})`,
        taskId: t.id,
        projectId: t.projectId,
      });
      await this.prisma.workTask.update({
        where: { id: t.id },
        data: { lastOverdueNotifiedAt: new Date() },
      });
      await this.audit(t.organizationId, null, {
        action: 'OVERDUE_NOTIFY',
        entityType: 'WorkTask',
        entityId: t.id,
        taskId: t.id,
        projectId: t.projectId,
        summary: 'Thông báo quá hạn',
      });
    }
    return { sent: tasks.length };
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private summarizeTasks(
    tasks: Array<{
      column: { key: string };
      deadline: Date | null;
      progress: number;
      completedAt?: Date | null;
    }>,
    today: string,
  ) {
    let inProgress = 0;
    let pendingReview = 0;
    let overdue = 0;
    let done = 0;
    let doneOnTime = 0;
    let doneWithDeadline = 0;
    let atRisk = 0;
    for (const t of tasks) {
      const key = t.column.key;
      if (key === WORK_COLUMN_KEYS.DONE) {
        done += 1;
        if (t.deadline) {
          doneWithDeadline += 1;
          const completedDay = t.completedAt ? vnDateString(t.completedAt) : today;
          if (completedDay <= vnDateString(t.deadline)) doneOnTime += 1;
        }
        continue;
      }
      if (key === WORK_COLUMN_KEYS.IN_PROGRESS || key === WORK_COLUMN_KEYS.NEEDS_FIX) {
        inProgress += 1;
      }
      if (key === WORK_COLUMN_KEYS.PENDING_REVIEW) pendingReview += 1;
      const dl = t.deadline ? vnDateString(t.deadline) : null;
      if (dl && dl < today) overdue += 1;
      const risk = classifyRisk(dl, key, today, t.progress);
      if (risk === 'AT_RISK') atRisk += 1;
    }
    return {
      total: tasks.length,
      inProgress,
      pendingReview,
      overdue,
      done,
      doneOnTime,
      onTimeRate:
        doneWithDeadline > 0 ? Math.round((doneOnTime / doneWithDeadline) * 1000) / 10 : null,
      atRisk,
    };
  }

  private serializeLite(
    t: {
      id: string;
      title: string;
      projectId: string;
      columnId: string;
      priority: string;
      progress: number;
      deadline: Date | null;
      startDate?: Date | null;
      estimatedMinutes?: number | null;
      completedAt?: Date | null;
      column: { key: string; name: string };
      project?: { id: string; name: string };
      assignees?: Array<{ employee: { id: string; name: string } }>;
    },
    today: string,
  ) {
    const deadline = t.deadline ? vnDateString(t.deadline) : null;
    return {
      id: t.id,
      title: t.title,
      projectId: t.projectId,
      project: t.project,
      columnId: t.columnId,
      columnKey: t.column.key,
      columnName: t.column.name,
      priority: t.priority,
      progress: t.progress,
      deadline,
      startDate: t.startDate ? vnDateString(t.startDate) : null,
      estimatedMinutes: t.estimatedMinutes ?? null,
      completedAt: t.completedAt,
      risk: classifyRisk(deadline, t.column.key, today, t.progress),
      assignees: (t.assignees ?? []).map((a) => a.employee),
    };
  }

  private liveDuration(log: {
    status: string;
    startedAt: Date | null;
    durationSeconds: number;
    endedAt: Date | null;
  }): number {
    if (log.status === 'RUNNING' && log.startedAt) {
      const base = log.durationSeconds || 0;
      // when restarted after pause durationSeconds holds accumulated; startedAt reset on start
      return base + Math.max(0, Math.floor((Date.now() - log.startedAt.getTime()) / 1000));
    }
    return log.durationSeconds || 0;
  }

  private async assertTaskWrite(organizationId: string, user: AuthUser, taskId: string) {
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
    return task;
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
}
