'use client';

import Link from 'next/link';
import { CalendarDays, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n/i18n-provider';
import { useSubscriptionDisplay } from '@/hooks/use-subscription-display';

/** Header: hiển thị gói hiện tại; nút nâng cấp Pro chỉ khi chưa có gói trả phí. Nâng cấp 12 tháng → sidebar. */
export function HeaderSubscriptionChips() {
  const t = useT();
  const { display } = useSubscriptionDisplay();
  if (!display) return null;

  const days = display.remainingDays;
  const upgrade = display.upgradeButton;
  const showCurrentPlanBadge =
    display.tier === 'PRO_6M' ||
    display.tier === 'PRO_12M' ||
    display.tier === 'TRIAL' ||
    display.tier === 'ADMIN_GIFT';
  const showUpgradeProInHeader = upgrade?.show && upgrade.variant === 'upgrade_pro';

  const daysTone =
    days <= 0
      ? 'bg-red-500/25 text-red-100 ring-red-300/40'
      : days <= 15
        ? 'bg-amber-500/25 text-amber-100 ring-amber-300/40'
        : 'bg-white/10 text-white/90 ring-white/15';

  const planBadgeClass =
    'inline-flex max-w-[240px] items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-50 ring-1 ring-emerald-300/35 sm:max-w-none';

  return (
    <>
      {display.showDaysChip ? (
        <Link
          href="/pricing"
          title={t('layout.viewSubscription')}
          className={cn(
            'inline-flex max-w-[200px] items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 sm:max-w-none',
            daysTone,
          )}
        >
          <CalendarDays className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden truncate sm:inline">{t('layout.daysRemaining')}</span>
          <span className="truncate whitespace-nowrap font-semibold">
            {days} {t('layout.daysUnit')}
          </span>
        </Link>
      ) : null}

      {showCurrentPlanBadge ? (
        <Link href="/pricing" title={display.planLabel} className={planBadgeClass}>
          <Crown className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{display.planLabel}</span>
        </Link>
      ) : null}

      {showUpgradeProInHeader ? (
        <Link
          href={upgrade.href}
          title={upgrade.label}
          className={cn(
            'inline-flex max-w-[220px] items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition-colors sm:max-w-none',
            'bg-gradient-to-r from-amber-400 to-yellow-300 text-[#0A3D30] ring-amber-200/50 shadow-sm hover:from-amber-300 hover:to-yellow-200',
          )}
        >
          <Crown className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{upgrade.label}</span>
        </Link>
      ) : null}
    </>
  );
}
