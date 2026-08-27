'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FunnelAdvancedSection } from '@/components/funnel/funnel-advanced-section';
import { FunnelMineCard } from '@/components/funnel/funnel-mine-card';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/shared/page-state';
import { useFunnelRecommendations } from '@/hooks/use-funnel-builder';
import { funnelHref, type FunnelAdvancedPane } from '@/lib/funnel-tabs';
import { useT } from '@/i18n/i18n-provider';

type StatusFilter = 'all' | 'ACTIVE' | 'DRAFT' | 'PAUSED' | 'ARCHIVED';

const STATUS_RANK: Record<string, number> = {
  ACTIVE: 0,
  PAUSED: 1,
  DRAFT: 2,
  ARCHIVED: 3,
};

export function FunnelMinePanel({
  advancedOpen = false,
  advancedPane = 'scoring',
  initialDesignId = null,
}: {
  advancedOpen?: boolean;
  advancedPane?: FunnelAdvancedPane;
  initialDesignId?: string | null;
}) {
  const t = useT();
  const router = useRouter();
  const list = useFunnelRecommendations();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [visibleDesignId, setVisibleDesignId] = useState<string | null>(null);
  const [mountedDesignIds, setMountedDesignIds] = useState<Set<string>>(() => new Set());
  const items = list.data ?? [];

  const FILTERS: Array<{ id: StatusFilter; label: string }> = [
    { id: 'all', label: t('funnel.filterAll') },
    { id: 'ACTIVE', label: t('funnel.statusActive') },
    { id: 'DRAFT', label: t('funnel.statusDraft') },
    { id: 'PAUSED', label: t('funnel.statusPaused') },
    { id: 'ARCHIVED', label: t('funnel.statusArchived') },
  ];

  useEffect(() => {
    if (!initialDesignId) return;
    setMountedDesignIds((prev) => new Set(prev).add(initialDesignId));
    setVisibleDesignId(initialDesignId);
  }, [initialDesignId]);

  function mountDesign(id: string) {
    setMountedDesignIds((prev) => new Set(prev).add(id));
  }

  function toggleDesign(id: string) {
    mountDesign(id);
    setVisibleDesignId((prev) => (prev === id ? null : id));
  }

  function openDesign(id: string) {
    mountDesign(id);
    setVisibleDesignId(id);
  }

  const counts = useMemo(() => {
    const out: Record<string, number> = { all: 0, ACTIVE: 0, DRAFT: 0, PAUSED: 0, ARCHIVED: 0 };
    for (const row of items) {
      const st = row.status ?? 'DRAFT';
      out.all += 1;
      out[st] = (out[st] ?? 0) + 1;
    }
    return out;
  }, [items]);

  const visible = useMemo(() => {
    const filtered =
      filter === 'all'
        ? items.filter((r) => (r.status ?? 'DRAFT') !== 'ARCHIVED')
        : items.filter((r) => (r.status ?? 'DRAFT') === filter);
    return [...filtered].sort((a, b) => {
      const ra = STATUS_RANK[a.status ?? 'DRAFT'] ?? 9;
      const rb = STATUS_RANK[b.status ?? 'DRAFT'] ?? 9;
      if (ra !== rb) return ra - rb;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [items, filter]);

  if (list.isLoading) return <LoadingState message={t('funnel.loading')} />;
  if (list.isError) return <ErrorState onRetry={() => void list.refetch()} />;

  return (
    <div className="space-y-6">
      {items.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            title={t('funnel.emptyTitle')}
            description={t('funnel.emptyDesc')}
          />
          <div className="flex justify-center">
            <Button onClick={() => router.replace(funnelHref({ tab: 'create', create: true }))}>
              {t('funnel.createFunnel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('funnel.hintSort')}</p>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const n = f.id === 'all' ? items.filter((r) => (r.status ?? 'DRAFT') !== 'ARCHIVED').length : counts[f.id] ?? 0;
              if (f.id === 'ARCHIVED' && n === 0) return null;
              return (
                <Button
                  key={f.id}
                  type="button"
                  size="sm"
                  variant={filter === f.id ? 'default' : 'outline'}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                  <span className="ml-1 tabular-nums opacity-70">{n}</span>
                </Button>
              );
            })}
          </div>
          {visible.length === 0 ? (
            <EmptyState title={t('funnel.emptyGroup')} />
          ) : (
            <div className="grid gap-3">
              {visible.map((row) => (
                <FunnelMineCard
                  key={row.id}
                  row={row}
                  copied={copiedId === row.id}
                  onCopied={setCopiedId}
                  designVisible={visibleDesignId === row.id}
                  designMounted={mountedDesignIds.has(row.id)}
                  onToggleDesign={() => toggleDesign(row.id)}
                  onOpenDesign={openDesign}
                  advancedOpen={advancedOpen}
                  advancedPane={advancedPane}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <FunnelAdvancedSection defaultOpen={advancedOpen} initialPane={advancedPane} />
    </div>
  );
}
