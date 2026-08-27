'use client';

import { cn } from '@/lib/utils';
import { useT } from '@/i18n/i18n-provider';
import type { ModuleHubKpi } from '@/config/module-hubs';

export function ModuleKpiCard({
  kpi,
  className,
}: {
  kpi: ModuleHubKpi;
  className?: string;
}) {
  const t = useT();
  return (
    <div
      className={cn(
        'rounded-xl border border-white/10 bg-white/5 p-4',
        className,
      )}
    >
      <p className="text-xs text-white/60">{t(kpi.labelKey)}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight text-white">{kpi.value}</p>
      {kpi.hintKey ? (
        <p className="mt-1 text-[11px] text-white/45">{t(kpi.hintKey)}</p>
      ) : null}
    </div>
  );
}

export function ModuleKpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-[88px] animate-pulse rounded-xl border border-white/10 bg-white/5"
        />
      ))}
    </div>
  );
}
