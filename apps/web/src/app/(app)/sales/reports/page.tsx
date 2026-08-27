'use client';

import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingState, ErrorState } from '@/components/shared/page-state';
import { useSalesReport } from '@/hooks/use-sales';
import { formatCurrency } from '@/lib/format';
import { useT } from '@/i18n/i18n-provider';
import { authStorage } from '@/lib/auth-storage';
import { getApiBaseUrl } from '@/lib/api-client';

const PRESETS = ['today', '7d', '30d', 'month', 'year'] as const;

export default function SalesReportsPage() {
  const t = useT();
  const [preset, setPreset] = useState<string>('30d');
  const report = useSalesReport({ preset });
  const k = report.data?.kpis;

  const cards = useMemo(() => {
    if (!k) return [];
    return [
      { label: t('sales.reportRevenue'), value: formatCurrency(k.revenue) },
      { label: t('sales.reportOrders'), value: String(k.orderCount) },
      { label: t('sales.reportAov'), value: formatCurrency(k.aov) },
      { label: t('sales.reportCogs'), value: formatCurrency(k.cogs) },
      { label: t('sales.reportGrossProfit'), value: formatCurrency(k.grossProfit) },
      { label: t('sales.reportInventoryValue'), value: formatCurrency(k.inventoryValue) },
      { label: t('sales.reportCancelled'), value: String(k.cancelledOrders) },
      { label: t('sales.reportReturned'), value: String(k.returnedOrders) },
      { label: t('sales.reportOutOfStock'), value: String(k.outOfStock) },
      { label: t('sales.reportLowStock'), value: String(k.lowStock) },
      { label: t('sales.reportExpired'), value: String(k.expiredBatches) },
      { label: t('sales.reportExpiring'), value: String(k.expiring30Batches) },
    ];
  }, [k, t]);

  const exportCsv = async () => {
    const token = authStorage.getAccessToken();
    const url = `${getApiBaseUrl()}/sales/reports/export.csv?preset=${encodeURIComponent(preset)}`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sales-report-${preset}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-6 pb-8">
      <PageHeader title={t('nav.salesReports')} description={t('sales.reportsDesc')}>
        <div className="flex flex-wrap gap-2">
          <Select value={preset} onValueChange={setPreset}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESETS.map((p) => (
                <SelectItem key={p} value={p}>
                  {t(`sales.reportPreset.${p}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" onClick={() => void exportCsv()}>
            <Download className="mr-1 h-4 w-4" />
            CSV
          </Button>
        </div>
      </PageHeader>

      {report.isLoading ? <LoadingState /> : null}
      {report.isError ? <ErrorState onRetry={() => void report.refetch()} /> : null}

      {k ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {cards.map((c) => (
              <div key={c.label} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="mt-1 text-xl font-semibold text-white">{c.value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h2 className="mb-3 text-sm font-semibold text-white">{t('sales.topProducts')}</h2>
              <ul className="space-y-2 text-sm">
                {(report.data?.topProducts ?? []).map((p) => (
                  <li key={p.productId} className="flex justify-between gap-2">
                    <span>
                      {p.name} · ×{p.qty}
                    </span>
                    <span className="text-[#F97316]">{formatCurrency(p.revenue)}</span>
                  </li>
                ))}
                {!report.data?.topProducts?.length ? (
                  <li className="text-muted-foreground">{t('common.emptyData')}</li>
                ) : null}
              </ul>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h2 className="mb-3 text-sm font-semibold text-white">{t('sales.topCustomers')}</h2>
              <ul className="space-y-2 text-sm">
                {(report.data?.topCustomers ?? []).map((c) => (
                  <li key={c.customerId} className="flex justify-between gap-2">
                    <span>
                      {c.name} · {c.orders} {t('sales.ordersShort')}
                    </span>
                    <span className="text-[#F97316]">{formatCurrency(c.revenue)}</span>
                  </li>
                ))}
                {!report.data?.topCustomers?.length ? (
                  <li className="text-muted-foreground">{t('common.emptyData')}</li>
                ) : null}
              </ul>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
