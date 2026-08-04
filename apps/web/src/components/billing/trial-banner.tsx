'use client';

import Link from 'next/link';
import { useCurrentSubscription } from '@/hooks/use-billing';

function formatRemaining(ms: number): string {
  if (ms <= 0) return '0 giờ';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  if (days > 0) return `${days} ngày ${hours} giờ`;
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `${hours} giờ ${minutes} phút`;
}

/**
 * Banner dùng thử — khôi phục từ runtime AppShell (20260802_2028).
 */
export function TrialBanner() {
  const { data } = useCurrentSubscription();
  const status = data?.subscriptionStatus ?? data?.status;
  const trial = data?.trial;

  if (status !== 'TRIALING' || !trial) return null;

  const warn = trial.warningWithin24h;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-sm text-white ${
        warn ? 'border-amber-400/40 bg-amber-600/30' : 'border-white/10 bg-[#0A3D31]'
      }`}
    >
      <p className="text-white">
        {warn ? '⚠️ Dùng thử sắp hết hạn — ' : 'Dùng thử miễn phí — '}
        còn <strong className="text-white">{formatRemaining(trial.remainingMs)}</strong>
        {trial.trialEndsAt
          ? ` (đến ${new Date(trial.trialEndsAt).toLocaleString('vi-VN')})`
          : ''}
      </p>
      <Link
        href="/pricing"
        className="rounded-md bg-heading px-3 py-1 text-xs font-medium text-white hover:bg-heading/90"
      >
        Nâng cấp ngay
      </Link>
    </div>
  );
}

export default TrialBanner;
