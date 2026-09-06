'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ChevronDown, Clock, MousePointerClick, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/shared/page-state';
import { FunnelFilterBar } from '@/components/funnel/funnel-filters';
import {
  defaultFunnelFilters,
  funnelStageToLeadsUrl,
  useFunnelAnalytics,
} from '@/hooks/use-funnel';
import { useFunnelRecommendations } from '@/hooks/use-funnel-builder';
import { useBranches, useLeadSources } from '@/hooks/use-crm';
import { useEmployees, useAdCampaigns } from '@/hooks/use-queries';
import { formatCurrency } from '@/lib/format';
import { funnelHref, funnelListTitle } from '@/lib/funnel-tabs';
import { cn } from '@/lib/utils';
import type { FunnelAnalyticsDashboard, FunnelFilters } from '@/types/funnel';
import { CONVERSION_LABELS } from '@/types/funnel';

const STAGE_COLORS = [
  'bg-blue-500',
  'bg-cyan-500',
  'bg-teal-500',
  'bg-amber-500',
  'bg-green-500',
];

function metric(v: number | null | undefined, suffix = '') {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v}${suffix}`;
}

function metricMoney(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return '—';
  return formatCurrency(v);
}

function metricRatio(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return '—';
  return v.toFixed(2);
}

function hasAdsSpend(data: FunnelAnalyticsDashboard) {
  return (data.kpis.spend ?? 0) > 0 || (data.attribution?.totals?.spend ?? 0) > 0;
}

type Props = {
  filters: FunnelFilters;
  onFiltersChange: (f: FunnelFilters) => void;
};

export function FunnelAnalyticsDashboard({ filters, onFiltersChange }: Props) {
  const router = useRouter();
  const [advanced, setAdvanced] = useState(false);
  const { data, isLoading, isError, refetch } = useFunnelAnalytics(filters);
  const list = useFunnelRecommendations();
  const { data: leadSourcesData } = useLeadSources();
  const { data: branches } = useBranches();
  const { data: employeesData } = useEmployees();
  const { data: campaignsData } = useAdCampaigns();

  const leadSources = leadSourcesData?.items ?? [];
  const branchList = Array.isArray(branches) ? branches : [];
  const employees = employeesData?.items ?? [];
  const campaigns = campaignsData?.items ?? [];
  const funnels = useMemo(
    () =>
      (list.data ?? [])
        .filter((r) => (r.status ?? 'DRAFT') !== 'ARCHIVED')
        .map((r) => ({ id: r.id, name: funnelListTitle(r) })),
    [list.data],
  );

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={refetch} />;
  if (!data) return <EmptyState title="Chưa có dữ liệu phễu" />;

  const spendReady = hasAdsSpend(data);
  const maxStage = Math.max(...data.funnelStages.map((s) => s.count), 1);
  const simpleStages = data.funnelStages.filter((s) =>
    s.key === 'LEAD' || s.key === 'BOOKING' || s.key === 'PURCHASED',
  );

  return (
    <div className="space-y-6">
      <FunnelFilterBar
        filters={filters}
        onChange={onFiltersChange}
        leadSources={leadSources}
        funnels={funnels}
        branches={branchList}
        employees={employees}
        campaigns={campaigns}
        advanced={advanced}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: 'Lead', value: data.kpis.leads, goCustomers: true },
          { label: 'Đặt lịch', value: data.kpis.booking, goCustomers: true },
          { label: 'Khách mua', value: data.kpis.purchased, goCustomers: true },
          { label: 'Doanh thu', value: metricMoney(data.kpis.revenue), raw: true },
          {
            label: 'Tỷ lệ chuyển đổi',
            value: metric(data.kpis.conversionRate, '%'),
            raw: true,
          },
        ].map((kpi) => (
          <Card
            key={kpi.label}
            className={cn('shadow-sm', kpi.goCustomers && 'cursor-pointer transition-colors hover:bg-muted/40')}
            onClick={
              kpi.goCustomers
                ? () =>
                    router.replace(
                      funnelHref({
                        tab: 'customers',
                        funnel: filters.funnelRecommendationId || undefined,
                      }),
                    )
                : undefined
            }
          >
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {data.kpis.leads === 0 ? (
        <p className="text-sm text-muted-foreground">
          Chưa có khách trong khoảng này. Đổi thời gian, phễu hoặc nguồn khách, hoặc kích hoạt phễu
          rồi gửi link.
        </p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MousePointerClick className="h-4 w-4" />
              Hành trình khách
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {simpleStages.map((stage, i) => (
              <button
                key={stage.key}
                type="button"
                className="w-full space-y-2 rounded-lg p-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() =>
                  router.replace(
                    filters.funnelRecommendationId
                      ? funnelHref({
                          tab: 'customers',
                          funnel: filters.funnelRecommendationId,
                        })
                      : funnelStageToLeadsUrl(stage.leadFilter),
                  )
                }
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <span
                      className={cn('h-2.5 w-2.5 rounded-full', STAGE_COLORS[i % STAGE_COLORS.length])}
                    />
                    {stage.key === 'LEAD'
                      ? 'Lead'
                      : stage.key === 'BOOKING'
                        ? 'Đặt lịch'
                        : 'Khách mua'}
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  </span>
                  <span className="text-xl font-bold">{stage.count}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn('h-full rounded-full', STAGE_COLORS[i % STAGE_COLORS.length])}
                    style={{ width: `${(stage.count / maxStage) * 100}%` }}
                  />
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setAdvanced((v) => !v)}
      >
        Xem nâng cao
        <ChevronDown className={cn('ml-1 h-4 w-4 transition-transform', advanced && 'rotate-180')} />
      </Button>

      {advanced && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'MQL', value: data.kpis.mql },
              { label: 'SQL', value: data.kpis.sql },
              ...(spendReady
                ? [
                    { label: 'CPL', value: metricMoney(data.kpis.cpl), raw: true },
                    { label: 'CAC', value: metricMoney(data.kpis.cac), raw: true },
                    { label: 'ROAS', value: metricRatio(data.kpis.roas), raw: true },
                  ]
                : []),
              {
                label: 'Thời gian chuyển đổi',
                value:
                  data.kpis.avgConversionTimeHours != null
                    ? `${data.kpis.avgConversionTimeHours}h`
                    : '—',
                raw: true,
              },
            ].map((kpi) => (
              <Card key={kpi.label} className="shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{kpi.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          {!spendReady && (
            <p className="text-xs text-muted-foreground">
              CPL, CAC, ROAS ẩn vì chưa có chi phí quảng cáo (Ads Spend) trong kỳ.
            </p>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MousePointerClick className="h-4 w-4" />
                  Phễu chi tiết — bấm để xem lead
                  <span className="ml-auto text-xs font-normal text-muted-foreground">
                    {data.touchModel === 'first' ? 'First Touch' : 'Last Touch'}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.funnelStages.map((stage, i) => (
                  <button
                    key={stage.key}
                    type="button"
                    className="w-full space-y-2 rounded-lg p-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() =>
                  router.replace(
                    filters.funnelRecommendationId
                      ? funnelHref({
                          tab: 'customers',
                          funnel: filters.funnelRecommendationId,
                        })
                      : funnelStageToLeadsUrl(stage.leadFilter),
                  )
                }
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 font-medium">
                        <span
                          className={cn(
                            'h-2.5 w-2.5 rounded-full',
                            STAGE_COLORS[i % STAGE_COLORS.length],
                          )}
                        />
                        {stage.label}
                      </span>
                      <span className="text-xl font-bold">{stage.count}</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn('h-full rounded-full', STAGE_COLORS[i % STAGE_COLORS.length])}
                        style={{ width: `${(stage.count / maxStage) * 100}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {stage.conversionFromLead != null && (
                        <span>{stage.conversionFromLead}% từ Lead</span>
                      )}
                      {stage.dropOffFromPrevious != null && (
                        <span className="inline-flex items-center gap-1 text-orange-600">
                          <TrendingDown className="h-3 w-3" />
                          Rớt {stage.dropOffFromPrevious}%
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pipeline CRM</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {CONVERSION_LABELS.map(({ key, label }) => {
                  const rate = data.pipeline.conversions[key];
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between rounded-lg bg-muted/50 p-3"
                    >
                      <span className="text-sm font-medium">{label}</span>
                      <span className="text-2xl font-bold text-primary">
                        {rate != null ? `${rate}%` : '—'}
                      </span>
                    </div>
                  );
                })}
                <p className="flex items-center gap-1 pt-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Kỳ: {new Date(data.from).toLocaleDateString('vi-VN')} —{' '}
                  {new Date(data.to).toLocaleDateString('vi-VN')}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Attribution theo chiến dịch</CardTitle>
              </CardHeader>
              <CardContent>
                {data.attribution.rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Chưa có dữ liệu attribution</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="pb-2 pr-2">Nguồn</th>
                          <th className="px-2 pb-2 text-right">Lead</th>
                          {spendReady && <th className="px-2 pb-2 text-right">Spend</th>}
                          <th className="px-2 pb-2 text-right">Doanh thu</th>
                          {spendReady && <th className="px-2 pb-2 text-right">ROAS</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {data.attribution.rows.slice(0, 8).map((row) => (
                          <tr key={row.key} className="border-b border-border/40">
                            <td className="py-2 pr-2 font-medium">{row.label}</td>
                            <td className="px-2 py-2 text-right">{row.leads}</td>
                            {spendReady && (
                              <td className="px-2 py-2 text-right">{formatCurrency(row.spend)}</td>
                            )}
                            <td className="px-2 py-2 text-right">{formatCurrency(row.revenue)}</td>
                            {spendReady && (
                              <td className="px-2 py-2 text-right">{metricRatio(row.roas)}</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">UTM / tracking</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex gap-4 text-muted-foreground">
                  <span>fbclid: {data.trackingBreakdown.clickIds.fbclid}</span>
                  <span>gclid: {data.trackingBreakdown.clickIds.gclid}</span>
                  <span>Attributed: {data.trackingBreakdown.attributedLeads}</span>
                </div>
                {[
                  { title: 'UTM Source', rows: data.trackingBreakdown.utmSources },
                  { title: 'UTM Campaign', rows: data.trackingBreakdown.utmCampaigns },
                  { title: 'Landing Page', rows: data.trackingBreakdown.landingPages },
                  { title: 'Referrer', rows: data.trackingBreakdown.referrers },
                ].map((section) => (
                  <div key={section.title}>
                    <p className="mb-1 font-medium">{section.title}</p>
                    {section.rows.length === 0 ? (
                      <p className="text-xs text-muted-foreground">—</p>
                    ) : (
                      <ul className="space-y-1">
                        {section.rows.slice(0, 5).map((r) => (
                          <li
                            key={r.value}
                            className="flex justify-between gap-2 text-xs text-muted-foreground"
                          >
                            <span className="truncate">{r.value}</span>
                            <span className="font-medium text-foreground">{r.leads}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

export function FunnelAnalyticsPanel() {
  const [filters, setFilters] = useState(defaultFunnelFilters());
  return <FunnelAnalyticsDashboard filters={filters} onFiltersChange={setFilters} />;
}
