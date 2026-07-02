import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { EmployeeDetail, EmployeePerformance } from '@/types/appointments';

export interface EmployeeInput {
  name: string;
  phone?: string;
  email?: string;
  position?: string;
  branchId?: string;
  roleCode?: string;
}

export function useEmployeePerformance(
  employeeId: string,
  filters: { from: string; to: string },
  enabled = true,
) {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);

  return useQuery({
    queryKey: ['employees', employeeId, 'performance', filters],
    queryFn: () => apiClient<EmployeePerformance>(`/employees/${employeeId}/performance?${params}`),
    enabled: !!employeeId && enabled,
  });
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: EmployeeInput) =>
      apiClient<EmployeeDetail>('/employees', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: EmployeeInput & { id: string; isActive?: boolean }) =>
      apiClient<EmployeeDetail>(`/employees/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  });
}

export function useDeleteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient(`/employees/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  });
}

export function defaultPerformanceRange() {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}
