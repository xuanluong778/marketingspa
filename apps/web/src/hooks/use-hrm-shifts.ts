import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { PaginatedResult } from '@/types/api';
import type {
  HrmShiftAssignment,
  HrmShiftPolicy,
  HrmShiftPolicyInput,
} from '@/types/hrm';

function toQuery(filters: Record<string, string | number | boolean | undefined> = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useHrmShiftPolicies(filters: {
  branchId?: string;
  includeInactive?: boolean;
} = {}) {
  return useQuery({
    queryKey: ['hrm', 'shift-policies', filters],
    queryFn: () =>
      apiClient<HrmShiftPolicy[]>(
        `/hrm/shift-policies${toQuery(filters as Record<string, string | number | boolean | undefined>)}`,
      ),
  });
}

export function useHrmShiftAssignments(filters: {
  branchId?: string;
  departmentId?: string;
  employeeId?: string;
  policyId?: string;
  from?: string;
  to?: string;
  pageSize?: number;
} = {}) {
  return useQuery({
    queryKey: ['hrm', 'shift-assignments', filters],
    queryFn: () =>
      apiClient<PaginatedResult<HrmShiftAssignment>>(
        `/hrm/shift-assignments${toQuery(filters as Record<string, string | number | boolean | undefined>)}`,
      ),
  });
}

export function useHrmShiftCalendar(filters: {
  from: string;
  to: string;
  branchId?: string;
  departmentId?: string;
  employeeId?: string;
}) {
  return useQuery({
    queryKey: ['hrm', 'shift-calendar', filters],
    queryFn: () =>
      apiClient<{ from: string; to: string; items: HrmShiftAssignment[] }>(
        `/hrm/shift-assignments/calendar${toQuery(filters as Record<string, string | number | boolean | undefined>)}`,
      ),
    enabled: !!filters.from && !!filters.to,
  });
}

export function useHrmShiftMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['hrm', 'shift-policies'] });
    qc.invalidateQueries({ queryKey: ['hrm', 'shift-assignments'] });
    qc.invalidateQueries({ queryKey: ['hrm', 'shift-calendar'] });
    qc.invalidateQueries({ queryKey: ['hrm', 'attendance'] });
  };

  return {
    createPolicy: useMutation({
      mutationFn: (body: HrmShiftPolicyInput) =>
        apiClient<HrmShiftPolicy>('/hrm/shift-policies', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      onSuccess: invalidate,
    }),
    updatePolicy: useMutation({
      mutationFn: ({ id, ...body }: HrmShiftPolicyInput & { id: string }) =>
        apiClient<HrmShiftPolicy>(`/hrm/shift-policies/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        }),
      onSuccess: invalidate,
    }),
    activatePolicy: useMutation({
      mutationFn: (id: string) =>
        apiClient(`/hrm/shift-policies/${id}/activate`, { method: 'POST' }),
      onSuccess: invalidate,
    }),
    deactivatePolicy: useMutation({
      mutationFn: (id: string) =>
        apiClient(`/hrm/shift-policies/${id}/deactivate`, { method: 'POST' }),
      onSuccess: invalidate,
    }),
    deletePolicy: useMutation({
      mutationFn: (id: string) =>
        apiClient(`/hrm/shift-policies/${id}`, { method: 'DELETE' }),
      onSuccess: invalidate,
    }),
    createAssignment: useMutation({
      mutationFn: (body: {
        employeeId: string;
        policyId: string;
        workDate: string;
        branchId?: string;
        forceOverwrite?: boolean;
        note?: string;
      }) =>
        apiClient<HrmShiftAssignment>('/hrm/shift-assignments', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      onSuccess: invalidate,
    }),
    bulkAssign: useMutation({
      mutationFn: (body: {
        policyId: string;
        fromDate: string;
        toDate: string;
        weekdays?: number[];
        employeeIds?: string[];
        departmentId?: string;
        branchId?: string;
        forceOverwrite?: boolean;
        note?: string;
      }) =>
        apiClient('/hrm/shift-assignments/bulk', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      onSuccess: invalidate,
    }),
    deleteAssignment: useMutation({
      mutationFn: (id: string) =>
        apiClient(`/hrm/shift-assignments/${id}`, { method: 'DELETE' }),
      onSuccess: invalidate,
    }),
  };
}
