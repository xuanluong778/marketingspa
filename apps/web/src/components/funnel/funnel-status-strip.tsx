'use client';

import { publicStatusLabel } from '@/lib/funnel-lifecycle-ui';
import { cn } from '@/lib/utils';

const STEPS = ['DRAFT', 'ACTIVE', 'PAUSED'] as const;

export function FunnelStatusStrip({ status = 'DRAFT' }: { status?: string }) {
  const current = status === 'ARCHIVED' ? 'PAUSED' : status;
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
            {publicStatusLabel(step)}
          </span>
        </li>
      ))}
    </ol>
  );
}
