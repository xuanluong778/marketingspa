import { useQuery } from '@tanstack/react-query';
import { formatISO, startOfDay, endOfDay } from 'date-fns';
import { apiClient } from '@/lib/api-client';
import type { PaginatedResult, Lead, Appointment, FinanceDashboard, StaleLead } from '@/types/api';

const PIPELINE_STATUSES = ['NEW', 'CONTACTED', 'BOOKED', 'VISITED', 'PURCHASED'] as const;

function todayRange() {
  const now = new Date();
  return {
    from: formatISO(startOfDay(now)),
    to: formatISO(endOfDay(now)),
    date: formatISO(now, { representation: 'date' }),
  };
}

function useFunnelCount(status: (typeof PIPELINE_STATUSES)[number]) {
  return useQuery({
    queryKey: ['dashboard', 'funnel', status],
    queryFn: () => apiClient<PaginatedResult<Lead>>(`/leads?pipelineStatus=${status}&pageSize=1`),
  });
}

export function useDashboardData() {
  const { from, to, date } = todayRange();

  const leadsToday = useQuery({
    queryKey: ['dashboard', 'leads-today', from, to],
    queryFn: () =>
      apiClient<PaginatedResult<Lead>>(
        `/leads?createdFrom=${encodeURIComponent(from)}&createdTo=${encodeURIComponent(to)}&pageSize=1`,
      ),
  });

  const appointmentsToday = useQuery({
    queryKey: ['dashboard', 'appointments-today', date],
    queryFn: () => apiClient<Appointment[]>(`/appointments/calendar?view=day&date=${date}`),
  });

  const finance = useQuery({
    queryKey: ['dashboard', 'finance', date],
    queryFn: () => apiClient<FinanceDashboard>(`/finance/dashboard?period=day&date=${date}`),
  });

  const adExpenses = useQuery({
    queryKey: ['dashboard', 'ad-expenses', from, to],
    queryFn: () =>
      apiClient<PaginatedResult<{ amount: string }>>(
        `/finance/expenses?expenseCategory=ADVERTISING&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&pageSize=100`,
      ),
  });

  const staleLeads = useQuery({
    queryKey: ['dashboard', 'stale-leads'],
    queryFn: () => apiClient<StaleLead[]>('/leads/alerts/stale?minutes=10'),
  });

  const funnelNew = useFunnelCount('NEW');
  const funnelContacted = useFunnelCount('CONTACTED');
  const funnelBooked = useFunnelCount('BOOKED');
  const funnelVisited = useFunnelCount('VISITED');
  const funnelPurchased = useFunnelCount('PURCHASED');

  const funnelQueries = [funnelNew, funnelContacted, funnelBooked, funnelVisited, funnelPurchased];

  const queries = [
    leadsToday,
    appointmentsToday,
    finance,
    adExpenses,
    staleLeads,
    ...funnelQueries,
  ];

  const isLoading = queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);
  const refetch = () => queries.forEach((q) => q.refetch());

  const appointments = appointmentsToday.data ?? [];
  const arrivedToday = appointments.filter((a) =>
    ['ARRIVED', 'COMPLETED'].includes(a.status),
  ).length;

  const adSpend = adExpenses.data?.items.reduce((sum, e) => sum + Number(e.amount), 0) ?? 0;

  const funnel = PIPELINE_STATUSES.map((status, i) => ({
    status,
    label: {
      NEW: 'Lead mới',
      CONTACTED: 'Tư vấn',
      BOOKED: 'Đặt lịch',
      VISITED: 'Đến spa',
      PURCHASED: 'Mua',
    }[status],
    count: funnelQueries[i]?.data?.total ?? 0,
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
