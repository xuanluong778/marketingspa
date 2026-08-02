'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingState, EmptyState, ErrorState } from '@/components/shared/page-state';
import type { AdConnectionItem, AdManagerDashboard } from '@/types/ai-ads-manager';
import { CONNECTION_STATUS_LABEL } from '@/types/ai-ads-manager';
import { formatMoney, formatNum, platformLabel, syncStatusLabel } from '../ads-format';
import type { AdsSyncJobPublic } from '@marketingspa/shared';

function KpiCard({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-xl">{value}</CardTitle>
      </CardHeader>
      {sub && <CardContent className="pt-0 text-xs text-muted-foreground">{sub}</CardContent>}
    </Card>
  );
}

export function AdsOverviewTab({
  dashboard,
  connections,
  syncJobs,
  isLoading,
  isError,
  onRetry,
}: {
  dashboard?: AdManagerDashboard;
  connections: AdConnectionItem[];
  syncJobs: AdsSyncJobPublic[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  if (isLoading) return <LoadingState message="Đang tải tổng quan từ database..." />;
  if (isError) return <ErrorState message="Không tải được dashboard" onRetry={onRetry} />;
  if (!dashboard) {
    return (
      <EmptyState
        title="Chưa có dữ liệu Ads"
        description="Kết nối tài khoản Meta/Google rồi đồng bộ. Dashboard chỉ đọc dữ liệu đã lưu trong PostgreSQL."
      />
    );
  }

  const d = dashboard;
  const connected = connections.filter((c) => c.connected && c.provider !== 'GMAIL');
  const activeJob = syncJobs.find((j) => j.status === 'RUNNING' || j.status === 'QUEUED');

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Nguồn: PostgreSQL (AdsNormalized) — không gọi Meta/Google từ trình duyệt.
      </p>

      {activeJob && (
        <Card className="border-primary/40">
          <CardContent className="flex flex-wrap items-center gap-3 py-4 text-sm">
            <Badge>{syncStatusLabel(activeJob.status)}</Badge>
            <span>
              {platformLabel(activeJob.platform)} · {activeJob.progressPercent}%
            </span>
            <span className="text-muted-foreground">
              {activeJob.progressMessage ?? 'Đang đồng bộ...'}
            </span>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <KpiCard title="Tổng chi tiêu" value={formatMoney(d.totalSpend)} />
        <KpiCard title="Doanh thu" value={formatMoney(d.conversionValue ?? d.totalRevenue)} />
        <KpiCard title="ROAS" value={d.roas != null ? formatNum(d.roas) : '—'} />
        <KpiCard title="CPA" value={d.cpa != null && d.cpa > 0 ? formatMoney(d.cpa) : '—'} />
        <KpiCard title="Chuyển đổi" value={String(d.totalConversions)} />
        <KpiCard title="Đang chạy" value={String(d.activeCampaigns)} />
        <KpiCard title="Kém hiệu quả" value={String(d.poorCampaigns)} />
        <KpiCard
          title="Lãi/lỗ"
          value={formatMoney(d.profit)}
          sub={d.profit >= 0 ? 'Có lãi' : 'Đang lỗ'}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tài khoản đã kết nối</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {connected.length === 0 ? (
              <p className="text-muted-foreground">Chưa kết nối Meta hoặc Google.</p>
            ) : (
              connected.map((c) => (
                <div key={c.provider} className="flex items-center justify-between gap-2">
                  <span>
                    {platformLabel(c.provider)}
                    {c.accountName ? ` · ${c.accountName}` : ''}
                  </span>
                  <Badge variant="secondary">{CONNECTION_STATUS_LABEL[c.status]}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Đồng bộ gần đây</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {syncJobs.slice(0, 5).length === 0 ? (
              <p className="text-muted-foreground">Chưa có lịch sử đồng bộ.</p>
            ) : (
              syncJobs.slice(0, 5).map((j) => (
                <div key={j.id} className="flex items-center justify-between gap-2">
                  <span>
                    {platformLabel(j.platform)} · {j.campaignsSynced} campaign
                  </span>
                  <Badge variant={j.status === 'FAILED' ? 'secondary' : 'outline'}>
                    {syncStatusLabel(j.status)}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
