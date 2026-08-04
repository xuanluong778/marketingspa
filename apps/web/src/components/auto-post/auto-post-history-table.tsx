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
import { RefreshCw, RotateCcw, Trash2, XCircle } from 'lucide-react';

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
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b">
          <tr>
            <th className="text-left px-4 py-3 font-medium">Chủ đề</th>
            <th className="text-left px-4 py-3 font-medium">Loại</th>
            <th className="text-left px-4 py-3 font-medium">Fanpage</th>
            <th className="text-left px-4 py-3 font-medium">Trạng thái</th>
            <th className="text-left px-4 py-3 font-medium">Lịch / Đăng</th>
            <th className="text-right px-4 py-3 font-medium">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b last:border-0 hover:bg-slate-50/50">
              <td className="px-4 py-3 max-w-[200px]">
                <p className="font-medium truncate">{item.topic}</p>
                {item.errorMessage && item.status === 'FAILED' && (
                  <p className="text-xs text-red-600 mt-0.5 line-clamp-2">{item.errorMessage}</p>
                )}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">{autoPostTypeLabel(item.postType)}</td>
              <td className="px-4 py-3 whitespace-nowrap">{item.fanpageName ?? '—'}</td>
              <td className="px-4 py-3">
                <Badge className={cn('font-normal', STATUS_VARIANT[item.status])}>
                  {AUTO_POST_STATUS_LABELS[item.status]}
                </Badge>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                {item.status === 'SCHEDULED'
                  ? formatDt(item.scheduledAt)
                  : formatDt(item.publishedAt ?? item.createdAt)}
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  {item.status === 'FAILED' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => onRetry(item.id)}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                      Thử lại
                    </Button>
                  )}
                  {item.status === 'SCHEDULED' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => onCancel(item.id)}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" />
                      Hủy lịch
                    </Button>
                  )}
                  {(item.status === 'DRAFT' ||
                    item.status === 'FAILED' ||
                    item.status === 'CANCELLED') && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => onDelete(item.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
