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
  META_ADS: [],
  GOOGLE_ADS: [],
  ZALO_OA: [
    { key: 'oaId', label: 'Mã Zalo OA' },
    { key: 'secretKey', label: 'Mã bảo mật', type: 'password' },
  ],
  SMS: [
    { key: 'apiKey', label: 'Mã kết nối SMS', type: 'password' },
    { key: 'brandName', label: 'Tên thương hiệu gửi SMS' },
  ],
  EMAIL: [
    { key: 'smtpHost', label: 'Máy chủ email' },
    { key: 'smtpUser', label: 'Tài khoản email' },
    { key: 'smtpPassword', label: 'Mật khẩu email', type: 'password' },
  ],
};

/** Ads credentials sống ở AdConnection (/ads) — không cấu hình tại Integrations */
export const ADS_INTEGRATION_PROVIDERS: IntegrationProvider[] = ['META_ADS', 'GOOGLE_ADS'];
