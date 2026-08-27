'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlignLeft,
  Bold,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  Circle,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Send,
  Smile,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useWorkTask,
  useUpdateWorkTask,
  useWorkComments,
  useCreateWorkComment,
  useDeleteWorkComment,
  useTaskFiles,
  useUploadTaskFile,
  useDeleteWorkFile,
  useSubmitReview,
  useApproveTask,
  useRequestFix,
  useTaskStatusHistory,
  useTaskReviewEvents,
  useArchiveWorkTask,
  useCopyWorkTask,
} from '@/hooks/use-work-management';
import type { HrmEmployee } from '@/types/hrm';
import type {
  WorkAttachment,
  WorkChecklistItem,
  WorkTask,
  UpdateWorkTaskInput,
} from '@/types/work-management';
import { formatDateTime } from '@/lib/format';
import { apiDownload } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  appendAttachmentToDescription,
  commentBodyForAttachment,
  confirmDiscardUnsavedDescription,
  fileExtensionBadge,
  isDescriptionDirty,
  mergeActivityFeed,
  removeAttachmentFromDescription,
  type WorkChecklistDraftItem,
} from '@/lib/work-task-detail';
import {
  SelectedLabelChips,
  WorkTaskActionPopovers,
  type CardPopoverKey,
} from '@/components/work-management/work-task-card-popovers';
import { useT } from '@/i18n/i18n-provider';

const EMOJIS = ['✅', '👍', '👀', '🔥', '❗', '🎉', '📎', '🙏'];

