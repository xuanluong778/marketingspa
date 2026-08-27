'use client';

import { ErrorState, LoadingState } from '@/components/shared/page-state';
import { useAdminOverview } from '@/hooks/use-platform-admin';
import { useT } from '@/i18n/i18n-provider';

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warn' | 'danger' }) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        tone === 'danger'
          ? 'border-red-400/30 bg-red-500/10'
          : tone === 'warn'
            ? 'border-amber-400/30 bg-amber-500/10'
            : 'border-border bg-card'
      }`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

export default function AdminOverviewPage() {
  const t = useT();
  const { data, isLoading, isError, refetch } = useAdminOverview();
  if (isLoading) return <LoadingState />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t('admin.platformOverview')}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Tổ chức / Spa" value={data.organizations} />
        <Stat label="Người dùng" value={data.users} />
        <Stat label="User đang hoạt động" value={data.activeUsers} />
        <Stat label="Gói còn hạn" value={data.subscriptionsActive} />
        <Stat label="Gói hết hạn" value={data.subscriptionsExpired} tone="danger" />
        <Stat label="Hết hạn ≤ 7 ngày" value={data.expiring7} tone="danger" />
        <Stat label="Hết hạn ≤ 15 ngày" value={data.expiring15} tone="warn" />
        <Stat label="Đơn CK chờ thanh toán" value={data.paymentOrdersPending} />
      </div>
    </div>
  );
}
