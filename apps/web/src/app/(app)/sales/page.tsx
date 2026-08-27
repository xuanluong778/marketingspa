'use client';

import { useMemo } from 'react';
import { ModuleHubRoute } from '@/components/module-hub/module-hub-route';
import { useSalesReport, useStockAlerts } from '@/hooks/use-sales';
import { formatCurrency } from '@/lib/format';
import type { ModuleHubKpi } from '@/config/module-hubs';

export default function SalesHubPage() {
  const report = useSalesReport({ preset: '30d' });
  const alerts = useStockAlerts();

  const kpis: ModuleHubKpi[] | undefined = useMemo(() => {
    const k = report.data?.kpis;
    if (!k) return undefined;
    return [
      { labelKey: 'moduleHub.kpi.salesRevenue', value: formatCurrency(k.revenue) },
      { labelKey: 'moduleHub.kpi.salesOrders', value: k.orderCount },
      { labelKey: 'moduleHub.kpi.salesAov', value: formatCurrency(k.aov) },
      { labelKey: 'moduleHub.kpi.salesInventory', value: formatCurrency(k.inventoryValue) },
      {
        labelKey: 'moduleHub.kpi.salesLowStock',
        value: k.lowStock ?? alerts.data?.counts.lowStock ?? 0,
      },
    ];
  }, [report.data, alerts.data]);

  return (
    <ModuleHubRoute
      hubId="sales"
      kpis={kpis}
      kpisLoading={report.isLoading}
      kpisError={report.isError}
      onRetryKpis={() => void report.refetch()}
      badges={{
        '/sales/orders': report.data?.kpis?.orderCount,
        '/sales/inventory':
          alerts.data?.counts.lowStock != null ? alerts.data.counts.lowStock : undefined,
      }}
    />
  );
}
