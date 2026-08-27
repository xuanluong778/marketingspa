'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Archive,
  Copy,
  GripVertical,
  LayoutGrid,
  ListTodo,
  BarChart3,
  CalendarDays,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/page-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useWorkProjects,
  useWorkProject,
  useCreateWorkProject,
  useCreateWorkTask,
  useUpdateWorkTask,
  useMoveWorkTask,
  useCopyWorkTask,
  useArchiveWorkTask,
  useSoftDeleteWorkTask,
} from '@/hooks/use-work-management';
import { useHrmEmployees } from '@/hooks/use-hrm';
import { PRIORITY_LABELS, type WorkTask } from '@/types/work-management';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';
import { useT } from '@/i18n/i18n-provider';
import {
  WorkDocumentsPanel,
  WorkNotificationsBell,
  WorkTaskDetailDialog,
} from '@/components/work-management/work-task-collab';

export default function WorkManagementPage() {
  const t = useT();
  return (
    <Suspense fallback={<LoadingState message={t('work.loadingWork')} />}>
      <WorkManagementBoard />
    </Suspense>
  );
}

function WorkManagementBoard() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const taskIdParam = searchParams.get('taskId');

  const projectsQ = useWorkProjects();
  const createProject = useCreateWorkProject();
  const createTask = useCreateWorkTask();
  const updateTask = useUpdateWorkTask();
  const moveTask = useMoveWorkTask();
  const copyTask = useCopyWorkTask();
  const archiveTask = useArchiveWorkTask();
  const deleteTask = useSoftDeleteWorkTask();
  const employeesQ = useHrmEmployees({ pageSize: 100 });

  const [projectId, setProjectId] = useState<string | null>(null);
  const projectQ = useWorkProject(projectId);
  const [query, setQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropCol, setDropCol] = useState<string | null>(null);

  const [projectDialog, setProjectDialog] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');

  const [taskDialog, setTaskDialog] = useState(false);
  const [editTask, setEditTask] = useState<WorkTask | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [detailSnapshot, setDetailSnapshot] = useState<WorkTask | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    assignerId: '',
    assigneeIds: [] as string[],
    watcherIds: [] as string[],
    startDate: '',
    deadline: '',
    priority: 'MEDIUM',
    labels: '',
    progress: 0,
    checklistText: '',
  });

  const projects = useMemo(() => projectsQ.data ?? [], [projectsQ.data]);
  const employees = employeesQ.data?.items ?? [];
  const firstProjectId = projects[0]?.id;

  useEffect(() => {
    if (!projectId && firstProjectId) setProjectId(firstProjectId);
  }, [firstProjectId, projectId]);

  const setTaskIdInUrl = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set('taskId', id);
      else params.delete('taskId');
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const openTaskDetail = useCallback(
    (task: WorkTask) => {
      setDetailSnapshot(task);
      setDetailTaskId(task.id);
      if (task.projectId) setProjectId(task.projectId);
      setTaskIdInUrl(task.id);
    },
    [setTaskIdInUrl],
  );

  const openTaskDetailById = useCallback(
    (id: string, nextProjectId?: string | null) => {
      setDetailTaskId(id);
      if (nextProjectId) setProjectId(nextProjectId);
      const found = (projectQ.data?.tasks ?? []).find((t) => t.id === id);
      setDetailSnapshot(found ?? null);
      setTaskIdInUrl(id);
    },
    [projectQ.data?.tasks, setTaskIdInUrl],
  );

  const closeTaskDetail = useCallback(() => {
    setDetailTaskId(null);
    setDetailSnapshot(null);
    setTaskIdInUrl(null);
  }, [setTaskIdInUrl]);

  // Deep link ?taskId= + browser back/forward
  useEffect(() => {
    if (taskIdParam) {
      setDetailTaskId(taskIdParam);
      const found = (projectQ.data?.tasks ?? []).find((t) => t.id === taskIdParam);
      if (found) {
        setDetailSnapshot(found);
        if (found.projectId) setProjectId(found.projectId);
      }
    } else {
      setDetailTaskId(null);
      setDetailSnapshot(null);
    }
  }, [taskIdParam, projectQ.data?.tasks]);

  const columns = useMemo(() => projectQ.data?.columns ?? [], [projectQ.data?.columns]);
  const tasks = useMemo(() => {
    let list = projectQ.data?.tasks ?? [];
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description || '').toLowerCase().includes(q) ||
          t.labels.some((l) => l.toLowerCase().includes(q)),
      );
    }
    if (priorityFilter !== 'all') {
      list = list.filter((t) => t.priority === priorityFilter);
    }
    return list;
  }, [projectQ.data?.tasks, query, priorityFilter]);

  const tasksByColumn = useMemo(() => {
    const map: Record<string, WorkTask[]> = {};
    for (const c of columns) map[c.id] = [];
    for (const t of tasks) {
      if (!map[t.columnId]) map[t.columnId] = [];
      map[t.columnId]!.push(t);
    }
    for (const id of Object.keys(map)) {
      map[id]!.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return map;
  }, [columns, tasks]);

  function openCreateTask(columnId?: string) {
    setEditTask(null);
    setForm({
      title: '',
      description: '',
      assignerId: '',
      assigneeIds: [],
      watcherIds: [],
      startDate: '',
      deadline: '',
      priority: 'MEDIUM',
      labels: '',
      progress: 0,
      checklistText: '',
    });
    setTaskDialog(true);
    if (columnId) {
      (window as unknown as { __wmCol?: string }).__wmCol = columnId;
    }
  }

  function openEditTask(task: WorkTask) {
    setEditTask(task);
    setForm({
      title: task.title,
      description: task.description || '',
      assignerId: task.assignerId || '',
      assigneeIds: task.assignees.map((a) => a.id),
      watcherIds: task.watchers.map((w) => w.id),
      startDate: task.startDate || '',
      deadline: task.deadline || '',
      priority: task.priority || 'MEDIUM',
      labels: task.labels.join(', '),
      progress: task.progress,
      checklistText: task.checklist.map((c) => `${c.isDone ? '[x] ' : ''}${c.title}`).join('\n'),
    });
    setTaskDialog(true);
  }

  function saveTask() {
    if (!projectId || !form.title.trim()) return;
    const labels = form.labels
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const checklist = form.checklistText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, i) => {
        const done = /^\[x\]\s*/i.test(line);
        return {
          title: line.replace(/^\[x\]\s*/i, ''),
          isDone: done,
          sortOrder: i,
        };
      });

    if (editTask) {
      updateTask.mutate(
        {
          id: editTask.id,
          title: form.title.trim(),
          description: form.description,
          assignerId: form.assignerId || null,
          assigneeIds: form.assigneeIds,
          watcherIds: form.watcherIds,
          startDate: form.startDate || null,
          deadline: form.deadline || null,
          priority: form.priority,
          labels,
          progress: form.progress,
          checklist,
        },
        { onSuccess: () => setTaskDialog(false) },
      );
    } else {
      createTask.mutate(
        {
          projectId,
          columnId: (window as unknown as { __wmCol?: string }).__wmCol,
          title: form.title.trim(),
          description: form.description || undefined,
          assignerId: form.assignerId || undefined,
          assigneeIds: form.assigneeIds,
          watcherIds: form.watcherIds,
          startDate: form.startDate || undefined,
          deadline: form.deadline || undefined,
          priority: form.priority,
          labels,
          progress: form.progress,
          checklist,
        },
        {
          onSuccess: () => {
            setTaskDialog(false);
            (window as unknown as { __wmCol?: string }).__wmCol = undefined;
          },
        },
      );
    }
  }

  function onDrop(columnId: string) {
    if (!draggingId) return;
    const list = tasksByColumn[columnId] ?? [];
    const from = tasks.find((t) => t.id === draggingId);
    const sameCol = from?.columnId === columnId;
    const sortOrder = sameCol ? list.findIndex((t) => t.id === draggingId) : list.length;
    moveTask.mutate({
      id: draggingId,
      columnId,
      sortOrder: sortOrder < 0 ? list.length : sortOrder,
    });
    setDraggingId(null);
    setDropCol(null);
  }

  if (projectsQ.isLoading) return <LoadingState message={t('work.loadingProjects')} />;
  if (projectsQ.isError) return <ErrorState onRetry={projectsQ.refetch} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('work.title')}
        description={t('work.description')}
      />

      <div className="flex flex-wrap gap-2">
        <Button variant="default" size="sm" asChild>
          <Link href="/work-management">
            <LayoutGrid className="h-3.5 w-3.5 mr-1" /> Kanban
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/work-management/my">
            <ListTodo className="h-3.5 w-3.5 mr-1" /> Việc của tôi
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/work-management/dashboard">
            <BarChart3 className="h-3.5 w-3.5 mr-1" /> Dashboard
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/work-management/calendar">
            <CalendarDays className="h-3.5 w-3.5 mr-1" /> Lịch
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="space-y-1 min-w-[200px] flex-1">
          <Label>Dự án</Label>
          <Select value={projectId ?? ''} onValueChange={(v) => setProjectId(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn dự án" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {p._count?.tasks != null ? ` (${p._count.tasks})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <WorkNotificationsBell onOpenTask={openTaskDetailById} />
        <Button
          variant="outline"
          onClick={() => {
            setProjectName('');
            setProjectDesc('');
            setProjectDialog(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> {t('work.createProject')}
        </Button>
        <Button disabled={!projectId} onClick={() => openCreateTask()}>
          <Plus className="h-4 w-4 mr-1" /> {t('work.createTaskTitle')}
        </Button>
      </div>

      {projectId && <WorkDocumentsPanel projectId={projectId} />}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t('work.filterPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t('work.priority')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('work.allPriorities')}</SelectItem>
            {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!projectId && (
        <EmptyState title={t('work.noProjectSelected')} description={t('work.noProjectSelectedDesc')} />
      )}

      {projectId && projectQ.isLoading && <LoadingState />}
      {projectId && projectQ.isError && <ErrorState onRetry={projectQ.refetch} />}

      {projectId && projectQ.data && (
        <div className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1 min-h-[min(70vh,640px)]">
          {columns.map((col) => {
            const items = tasksByColumn[col.id] ?? [];
            return (
              <div
                key={col.id}
                className={cn(
                  'flex-shrink-0 w-[min(85vw,280px)] sm:w-[300px] rounded-xl border bg-muted/30 flex flex-col max-h-[min(70vh,640px)]',
                  dropCol === col.id && 'ring-2 ring-primary',
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropCol(col.id);
                }}
                onDragLeave={() => setDropCol(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  onDrop(col.id);
                }}
              >
                <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b bg-background/60 rounded-t-xl">
                  <div>
                    <p className="text-sm font-semibold">{col.name}</p>
                    <p className="text-[11px] text-muted-foreground">{items.length} việc</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => openCreateTask(col.id)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {items.map((task, index) => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => {
                        setDraggingId(task.id);
                        e.dataTransfer.setData('text/plain', task.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDropCol(null);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!draggingId || draggingId === task.id) return;
                        moveTask.mutate({
                          id: draggingId,
                          columnId: col.id,
                          sortOrder: index,
                        });
                        setDraggingId(null);
                        setDropCol(null);
                      }}
                      className={cn(
                        'rounded-lg border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing touch-manipulation',
                        draggingId === task.id && 'opacity-50',
                      )}
                    >
                      <div className="flex items-start gap-1">
                        <GripVertical className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                        <div
                          className="min-w-0 flex-1 cursor-pointer"
                          onClick={() => openTaskDetail(task)}
                        >
                          <p className="text-sm font-medium leading-snug">{task.title}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            <Badge variant="outline" className="text-[10px]">
                              {PRIORITY_LABELS[task.priority] || task.priority}
                            </Badge>
                            {task.labels.slice(0, 3).map((l) => (
                              <Badge key={l} variant="secondary" className="text-[10px]">
                                {l}
                              </Badge>
                            ))}
                          </div>
                          {(task.assignees.length > 0 || task.deadline) && (
                            <p className="mt-1.5 text-[11px] text-muted-foreground line-clamp-1">
                              {task.assignees.map((a) => a.name).join(', ') || '—'}
                              {task.deadline ? ` · đến ${task.deadline}` : ''}
                            </p>
                          )}
                          {task.progress > 0 && (
                            <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full bg-emerald-500"
                                style={{ width: `${task.progress}%` }}
                              />
                            </div>
                          )}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openTaskDetail(task)}>
                              Chi tiết
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEditTask(task)}>
                              Sửa
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => copyTask.mutate(task.id)}>
                              <Copy className="h-3.5 w-3.5 mr-2" /> Sao chép
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => archiveTask.mutate(task.id)}>
                              <Archive className="h-3.5 w-3.5 mr-2" /> Lưu trữ
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => {
                                if (window.confirm('Xóa mềm công việc này?')) {
                                  deleteTask.mutate(task.id);
                                }
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Xóa
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create project */}
      <Dialog open={projectDialog} onOpenChange={setProjectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('work.createProjectTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Tên dự án</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Mô tả</Label>
              <Textarea
                rows={3}
                value={projectDesc}
                onChange={(e) => setProjectDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectDialog(false)}>
              Huỷ
            </Button>
            <Button
              disabled={!projectName.trim() || createProject.isPending}
              onClick={() =>
                createProject.mutate(
                  { name: projectName.trim(), description: projectDesc || undefined },
                  {
                    onSuccess: (p) => {
                      setProjectDialog(false);
                      setProjectId(p.id);
                    },
                  },
                )
              }
            >
              Tạo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task form */}
      <Dialog open={taskDialog} onOpenChange={setTaskDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTask ? 'Sửa công việc' : 'Tạo công việc'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Tiêu đề</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Mô tả</Label>
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Người giao</Label>
                <Select
                  value={form.assignerId || '__none__'}
                  onValueChange={(v) => setForm({ ...form, assignerId: v === '__none__' ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Ưu tiên</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm({ ...form, priority: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Ngày bắt đầu</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Deadline</Label>
                <Input
                  type="date"
                  value={form.deadline}
                  onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Người thực hiện (giữ Ctrl/Cmd để chọn nhiều)</Label>
              <select
                multiple
                className="w-full min-h-[88px] rounded-md border bg-background px-2 py-1 text-sm"
                value={form.assigneeIds}
                onChange={(e) =>
                  setForm({
                    ...form,
                    assigneeIds: Array.from(e.target.selectedOptions).map((o) => o.value),
                  })
                }
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Người theo dõi</Label>
              <select
                multiple
                className="w-full min-h-[72px] rounded-md border bg-background px-2 py-1 text-sm"
                value={form.watcherIds}
                onChange={(e) =>
                  setForm({
                    ...form,
                    watcherIds: Array.from(e.target.selectedOptions).map((o) => o.value),
                  })
                }
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Nhãn (phân tách bằng dấu phẩy)</Label>
              <Input
                value={form.labels}
                onChange={(e) => setForm({ ...form, labels: e.target.value })}
                placeholder="Marketing, Q3"
              />
            </div>
            <div className="space-y-1">
              <Label>Tiến độ ({form.progress}%)</Label>
              <Input
                type="range"
                min={0}
                max={100}
                value={form.progress}
                onChange={(e) => setForm({ ...form, progress: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <Label>Checklist (mỗi dòng 1 mục; `[x] ` = đã xong)</Label>
              <Textarea
                rows={4}
                value={form.checklistText}
                onChange={(e) => setForm({ ...form, checklistText: e.target.value })}
                placeholder={'Chuẩn bị slide\n[x] Gửi draft'}
              />
            </div>
            {editTask && (
              <p className="text-xs text-muted-foreground">
                Cập nhật lần cuối: {formatDateTime(editTask.updatedAt)}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskDialog(false)}>
              Huỷ
            </Button>
            <Button
              disabled={!form.title.trim() || createTask.isPending || updateTask.isPending}
              onClick={saveTask}
            >
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WorkTaskDetailDialog
        taskId={detailTaskId}
        initialTask={detailSnapshot}
        open={!!detailTaskId}
        onOpenChange={(v) => {
          if (!v) closeTaskDetail();
        }}
        employees={employees}
      />
    </div>
  );
}
