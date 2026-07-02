import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { authStorage } from '@/lib/auth-storage';
import type { AuthResponse, AuthUser } from '@/types/api';

export function useCurrentUser() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiClient<AuthUser>('/auth/me'),
    enabled: authStorage.isAuthenticated(),
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      apiClient<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
        auth: false,
      }),
    onSuccess: (data) => {
      authStorage.setTokens(data.accessToken, data.refreshToken);
      qc.setQueryData(['auth', 'me'], data.user);
    },
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      email: string;
      password: string;
      name: string;
      organizationName: string;
    }) =>
      apiClient<AuthResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(body),
        auth: false,
      }),
    onSuccess: (data) => {
      authStorage.setTokens(data.accessToken, data.refreshToken);
      qc.setQueryData(['auth', 'me'], data.user);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const refreshToken = authStorage.getRefreshToken();
      try {
        await apiClient('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        // ignore
      }
      authStorage.clear();
    },
    onSuccess: () => {
      qc.clear();
    },
  });
}
