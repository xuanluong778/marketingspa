'use client';

import { ModuleHubPage } from '@/components/module-hub/module-hub-page';
import { getModuleHubById, type ModuleHubKpi } from '@/config/module-hubs';
import { EmptyState } from '@/components/shared/page-state';
import { useT } from '@/i18n/i18n-provider';

export function ModuleHubRoute({
  hubId,
  badges,
  kpis,
  kpisLoading,
  kpisError,
  onRetryKpis,
}: {
  hubId: string;
  badges?: Record<string, string | number | null | undefined>;
  kpis?: ModuleHubKpi[];
  kpisLoading?: boolean;
  kpisError?: boolean;
  onRetryKpis?: () => void;
}) {
  const t = useT();
  const hub = getModuleHubById(hubId);

  if (!hub) {
    return (
      <EmptyState title={t('moduleHub.missing')} description={t('moduleHub.missingDesc')} />
    );
  }

  return (
    <ModuleHubPage
      hub={hub}
      badges={badges}
      kpis={kpis}
      kpisLoading={kpisLoading}
      kpisError={kpisError}
      onRetryKpis={onRetryKpis}
    />
  );
}
