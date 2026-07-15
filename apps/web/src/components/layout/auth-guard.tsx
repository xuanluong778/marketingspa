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
  const { isLoading, isError, error, refetch, isSuccess, data } = useCurrentUser();

  const apiError = error as ApiError | undefined;
  const isUnauthorized = isError && apiError?.statusCode === 401;
  const isNetworkError = isError && !apiError?.statusCode;

  useEffect(() => {
    const authenticated = authStorage.isAuthenticated();
    setHasToken(authenticated);
    setReady(true);
    if (!authenticated) {
      redirectToLogin();
    }
  }, []);

  useEffect(() => {
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

  if (!hasToken || !authStorage.isAuthenticated() || isUnauthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A3D30]">
        <LoadingState
          message={isUnauthorized ? 'Phiên đăng nhập hết hạn...' : 'Đang chuyển đến trang đăng nhập...'}
          className="text-white [&_svg]:text-white"
        />
      </div>
    );
  }

  if (isLoading || (!isSuccess && !isError && !data)) {
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
