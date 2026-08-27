'use client';

import Link from 'next/link';
import { useCurrentSubscription } from '@/hooks/use-billing';
import { useI18n } from '@/i18n/i18n-provider';

function formatRemaining(ms: number, t: ReturnType<typeof useI18n>['t']): string {
  if (ms <= 0) return t('billing.zeroHours');
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  if (days > 0) return t('billing.daysHours', { days, hours });
  const minutes = Math.floor((ms % 3600000) / 60000);
  return t('billing.hoursMinutes', { hours, minutes });
}

/**
 * Banner dùng thử — khôi phục từ runtime AppShell (20260802_2028).
 */
export function TrialBanner() {
  const { locale, t } = useI18n();
  const { data } = useCurrentSubscription();
  const status = data?.subscriptionStatus ?? data?.status;
  const trial = data?.trial;

  if (status !== 'TRIALING' || !trial) return null;

  const warn = trial.warningWithin24h;
  const dateLocale = locale === 'en' ? 'en-US' : 'vi-VN';

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-sm text-white ${
        warn ? 'border-amber-400/40 bg-amber-600/30' : 'border-white/10 bg-[#0A3D31]'
      }`}
    >
      <p className="text-white">
        {warn ? '⚠️ ' : ''}
        {t('billing.trialRemaining')}{' '}
        <strong className="text-white">{formatRemaining(trial.remainingMs, t)}</strong>
        {trial.trialEndsAt
          ? ` ${t('billing.trialUntil', {
              date: new Date(trial.trialEndsAt).toLocaleString(dateLocale),
            })}`
          : ''}
      </p>
      <Link
        href="/pricing"
        className="rounded-md bg-heading px-3 py-1 text-xs font-medium text-white hover:bg-heading/90"
      >
        {t('billing.upgradeNow')}
      </Link>
    </div>
  );
}

export default TrialBanner;
