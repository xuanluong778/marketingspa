'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LoadingState, EmptyState, ErrorState } from '@/components/shared/page-state';
import type { AdsSyncJobPublic } from '@marketingspa/shared';
import { platformLabel, syncStatusLabel } from '../ads-format';
import { useT } from '@/i18n/i18n-provider';

function asDate(v: string | Date) {
  return typeof v === 'string' ? new Date(v) : v;
}

export function AdsSyncHistoryTab({
  jobs,
  isLoading,
  isError,
  onRetry,
}: {
  jobs: AdsSyncJobPublic[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const t = useT();
  if (isLoading) return <LoadingState message={t('aiAds.loadingSyncHistory')} />;
  if (isError) return <ErrorState onRetry={onRetry} />;
  if (!jobs.length) {
    return (
      <EmptyState
        title={t('aiAds.emptySyncJobs')}
        description="Bấm Đồng bộ để enqueue BullMQ. Tiến độ cập nhật qua Socket.IO hoặc polling."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Job lưu trong PostgreSQL · progress realtime (`ads:sync-progress`) + polling khi đang chạy.
      </p>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Thời gian</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Khoảng ngày</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Progress</TableHead>
                <TableHead className="text-right">Campaigns</TableHead>
                <TableHead>Chi tiết</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((j) => (
                <TableRow key={j.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {asDate(j.createdAt).toLocaleString('vi-VN')}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{platformLabel(j.platform)}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs max-w-[120px] truncate">
                    {j.accountId}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {String(j.dateFrom).slice(0, 10)} → {String(j.dateTo).slice(0, 10)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={j.status === 'FAILED' ? 'secondary' : 'outline'}
                      className={j.status === 'FAILED' ? 'bg-red-100 text-red-800' : undefined}
                    >
                      {syncStatusLabel(j.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{j.progressPercent}%</TableCell>
                  <TableCell className="text-right">{j.campaignsSynced}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">
                    {j.lastError ?? j.progressMessage ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
