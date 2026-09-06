'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Pencil, Play, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createDownloadUrl,
  deleteTeleprompterRecording,
  formatBytes,
  formatDuration,
  listTeleprompterRecordings,
  renameTeleprompterRecording,
  type TeleprompterRecordingDto,
} from '@/lib/teleprompter-recording-api';
import { cn } from '@/lib/utils';

export function TeleprompterRecordingsLibrary({
  className,
  refreshToken,
}: {
  className?: string;
  /** Change to force reload list */
  refreshToken?: number;
}) {
  const [items, setItems] = useState<TeleprompterRecordingDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    url: string;
    mime: string;
    title: string;
  } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listTeleprompterRecordings();
      setItems(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được danh sách');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  useEffect(() => {
    return () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  const onPreview = async (item: TeleprompterRecordingDto) => {
    setBusyId(item.id);
    try {
      const signed = await createDownloadUrl(item.id);
      // fetch as blob for in-app player (avoids navigating away)
      const res = await fetch(signed.url, { credentials: 'include' });
      if (!res.ok) throw new Error('Không mở được video (URL hết hạn hoặc lỗi mạng)');
      const blob = await res.blob();
      if (preview?.url) URL.revokeObjectURL(preview.url);
      setPreview({
        url: URL.createObjectURL(blob),
        mime: item.mimeType,
        title: item.title,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xem lại thất bại');
    } finally {
      setBusyId(null);
    }
  };

  const onDownload = async (item: TeleprompterRecordingDto) => {
    setBusyId(item.id);
    try {
      const signed = await createDownloadUrl(item.id);
      const a = document.createElement('a');
      a.href = signed.url;
      a.download = signed.filename || item.title;
      a.rel = 'noopener';
      a.click();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tải xuống thất bại');
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (item: TeleprompterRecordingDto) => {
    if (!window.confirm(`Xóa “${item.title}”? File trên hệ thống sẽ bị xóa.`)) return;
    setBusyId(item.id);
    try {
      await deleteTeleprompterRecording(item.id);
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      if (preview?.title === item.title) {
        if (preview.url) URL.revokeObjectURL(preview.url);
        setPreview(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xóa thất bại');
    } finally {
      setBusyId(null);
    }
  };

  const commitRename = async (id: string) => {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    setBusyId(id);
    try {
      const updated = await renameTeleprompterRecording(id, renameValue.trim());
      setItems((prev) => prev.map((x) => (x.id === id ? updated : x)));
      setRenamingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đổi tên thất bại');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section
      className={cn(
        'rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950',
        className,
      )}
      aria-label="Video đã quay"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Video đã quay</h2>
          <p className="text-xs text-muted-foreground">
            Lưu trên hệ thống theo tài khoản — không tự upload khi chỉ quay local.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void load()}
          disabled={loading}
        >
          Làm mới
        </Button>
      </div>

      {error && (
        <p className="mb-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {preview && (
        <div className="mb-4 overflow-hidden rounded-lg border border-slate-200 bg-black dark:border-slate-700">
          <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-white/80">
            <span className="truncate">{preview.title}</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-white hover:bg-white/10"
              onClick={() => {
                URL.revokeObjectURL(preview.url);
                setPreview(null);
              }}
            >
              Đóng
            </Button>
          </div>
          {preview.mime.startsWith('audio/') ? (
            <audio src={preview.url} controls className="w-full px-3 pb-3" />
          ) : (
            <video src={preview.url} controls playsInline className="aspect-video w-full" />
          )}
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground">Đang tải…</p>}
      {!loading && items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Chưa có recording. Sau khi quay xong, bấm “Lưu lên hệ thống”.
        </p>
      )}

      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 flex-1 space-y-0.5">
              {renamingId === item.id ? (
                <div className="flex gap-2">
                  <Input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    className="h-8 text-sm"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void commitRename(item.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                  />
                  <Button type="button" size="sm" onClick={() => void commitRename(item.id)}>
                    Lưu
                  </Button>
                </div>
              ) : (
                <p className="truncate font-medium text-slate-900 dark:text-slate-50">
                  {item.title}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {formatDuration(item.duration)} · {formatBytes(item.size)} ·{' '}
                {new Date(item.createdAt).toLocaleString('vi-VN')}
                {item.sourceTitle ? ` · Kịch bản: ${item.sourceTitle}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busyId === item.id}
                onClick={() => void onPreview(item)}
                title="Xem lại"
              >
                <Play className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busyId === item.id}
                onClick={() => void onDownload(item)}
                title="Tải xuống"
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busyId === item.id}
                onClick={() => {
                  setRenamingId(item.id);
                  setRenameValue(item.title);
                }}
                title="Đổi tên"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busyId === item.id}
                onClick={() => void onDelete(item)}
                title="Xóa"
                className="text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default TeleprompterRecordingsLibrary;
