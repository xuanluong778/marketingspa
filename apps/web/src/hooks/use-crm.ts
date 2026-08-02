import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { PaginatedResult, Lead } from '@/types/api';
import type {
  CustomerDetail,
  CustomerHistory,
  LeadDetail,
  LeadPipelineStatus,
  CreateCustomerInput,
  CreateLeadInput,
  CreateAppointmentInput,
  Branch,
  LeadSource,
} from '@/types/crm';

// --- Lookups ---

export function useBranches() {
  return useQuery({
    queryKey: ['branches'],
    queryFn: () => apiClient<Branch[]>('/organizations/branches'),
  });
}

export function useCreateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; code?: string; address?: string; phone?: string }) =>
      apiClient<Branch>('/organizations/branches', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['branches'] }),
  });
}

export function useLeadSources() {
  return useQuery({
    queryKey: ['lead-sources'],
    queryFn: () => apiClient<PaginatedResult<LeadSource>>('/marketing/lead-sources'),
  });
}

export function useStaleLeads(minutes = 10) {
  return useQuery({
    queryKey: ['leads', 'stale', minutes],
    queryFn: () => apiClient<Lead[]>(`/leads/alerts/stale?minutes=${minutes}`),
    refetchInterval: 60_000,
  });
}

// --- Customers ---

export function useCustomer(id: string) {
  return useQuery({
    queryKey: ['customers', id],
    queryFn: () => apiClient<CustomerDetail>(`/customers/${id}`),
    enabled: !!id,
  });
}

export function useCustomerHistory(id: string) {
  return useQuery({
    queryKey: ['customers', id, 'history'],
    queryFn: () => apiClient<CustomerHistory>(`/customers/${id}/history`),
    enabled: !!id,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCustomerInput) =>
      apiClient<CustomerDetail>('/customers', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: CreateCustomerInput & { id: string }) =>
      apiClient<CustomerDetail>(`/customers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customers', vars.id] });
      qc.invalidateQueries({ queryKey: ['customers', vars.id, 'history'] });
    },
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient(`/customers/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

export function useAddCustomerNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, content }: { customerId: string; content: string }) =>
      apiClient(`/customers/${customerId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['customers', vars.customerId, 'history'] });
    },
  });
}

// --- Leads ---

export function useLead(id: string) {
  return useQuery({
    queryKey: ['leads', id],
    queryFn: () => apiClient<LeadDetail>(`/leads/${id}`),
    enabled: !!id,
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateLeadInput) =>
      apiClient<LeadDetail>('/leads', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: CreateLeadInput & { id: string; lostReason?: string }) =>
      apiClient<LeadDetail>(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['leads', vars.id] });
    },
  });
}

export function useUpdateLeadStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      pipelineStatus,
      lostReason,
    }: {
      id: string;
      pipelineStatus: LeadPipelineStatus;
      lostReason?: string;
    }) =>
      apiClient<LeadDetail>(`/leads/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ pipelineStatus, lostReason }),
      }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['leads', 'kanban'] });
      const previous = qc.getQueriesData({ queryKey: ['leads', 'kanban'] });
      qc.setQueriesData({ queryKey: ['leads', 'kanban'] }, (old: unknown) => {
        if (!old || typeof old !== 'object' || !('columns' in (old as object))) return old;
        const data = old as {
          columns: Record<
            string,
            { total: number; items: Lead[]; nextCursor: string | null }
          >;
        };
        const columns = { ...data.columns };
        let moved: Lead | undefined;
        for (const [status, col] of Object.entries(columns)) {
          const idx = col.items.findIndex((l) => l.id === vars.id);
          if (idx >= 0) {
            moved = col.items[idx];
            columns[status] = {
              ...col,
              total: Math.max(0, col.total - 1),
              items: col.items.filter((l) => l.id !== vars.id),
            };
            break;
          }
        }
        if (moved) {
          const target = columns[vars.pipelineStatus] ?? {
            total: 0,
            items: [],
            nextCursor: null,
          };
          columns[vars.pipelineStatus] = {
            ...target,
            total: target.total + 1,
            items: [{ ...moved, pipelineStatus: vars.pipelineStatus }, ...target.items],
          };
        }
        return { ...data, columns };
      });
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.previous?.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useLeadKanban(params: Record<string, string>, enabled = true) {
  const qs = new URLSearchParams({ limit: '20', ...params }).toString();
  return useQuery({
    queryKey: ['leads', 'kanban', params],
    queryFn: () =>
      apiClient<{
        columns: Record<
          string,
          { total: number; items: Lead[]; nextCursor: string | null }
        >;
        limit: number;
      }>(`/leads/kanban?${qs}`),
    enabled,
  });
}

export function useLeadSavedViews() {
  return useQuery({
    queryKey: ['leads', 'saved-views'],
    queryFn: () =>
      apiClient<
        Array<{
          id: string;
          name: string;
          viewMode: string;
          filters: Record<string, unknown>;
          tableColumns?: string[] | null;
          isDefault: boolean;
        }>
      >('/leads/saved-views'),
  });
}

export function useCreateLeadSavedView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      viewMode?: string;
      filters?: Record<string, unknown>;
      tableColumns?: string[];
      isDefault?: boolean;
    }) =>
      apiClient('/leads/saved-views', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads', 'saved-views'] }),
  });
}

export function useDeleteLeadSavedView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient(`/leads/saved-views/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads', 'saved-views'] }),
  });
}

export function useBulkLeadAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      leadIds: string[];
      action: 'status' | 'assign' | 'tag';
      pipelineStatus?: string;
      assignedToId?: string;
      tags?: string[];
    }) => apiClient('/leads/bulk', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useAssignLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, assignedToId }: { id: string; assignedToId: string }) =>
      apiClient<LeadDetail>(`/leads/${id}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({ assignedToId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient(`/leads/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });
}

export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAppointmentInput) =>
      apiClient('/appointments', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}
