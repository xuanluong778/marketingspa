'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authStorage } from '@/lib/auth-storage';
import { useCurrentUser } from '@/hooks/use-auth';
import { LoadingState } from '@/components/shared/page-state';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isLoading, isError } = useCurrentUser();

  useEffect(() => {
    if (!authStorage.isAuthenticated()) {
      router.replace('/login');
    }
  }, [router]);

  if (!authStorage.isAuthenticated()) {
    return <LoadingState message="Đang chuyển hướng..." />;
  }

  if (isLoading) {
    return <LoadingState />;
  }

  if (isError) {
    authStorage.clear();
    router.replace('/login');
    return <LoadingState message="Phiên đăng nhập hết hạn..." />;
  }

  return <>{children}</>;
}
