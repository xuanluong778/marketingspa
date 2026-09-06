'use client';

import { StatCard, StatCardSkeleton } from '@/components/shared/stat-card';
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
    <StatCard
      label={t(kpi.labelKey)}
      value={kpi.value}
      hint={kpi.hintKey ? t(kpi.hintKey) : undefined}
      className={className}
    />
  );
}

export function ModuleKpiSkeleton({ count = 4 }: { count?: number }) {
  return <StatCardSkeleton count={count} />;
}
