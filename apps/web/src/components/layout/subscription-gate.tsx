'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useCurrentUser } from '@/hooks/use-auth';
import { useCurrentSubscription } from '@/hooks/use-billing';
import { LoadingState } from '@/components/shared/page-state';

/** Routes luôn mở dù chưa có gói / hết trial */
const ALLOW = ['/pricing', '/settings', '/credits', '/login', '/register'];

/**
 * Khóa khu vực app khi chưa ACTIVE/TRIALING.
 * SUPER_ADMIN và /admin/* luôn được vào.
 * Khôi phục từ runtime 20260802_2028 (SubscriptionGate).
 */
export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const sub = useCurrentSubscription();

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const onAllowPath =
    ALLOW.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    pathname === '/admin' ||
    pathname.startsWith('/admin/');
  const bypass = onAllowPath || isSuperAdmin;

  const status = sub.data?.subscriptionStatus ?? sub.data?.status ?? null;
  const hasAccess =
    !!sub.data?.hasPlan &&
    !sub.data?.isExpired &&
    (status === 'ACTIVE' || status === 'EXPIRING' || status === 'TRIALING');

  useEffect(() => {
    if (isSuperAdmin || bypass) return;
    if (sub.isLoading || sub.isFetching) return;
    if (hasAccess) return;

    const reason =
      sub.isError
        ? 'subscription_check_failed'
        : status === 'TRIAL_EXPIRED'
          ? 'trial_expired'
          : 'subscription_required';
    const target = `/pricing?reason=${reason}`;
    router.replace(target);
    // Fallback when client router is stuck (common after auth redirect)
    if (typeof window !== 'undefined' && window.location.pathname !== '/pricing') {
      window.setTimeout(() => {
        if (!window.location.pathname.startsWith('/pricing')) {
          window.location.replace(target);
        }
      }, 300);
    }
  }, [
    bypass,
    hasAccess,
    isSuperAdmin,
    router,
    status,
    sub.isError,
    sub.isFetching,
    sub.isLoading,
  ]);

  if (isSuperAdmin) return <>{children}</>;

  if (sub.isLoading && !sub.data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoadingState message="Đang kiểm tra gói đăng ký..." />
      </div>
    );
  }

  if (hasAccess || bypass) return <>{children}</>;

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <LoadingState message="Đang chuyển đến trang thanh toán..." />
    </div>
  );
}

export default SubscriptionGate;
