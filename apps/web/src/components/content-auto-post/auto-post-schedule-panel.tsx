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
import { type AutoPostStatus } from '@/types/auto-post';
import { useT } from '@/i18n/i18n-provider';

const STATUS_I18N: Record<AutoPostStatus, string> = {
  DRAFT: 'facebookFlow.statusDraft',
  PENDING: 'facebookFlow.statusPending',
  SCHEDULED: 'facebookFlow.statusScheduled',
  PUBLISHING: 'facebookFlow.statusPublishing',
  PUBLISHED: 'facebookFlow.statusPublished',
  FAILED: 'facebookFlow.statusFailed',
  CANCELLED: 'facebookFlow.statusCancelled',
};

const STATUS_VALUES = Object.keys(STATUS_I18N) as AutoPostStatus[];

export function AutoPostSchedulePanel() {
  const t = useT();
  const [statusFilter, setStatusFilter] = useState<'all' | AutoPostStatus>('all');
  const { data, isLoading } = useAutoPostList(
    statusFilter === 'all' ? undefined : statusFilter,
  );
  const mutations = useAutoPostMutations();

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const statusFilterOptions = useMemo(
    () => [
      { value: 'all' as const, label: t('facebookFlow.allStatuses') },
      ...STATUS_VALUES.map((value) => ({
        value,
        label: t(STATUS_I18N[value]),
      })),
    ],
    [t],
  );

  const isBusy =
    mutations.retry.isPending ||
    mutations.cancelSchedule.isPending ||
    mutations.deletePost.isPending;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-900">
        {t('facebookFlow.scheduleHint')}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">
          {t('facebookFlow.scheduleHistory')}
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
              {statusFilterOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <LoadingState message={t('facebookFlow.loadingSchedule')} />
      ) : (
        <AutoPostHistoryTable
          items={items}
          busy={isBusy}
          onRetry={(id) => mutations.retry.mutate(id)}
          onCancel={(id) => mutations.cancelSchedule.mutate(id)}
          onDelete={(id) => {
            if (window.confirm(t('facebookFlow.confirmDeleteSchedule'))) {
              mutations.deletePost.mutate(id);
            }
          }}
        />
      )}
    </div>
  );
}
