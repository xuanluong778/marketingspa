'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/page-state';
import { FunnelFilterBar } from '@/components/funnel/funnel-filters';
import { useFunnelStats, defaultFunnelFilters } from '@/hooks/use-funnel';
import { useBranches, useLeadSources } from '@/hooks/use-crm';
import { useEmployees, useAdCampaigns } from '@/hooks/use-queries';
import { CONVERSION_LABELS } from '@/types/funnel';
import { cn } from '@/lib/utils';

const STEP_COLORS = [
  'bg-blue-500',
  'bg-cyan-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-green-500',
  'bg-gray-400',
];

export default function FunnelPage() {
  const [filters, setFilters] = useState(defaultFunnelFilters);
  const { data, isLoading, isError, refetch } = useFunnelStats(filters);
  const { data: branches } = useBranches();
  const { data: leadSourcesData } = useLeadSources();
  const { data: employeesData } = useEmployees();
  const { data: campaignsData } = useAdCampaigns();

  const branchList = Array.isArray(branches) ? branches : [];
  const leadSources = leadSourcesData?.items ?? [];
  const employees = employeesData?.items ?? [];
  const campaigns = campaignsData?.items ?? [];

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const max = Math.max(...(data?.steps.map((s) => s.count) ?? [0]), 1);
  const hasData = data && data.totalLeads > 0;

  return (
    <div>
      <PageHeader
        title="Phễu Marketing"
        description="Theo dõi hành trình khách từ lead đến mua dịch vụ"
      />

      <FunnelFilterBar
        filters={filters}
        onChange={setFilters}
        leadSources={leadSources}
        branches={branchList}
        employees={employees}
        campaigns={campaigns}
      />

      {!hasData ? (
        <EmptyState
          title="Chưa có dữ liệu phễu"
          description="Thử mở rộng khoảng thời gian hoặc bỏ bộ lọc"
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Số lượng theo giai đoạn
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  ({data.totalLeads} lead trong kỳ)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {data.steps.map((step, i) => (
                <div key={step.status} className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      <span className={cn('w-2.5 h-2.5 rounded-full', STEP_COLORS[i])} />
                      {step.label}
                    </span>
                    <span className="text-xl font-bold">{step.count}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', STEP_COLORS[i])}
                      style={{ width: `${(step.count / max) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tỷ lệ chuyển đổi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {CONVERSION_LABELS.map(({ key, label }) => {
                const rate = data.conversions[key];
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <span className="text-sm font-medium">{label}</span>
                    <span className="text-2xl font-bold text-primary">
                      {rate != null ? `${rate}%` : '—'}
                    </span>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground pt-2">
                Tính trên lead tạo trong khoảng {new Date(data.from).toLocaleDateString('vi-VN')} —{' '}
                {new Date(data.to).toLocaleDateString('vi-VN')}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
