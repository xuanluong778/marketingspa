'use client';

import { cn } from '@/lib/utils';
import { useT } from '@/i18n/i18n-provider';

const STEPS = ['DRAFT', 'ACTIVE', 'PAUSED'] as const;

export function FunnelStatusStrip({ status = 'DRAFT' }: { status?: string }) {
  const t = useT();
  const current = status === 'ARCHIVED' ? 'PAUSED' : status;

  function label(step: string) {
    if (step === 'ACTIVE') return t('funnel.statusActive');
    if (step === 'PAUSED') return t('funnel.statusPaused');
    if (step === 'ARCHIVED') return t('funnel.statusArchived');
    return t('funnel.statusDraft');
  }

  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs">
      {STEPS.map((step, i) => (
        <li key={step} className="flex items-center gap-1">
          {i > 0 ? <span className="text-muted-foreground">→</span> : null}
          <span
            className={cn(
              'rounded-full border px-2 py-0.5',
              current === step
                ? step === 'ACTIVE'
                  ? 'border-green-600 bg-green-600 text-white'
                  : step === 'PAUSED'
                    ? 'border-amber-500 bg-amber-500/15 font-medium text-amber-800'
                    : 'border-primary bg-primary/10 font-medium'
                : 'text-muted-foreground',
            )}
          >
            {label(step)}
          </span>
        </li>
      ))}
    </ol>
  );
}
