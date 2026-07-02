import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { PaginatedResult } from '@/types/api';
import type {
  MessageTemplateDetail,
  AutomationFlowDetail,
  AutomationLogDetail,
  MessageChannel,
  AutomationTriggerType,
} from '@/types/automation-messaging';

export interface TemplateInput {
  name: string;
  channel: MessageChannel;
  subject?: string;
  body: string;
  variables?: string[];
  isActive?: boolean;
}

export interface FlowInput {
  name: string;
  triggerType: AutomationTriggerType;
  messageTemplateId?: string;
  channel?: MessageChannel;
  delayMinutes?: number;
  isActive?: boolean;
}

export function useAutomationVariables() {
  return useQuery({
    queryKey: ['automation', 'variables'],
    queryFn: () =>
      apiClient<{ key: string; placeholder: string; label: string }[]>('/automation/variables'),
  });
}

export function useAutomationTemplates(params?: Record<string, string>) {
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  return useQuery({
    queryKey: ['automation', 'templates', params],
    queryFn: () => apiClient<PaginatedResult<MessageTemplateDetail>>(`/automation/templates${qs}`),
  });
}

export function useAutomationFlows() {
  return useQuery({
    queryKey: ['automation', 'flows'],
    queryFn: () => apiClient<AutomationFlowDetail[]>('/automation/flows'),
  });
}

export function useAutomationLogs(params?: Record<string, string>) {
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  return useQuery({
    queryKey: ['automation', 'logs', params],
    queryFn: () => apiClient<PaginatedResult<AutomationLogDetail>>(`/automation/logs${qs}`),
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TemplateInput) =>
      apiClient<MessageTemplateDetail>('/automation/templates', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation'] }),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: TemplateInput & { id: string }) =>
      apiClient<MessageTemplateDetail>(`/automation/templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation'] }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient(`/automation/templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation'] }),
  });
}

export function useCreateFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: FlowInput) =>
      apiClient<AutomationFlowDetail>('/automation/flows', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation'] }),
  });
}

export function useUpdateFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: FlowInput & { id: string }) =>
      apiClient<AutomationFlowDetail>(`/automation/flows/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation'] }),
  });
}

export function useDeleteFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient(`/automation/flows/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation'] }),
  });
}

export function useSimulateFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      customerId,
      leadId,
    }: {
      id: string;
      customerId?: string;
      leadId?: string;
    }) =>
      apiClient(`/automation/flows/${id}/simulate`, {
        method: 'POST',
        body: JSON.stringify({ customerId, leadId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation', 'logs'] }),
  });
}
