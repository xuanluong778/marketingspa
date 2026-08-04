'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AUTO_POST_STATUS_LABELS,
  autoPostTypeLabel,
  type AutoPostItem,
  type AutoPostStatus,
} from '@/types/auto-post';
import { cn } from '@/lib/utils';
import { ExternalLink, RotateCcw, Trash2, XCircle } from 'lucide-react';

const STATUS_VARIANT: Record<AutoPostStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  PENDING: 'bg-amber-100 text-amber-800',
  SCHEDULED: 'bg-blue-100 text-blue-800',
  PUBLISHING: 'bg-violet-100 text-violet-800',
  PUBLISHED: 'bg-emerald-100 text-emerald-800',
  FAILED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

function formatDt(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('vi-VN');
}

function resolvePostUrl(item: AutoPostItem): string | null {
  if (item.facebookPostUrl) return item.facebookPostUrl;
  if (!item.facebookPostId) return null;
  if (item.facebookPostId.includes('_')) {
    const [pid, storyId] = item.facebookPostId.split('_');
    const pageId = item.fanpagePageId || pid;
    if (pageId && storyId) {
      return `https://www.facebook.com/permalink.php?story_fbid=${encodeURIComponent(storyId)}&id=${encodeURIComponent(pageId)}`;
    }
  }
  return `https://www.facebook.com/${item.facebookPostId}`;
}

export function AutoPostHistoryTable({
  items,
  onRetry,
  onCancel,
  onDelete,
  busy,
}: {
  items: AutoPostItem[];
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
  busy?: boolean;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Chưa có bài đăng nào. Tạo bài và lưu nháp hoặc đăng để xem lịch sử.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full text-sm text-slate-900">
        <thead className="border-b bg-slate-100">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-black">Chủ đề</th>
            <th className="px-4 py-3 text-left font-semibold text-black">Loại</th>
            <th className="px-4 py-3 text-left font-semibold text-black">Fanpage</th>
            <th className="px-4 py-3 text-left font-semibold text-black">Trạng thái</th>
            <th className="px-4 py-3 text-left font-semibold text-black">Lịch / Đăng</th>
            <th className="px-4 py-3 text-right font-semibold text-black">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const viewUrl = resolvePostUrl(item);
            return (
              <tr key={item.id} className="border-b last:border-0 hover:bg-slate-50/80">
                <td className="max-w-[200px] px-4 py-3">
                  <p className="truncate font-medium text-slate-900">{item.topic}</p>
                  {item.errorMessage && item.status === 'FAILED' && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-red-600">{item.errorMessage}</p>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-800">
                  {autoPostTypeLabel(item.postType)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-800">
                  {item.fanpageName ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <Badge className={cn('font-normal', STATUS_VARIANT[item.status])}>
                    {AUTO_POST_STATUS_LABELS[item.status]}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                  {item.status === 'SCHEDULED'
                    ? formatDt(item.scheduledAt)
                    : formatDt(item.publishedAt ?? item.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-1">
                    {item.status === 'PUBLISHED' && viewUrl ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-[#0A3D30] bg-[#0A3D30] text-white hover:bg-[#083028] hover:text-white [&_svg]:text-white"
                        asChild
                      >
                        <a href={viewUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="mr-1 h-3.5 w-3.5" />
                          Xem bài viết
                        </a>
                      </Button>
                    ) : null}
                    {item.status === 'FAILED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-[#0A3D30] bg-[#0A3D30] text-white hover:bg-[#083028] hover:text-white [&_svg]:text-white"
                        disabled={busy}
                        onClick={() => onRetry(item.id)}
                      >
                        <RotateCcw className="mr-1 h-3.5 w-3.5" />
                        Thử lại
                      </Button>
                    )}
                    {item.status === 'SCHEDULED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-[#0A3D30] bg-[#0A3D30] text-white hover:bg-[#083028] hover:text-white [&_svg]:text-white"
                        disabled={busy}
                        onClick={() => onCancel(item.id)}
                      >
                        <XCircle className="mr-1 h-3.5 w-3.5" />
                        Hủy lịch
                      </Button>
                    )}
                    {(item.status === 'DRAFT' ||
                      item.status === 'FAILED' ||
                      item.status === 'CANCELLED') && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-slate-700 hover:text-slate-900"
                        disabled={busy}
                        onClick={() => onDelete(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
