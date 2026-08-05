'use client';

import { useMemo, useState } from 'react';
import { Bell, FileText, Image as ImageIcon, Paperclip, Send, Smile } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useWorkComments,
  useCreateWorkComment,
  useUpdateWorkComment,
  useDeleteWorkComment,
  useTaskFiles,
  useUploadTaskFile,
  useDeleteWorkFile,
  useSubmitReview,
  useApproveTask,
  useRequestFix,
  useTaskStatusHistory,
  useTaskReviewEvents,
  useProjectDocuments,
  useUploadProjectDocument,
  useWorkNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from '@/hooks/use-work-management';
import type { HrmEmployee } from '@/types/hrm';
import type { WorkTask } from '@/types/work-management';
import { formatDateTime } from '@/lib/format';
import { apiDownload } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const EMOJIS = ['✅', '👍', '👀', '🔥', '❗', '🎉', '📎', '🙏'];

function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function WorkTaskDetailDialog({
  task,
  open,
  onOpenChange,
  employees,
}: {
  task: WorkTask | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employees: HrmEmployee[];
}) {
  const taskId = task?.id ?? null;
  const commentsQ = useWorkComments(open ? taskId : null);
  const filesQ = useTaskFiles(open ? taskId : null);
  const historyQ = useTaskStatusHistory(open ? taskId : null);
  const reviewsQ = useTaskReviewEvents(open ? taskId : null);
  const createComment = useCreateWorkComment(taskId || '');
  const updateComment = useUpdateWorkComment();
  const deleteComment = useDeleteWorkComment();
  const uploadFile = useUploadTaskFile(taskId || '');
  const deleteFile = useDeleteWorkFile();
  const submitReview = useSubmitReview();
  const approve = useApproveTask();
  const requestFix = useRequestFix();

  const [tab, setTab] = useState<'comments' | 'files' | 'review'>('comments');
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [preview, setPreview] = useState<{ url: string; mime: string; name: string } | null>(null);

  const mentionOptions = useMemo(() => employees.slice(0, 100), [employees]);

  if (!task) return null;

  async function openPreview(fileId: string, mime: string, name: string) {
    const { blob } = await apiDownload(`/work-management/files/${fileId}/download`);
    const url = URL.createObjectURL(blob);
    setPreview({ url, mime, name });
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="pr-6">{task.title}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {task.columnName}
              {task.revisionCount ? ` · sửa lần ${task.revisionCount}` : ''}
            </p>
          </DialogHeader>

          <div className="flex flex-wrap gap-2 border-b pb-2">
            {(
              [
                ['comments', 'Bình luận'],
                ['files', 'Tệp'],
                ['review', 'Duyệt'],
              ] as const
            ).map(([k, label]) => (
              <Button
                key={k}
                size="sm"
                variant={tab === k ? 'default' : 'outline'}
                onClick={() => setTab(k)}
              >
                {label}
              </Button>
            ))}
          </div>

          {tab === 'comments' && (
            <div className="space-y-3">
              <div className="space-y-3 max-h-[40vh] overflow-y-auto">
                {(commentsQ.data ?? []).map((c) => (
                  <div key={c.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{c.author.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(c.createdAt)}
                          {c.editedAt ? ' · đã sửa' : ''}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setReplyTo(c.id)}>
                          Trả lời
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditId(c.id);
                            setEditBody(c.body);
                          }}
                        >
                          Sửa
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => {
                            if (window.confirm('Xóa bình luận?')) deleteComment.mutate(c.id);
                          }}
                        >
                          Xóa
                        </Button>
                      </div>
                    </div>
                    {editId === c.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          rows={3}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() =>
                              updateComment.mutate(
                                { id: c.id, body: editBody },
                                {
                                  onSuccess: () => {
                                    setEditId(null);
                                    setEditBody('');
                                  },
                                },
                              )
                            }
                          >
                            Lưu
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditId(null)}>
                            Huỷ
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{c.body}</p>
                    )}
                    {(c.replies ?? []).map((r) => (
                      <div key={r.id} className="ml-4 border-l pl-3 space-y-1">
                        <p className="text-sm font-medium">{r.author.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(r.createdAt)}
                        </p>
                        <p className="text-sm whitespace-pre-wrap">{r.body}</p>
                      </div>
                    ))}
                  </div>
                ))}
                {!commentsQ.data?.length && (
                  <p className="text-sm text-muted-foreground">Chưa có bình luận.</p>
                )}
              </div>

              {replyTo && (
                <p className="text-xs text-muted-foreground">
                  Đang trả lời bình luận…{' '}
                  <button type="button" className="underline" onClick={() => setReplyTo(null)}>
                    huỷ
                  </button>
                </p>
              )}

              <div className="space-y-2">
                <Label>Bình luận (emoji, @mention)</Label>
                <div className="flex flex-wrap gap-1">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      className="rounded border px-1.5 py-0.5 text-sm hover:bg-muted"
                      onClick={() => setBody((b) => b + e)}
                    >
                      {e}
                    </button>
                  ))}
                  <Smile className="h-4 w-4 text-muted-foreground self-center ml-1" />
                </div>
                <Textarea
                  rows={3}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Viết bình luận… @Tên nhân viên"
                />
                <div className="space-y-1">
                  <Label className="text-xs">Mention</Label>
                  <select
                    multiple
                    className="w-full min-h-[64px] rounded-md border bg-background px-2 py-1 text-sm"
                    value={mentionIds}
                    onChange={(e) =>
                      setMentionIds(Array.from(e.target.selectedOptions).map((o) => o.value))
                    }
                  >
                    {mentionOptions.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Button onClick={postComment} disabled={!body.trim() || createComment.isPending}>
                  <Send className="h-4 w-4 mr-1" /> Gửi
                </Button>
              </div>
            </div>
          )}

          {tab === 'files' && (
            <div className="space-y-3">
              <div>
                <Label>Upload (ảnh, PDF, Word, Excel, video, ZIP)</Label>
                <Input
                  type="file"
                  className="mt-1"
                  accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.mp4,.webm,.mov,.zip"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadFile.mutate(f);
                    e.target.value = '';
                  }}
                />
              </div>
              <div className="space-y-2 max-h-[45vh] overflow-y-auto">
                {(filesQ.data ?? []).map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm"
                  >
                    <div className="min-w-0 flex items-start gap-2">
                      {f.kind === 'image' ? (
                        <ImageIcon className="h-4 w-4 mt-0.5 shrink-0" />
                      ) : (
                        <FileText className="h-4 w-4 mt-0.5 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-medium">{f.originalName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatSize(f.sizeBytes)} · {f.kind} · {f.uploadedBy?.name || '—'} ·{' '}
                          {formatDateTime(f.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {f.canPreview && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openPreview(f.id, f.mimeType, f.originalName)}
                        >
                          Xem
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const { blob, filename } = await apiDownload(
                            `/work-management/files/${f.id}/download`,
                          );
                          const a = document.createElement('a');
                          a.href = URL.createObjectURL(blob);
                          a.download = filename || f.originalName;
                          a.click();
                        }}
                      >
                        Tải
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => {
                          if (window.confirm('Xóa mềm file?')) deleteFile.mutate(f.id);
                        }}
                      >
                        Xóa
                      </Button>
                    </div>
                  </div>
                ))}
                {!filesQ.data?.length && (
                  <p className="text-sm text-muted-foreground">Chưa có file.</p>
                )}
              </div>
            </div>
          )}

          {tab === 'review' && (
            <div className="space-y-4">
              <div className="rounded-lg border p-3 space-y-1 text-sm">
                <p>
                  Trạng thái: <Badge variant="secondary">{task.columnName}</Badge>
                </p>
                {task.lastSubmittedAt && (
                  <p className="text-muted-foreground">
                    Gửi duyệt: {task.lastSubmittedBy?.name || '—'} ·{' '}
                    {formatDateTime(task.lastSubmittedAt)}
                  </p>
                )}
                {task.lastReviewedAt && (
                  <p className="text-muted-foreground">
                    Duyệt: {task.lastReviewedBy?.name || '—'} · {task.lastReviewAction} ·{' '}
                    {formatDateTime(task.lastReviewedAt)}
                  </p>
                )}
                {task.lastReviewNote && <p>Nhận xét: {task.lastReviewNote}</p>}
                <p className="text-muted-foreground">Số lần sửa: {task.revisionCount ?? 0}</p>
              </div>

              <div className="space-y-1">
                <Label>Ghi chú gửi / duyệt</Label>
                <Textarea
                  rows={2}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {(task.canSubmitReview ||
                  task.columnKey === 'IN_PROGRESS' ||
                  task.columnKey === 'NEEDS_FIX') && (
                  <Button
                    onClick={() =>
                      submitReview.mutate(
                        { id: task.id, note: reviewNote || undefined },
                        { onSuccess: () => setReviewNote('') },
                      )
                    }
                    disabled={submitReview.isPending}
                  >
                    Gửi duyệt
                  </Button>
                )}
                {(task.canReview || task.columnKey === 'PENDING_REVIEW') && (
                  <>
                    <Button
                      onClick={() =>
                        approve.mutate(
                          { id: task.id, note: reviewNote || undefined },
                          { onSuccess: () => setReviewNote('') },
                        )
                      }
                      disabled={approve.isPending}
                    >
                      Duyệt hoàn thành
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        requestFix.mutate(
                          { id: task.id, note: reviewNote || undefined },
                          { onSuccess: () => setReviewNote('') },
                        )
                      }
                      disabled={requestFix.isPending}
                    >
                      Yêu cầu sửa
                    </Button>
                  </>
                )}
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Lịch sử trạng thái</p>
                <ul className="space-y-1 text-xs text-muted-foreground max-h-32 overflow-y-auto">
                  {(historyQ.data ?? []).map((h) => (
                    <li key={h.id}>
                      {h.fromColumnKey || '—'} → {h.toColumnKey} ({h.action}) ·{' '}
                      {h.actor?.name || '—'} · {formatDateTime(h.createdAt)}
                      {h.note ? ` — ${h.note}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Sự kiện duyệt</p>
                <ul className="space-y-1 text-xs text-muted-foreground max-h-32 overflow-y-auto">
                  {(reviewsQ.data ?? []).map((r) => (
                    <li key={r.id}>
                      {r.type} · rev {r.revisionNumber} ·{' '}
                      {r.reviewedBy?.name || r.submittedBy?.name || '—'} ·{' '}
                      {formatDateTime(r.createdAt)}
                      {r.note ? ` — ${r.note}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Đóng
            </Button>
          </DialogFooter>
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{preview?.name}</DialogTitle>
          </DialogHeader>
          {preview?.mime.startsWith('image/') && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.url} alt={preview.name} className="max-w-full rounded" />
          )}
          {preview?.mime === 'application/pdf' && (
            <iframe title={preview.name} src={preview.url} className="w-full h-[70vh] rounded" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function WorkDocumentsPanel({ projectId }: { projectId: string }) {
  const docsQ = useProjectDocuments(projectId);
  const upload = useUploadProjectDocument(projectId);
  const deleteFile = useDeleteWorkFile();
  const [preview, setPreview] = useState<{ url: string; mime: string; name: string } | null>(null);

  return (
    <div className="rounded-xl border p-3 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Paperclip className="h-4 w-4" /> Kho tài liệu dự án
        </h3>
        <Input
          type="file"
          className="max-w-[240px]"
          accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.mp4,.webm,.mov,.zip"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload.mutate(f);
            e.target.value = '';
          }}
        />
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {(docsQ.data ?? []).map((f) => (
          <div
            key={f.id}
            className="flex items-center justify-between gap-2 text-sm py-1 border-b last:border-0"
          >
            <div className="min-w-0">
              <p className="truncate">{f.originalName}</p>
              <p className="text-[11px] text-muted-foreground">
                {formatSize(f.sizeBytes)}
                {f.task ? ` · ${f.task.title}` : ' · dự án'} · {f.uploadedBy?.name || '—'}
              </p>
            </div>
            <div className="flex gap-1 shrink-0">
              {f.canPreview && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const { blob } = await apiDownload(`/work-management/files/${f.id}/download`);
                    setPreview({
                      url: URL.createObjectURL(blob),
                      mime: f.mimeType,
                      name: f.originalName,
                    });
                  }}
                >
                  Xem
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => {
                  if (window.confirm('Xóa file?')) deleteFile.mutate(f.id);
                }}
              >
                Xóa
              </Button>
            </div>
          </div>
        ))}
        {!docsQ.data?.length && (
          <p className="text-xs text-muted-foreground">Chưa có tài liệu trong dự án.</p>
        )}
      </div>

      <Dialog
        open={!!preview}
        onOpenChange={(v) => {
          if (!v && preview) {
            URL.revokeObjectURL(preview.url);
            setPreview(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{preview?.name}</DialogTitle>
          </DialogHeader>
          {preview?.mime.startsWith('image/') && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.url} alt={preview.name} className="max-w-full" />
          )}
          {preview?.mime === 'application/pdf' && (
            <iframe title={preview?.name} src={preview?.url} className="w-full h-[70vh]" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function WorkNotificationsBell() {
  const q = useWorkNotifications();
  const mark = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const [open, setOpen] = useState(false);
  const unread = (q.data ?? []).filter((n) => !n.isRead).length;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="relative">
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full bg-destructive text-[10px] text-white px-1 flex items-center justify-center">
            {unread}
          </span>
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Thông báo công việc</DialogTitle>
          </DialogHeader>
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" onClick={() => markAll.mutate()}>
              Đánh dấu đã đọc
            </Button>
          </div>
          <ul className="space-y-2">
            {(q.data ?? []).map((n) => (
              <li
                key={n.id}
                className={cn(
                  'rounded-lg border p-2 text-sm cursor-pointer',
                  !n.isRead && 'bg-muted/50',
                )}
                onClick={() => {
                  if (!n.isRead) mark.mutate(n.id);
                }}
              >
                <p className="font-medium">{n.title}</p>
                {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
                <p className="text-[11px] text-muted-foreground mt-1">
                  {n.actor?.name || 'Hệ thống'} · {formatDateTime(n.createdAt)}
                </p>
              </li>
            ))}
            {!q.data?.length && (
              <p className="text-sm text-muted-foreground">Không có thông báo.</p>
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
