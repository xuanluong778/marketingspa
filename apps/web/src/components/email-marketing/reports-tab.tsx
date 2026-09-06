'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, StatusBadge } from '@/components/shared/data-table';
import { LoadingState, ErrorState } from '@/components/shared/page-state';
import { useEmailReports } from '@/hooks/use-email-marketing';
import { CAMPAIGN_STATUS_LABELS } from '@/types/email-marketing';
import { formatDateTime } from '@/lib/format';

export function EmailReportsTab() {
  const reports = useEmailReports();
  if (reports.isLoading) return <LoadingState />;
  if (reports.isError || !reports.data) return <ErrorState onRetry={() => reports.refetch()} />;

  const { campaigns, events } = reports.data;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {events.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Sự kiện</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Chưa có sự kiện gửi/mở/click.</CardContent>
          </Card>
        ) : (
          events.map((e) => (
            <Card key={e.type}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{e.type}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{e.count}</div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <DataTable
        getRowKey={(r) => r.id}
        data={campaigns}
        isLoading={false}
        isError={false}
        emptyTitle="Chưa có chiến dịch để báo cáo"
        columns={[
          { key: 'name', header: 'Chiến dịch', cell: (r) => r.name },
          {
            key: 'status',
            header: 'TT',
            cell: (r) => <StatusBadge status={CAMPAIGN_STATUS_LABELS[r.status]} />,
          },
          { key: 'sent', header: 'Gửi', cell: (r) => r.sentCount },
          { key: 'delivered', header: 'Tới', cell: (r) => r.deliveredCount ?? 0 },
          { key: 'open', header: 'Open %', cell: (r) => `${r.openRate}%` },
          { key: 'click', header: 'Click %', cell: (r) => `${r.clickRate}%` },
          { key: 'bounce', header: 'Bounce', cell: (r) => r.bounceCount },
          { key: 'unsub', header: 'Hủy ĐK', cell: (r) => r.unsubscribeCount },
          {
            key: 'when',
            header: 'Bắt đầu',
            cell: (r) => (r.startedAt ? formatDateTime(r.startedAt) : '—'),
          },
        ]}
      />
    </div>
  );
}
