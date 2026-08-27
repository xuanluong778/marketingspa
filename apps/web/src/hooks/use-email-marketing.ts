import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { PaginatedResult } from '@/types/api';
import type {
  EmailAudienceMember,
  EmailAudiencePreview,
  CreateEmailAutomationFromRecipeInput,
  EmailAutomation,
  EmailAutomationRecipe,
  EmailCrmStageOption,
  EmailCampaign,
  EmailCampaignRecipient,
  EmailContact,
  EmailContactFacets,
  EmailGeneratedContent,
  EmailImportResult,
  EmailList,
  EmailOverview,
  EmailReports,
  EmailSegment,
  EmailSenderDomain,
  EmailSuppression,
  EmailTemplate,
} from '@/types/email-marketing';
import { apiClient, apiUpload } from '@/lib/api-client';

const KEY = ['email-marketing'] as const;

export function useEmailOverview() {
  return useQuery({
    queryKey: [...KEY, 'overview'],
    queryFn: () => apiClient<EmailOverview>('/email-marketing/overview'),
  });
}

export function useEmailReports() {
  return useQuery({
    queryKey: [...KEY, 'reports'],
    queryFn: () => apiClient<EmailReports>('/email-marketing/reports'),
  });
}

export function useEmailTemplates(params?: Record<string, string>) {
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  return useQuery({
    queryKey: [...KEY, 'templates', params],
    queryFn: () => apiClient<PaginatedResult<EmailTemplate>>(`/email-marketing/templates${qs}`),
  });
}

export function useEmailContacts(params?: Record<string, string>) {
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  return useQuery({
    queryKey: [...KEY, 'contacts', params],
    queryFn: () => apiClient<PaginatedResult<EmailContact>>(`/email-marketing/contacts${qs}`),
  });
}

export function useEmailLists(params?: Record<string, string>) {
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  return useQuery({
    queryKey: [...KEY, 'lists', params],
    queryFn: () => apiClient<PaginatedResult<EmailList>>(`/email-marketing/lists${qs}`),
  });
}

export function useEmailSegments() {
  return useQuery({
    queryKey: [...KEY, 'segments'],
    queryFn: () => apiClient<PaginatedResult<EmailSegment>>('/email-marketing/segments?pageSize=50'),
  });
}

export function useEmailCampaigns(params?: Record<string, string>) {
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  return useQuery({
    queryKey: [...KEY, 'campaigns', params],
    queryFn: () => apiClient<PaginatedResult<EmailCampaign>>(`/email-marketing/campaigns${qs}`),
  });
}

export function useEmailCampaign(id: string | null) {
  return useQuery({
    queryKey: [...KEY, 'campaign', id],
    queryFn: () => apiClient<EmailCampaign>(`/email-marketing/campaigns/${id}`),
    enabled: !!id,
  });
}

export function useEmailCampaignRecipients(
  campaignId: string | null,
  params?: Record<string, string>,
) {
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  return useQuery({
    queryKey: [...KEY, 'campaign-recipients', campaignId, params],
    queryFn: () =>
      apiClient<PaginatedResult<EmailCampaignRecipient>>(
        `/email-marketing/campaigns/${campaignId}/recipients${qs}`,
      ),
    enabled: !!campaignId,
  });
}

export function useEmailSuppressions() {
  return useQuery({
    queryKey: [...KEY, 'suppressions'],
    queryFn: () =>
      apiClient<PaginatedResult<EmailSuppression>>('/email-marketing/suppressions?pageSize=50'),
  });
}

export function useEmailDomains() {
  return useQuery({
    queryKey: [...KEY, 'domains'],
    queryFn: () => apiClient<EmailSenderDomain[]>('/email-marketing/domains'),
  });
}

export function useEmailAutomations() {
  return useQuery({
    queryKey: [...KEY, 'automations'],
    queryFn: () => apiClient<EmailAutomation[]>('/email-marketing/automations'),
  });
}

export function useEmailAutomationRecipes() {
  return useQuery({
    queryKey: [...KEY, 'automation-recipes'],
    queryFn: () => apiClient<EmailAutomationRecipe[]>('/email-marketing/automations/recipes'),
  });
}

