'use client';

import Link from 'next/link';
import { Coins } from 'lucide-react';
import { CREDIT_LOW_THRESHOLD } from '@marketingspa/shared';
import { useCurrentUser } from '@/hooks/use-auth';
import { useCreditBalance } from '@/hooks/use-credit';
import { useT } from '@/i18n/i18n-provider';
import { formatCredit } from '@/lib/format';
import { cn } from '@/lib/utils';

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

  const title =
    available <= 0
      ? t('layout.aiCreditsOut')
      : available < CREDIT_LOW_THRESHOLD
        ? t('layout.aiCreditsLow')
        : t('layout.viewAiCredits');

  return (
    <Link
      href="/credits"
      title={title}
      className={cn(
        'inline-flex max-w-[9.5rem] items-center gap-1 truncate rounded-full px-2 py-1.5 text-xs font-medium ring-1 sm:max-w-[220px] sm:px-2.5',
        tone,
      )}
    >
      <Coins className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate sm:hidden">{formatCredit(available)}</span>
      <span className="hidden truncate sm:inline">
        {t('layout.aiCreditsRemaining', { count: formatCredit(available) })}
      </span>
    </Link>
  );
}
