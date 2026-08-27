'use client';

import { PageHeader } from '@/components/shared/page-header';
import { DataTable, StatusBadge } from '@/components/shared/data-table';
import { LoadingState, EmptyState, ErrorState } from '@/components/shared/page-state';
import { useMarketingReports } from '@/hooks/use-queries';
import { formatCurrency } from '@/lib/format';
import { useT } from '@/i18n/i18n-provider';

export default function ReportsPage() {
  const t = useT();
  const { data, isLoading, isError, refetch } = useMarketingReports();

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const campaigns = data?.campaigns ?? [];

  return (
    <div>
      <PageHeader
        title={t('reports.title')}
        description={`Marketing ${data?.from ? new Date(data.from).toLocaleDateString('vi-VN') : ''} — ${data?.to ? new Date(data.to).toLocaleDateString('vi-VN') : ''}`}
      />
      {campaigns.length === 0 ? (
        <EmptyState title={t('reports.emptyCampaigns')} />
      ) : (
        <DataTable
          data={campaigns}
          isLoading={false}
          isError={false}
          emptyTitle={t('reports.empty')}
          getRowKey={(r) => r.campaignId}
          columns={[
            { key: 'name', header: 'Chiến dịch', cell: (r) => r.campaignName },
            {
              key: 'platform',
              header: 'Nền tảng',
              cell: (r) => (r.platform ? <StatusBadge status={r.platform} /> : '—'),
            },
            {
              key: 'spend',
              header: 'Chi tiêu',
              cell: (r) => formatCurrency(r.totalSpend),
            },
            { key: 'leads', header: 'Lead', cell: (r) => r.totalLeads },
            {
              key: 'cpl',
              header: 'CPL',
              cell: (r) => (r.cpl != null ? formatCurrency(r.cpl) : '—'),
            },
            { key: 'booked', header: 'Đặt lịch', cell: (r) => r.bookedLeads },
            { key: 'purchased', header: 'Mua', cell: (r) => r.purchasedLeads },
          ]}
        />
      )}
    </div>
  );
}
