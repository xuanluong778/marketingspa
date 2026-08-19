'use client';

import { useEffect, useState } from 'react';
import { authStorage } from '@/lib/auth-storage';
import { useCurrentUser } from '@/hooks/use-auth';
import { LoadingState, ErrorState } from '@/components/shared/page-state';
import { ApiError } from '@/lib/api-client';

function redirectToLogin() {
  if (typeof window === 'undefined') return;
  if (window.location.pathname === '/login') return;
  // Hard navigation — tránh kẹt soft-route khi remount/HMR
  window.location.replace('/login');
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const { isLoading, isError, error, refetch, isSuccess, data, isFetching } = useCurrentUser();

  const apiError = error as ApiError | undefined;
  const isUnauthorized = isError && apiError?.statusCode === 401 && !data;
  const isNetworkError = isError && !apiError?.statusCode && !data;

  useEffect(() => {
    const authenticated = authStorage.isAuthenticated();
    setHasToken(authenticated);
    setReady(true);
    if (!authenticated) {
      redirectToLogin();
    }
  }, []);

  useEffect(() => {
    // Only hard-redirect when we truly have no session (no prior /auth/me data)
    if (!isUnauthorized) return;
    authStorage.clear();
    setHasToken(false);
    redirectToLogin();
  }, [isUnauthorized]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A3D30]">
        <LoadingState message="Đang tải..." className="text-white [&_svg]:text-white" />
      </div>
    );
  }

  if (!hasToken || !authStorage.isAuthenticated()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A3D30]">
        <LoadingState
          message="Đang chuyển đến trang đăng nhập..."
          className="text-white [&_svg]:text-white"
        />
      </div>
    );
  }

  // Keep children mounted once we have user data — temporary 401/refetch must NOT remount Teleprompter
  if (data || isSuccess) {
    return <>{children}</>;
  }

  if (isUnauthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A3D30]">
        <LoadingState
          message="Phiên đăng nhập hết hạn..."
          className="text-white [&_svg]:text-white"
        />
      </div>
    );
  }

  if (isLoading || isFetching || (!isSuccess && !isError && !data)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A3D30]">
        <LoadingState message="Đang xác thực..." className="text-white [&_svg]:text-white" />
      </div>
    );
  }

  if (isNetworkError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <ErrorState
          message="Không kết nối được server. Kiểm tra API đang chạy (port 4000)."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <ErrorState
          message={apiError?.message ?? 'Không thể xác thực phiên đăng nhập'}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return <>{children}</>;
}