export function useEmailCrmStages() {
  return useQuery({
    queryKey: [...KEY, 'automation-crm-stages'],
    queryFn: () => apiClient<EmailCrmStageOption[]>('/email-marketing/automations/crm-stages'),
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  return qc.invalidateQueries({ queryKey: KEY });
}

export function useEmailMutation<TBody, TResult = unknown>(
  path: string | ((body: TBody) => string),
  method: 'POST' | 'PATCH' | 'DELETE',
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TBody) => {
      const url = typeof path === 'function' ? path(body) : path;
      let payload: unknown = body;
      if (method !== 'DELETE' && body && typeof body === 'object' && 'id' in (body as object)) {
        const { id: _id, ...rest } = body as { id: string } & Record<string, unknown>;
        payload = rest;
      }
      return apiClient<TResult>(url, {
        method,
        body: method === 'DELETE' ? undefined : JSON.stringify(payload),
      });
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useCreateEmailTemplate() {
  return useEmailMutation<Partial<EmailTemplate>, EmailTemplate>('/email-marketing/templates', 'POST');
}

export function useUpdateEmailTemplate() {
  return useEmailMutation<{ id: string } & Partial<EmailTemplate>, EmailTemplate>(
    (b) => `/email-marketing/templates/${b.id}`,
    'PATCH',
  );
}

export function useDeleteEmailTemplate() {
  return useEmailMutation<string, { ok: boolean }>((id) => `/email-marketing/templates/${id}`, 'DELETE');
}

export function useEmailContactFacets() {
  return useQuery({
    queryKey: [...KEY, 'contact-facets'],
    queryFn: () => apiClient<EmailContactFacets>('/email-marketing/contacts/facets'),
  });
}

export function useCreateEmailContact() {
  return useEmailMutation<Partial<EmailContact> & { listId?: string }, EmailContact>(
    '/email-marketing/contacts',
    'POST',
  );
}

export function useUpdateEmailContact() {
  return useEmailMutation<{ id: string } & Partial<EmailContact> & { listId?: string }, EmailContact>(
    (b) => `/email-marketing/contacts/${b.id}`,
    'PATCH',
  );
}

export function useDeleteEmailContact() {
  return useEmailMutation<string>((id) => `/email-marketing/contacts/${id}`, 'DELETE');
}

export function useSyncEmailCrm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<EmailImportResult>('/email-marketing/contacts/sync-crm', { method: 'POST' }),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useImportEmailCustomers() {
  return useSyncEmailCrm();
}

export function useImportEmailFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, listId }: { file: File; listId?: string }) => {
      const fd = new FormData();
      fd.append('file', file);
      const qs = listId ? `?listId=${encodeURIComponent(listId)}` : '';
      return apiUpload<EmailImportResult>(`/email-marketing/contacts/import-file${qs}`, fd);
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useCreateEmailList() {
  return useEmailMutation<{ name: string; description?: string }, EmailList>(
    '/email-marketing/lists',
    'POST',
  );
}

export function useDeleteEmailList() {
  return useEmailMutation<string>((id) => `/email-marketing/lists/${id}`, 'DELETE');
}

export function useAddListMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      listId,
      email,
      name,
      contactId,
    }: {
      listId: string;
      email?: string;
      name?: string;
      contactId?: string;
    }) =>
      apiClient(`/email-marketing/lists/${listId}/members`, {
        method: 'POST',
        body: JSON.stringify({ email, name, contactId }),
      }),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useCreateEmailSegment() {
  return useEmailMutation<{ name: string; rules?: Record<string, unknown> }, EmailSegment>(
    '/email-marketing/segments',
    'POST',
  );
}

export function useDeleteEmailSegment() {
  return useEmailMutation<string>((id) => `/email-marketing/segments/${id}`, 'DELETE');
}

export function useEmailAudiencePreview(listId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, 'audience-preview', listId ?? 'all'],
    queryFn: () => {
      const qs = listId ? `?listId=${encodeURIComponent(listId)}` : '';
      return apiClient<EmailAudiencePreview>(`/email-marketing/audience-preview${qs}`);
    },
    enabled,
  });
}

