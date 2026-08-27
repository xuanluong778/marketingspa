'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/shared/data-table';
import { LoadingState, ErrorState } from '@/components/shared/page-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBranches } from '@/hooks/use-crm';
import {
  defaultAttributionFilters,
  useAttributionDashboard,
  type AttributionFilters,
  type AttributionRow,
} from '@/hooks/use-attribution';
import { formatCurrency } from '@/lib/format';
import { useT } from '@/i18n/i18n-provider';

function metric(v: number | null | undefined, digits = 2) {
  if (v == null || Number.isNaN(v)) return '—';
  return v.toFixed(digits);
}

export default function AttributionPage() {
  const t = useT();
  const [filters, setFilters] = useState<AttributionFilters>(defaultAttributionFilters);
  const { data, isLoading, isError, refetch } = useAttributionDashboard(filters);
  const { data: branches } = useBranches();
  const branchList = Array.isArray(branches) ? branches : [];

  const totals = data?.totals;
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attribution & ROAS"
        description="Đo lường khép kín từ quảng cáo → lead → lịch hẹn → doanh thu"
      />

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="space-y-1">
          <Label className="text-xs">Từ ngày</Label>
          <Input
            type="date"
            className="w-full sm:w-[160px]"
            value={filters.from}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Đến ngày</Label>
          <Input
            type="date"
            className="w-full sm:w-[160px]"
            value={filters.to}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Nguồn</Label>
          <Select
            value={filters.channel ?? 'all'}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, channel: v === 'all' ? undefined : v }))
            }
          >
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Tất cả" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="META">Meta</SelectItem>
              <SelectItem value="GOOGLE">Google</SelectItem>
              <SelectItem value="MANUAL">Thủ công</SelectItem>
              <SelectItem value="OTHER">Khác</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Chi nhánh</Label>
          <Select
            value={filters.branchId ?? 'all'}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, branchId: v === 'all' ? undefined : v }))
            }
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Tất cả" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              {branchList.map((b: { id: string; name: string }) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Khách</Label>
          <Select
            value={filters.customerType ?? 'all'}
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                customerType: v as AttributionFilters['customerType'],
              }))
            }
          >
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="new">Mới</SelectItem>
              <SelectItem value="returning">Cũ</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">utm_source</Label>
          <Input
            className="w-full sm:w-[140px]"
            value={filters.utmSource ?? ''}
            onChange={(e) =>
              setFilters((f) => ({ ...f, utmSource: e.target.value || undefined }))
            }
            placeholder="facebook"
          />
        </div>
        <div className="flex items-center gap-2 pt-5">
          <Button
            type="button"
            variant={filters.groupByAd ? 'default' : 'outline'}
            onClick={() => setFilters((f) => ({ ...f, groupByAd: !f.groupByAd }))}
          >
            {filters.groupByAd ? 'Theo Ad' : 'Theo Campaign'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => refetch()}>
            Làm mới
          </Button>
        </div>
      </div>

      {isLoading && <LoadingState />}
      {isError && <ErrorState onRetry={() => refetch()} />}
      {!isLoading && !isError && totals && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Chi tiêu</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {formatCurrency(totals.spend)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Lead / Đến</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {totals.leads} / {totals.arrived}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Doanh thu</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {formatCurrency(totals.revenue)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">ROAS</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{metric(totals.roas)}</CardContent>
          </Card>
        </div>
      )}

      {!isLoading && !isError && (
        <DataTable
          data={rows}
          isLoading={false}
          isError={false}
          emptyTitle={t('attribution.empty')}
          getRowKey={(r: AttributionRow) => r.key}
          columns={[
            { key: 'label', header: 'Campaign / Ad', cell: (r) => r.label },
            { key: 'channel', header: 'Nguồn', cell: (r) => r.channel ?? '—' },
            { key: 'spend', header: 'Chi tiêu', cell: (r) => formatCurrency(r.spend) },
            { key: 'leads', header: 'Lead', cell: (r) => String(r.leads) },
            { key: 'qualifiedLeads', header: 'Lead ĐK', cell: (r) => String(r.qualifiedLeads) },
            { key: 'appointments', header: 'Lịch hẹn', cell: (r) => String(r.appointments) },
            { key: 'arrived', header: 'Đến', cell: (r) => String(r.arrived) },
            { key: 'orders', header: 'Đơn', cell: (r) => String(r.orders) },
            { key: 'revenue', header: 'Doanh thu', cell: (r) => formatCurrency(r.revenue) },
            {
              key: 'cpl',
              header: 'CPL',
              cell: (r) => (r.cpl != null ? formatCurrency(r.cpl) : '—'),
            },
            {
              key: 'costPerAppointment',
              header: 'CPA',
              cell: (r) =>
                r.costPerAppointment != null ? formatCurrency(r.costPerAppointment) : '—',
            },
            {
              key: 'cac',
              header: 'CAC',
              cell: (r) => (r.cac != null ? formatCurrency(r.cac) : '—'),
            },
            { key: 'roas', header: 'ROAS', cell: (r) => metric(r.roas) },
            {
              key: 'estimatedProfit',
              header: 'LN ước tính',
              cell: (r) => formatCurrency(r.estimatedProfit),
            },
          ]}
        />
      )}
    </div>
  );
}
