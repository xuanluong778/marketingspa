import { useQuery, type QueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { CreditBalanceSnapshot } from '@marketingspa/shared';

export const CREDITS_QUERY_KEY = ['credits'] as const;

/** Gọi sau tác vụ AI trừ Credit — header chip và /credits refresh ngay. */
export function invalidateCredits(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: [...CREDITS_QUERY_KEY, 'balance'] }),
    qc.invalidateQueries({ queryKey: [...CREDITS_QUERY_KEY, 'history'] }),
  ]);
}

export type CreditBalance = CreditBalanceSnapshot;

export type CreditHistoryItem = {
  id: string;
  createdAt: string;
  type: string;
  featureCode: string | null;
  featureLabel: string;
  reason: string | null;
  referenceId: string | null;
  amount: number;
  balanceAfter: number;
  reservedAfter: number;
};

type PageResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export function useCreditBalance(enabled = true) {
  return useQuery({
    queryKey: [...CREDITS_QUERY_KEY, 'balance'],
    queryFn: () => apiClient<CreditBalance>('/credits/balance'),
    enabled,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });
}

export function useCreditHistory(params: { page?: number; pageSize?: number }) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  return useQuery({
    queryKey: [...CREDITS_QUERY_KEY, 'history', page, pageSize],
    queryFn: () =>
      apiClient<PageResult<CreditHistoryItem>>(
        `/credits/history?page=${page}&pageSize=${pageSize}`,
      ),
  });
}

export type CreditPackage = {
  id: string;
  code: string;
  name: string;
  credits: number;
  priceVnd: number;
  status: string;
};

export function useCreditPackages() {
  return useQuery({
    queryKey: ['credits', 'packages'],
    queryFn: () => apiClient<CreditPackage[]>('/credits/packages'),
    staleTime: 60_000,
  });
}
