import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatISO, startOfDay, endOfDay } from 'date-fns';
import { apiClient } from '@/lib/api-client';
import type { PaginatedResult, Lead, Appointment, FinanceDashboard, StaleLead } from '@/types/api';

const PIPELINE_STATUSES = ['NEW', 'CONTACTED', 'BOOKED', 'VISITED', 'PURCHASED'] as const;
const DASHBOARD_STALE_MS = 60_000;

function todayRange() {
  const now = new Date();
  return {
    from: formatISO(startOfDay(now)),
    to: formatISO(endOfDay(now)),
    date: formatISO(now, { representation: 'date' }),
  };
}

export type DashboardScope = 'overview' | 'hub';

export function useDashboardData(scope: DashboardScope = 'overview') {
  const { from, to, date } = useMemo(() => todayRange(), []);
  const full = scope === 'overview';

  const leadsToday = useQuery({
    queryKey: ['dashboard', 'leads-today', from, to],
    queryFn: () =>
      apiClient<PaginatedResult<Lead>>(
        `/leads?createdFrom=${encodeURIComponent(from)}&createdTo=${encodeURIComponent(to)}&pageSize=1`,
      ),
    staleTime: DASHBOARD_STALE_MS,
  });

  const appointmentsToday = useQuery({
    queryKey: ['dashboard', 'appointments-today', date],
    queryFn: () => apiClient<Appointment[]>(`/appointments/calendar?view=day&date=${date}`),
    staleTime: DASHBOARD_STALE_MS,
  });

  const finance = useQuery({
    queryKey: ['dashboard', 'finance', date],
    queryFn: () => apiClient<FinanceDashboard>(`/finance/dashboard?period=day&date=${date}`),
    staleTime: DASHBOARD_STALE_MS,
    enabled: full,
  });

  const staleLeads = useQuery({
    queryKey: ['dashboard', 'stale-leads'],
    queryFn: () => apiClient<StaleLead[]>('/leads/alerts/stale?minutes=10'),
    staleTime: DASHBOARD_STALE_MS,
  });

  const pipelineCounts = useQuery({
    queryKey: ['dashboard', 'pipeline-counts'],
    queryFn: () => apiClient<Record<string, number>>('/leads/pipeline-counts'),
    staleTime: DASHBOARD_STALE_MS,
  });

  const queries = full
    ? [leadsToday, appointmentsToday, finance, staleLeads, pipelineCounts]
    : [leadsToday, appointmentsToday, staleLeads, pipelineCounts];

  const isLoading = queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);
  const refetch = () => queries.forEach((q) => q.refetch());

  const appointments = appointmentsToday.data ?? [];
  const arrivedToday = appointments.filter((a) =>
    ['ARRIVED', 'COMPLETED'].includes(a.status),
  ).length;

  const adSpend = finance.data?.adSpend ?? 0;

  const funnel = PIPELINE_STATUSES.map((status) => ({
    status,
    label: {
      NEW: 'Lead mới',
      CONTACTED: 'Tư vấn',
      BOOKED: 'Đặt lịch',
      VISITED: 'Đến spa',
      PURCHASED: 'Mua',
    }[status],
    count: pipelineCounts.data?.[status] ?? 0,
  }));

  return {
    isLoading,
    isError,
    refetch,
    stats: {
      leadsToday: leadsToday.data?.total ?? 0,
      appointmentsToday: appointments.length,
      arrivedToday,
      revenue: finance.data?.revenue ?? 0,
      adSpend,
      profit: finance.data?.profit ?? 0,
    },
    appointments,
    staleLeads: staleLeads.data ?? [],
    funnel,
  };
}
