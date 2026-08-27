'use client';

import { ModuleHubPage } from '@/components/module-hub';
import { getModuleHubById, type ModuleHubKpi } from '@/config/module-hubs';
import { EmptyState } from '@/components/shared/page-state';
import { useT } from '@/i18n/i18n-provider';

/** Generic hub page wired by module id from config. */
export function ModuleHubRoute({
  hubId,
  kpis,
  kpisLoading,
  kpisError,
  onRetryKpis,
  badges,
}: {
  hubId: string;
  kpis?: ModuleHubKpi[];
  kpisLoading?: boolean;
  kpisError?: boolean;
  onRetryKpis?: () => void;
  badges?: Record<string, string | number | null | undefined>;
}) {
  const t = useT();
  const hub = getModuleHubById(hubId);
  if (!hub) {
    return (
      <EmptyState
        title={t('moduleHub.missing')}
        description={t('moduleHub.missingDesc')}
      />
    );
  }
  return (
    <ModuleHubPage
      hub={hub}
      kpis={kpis}
      kpisLoading={kpisLoading}
      kpisError={kpisError}
      onRetryKpis={onRetryKpis}
      badges={badges}
    />
  );
}
