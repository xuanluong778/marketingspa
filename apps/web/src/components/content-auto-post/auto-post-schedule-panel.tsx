'use client';

import { useMemo, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingState } from '@/components/shared/page-state';
import { AutoPostHistoryTable } from '@/components/auto-post/auto-post-history-table';
import { useAutoPostList, useAutoPostMutations } from '@/hooks/use-auto-post';
import {
  AUTO_POST_STATUS_LABELS,
  type AutoPostStatus,
} from '@/types/auto-post';

const STATUS_FILTER_OPTIONS: { value: 'all' | AutoPostStatus; label: string }[] = [
  { value: 'all', label: 'Tất cả trạng thái' },
  ...Object.entries(AUTO_POST_STATUS_LABELS).map(([value, label]) => ({
    value: value as AutoPostStatus,
    label,
  })),
];

export function AutoPostSchedulePanel() {
  const [statusFilter, setStatusFilter] = useState<'all' | AutoPostStatus>('all');
  const { data, isLoading } = useAutoPostList(
    statusFilter === 'all' ? undefined : statusFilter,
  );
  const mutations = useAutoPostMutations();

  const items = useMemo(() => data?.items ?? [], [data?.items]);

  const isBusy =
    mutations.retry.isPending ||
    mutations.cancelSchedule.isPending ||
    mutations.deletePost.isPending;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-900">
        Theo dõi bài đã lên lịch, đang đăng, đã đăng hoặc lỗi. Worker hệ thống tự đăng bài đúng
        giờ sau khi bạn duyệt.
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">
          Lịch đăng & lịch sử
          {items.length > 0 ? (
            <span className="ml-2 text-sm font-normal text-muted-foreground">({items.length})</span>
          ) : null}
        </h2>
        <div className="w-full sm:w-56">
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as 'all' | AutoPostStatus)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <LoadingState message="Đang tải lịch đăng..." />
      ) : (
        <AutoPostHistoryTable
          items={items}
          busy={isBusy}
          onRetry={(id) => mutations.retry.mutate(id)}
          onCancel={(id) => mutations.cancelSchedule.mutate(id)}
          onDelete={(id) => {
            if (window.confirm('Xóa bài này?')) mutations.deletePost.mutate(id);
          }}
        />
      )}
    </div>
  );
}
