'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ErrorState, LoadingState } from '@/components/shared/page-state';
import { useAdminFailedJobs, useAdminRetryJob } from '@/hooks/use-platform-admin';
import { formatDateTime } from '@/lib/format';

type JobRow = {
  type: string;
  id: string;
  organizationId: string;
  organization?: { name: string; slug: string };
  status: string;
  attemptCount: number;
  maxAttempts: number | null;
  lastError: string | null;
  retryable: boolean;
  updatedAt: string;
  platform?: string;
  provider?: string;
};

export default function AdminJobsPage() {
  const [type, setType] = useState('all');
  const [page, setPage] = useState(1);
  const list = useAdminFailedJobs({ type, page, pageSize: 30 });
  const retry = useAdminRetryJob();

  function onRetry(job: JobRow) {
    const reason = window.prompt(`Retry ${job.type} ${job.id.slice(0, 8)}…\nLý do:`);
    if (!reason || reason.trim().length < 3) return;
    if (
      !window.confirm(
        `Xác nhận retry?\nTrước: status=${job.status}, attempts=${job.attemptCount}\nSau: QUEUED/PENDING`,
      )
    ) {
      return;
    }
    retry.mutate(
      { type: job.type, id: job.id, reason: reason.trim() },
      {
        onSuccess: () => window.alert('Đã xếp hàng retry'),
        onError: (e) => window.alert(e instanceof Error ? e.message : 'Lỗi'),
      },
    );
  }

  if (list.isLoading) return <LoadingState />;
  if (list.isError) return <ErrorState onRetry={() => void list.refetch()} />;

  const items = (list.data?.items ?? []) as JobRow[];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Công việc nền thất bại</h2>
        <p className="text-sm text-muted-foreground">
          Ads sync · Ads action · Offline conversion — retry có lý do + audit.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">Tất cả</option>
          <option value="ads_sync">Ads sync</option>
          <option value="ads_action">Ads action</option>
          <option value="offline_conversion">Offline conversion</option>
        </select>
        <Button size="sm" variant="secondary" onClick={() => void list.refetch()}>
          Làm mới
        </Button>
      </div>

      {!items.length ? (
        <p className="text-sm text-muted-foreground">Không có job thất bại.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left">Loại</th>
                <th className="px-3 py-2 text-left">Org</th>
                <th className="px-3 py-2 text-left">Lỗi</th>
                <th className="px-3 py-2 text-left">Attempts</th>
                <th className="px-3 py-2 text-left">Cập nhật</th>
                <th className="px-3 py-2 text-left">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((j) => (
                <tr key={`${j.type}-${j.id}`} className="border-t">
                  <td className="px-3 py-2">
                    <Badge variant="outline">{j.type}</Badge>
                    <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {j.id.slice(0, 12)}…
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">{j.organization?.name ?? j.organizationId}</td>
                  <td className="px-3 py-2 max-w-[240px] truncate text-xs text-amber-200">
                    {j.lastError ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {j.attemptCount}
                    {j.maxAttempts != null ? `/${j.maxAttempts}` : ''}
                  </td>
                  <td className="px-3 py-2 text-xs">{formatDateTime(j.updatedAt)}</td>
                  <td className="px-3 py-2">
                    {j.retryable && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={retry.isPending}
                        onClick={() => onRetry(j)}
                      >
                        Retry
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end gap-2 border-t px-3 py-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Trước
            </Button>
            <span className="text-xs text-muted-foreground">
              {page}/{list.data?.totalPages ?? 1}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= (list.data?.totalPages ?? 1)}
              onClick={() => setPage((p) => p + 1)}
            >
              Sau
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
