import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { PaginatedResult } from '@/types/api';
import type { FinanceDashboard, CampaignReport, ExpenseRow, OrderRow } from '@/types/finance';

export interface FinanceDateFilters {
  from: string;
  to: string;
  branchId?: string;
}

export function useFinanceDashboard(filters: FinanceDateFilters) {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.branchId) params.set('branchId', filters.branchId);

  return useQuery({
    queryKey: ['finance', 'dashboard', filters],
    queryFn: () => apiClient<FinanceDashboard>(`/finance/dashboard?${params}`),
  });
}

export function useFinanceOrders(filters: FinanceDateFilters & { page?: number }) {
  const params = new URLSearchParams({
    pageSize: '20',
    page: String(filters.page ?? 1),
  });
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);

  return useQuery({
    queryKey: ['finance', 'orders', filters],
    queryFn: () => apiClient<PaginatedResult<OrderRow>>(`/finance/orders?${params}`),
  });
}

export function useFinancePayments(filters: FinanceDateFilters & { page?: number }) {
  const params = new URLSearchParams({
    pageSize: '20',
    page: String(filters.page ?? 1),
  });
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);

  return useQuery({
    queryKey: ['finance', 'payments', filters],
    queryFn: () => apiClient<PaginatedResult<unknown>>(`/finance/payments?${params}`),
  });
}

export function useFinanceExpenses(filters: FinanceDateFilters & { page?: number }) {
  const params = new URLSearchParams({
    pageSize: '50',
    page: String(filters.page ?? 1),
  });
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);

  return useQuery({
    queryKey: ['finance', 'expenses', filters],
    queryFn: () => apiClient<PaginatedResult<ExpenseRow>>(`/finance/expenses?${params}`),
  });
}

export function useCampaignReports(filters: { from: string; to: string; adCampaignId?: string }) {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.adCampaignId) params.set('adCampaignId', filters.adCampaignId);

  return useQuery({
    queryKey: ['marketing', 'reports', filters],
    queryFn: () =>
      apiClient<{ from: string; to: string; campaigns: CampaignReport[] }>(
        `/marketing/reports?${params}`,
      ),
  });
}

export interface ExpenseInput {
  category: string;
  description: string;
  amount: number;
  expenseDate: string;
  branchId?: string;
  adCampaignId?: string;
  note?: string;
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ExpenseInput) =>
      apiClient('/finance/expenses', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance'] });
    },
  });
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: ExpenseInput & { id: string }) =>
      apiClient(`/finance/expenses/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance'] }),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient(`/finance/expenses/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance'] }),
  });
}

export function defaultFinanceFilters(): FinanceDateFilters {
  const to = new Date();
  const from = new Date();
  from.setDate(1);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    branchId: '',
  };
}
