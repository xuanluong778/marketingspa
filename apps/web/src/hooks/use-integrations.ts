import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { IntegrationItem, IntegrationProvider } from '@/types/automation-messaging';

export function useIntegrations() {
  return useQuery({
    queryKey: ['integrations'],
    queryFn: () => apiClient<IntegrationItem[]>('/integrations'),
  });
}

export function useConnectIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      provider,
      credentials,
    }: {
      provider: IntegrationProvider;
      credentials: Record<string, string>;
    }) =>
      apiClient(`/integrations/${provider}/connect`, {
        method: 'POST',
        body: JSON.stringify({ credentials }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export function useTestIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: IntegrationProvider) =>
      apiClient(`/integrations/${provider}/test`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export function useDisconnectIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: IntegrationProvider) =>
      apiClient(`/integrations/${provider}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export const INTEGRATION_FIELDS: Record<
  IntegrationProvider,
  { key: string; label: string; type?: string }[]
> = {
  META_ADS: [
    { key: 'appId', label: 'App ID' },
    { key: 'appSecret', label: 'App Secret', type: 'password' },
    { key: 'accessToken', label: 'Access Token', type: 'password' },
  ],
  GOOGLE_ADS: [
    { key: 'clientId', label: 'Client ID' },
    { key: 'clientSecret', label: 'Client Secret', type: 'password' },
    { key: 'developerToken', label: 'Developer Token', type: 'password' },
  ],
  ZALO_OA: [
    { key: 'oaId', label: 'OA ID' },
    { key: 'secretKey', label: 'Secret Key', type: 'password' },
  ],
  SMS: [
    { key: 'apiKey', label: 'API Key', type: 'password' },
    { key: 'brandName', label: 'Brand name' },
  ],
  EMAIL: [
    { key: 'smtpHost', label: 'SMTP Host' },
    { key: 'smtpUser', label: 'SMTP User' },
    { key: 'smtpPassword', label: 'SMTP Password', type: 'password' },
  ],
};
