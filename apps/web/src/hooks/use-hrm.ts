import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { PaginatedResult } from '@/types/api';
import type {
  HrmContract,
  HrmDepartment,
  HrmDocument,
  HrmEmployee,
  HrmEmployeeFilters,
  HrmEmployeeInput,
} from '@/types/hrm';

function toQuery(filters: HrmEmployeeFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useHrmEmployees(filters: HrmEmployeeFilters = {}) {
  return useQuery({
    queryKey: ['hrm', 'employees', filters],
    queryFn: () =>
      apiClient<PaginatedResult<HrmEmployee>>(`/hrm/employees${toQuery(filters)}`),
  });
}

export function useHrmEmployee(id: string) {
  return useQuery({
    queryKey: ['hrm', 'employees', id],
    queryFn: () => apiClient<HrmEmployee>(`/hrm/employees/${id}`),
    enabled: !!id,
  });
}

export function useHrmDepartments() {
  return useQuery({
    queryKey: ['hrm', 'departments'],
    queryFn: () => apiClient<HrmDepartment[]>('/hrm/departments'),
  });
}

export function useHrmContracts(employeeId: string) {
  return useQuery({
    queryKey: ['hrm', 'employees', employeeId, 'contracts'],
    queryFn: () => apiClient<HrmContract[]>(`/hrm/employees/${employeeId}/contracts`),
    enabled: !!employeeId,
  });
}

export function useHrmDocuments(employeeId: string) {
  return useQuery({
    queryKey: ['hrm', 'employees', employeeId, 'documents'],
    queryFn: () => apiClient<HrmDocument[]>(`/hrm/employees/${employeeId}/documents`),
    enabled: !!employeeId,
  });
}

export function useHrmEmployeeMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['hrm', 'employees'] });
    qc.invalidateQueries({ queryKey: ['employees'] });
  };

  return {
    create: useMutation({
      mutationFn: (body: HrmEmployeeInput) =>
        apiClient<HrmEmployee>('/hrm/employees', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, ...body }: HrmEmployeeInput & { id: string }) =>
        apiClient<HrmEmployee>(`/hrm/employees/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        }),
      onSuccess: invalidate,
    }),
    deactivate: useMutation({
      mutationFn: (id: string) =>
        apiClient(`/hrm/employees/${id}/deactivate`, { method: 'POST' }),
      onSuccess: invalidate,
    }),
    createAccount: useMutation({
      mutationFn: ({
        employeeId,
        ...body
      }: {
        employeeId: string;
        email: string;
        password: string;
        roleCode: string;
        name?: string;
      }) =>
        apiClient(`/hrm/employees/${employeeId}/account`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      onSuccess: invalidate,
    }),
    resetPassword: useMutation({
      mutationFn: ({ employeeId, password }: { employeeId: string; password: string }) =>
        apiClient(`/hrm/employees/${employeeId}/account/reset-password`, {
          method: 'POST',
          body: JSON.stringify({ password }),
        }),
    }),
    createDepartment: useMutation({
      mutationFn: (body: { name: string; code?: string; branchId?: string }) =>
        apiClient<HrmDepartment>('/hrm/departments', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      onSuccess: () => qc.invalidateQueries({ queryKey: ['hrm', 'departments'] }),
    }),
    createContract: useMutation({
      mutationFn: ({
        employeeId,
        ...body
      }: {
        employeeId: string;
        title: string;
        contractType: string;
        startDate: string;
        endDate?: string;
        salaryBase?: number;
        status?: string;
        notes?: string;
        fileUrl?: string;
      }) =>
        apiClient<HrmContract>(`/hrm/employees/${employeeId}/contracts`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      onSuccess: (_, v) =>
        qc.invalidateQueries({ queryKey: ['hrm', 'employees', v.employeeId] }),
    }),
    createDocument: useMutation({
      mutationFn: ({
        employeeId,
        ...body
      }: {
        employeeId: string;
        title: string;
        type: string;
        fileUrl: string;
      }) =>
        apiClient<HrmDocument>(`/hrm/employees/${employeeId}/documents`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      onSuccess: (_, v) =>
        qc.invalidateQueries({ queryKey: ['hrm', 'employees', v.employeeId, 'documents'] }),
    }),
    archiveDocument: useMutation({
      mutationFn: (id: string) => apiClient(`/hrm/documents/${id}`, { method: 'DELETE' }),
      onSuccess: () => qc.invalidateQueries({ queryKey: ['hrm'] }),
    }),
  };
}
