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
      apiClient<Omit<AuthResponse, 'refreshToken'>>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
        auth: false,
      }),
    onSuccess: (data) => {
      authStorage.setAccessToken(data.accessToken);
      qc.setQueryData(['auth', 'me'], data.user);
    },
  });
}

export function useGoogleLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { idToken: string; referralCode?: string }) => {
      let referralCode = body.referralCode;
      if (!referralCode && typeof window !== 'undefined') {
        try {
          referralCode = localStorage.getItem('msa_ref') || undefined;
        } catch {
          /* ignore */
        }
      }
      return apiClient<Omit<AuthResponse, 'refreshToken'>>('/auth/google', {
        method: 'POST',
        body: JSON.stringify({
          idToken: body.idToken,
          referralCode: referralCode || undefined,
        }),
        auth: false,
      });
    },
    onSuccess: (data) => {
      authStorage.setAccessToken(data.accessToken);
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
      apiClient<Omit<AuthResponse, 'refreshToken'>>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(body),
        auth: false,
      }),
    onSuccess: (data) => {
      authStorage.setAccessToken(data.accessToken);
      qc.setQueryData(['auth', 'me'], data.user);
    },
  });
}

export type SendRegistrationOtpResult = {
  registrationId: string;
  email: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
  message: string;
};

export function useSendRegistrationOtp() {
  return useMutation({
    mutationFn: (body: {
      email: string;
      password: string;
      name: string;
      organizationName: string;
      referralCode?: string;
    }) => {
      // Đảm bảo body cũng mang ref (backup cho cookie/header)
      let referralCode = body.referralCode;
      if (!referralCode && typeof window !== 'undefined') {
        try {
          referralCode = localStorage.getItem('msa_ref') || undefined;
        } catch {
          /* ignore */
        }
      }
      return apiClient<SendRegistrationOtpResult>('/auth/register/send-otp', {
        method: 'POST',
        body: JSON.stringify({ ...body, referralCode: referralCode || undefined }),
        auth: false,
      });
    },
  });
}

export function useResendRegistrationOtp() {
  return useMutation({
    mutationFn: (body: { registrationId: string }) =>
      apiClient<SendRegistrationOtpResult>('/auth/register/resend-otp', {
        method: 'POST',
        body: JSON.stringify(body),
        auth: false,
      }),
  });
}

export function useVerifyRegistrationOtp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { registrationId: string; otp: string }) =>
      apiClient<Omit<AuthResponse, 'refreshToken'>>('/auth/register/verify-otp', {
        method: 'POST',
        body: JSON.stringify(body),
        auth: false,
      }),
    onSuccess: (data) => {
      authStorage.setAccessToken(data.accessToken);
      qc.setQueryData(['auth', 'me'], data.user);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        await apiClient('/auth/logout', { method: 'POST' });
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

/** Đăng xuất + chuyển /login bằng location.replace (chặn Back vào trang đã auth) */
export function logoutAndRedirect() {
  authStorage.clear();
  if (typeof window !== 'undefined') {
    window.location.replace('/login');
  }
}

export function useLogoutAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiClient('/auth/logout-all', { method: 'POST' });
      authStorage.clear();
    },
    onSuccess: () => {
      qc.clear();
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      apiClient('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (body: { email: string }) =>
      apiClient('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify(body),
        auth: false,
      }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (body: { token: string; password: string }) =>
      apiClient('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify(body),
        auth: false,
      }),
  });
}

export function hasPermission(user: AuthUser | undefined, code: string): boolean {
  if (!user) return false;
  // Khớp PermissionsGuard API: OWNER / SUPER_ADMIN bypass toàn bộ RBAC
  if (user.role === 'OWNER' || user.role === 'SUPER_ADMIN') return true;
  return (user.permissions ?? []).includes(code);
}
