'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingState, EmptyState, ErrorState } from '@/components/shared/page-state';
import type { AdManagerCampaignRow, AdManagerDashboard } from '@/types/ai-ads-manager';
import { formatMoney, formatNum, platformLabel } from '../ads-format';

export function AdsPerformanceTab({
  dashboard,
  campaigns,
  isLoading,
  isError,
  onRetry,
}: {
  dashboard?: AdManagerDashboard;
  campaigns: AdManagerCampaignRow[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  if (isLoading) return <LoadingState message="Đang tải hiệu quả..." />;
  if (isError) return <ErrorState onRetry={onRetry} />;
  if (!dashboard || campaigns.length === 0) {
    return (
      <EmptyState
        title="Chưa có metrics hiệu quả"
        description="Đồng bộ Ads để lưu impressions, spend, ROAS… vào PostgreSQL."
      />
    );
  }

  const byPlatform = ['META', 'GOOGLE'].map((platform) => {
    const rows = campaigns.filter((c) => c.platform === platform);
    const spend = rows.reduce((s, r) => s + r.spend, 0);
    const convValue = rows.reduce((s, r) => s + (r.conversionValue ?? 0), 0);
    const clicks = rows.reduce((s, r) => s + r.clicks, 0);
    const impressions = rows.reduce((s, r) => s + r.impressions, 0);
    const conversions = rows.reduce((s, r) => s + r.conversions, 0);
    return {
      platform,
      spend,
      convValue,
      clicks,
      impressions,
      conversions,
      roas: spend > 0 ? convValue / spend : null,
      ctr: impressions > 0 ? (clicks * 100) / impressions : null,
    };
  });

  const topSpend = [...campaigns].sort((a, b) => b.spend - a.spend).slice(0, 5);
  const topRoas = [...campaigns]
    .filter((c) => c.roas != null)
    .sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0))
    .slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        {byPlatform.map((p) => (
          <Card key={p.platform}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                {platformLabel(p.platform)}
                <Badge variant="secondary">{campaigns.filter((c) => c.platform === p.platform).length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 text-sm">
              <div>Chi tiêu: {formatMoney(p.spend)}</div>
              <div>Conv value: {formatMoney(p.convValue)}</div>
              <div>ROAS: {p.roas != null ? formatNum(p.roas) : '—'}</div>
              <div>CTR: {p.ctr != null ? `${formatNum(p.ctr)}%` : '—'}</div>
              <div>Clicks: {formatNum(p.clicks, 0)}</div>
              <div>Conv: {formatNum(p.conversions, 0)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top chi tiêu</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {topSpend.map((c) => (
              <div key={c.insightId} className="flex justify-between gap-2">
                <span className="truncate">
                  {platformLabel(c.platform)} · {c.name}
                </span>
                <span className="shrink-0">{formatMoney(c.spend)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top ROAS</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {topRoas.length === 0 ? (
              <p className="text-muted-foreground">Chưa có ROAS</p>
            ) : (
              topRoas.map((c) => (
                <div key={c.insightId} className="flex justify-between gap-2">
                  <span className="truncate">
                    {platformLabel(c.platform)} · {c.name}
                  </span>
                  <span className="shrink-0">{formatNum(c.roas)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
