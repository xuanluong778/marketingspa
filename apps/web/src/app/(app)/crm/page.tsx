'use client';

import { useMemo } from 'react';
import { ModuleHubRoute } from '@/components/module-hub/module-hub-route';
import { useDashboardData } from '@/hooks/use-dashboard';
import type { ModuleHubKpi } from '@/config/module-hubs';

export default function CrmHubPage() {
  const dash = useDashboardData('hub');
  const kpis: ModuleHubKpi[] | undefined = useMemo(() => {
    if (!dash.stats) return undefined;
    return [
      { labelKey: 'moduleHub.kpi.crmLeads', value: dash.stats.leadsToday },
      { labelKey: 'moduleHub.kpi.crmAppointments', value: dash.stats.appointmentsToday },
      { labelKey: 'moduleHub.kpi.crmStale', value: dash.staleLeads?.length ?? 0 },
      {
        labelKey: 'moduleHub.kpi.crmFunnelNew',
        value: dash.funnel?.find((f) => f.status === 'NEW')?.count ?? 0,
      },
    ];
  }, [dash.stats, dash.staleLeads, dash.funnel]);

  return (
    <ModuleHubRoute
      hubId="crmCustomers"
      kpis={kpis}
      kpisLoading={dash.isLoading}
      kpisError={dash.isError}
      onRetryKpis={dash.refetch}
    />
  );
}
