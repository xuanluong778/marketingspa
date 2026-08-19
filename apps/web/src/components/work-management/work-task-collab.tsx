'use client';

import { useMemo, useState } from 'react';
import { Bell, FileText, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useProjectDocuments,
  useUploadProjectDocument,
  useDeleteWorkFile,
  useWorkNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from '@/hooks/use-work-management';
import { formatDateTime } from '@/lib/format';
import { apiDownload } from '@/lib/api-client';

export { WorkTaskDetailDialog } from './work-task-detail-modal';

function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function WorkDocumentsPanel({ projectId }: { projectId: string }) {
  const docsQ = useProjectDocuments(projectId);
  const upload = useUploadProjectDocument(projectId);
  const deleteFile = useDeleteWorkFile();
  const [preview, setPreview] = useState<{ url: string; mime: string; name: string } | null>(null);

  async function openPreview(fileId: string, mime: string, name: string) {
    const { blob } = await apiDownload(`/work-management/files/${fileId}/download`);
    const url = URL.createObjectURL(blob);
    setPreview({ url, mime, name });
  }

  return (
    <>
      <div className="space-y-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Tài liệu dự án</h3>
          <Input
            type="file"
            className="max-w-xs"
            accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.mp4,.webm,.mov,.zip"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload.mutate(f);
              e.target.value = '';
            }}
          />
        </div>
        <div className="max-h-48 space-y-2 overflow-y-auto">
          {(docsQ.data ?? []).map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm"
            >
              <div className="flex min-w-0 items-start gap-2">
                {f.kind === 'image' ? (
                  <ImageIcon className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <FileText className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium">{f.originalName}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatSize(f.sizeBytes)} · {formatDateTime(f.createdAt)}
                    {f.task?.title ? ` · ${f.task.title}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
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
            <p className="text-sm text-muted-foreground">Chưa có tài liệu dự án.</p>
          )}
        </div>
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
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-auto">
          <DialogHeader>
            <DialogTitle>{preview?.name}</DialogTitle>
          </DialogHeader>
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

export function WorkNotificationsBell({
  onOpenTask,
}: {
  onOpenTask?: (taskId: string, projectId?: string | null) => void;
}) {
  const notifQ = useWorkNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const [open, setOpen] = useState(false);
  const unread = useMemo(() => (notifQ.data ?? []).filter((n) => !n.isRead).length, [notifQ.data]);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="relative"
        onClick={() => setOpen(true)}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <Badge className="absolute -right-1.5 -top-1.5 h-5 min-w-5 px-1 text-[10px]">
            {unread > 9 ? '9+' : unread}
          </Badge>
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Thông báo</DialogTitle>
          </DialogHeader>
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" onClick={() => markAll.mutate()} disabled={!unread}>
              Đánh dấu tất cả đã đọc
            </Button>
          </div>
          <ul className="space-y-2">
            {(notifQ.data ?? []).map((n) => (
              <li
                key={n.id}
                className={`cursor-pointer rounded-lg border p-3 text-sm ${
                  n.isRead ? 'opacity-70' : 'bg-muted/40'
                }`}
                onClick={() => {
                  if (!n.isRead) markRead.mutate(n.id);
                  if (n.taskId && onOpenTask) {
                    onOpenTask(n.taskId, n.projectId);
                    setOpen(false);
                  }
                }}
              >
                <p className="font-medium">{n.title}</p>
                {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {formatDateTime(n.createdAt)}
                  {n.actor?.name ? ` · ${n.actor.name}` : ''}
                </p>
              </li>
            ))}
            {!notifQ.data?.length && (
              <li className="text-sm text-muted-foreground">Không có thông báo.</li>
            )}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
