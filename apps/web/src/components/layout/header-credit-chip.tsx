'use client';

import Link from 'next/link';
import { Coins } from 'lucide-react';
import { CREDIT_LOW_THRESHOLD } from '@marketingspa/shared';
import { useCurrentUser } from '@/hooks/use-auth';
import { useCreditBalance } from '@/hooks/use-credit';
import { formatCredit } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n/i18n-provider';

export function HeaderCreditChip() {
  const t = useT();
  const { data: user } = useCurrentUser();
  const { data } = useCreditBalance(Boolean(user?.organizationId));
  if (!user?.organizationId || data == null) return null;

  const available = Number(data.available ?? data.balance ?? 0);
  const tone =
    available <= 0
      ? 'bg-red-500/25 text-red-100 ring-red-300/40'
      : available < CREDIT_LOW_THRESHOLD
        ? 'bg-amber-500/25 text-amber-100 ring-amber-300/40'
        : 'bg-white/10 text-white/90 ring-white/15';

  return (
    <Link
      href="/credits"
      title={
        available <= 0
          ? t('layout.aiCreditsOut')
          : available < CREDIT_LOW_THRESHOLD
            ? t('layout.aiCreditsLow')
            : t('layout.viewAiCredits')
      }
      className={cn(
        'inline-flex max-w-[220px] items-center gap-1 truncate rounded-full px-2.5 py-1 text-xs font-medium ring-1 sm:max-w-none',
        tone,
      )}
    >
      <Coins className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">
        {t('layout.aiCreditsRemaining', { count: formatCredit(available) })}
      </span>
    </Link>
  );
}