export function useEmailAudienceMembers(
  params: { listId?: string; search?: string; page?: string; pageSize?: string; filter?: string },
  enabled: boolean,
) {
  const qs = new URLSearchParams();
  if (params.listId) qs.set('listId', params.listId);
  if (params.search) qs.set('search', params.search);
  if (params.page) qs.set('page', params.page);
  if (params.pageSize) qs.set('pageSize', params.pageSize);
  qs.set('filter', params.filter || 'eligible');
  const q = qs.toString();
  return useQuery({
    queryKey: [...KEY, 'audience-members', params],
    queryFn: () =>
      apiClient<PaginatedResult<EmailAudienceMember>>(
        `/email-marketing/audience-members?${q}`,
      ),
    enabled,
  });
}

export function useGenerateEmailContent() {
  return useMutation({
    mutationFn: (body: { prompt: string }) =>
      apiClient<EmailGeneratedContent>('/email-marketing/generate', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });
}

export function useSendTestEmail() {
  return useMutation({
    mutationFn: (body: { to: string; subject: string; htmlBody: string; previewText?: string }) =>
      apiClient<{ ok: boolean; to: string }>('/email-marketing/send-test', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });
}

export function useCreateEmailCampaign() {
  return useEmailMutation<Partial<EmailCampaign>, EmailCampaign>('/email-marketing/campaigns', 'POST');
}

export function useDeleteEmailCampaign() {
  return useEmailMutation<string>((id) => `/email-marketing/campaigns/${id}`, 'DELETE');
}

export function useSendEmailCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<EmailCampaign>(`/email-marketing/campaigns/${id}/send`, { method: 'POST' }),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateEmailCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      scheduledAt?: string;
      contactIds?: string[];
      name?: string;
    }) =>
      apiClient<EmailCampaign>(`/email-marketing/campaigns/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useScheduleEmailCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, scheduledAt }: { id: string; scheduledAt: string }) =>
      apiClient<EmailCampaign>(`/email-marketing/campaigns/${id}/schedule`, {
        method: 'POST',
        body: JSON.stringify({ scheduledAt }),
      }),
    onSuccess: () => invalidateAll(qc),
  });
}

export function usePauseEmailCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<EmailCampaign>(`/email-marketing/campaigns/${id}/pause`, { method: 'POST' }),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useCancelEmailCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<EmailCampaign>(`/email-marketing/campaigns/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useCreateEmailSuppression() {
  return useEmailMutation<{ email: string; note?: string }, EmailSuppression>(
    '/email-marketing/suppressions',
    'POST',
  );
}

export function useDeleteEmailSuppression() {
  return useEmailMutation<string>((id) => `/email-marketing/suppressions/${id}`, 'DELETE');
}

export function useCreateEmailDomain() {
  return useEmailMutation<
    { domain: string; fromName: string; fromEmail: string; replyTo?: string },
    EmailSenderDomain
  >('/email-marketing/domains', 'POST');
}

export function useUpdateEmailDomain() {
  return useEmailMutation<
    { id: string; fromName?: string; fromEmail?: string; replyTo?: string | null },
    EmailSenderDomain
  >((b) => `/email-marketing/domains/${b.id}`, 'PATCH');
}

export function useVerifyEmailDomain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<EmailSenderDomain>(`/email-marketing/domains/${id}/check`, { method: 'POST' }),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteEmailDomain() {
  return useEmailMutation<string>((id) => `/email-marketing/domains/${id}`, 'DELETE');
}

export function useCreateEmailAutomationFromRecipe() {
  return useEmailMutation<CreateEmailAutomationFromRecipeInput, EmailAutomation>(
    '/email-marketing/automations/from-recipe',
    'POST',
  );
}

export function useCreateEmailAutomation() {
  return useEmailMutation<Partial<EmailAutomation>, EmailAutomation>(
    '/email-marketing/automations',
    'POST',
  );
}

export function useUpdateEmailAutomation() {
  return useEmailMutation<{ id: string } & Partial<EmailAutomation>, EmailAutomation>(
    (b) => `/email-marketing/automations/${b.id}`,
    'PATCH',
  );
}

export function useDeleteEmailAutomation() {
  return useEmailMutation<string>((id) => `/email-marketing/automations/${id}`, 'DELETE');
}

export function useRunEmailAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ queued: number }>(`/email-marketing/automations/${id}/run`, { method: 'POST' }),
    onSuccess: () => invalidateAll(qc),
  });
}
