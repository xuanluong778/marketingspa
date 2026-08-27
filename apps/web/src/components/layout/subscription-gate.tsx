'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useCurrentUser } from '@/hooks/use-auth';
import { useCurrentSubscription } from '@/hooks/use-billing';
import { LoadingState } from '@/components/shared/page-state';
import { useT } from '@/i18n/i18n-provider';

/** Routes luôn mở dù chưa có gói / hết trial */
const ALLOW = ['/pricing', '/settings', '/credits', '/login', '/register'];

/**
 * Khóa khu vực app khi chưa ACTIVE/TRIALING.
 * SUPER_ADMIN và /admin/* luôn được vào.
 * Khôi phục từ runtime 20260802_2028 (SubscriptionGate).
 */
export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const t = useT();
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
    if (isSuperAdmin) return;
    if (sub.isLoading || sub.isFetching || sub.isError) return;
    if (hasAccess || bypass) return;
    const reason = status === 'TRIAL_EXPIRED' ? 'trial_expired' : 'subscription_required';
    router.replace(`/pricing?reason=${reason}`);
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
        <LoadingState message={t('billing.checkingSubscription')} />
      </div>
    );
  }

  if (hasAccess || bypass) return <>{children}</>;

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <LoadingState message={t('billing.redirectingToPricing')} />
    </div>
  );
}

export default SubscriptionGate;