function toChecklistDraft(items: WorkChecklistItem[] | undefined): WorkChecklistDraftItem[] {
  return (items ?? []).map((c, i) => ({
    id: c.id,
    title: c.title,
    isDone: c.isDone,
    sortOrder: c.sortOrder ?? i,
  }));
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

type PanelKey = null | 'files' | 'review';

export type WorkTaskDetailDialogProps = {
  taskId: string | null;
  initialTask?: WorkTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: HrmEmployee[];
};

export function WorkTaskDetailDialog({
  taskId,
  initialTask,
  open,
  onOpenChange,
  employees,
}: WorkTaskDetailDialogProps) {
  const t = useT();
  const taskQ = useWorkTask(open ? taskId : null);
  const task = taskQ.data ?? (initialTask?.id === taskId ? initialTask : null) ?? null;
  const updateTask = useUpdateWorkTask();
  const archiveTask = useArchiveWorkTask();
  const copyTask = useCopyWorkTask();

  const commentsQ = useWorkComments(open ? taskId : null);
  const filesQ = useTaskFiles(open ? taskId : null);
  const historyQ = useTaskStatusHistory(open ? taskId : null);
  const reviewsQ = useTaskReviewEvents(open ? taskId : null);
  const createComment = useCreateWorkComment(taskId || '');
  const deleteComment = useDeleteWorkComment();
  const uploadFile = useUploadTaskFile(taskId || '');
  const deleteFile = useDeleteWorkFile();
  const submitReview = useSubmitReview();
  const approve = useApproveTask();
  const requestFix = useRequestFix();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [savedDescription, setSavedDescription] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [checklist, setChecklist] = useState<WorkChecklistDraftItem[]>([]);
  const [checklistTitle, setChecklistTitle] = useState('Việc cần làm');
  const [showChecklist, setShowChecklist] = useState(false);
  const [newCheckItem, setNewCheckItem] = useState('');
  const [formSeededFor, setFormSeededFor] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelKey>(null);
  const [cardPopover, setCardPopover] = useState<CardPopoverKey>(null);
  const [showActivityDetail, setShowActivityDetail] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [customFieldsMsg, setCustomFieldsMsg] = useState(false);

  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [reviewNote, setReviewNote] = useState('');
  const [preview, setPreview] = useState<{ url: string; mime: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const commentsSectionRef = useRef<HTMLDivElement>(null);

  const seedForm = useCallback((t: WorkTask) => {
    setTitle(t.title);
    setDescription(t.description || '');
    setSavedDescription(t.description || '');
    setLabels([...(t.labels ?? [])]);
    setStartDate(t.startDate || '');
    setDeadline(t.deadline || '');
    setAssigneeIds(t.assignees?.map((a) => a.id) ?? []);
    setChecklist(toChecklistDraft(t.checklist));
    setShowChecklist((t.checklist?.length ?? 0) > 0);
    setFormSeededFor(t.id);
    setPanel(null);
    setCardPopover(null);
    setEditingTitle(false);
  }, []);

  useEffect(() => {
    if (!open || !task) return;
    if (formSeededFor !== task.id) seedForm(task);
  }, [open, task, formSeededFor, seedForm]);

  useEffect(() => {
    if (!open) {
      setFormSeededFor(null);
      setBody('');
      setReplyTo(null);
      setMentionIds([]);
      setReviewNote('');
      setPanel(null);
      setCardPopover(null);
      setShowActivityDetail(false);
      setCustomFieldsMsg(false);
      setShowChecklist(false);
      setChecklistTitle('Việc cần làm');
    }
  }, [open]);

  const dirty = isDescriptionDirty(savedDescription, description);
  const metaDirty =
    !!task &&
    (title !== task.title ||
      startDate !== (task.startDate || '') ||
      deadline !== (task.deadline || '') ||
      JSON.stringify(checklist.map((c) => ({ t: c.title, d: c.isDone }))) !==
        JSON.stringify((task.checklist ?? []).map((c) => ({ t: c.title, d: c.isDone }))));

  const requestClose = useCallback(
    (next: boolean) => {
      if (!next && (dirty || metaDirty)) {
        if (!confirmDiscardUnsavedDescription(true)) return;
      }
      onOpenChange(next);
    },
    [dirty, metaDirty, onOpenChange],
  );

  const isDone = task?.columnKey === 'DONE' || !!task?.completedAt;
  const assigneeList = employees.filter((e) => assigneeIds.includes(e.id));
  const primaryName =
    assigneeList[0]?.name || task?.assignees?.[0]?.name || task?.assigner?.name || 'Chưa gán';

  const activity = useMemo(
    () =>
      mergeActivityFeed({
        history: historyQ.data ?? [],
        reviews: reviewsQ.data ?? [],
      }),
    [historyQ.data, reviewsQ.data],
  );

  const doneCount = checklist.filter((c) => c.isDone).length;

  function toChecklistPayload(items: WorkChecklistDraftItem[]) {
    return items.map((c, i) => ({
      title: c.title,
      isDone: c.isDone,
      sortOrder: i,
    }));
  }

  function patchTask(
    partial: UpdateWorkTaskInput,
    opts?: { syncDesc?: boolean; onDone?: (t: WorkTask) => void },
  ) {
    if (!taskId) return;
    updateTask.mutate(
      { id: taskId, ...partial },
      {
        onSuccess: (updated) => {
          if (opts?.syncDesc) {
            setSavedDescription(updated.description || '');
            setDescription(updated.description || '');
          }
          if (partial.title !== undefined) setTitle(updated.title);
          opts?.onDone?.(updated);
        },
      },
    );
  }

  function saveAll(patch?: Partial<{ title: string; description: string }>) {
    if (!taskId) return;
    const nextTitle = (patch?.title ?? title).trim();
    if (!nextTitle) return;
    const nextDesc = patch?.description !== undefined ? patch.description : description;
    patchTask(
      {
        title: nextTitle,
        description: nextDesc.trim() || null,
        labels,
        startDate: startDate || null,
        deadline: deadline || null,
        assigneeIds,
        checklist: toChecklistPayload(checklist),
      },
      { syncDesc: true },
    );
  }

  function persistLabels(next: string[]) {
    setLabels(next);
    patchTask({ labels: next });
  }

  function persistAssignees(next: string[]) {
    setAssigneeIds(next);
    patchTask({ assigneeIds: next });
  }

  function persistChecklist(next: WorkChecklistDraftItem[]) {
    setChecklist(next);
    setShowChecklist(true);
    patchTask({ checklist: toChecklistPayload(next) });
  }

  function persistDates() {
    patchTask({
      startDate: startDate || null,
      deadline: deadline || null,
    });
  }

  function addChecklistFromPopover() {
    const name = checklistTitle.trim() || 'Việc cần làm';
    setChecklistTitle(name);
    setShowChecklist(true);
    setCardPopover(null);
    // Do not invent duplicate placeholder items; only reveal the editor.
  }

  function cancelDescription() {
    setDescription(savedDescription);
  }

  function wrapDesc(prefix: string, suffix = prefix) {
    const el = descRef.current;
    if (!el) {
      setDescription((d) => `${prefix}${d}${suffix}`);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = description.slice(start, end) || 'văn bản';
    const next = description.slice(0, start) + prefix + selected + suffix + description.slice(end);
    setDescription(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  }

  function postComment() {
    if (!body.trim() || !taskId) return;
    createComment.mutate(
      { body: body.trim(), parentId: replyTo || undefined, mentionIds },
      {
        onSuccess: () => {
          setBody('');
          setReplyTo(null);
          setMentionIds([]);
        },
      },
    );
  }

  async function openPreview(fileId: string, mime: string, name: string) {
    const { blob } = await apiDownload(`/work-management/files/${fileId}/download`);
    setPreview({ url: URL.createObjectURL(blob), mime, name });
  }

  async function downloadAttachment(f: WorkAttachment) {
    const { blob, filename } = await apiDownload(`/work-management/files/${f.id}/download`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || f.originalName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function insertFileIntoDescription(f: WorkAttachment, autoSave = true) {
    const next = appendAttachmentToDescription(description, f.originalName, f.id);
    setDescription(next);
    if (autoSave && next !== description) {
      patchTask({ description: next.trim() || null }, { syncDesc: true });
    }
  }

  function handleUploadFile(file: File) {
    setPanel('files');
    uploadFile.mutate(file, {
      onSuccess: (att) => {
        setDescription((prev) => {
          const next = appendAttachmentToDescription(prev, att.originalName, att.id);
          if (next !== prev) {
            // Persist outside React setState updater
            queueMicrotask(() => {
              patchTask({ description: next.trim() || null }, { syncDesc: true });
            });
          }
          return next;
        });
      },
    });
  }

  function commentAboutFile(f: WorkAttachment) {
    const text = commentBodyForAttachment(f.originalName, f.id);
    createComment.mutate(
      { body: text },
      {
        onSuccess: () => {
          setBody('');
          setReplyTo(null);
          commentsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          requestAnimationFrame(() => commentRef.current?.focus());
        },
      },
    );
  }

  function removeAttachment(f: WorkAttachment) {
    if (!window.confirm(`Loại bỏ file "${f.originalName}"?`)) return;
    deleteFile.mutate(f.id, {
      onSuccess: () => {
        setDescription((prev) => {
          const next = removeAttachmentFromDescription(prev, f.id, f.originalName);
          if (next !== prev) {
            queueMicrotask(() => {
              patchTask({ description: next.trim() || null }, { syncDesc: true });
            });
          }
          return next;
        });
      },
    });
  }

  function togglePanel(key: Exclude<PanelKey, null>) {
    setPanel((p) => (p === key ? null : key));
  }

  if (!taskId) return null;

  // Override global Input/Textarea dark theme (text-white on green) for this light modal
  const lightInput =
    'border-slate-200 bg-white text-black placeholder:text-slate-400 focus-visible:ring-slate-300 focus-visible:ring-offset-0 focus-visible:ring-offset-white';
  const lightTextarea =
    'border-slate-200 bg-white text-black placeholder:text-slate-400 focus-visible:ring-slate-300 focus-visible:ring-offset-0 focus-visible:ring-offset-white';

  function isOutsidePopover(target: EventTarget | null) {
    if (!(target instanceof Element)) return true;
    // Popover / menu portaled outside Dialog must not count as "outside"
    return !target.closest(
      '[data-radix-popper-content-wrapper], [data-slot="popover-content"], [data-radix-menu-content], [role="menu"], [role="dialog"][data-state="open"]',
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={requestClose}>
        <DialogContent
          className={cn(
            'flex max-h-[94vh] w-[min(1040px,calc(100vw-1rem))] max-w-[1040px] flex-col gap-0 overflow-hidden p-0',
            'border-slate-200 bg-white sm:rounded-xl dark:border-slate-800 dark:bg-slate-950',
            // Hide stock dialog close — custom top-right controls
            '[&>button]:hidden',
          )}
          onEscapeKeyDown={(e) => {
            if (cardPopover) {
              e.preventDefault();
              setCardPopover(null);
              return;
            }
            if (dirty || metaDirty) {
              if (!confirmDiscardUnsavedDescription(true)) e.preventDefault();
            }
          }}
          onInteractOutside={(e) => {
            if (!isOutsidePopover(e.target)) {
              e.preventDefault();
              return;
            }
            if (dirty || metaDirty) {
              if (!confirmDiscardUnsavedDescription(true)) e.preventDefault();
            }
          }}
          onPointerDownOutside={(e) => {
            if (!isOutsidePopover(e.target)) e.preventDefault();
            // Keep dialog open while a card popover is open
            if (cardPopover) e.preventDefault();
          }}
          onFocusOutside={(e) => {
            if (!isOutsidePopover(e.target)) e.preventDefault();
            if (cardPopover) e.preventDefault();
          }}
        >
          <DialogTitle className="sr-only">
            {title || task?.title || 'Chi tiết công việc'}
          </DialogTitle>

          {/* Top bar: assignee · actions */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex max-w-[min(100%,280px)] items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-900"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[11px] font-semibold text-white">
                    {initials(primaryName)}
                  </span>
                  <span className="truncate font-medium text-slate-800 dark:text-slate-100">
                    {primaryName}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {employees.slice(0, 40).map((emp) => {
                  const on = assigneeIds.includes(emp.id);
                  return (
                    <DropdownMenuItem
                      key={emp.id}
                      onClick={() => {
                        const next = on
                          ? assigneeIds.filter((x) => x !== emp.id)
                          : [...assigneeIds, emp.id];
                        persistAssignees(next);
                      }}
                    >
                      <span
                        className={cn(
                          'mr-2 h-2 w-2 rounded-full',
                          on ? 'bg-sky-500' : 'bg-slate-300',
                        )}
                      />
                      {emp.name}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 text-slate-700 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                title="File đính kèm"
                onClick={() => togglePanel('files')}
              >
                <ImageIcon className="h-4 w-4" strokeWidth={2.25} />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-slate-700 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                    aria-label="Thêm tùy chọn"
                  >
                    <MoreHorizontal className="h-4 w-4" strokeWidth={2.25} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => taskId && copyTask.mutate(taskId)}>
                    Sao chép
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => taskId && archiveTask.mutate(taskId)}>
                    Lưu trữ
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => togglePanel('review')}>
                    Duyệt / gửi duyệt
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 text-slate-700 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                aria-label="Đóng"
                onClick={() => requestClose(false)}
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </Button>
            </div>
          </div>

          {taskQ.isError && (
            <div className="bg-destructive/10 px-4 py-2 text-sm text-destructive">
              Không tải được công việc.
            </div>
          )}

          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,1fr)]">
            {/* LEFT */}
            <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-4 lg:border-r lg:border-slate-100 dark:lg:border-slate-800">
              {/* Title row */}
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  className="mt-1 shrink-0 text-slate-400 hover:text-emerald-600"
                  title={isDone ? 'Đã hoàn thành' : 'Chưa hoàn thành'}
                  onClick={() => {
                    /* status is column-driven; visual only */
                  }}
                >
                  {isDone ? (
                    <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                  ) : (
                    <Circle className="h-6 w-6" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  {editingTitle ? (
                    <Input
                      autoFocus
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      onBlur={() => {
                        setEditingTitle(false);
                        if (title.trim() && title !== task?.title) saveAll({ title });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      className={cn('h-auto text-xl font-semibold leading-snug', lightInput)}
                    />
                  ) : (
                    <button
                      type="button"
                      className="w-full text-left text-xl font-semibold leading-snug text-slate-900 hover:text-sky-800 dark:text-slate-50"
                      onClick={() => setEditingTitle(true)}
                    >
                      {title || task?.title || t('work.loadingTask')}
                    </button>
                  )}
                  {task?.columnName && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      trong danh sách{' '}
                      <span className="font-medium text-slate-700">{task.columnName}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Action chips + popovers (Thêm / Nhãn / Ngày / Checklist / Thành viên) */}
              <WorkTaskActionPopovers
                popover={cardPopover}
                onPopoverChange={setCardPopover}
                labels={labels}
                onLabelsChange={persistLabels}
                startDate={startDate}
                deadline={deadline}
                onStartDateChange={setStartDate}
                onDeadlineChange={setDeadline}
                onSaveDates={persistDates}
                checklistTitle={checklistTitle}
                onChecklistTitleChange={setChecklistTitle}
                onAddChecklist={addChecklistFromPopover}
                employees={employees}
                assigneeIds={assigneeIds}
                onAssigneesChange={persistAssignees}
                onOpenFiles={() => setPanel('files')}
                onOpenCustomFields={() => setCustomFieldsMsg(true)}
              />

              <SelectedLabelChips labels={labels} />

              {customFieldsMsg && (
                <p className="pl-9 text-xs text-slate-500">
                  Trường tùy chỉnh: đang dùng nhãn/checklist hiện có. Đóng thông báo này khi xong.
                  <button
                    type="button"
                    className="ml-2 underline"
                    onClick={() => setCustomFieldsMsg(false)}
                  >
                    Ẩn
                  </button>
                </p>
              )}

              {/* Checklist body */}
              {(showChecklist || checklist.length > 0) && (
                <div className="ml-9 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                    <CheckSquare className="h-4 w-4 text-slate-500" />
                    {checklistTitle || 'Việc cần làm'}
                    <span className="text-xs font-normal text-muted-foreground">
                      {doneCount}/{checklist.length || 0}
                    </span>
                  </div>
                  {checklist.length > 0 && (
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-sky-500 transition-all"
                        style={{
                          width: `${checklist.length ? Math.round((doneCount / checklist.length) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  )}
                  <ul className="space-y-1.5">
                    {checklist.map((item, index) => (
                      <li
                        key={`${item.id || item.title}-${index}`}
                        className="flex items-center gap-2"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300"
                          checked={item.isDone}
                          onChange={() => {
                            const next = checklist.map((it, i) =>
                              i === index ? { ...it, isDone: !it.isDone } : it,
                            );
                            persistChecklist(next);
                          }}
                        />
                        <Input
                          className={cn(
                            'h-8 border-transparent bg-transparent px-1 text-black shadow-none placeholder:text-slate-400 focus-visible:border-slate-200 focus-visible:bg-white focus-visible:ring-0 focus-visible:ring-offset-0',
                            item.isDone && 'line-through opacity-50',
                          )}
                          value={item.title}
                          onChange={(e) =>
                            setChecklist((prev) =>
                              prev.map((it, i) =>
                                i === index ? { ...it, title: e.target.value } : it,
                              ),
                            )
                          }
                          onBlur={() => persistChecklist(checklist)}
                        />
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Thêm mục…"
                      className={cn('h-8', lightInput)}
                      value={newCheckItem}
                      onChange={(e) => setNewCheckItem(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newCheckItem.trim()) {
                          e.preventDefault();
                          const next = [
                            ...checklist,
                            {
                              title: newCheckItem.trim(),
                              isDone: false,
                              sortOrder: checklist.length,
                            },
                          ];
                          setNewCheckItem('');
                          persistChecklist(next);
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!newCheckItem.trim()) return;
                        const next = [
                          ...checklist,
                          {
                            title: newCheckItem.trim(),
                            isDone: false,
                            sortOrder: checklist.length,
                          },
                        ];
                        setNewCheckItem('');
                        persistChecklist(next);
                      }}
                    >
                      Thêm
                    </Button>
                  </div>
                </div>
              )}

              {/* Description — rich-ish toolbar */}
              <div className="ml-9 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  <AlignLeft className="h-4 w-4 text-slate-500" />
                  Mô tả
                </div>
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white text-black dark:border-slate-700 dark:bg-slate-950">
                  <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-100 bg-slate-50/80 px-1.5 py-1 text-black dark:border-slate-800 dark:bg-slate-900/80">
                    <ToolbarBtn title="In đậm" onClick={() => wrapDesc('**')}>
                      <Bold className="h-3.5 w-3.5" />
                    </ToolbarBtn>
                    <ToolbarBtn title="Nghiêng" onClick={() => wrapDesc('_')}>
                      <Italic className="h-3.5 w-3.5" />
                    </ToolbarBtn>
                    <ToolbarBtn
                      title="Danh sách"
                      onClick={() => setDescription((d) => `${d}${d ? '\n' : ''}- `)}
                    >
                      <List className="h-3.5 w-3.5" />
                    </ToolbarBtn>
                    <ToolbarBtn
                      title="Danh sách số"
                      onClick={() => setDescription((d) => `${d}${d ? '\n' : ''}1. `)}
                    >
                      <ListOrdered className="h-3.5 w-3.5" />
                    </ToolbarBtn>
                    <ToolbarBtn title="Liên kết" onClick={() => wrapDesc('[', '](https://)')}>
                      <Link2 className="h-3.5 w-3.5" />
                    </ToolbarBtn>
                    <div className="ml-auto flex items-center gap-0.5">
                      <ToolbarBtn
                        title="Đính kèm"
                        onClick={() => {
                          setPanel('files');
                          fileInputRef.current?.click();
                        }}
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                      </ToolbarBtn>
                    </div>
                  </div>
                  <Textarea
                    ref={descRef}
                    rows={8}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Mẹo: Enter để xuống dòng. Mô tả công việc tại đây…"
                    className="min-h-[160px] resize-y rounded-none border-0 bg-transparent px-3 py-2.5 text-sm text-black placeholder:text-slate-400 shadow-none focus-visible:ring-0 dark:text-black"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="bg-sky-600 hover:bg-sky-700"
                    onClick={() => saveAll()}
                    disabled={updateTask.isPending || (!dirty && !metaDirty)}
                  >
                    {updateTask.isPending ? 'Đang lưu…' : 'Lưu'}
                  </Button>
                  <button
                    type="button"
                    className="text-sm text-slate-500 hover:underline"
                    onClick={cancelDescription}
                  >
                    Hủy
                  </button>
                  {dirty && <span className="text-xs text-amber-600">Chưa lưu mô tả</span>}
                </div>
              </div>

              {/* Always mounted so paperclip / "Thêm file" can open the native picker */}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.mp4,.webm,.mov,.zip"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUploadFile(f);
                  e.target.value = '';
                }}
              />

              {/* Files panel — Trello-like cards */}
              {(panel === 'files' || (filesQ.data?.length ?? 0) > 0) && (
                <div className="ml-9 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <Paperclip className="h-4 w-4 text-slate-600" />
                      Các tập tin đính kèm
                      {uploadFile.isPending && (
                        <span className="text-xs font-normal text-slate-500">{t('work.loadingTask')}</span>
                      )}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 border-slate-300 text-xs text-slate-800"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadFile.isPending || !taskId}
                    >
                      Thêm tệp
                    </Button>
                  </div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Tệp
                  </p>
                  <ul className="space-y-2">
                    {(filesQ.data ?? []).map((f) => (
                      <li
                        key={f.id}
                        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-2 dark:border-slate-700 dark:bg-slate-950"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {fileExtensionBadge(f.originalName)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            className="block w-full truncate text-left text-sm font-medium text-sky-700 hover:underline"
                            onClick={() =>
                              f.canPreview
                                ? openPreview(f.id, f.mimeType, f.originalName)
                                : downloadAttachment(f)
                            }
                          >
                            {f.originalName}
                          </button>
                          <p className="text-[11px] text-slate-500">
                            {formatDateTime(f.createdAt)}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="rounded p-1.5 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                          title="Tải xuống"
                          onClick={() => downloadAttachment(f)}
                        >
                          <ExternalLink className="h-4 w-4" strokeWidth={2.25} />
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="rounded p-1.5 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                              aria-label="Tùy chọn tệp"
                            >
                              <MoreHorizontal className="h-4 w-4" strokeWidth={2.25} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem
                              onClick={() => {
                                insertFileIntoDescription(f, true);
                                descRef.current?.focus();
                              }}
                            >
                              Chèn vào mô tả
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => commentAboutFile(f)}>
                              <MessageSquare className="mr-2 h-3.5 w-3.5" />
                              Nhận xét
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => downloadAttachment(f)}>
                              <Download className="mr-2 h-3.5 w-3.5" />
                              Tải xuống
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600 focus:text-red-600"
                              onClick={() => removeAttachment(f)}
                            >
                              Loại bỏ
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </li>
                    ))}
                    {!filesQ.data?.length && !uploadFile.isPending && (
                      <li className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-500">
                        {t('work.noAttachments')}
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {panel === 'review' && task && (
                <div className="ml-9 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-xs font-semibold">Gửi duyệt / phê duyệt</p>
                  <Textarea
                    rows={2}
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    placeholder="Ghi chú…"
                    className={lightTextarea}
                  />
                  <div className="flex flex-wrap gap-2">
                    {(task.canSubmitReview ||
                      task.columnKey === 'IN_PROGRESS' ||
                      task.columnKey === 'NEEDS_FIX') && (
                      <Button
                        size="sm"
                        onClick={() =>
                          submitReview.mutate(
                            { id: task.id, note: reviewNote || undefined },
                            { onSuccess: () => setReviewNote('') },
                          )
                        }
                      >
                        Gửi duyệt
                      </Button>
                    )}
                    {(task.canReview || task.columnKey === 'PENDING_REVIEW') && (
                      <>
                        <Button
                          size="sm"
                          onClick={() =>
                            approve.mutate(
                              { id: task.id, note: reviewNote || undefined },
                              { onSuccess: () => setReviewNote('') },
                            )
                          }
                        >
                          Duyệt hoàn thành
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            requestFix.mutate(
                              { id: task.id, note: reviewNote || undefined },
                              { onSuccess: () => setReviewNote('') },
                            )
                          }
                        >
                          Yêu cầu sửa
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>
                      Đóng
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT — comments & activity */}
            <div
              ref={commentsSectionRef}
              className="flex min-h-0 flex-col border-t border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40 lg:border-t-0"
            >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  <MessageSquare className="h-4 w-4 text-slate-600" />
                  Nhận xét và hoạt động
                </div>
                <button
                  type="button"
                  className="text-xs font-medium text-sky-700 hover:underline dark:text-sky-400"
                  onClick={() => setShowActivityDetail((v) => !v)}
                >
                  {showActivityDetail ? 'Ẩn chi tiết' : 'Hiện chi tiết'}
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {/* Comment composer first — like sample */}
                <div className="flex gap-2">
                  <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[10px] font-semibold text-white">
                    {initials(primaryName)}
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <Textarea
                      ref={commentRef}
                      rows={2}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="Viết bình luận..."
                      className={cn('min-h-[64px] resize-none text-sm shadow-sm', lightTextarea)}
                    />
                    <div className="flex flex-wrap items-center gap-1">
                      {EMOJIS.map((e) => (
                        <button
                          key={e}
                          type="button"
                          className="rounded px-1 text-sm hover:bg-white"
                          onClick={() => setBody((b) => b + e)}
                        >
                          {e}
                        </button>
                      ))}
                      <Smile className="ml-0.5 h-3.5 w-3.5 text-slate-400" />
                      <select
                        multiple
                        className="ml-auto max-h-16 max-w-[140px] rounded border bg-white px-1 text-[10px] dark:bg-slate-950"
                        value={mentionIds}
                        onChange={(e) =>
                          setMentionIds(Array.from(e.target.selectedOptions).map((o) => o.value))
                        }
                        title="@mention"
                      >
                        {employees.slice(0, 50).map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        className="h-7 bg-sky-600 hover:bg-sky-700"
                        disabled={!body.trim() || createComment.isPending}
                        onClick={postComment}
                      >
                        <Send className="mr-1 h-3 w-3" />
                        Gửi
                      </Button>
                    </div>
                    {replyTo && (
                      <p className="text-[11px] text-muted-foreground">
                        Đang trả lời…{' '}
                        <button
                          type="button"
                          className="underline"
                          onClick={() => setReplyTo(null)}
                        >
                          hủy
                        </button>
                      </p>
                    )}
                  </div>
                </div>

                {/* Comments list */}
                {(commentsQ.data ?? []).map((c) => (
                  <div key={c.id} className="flex gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-300 text-[10px] font-semibold text-slate-800 dark:bg-slate-600 dark:text-white">
                      {initials(c.author.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-semibold text-slate-800 dark:text-slate-100">
                          {c.author.name}
                        </span>
                        <span className="ml-2 text-[11px] text-muted-foreground">
                          {formatDateTime(c.createdAt)}
                        </span>
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                        {c.body}
                      </p>
                      <div className="mt-0.5 flex gap-2 text-[11px]">
                        <button
                          type="button"
                          className="text-sky-700 hover:underline"
                          onClick={() => setReplyTo(c.id)}
                        >
                          Reply
                        </button>
                        <button
                          type="button"
                          className="text-destructive hover:underline"
                          onClick={() => {
                            if (window.confirm('Xóa bình luận?')) deleteComment.mutate(c.id);
                          }}
                        >
                          Xóa
                        </button>
                      </div>
                      {(c.replies ?? []).map((r) => (
                        <div key={r.id} className="mt-2 ml-1 border-l border-slate-200 pl-3">
                          <p className="text-xs font-semibold">{r.author.name}</p>
                          <p className="whitespace-pre-wrap text-sm">{r.body}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Activity */}
                <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                  {(showActivityDetail ? activity : activity.slice(0, 3)).map((a) => (
                    <div key={a.id} className="flex gap-2 text-xs">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[9px] font-semibold dark:bg-slate-700">
                        {a.kind === 'review' ? 'D' : 'A'}
                      </span>
                      <div className="min-w-0">
                        <p className="text-slate-700 dark:text-slate-300">{a.text}</p>
                        <p className="text-[11px] text-sky-700/80 dark:text-sky-400">
                          {formatDateTime(a.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {!activity.length && !commentsQ.data?.length && (
                    <p className="text-xs text-muted-foreground">{t('work.noActivity')}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!preview}
        onOpenChange={(v) => {
          if (!v && preview) {
            URL.revokeObjectURL(preview.url);
            setPreview(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-auto">
          <DialogTitle>{preview?.name}</DialogTitle>
          {preview?.mime.startsWith('image/') && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.url} alt={preview.name} className="max-w-full rounded" />
          )}
          {preview?.mime === 'application/pdf' && (
            <iframe title={preview.name} src={preview.url} className="h-[70vh] w-full rounded" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ToolbarBtn({
  children,
  onClick,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-700 hover:bg-white hover:text-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      {children}
    </button>
  );
}
