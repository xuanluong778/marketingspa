'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FunnelAdvancedSection } from '@/components/funnel/funnel-advanced-section';
import { FunnelMineCard } from '@/components/funnel/funnel-mine-card';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/shared/page-state';
import { useFunnelRecommendations } from '@/hooks/use-funnel-builder';
import { funnelHref, type FunnelAdvancedPane } from '@/lib/funnel-tabs';

type StatusFilter = 'all' | 'ACTIVE' | 'DRAFT' | 'PAUSED' | 'ARCHIVED';

const FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'Tất cả' },
  { id: 'ACTIVE', label: 'Đang chạy' },
  { id: 'DRAFT', label: 'Nháp' },
  { id: 'PAUSED', label: 'Tạm dừng' },
  { id: 'ARCHIVED', label: 'Đã lưu trữ' },
];

const STATUS_RANK: Record<string, number> = {
  ACTIVE: 0,
  PAUSED: 1,
  DRAFT: 2,
  ARCHIVED: 3,
};

export function FunnelMinePanel({
  advancedOpen = false,
  advancedPane = 'scoring',
}: {
  advancedOpen?: boolean;
  advancedPane?: FunnelAdvancedPane;
}) {
  const router = useRouter();
  const list = useFunnelRecommendations();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const items = list.data ?? [];

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

  if (list.isLoading) return <LoadingState message="Đang tải phễu…" />;
  if (list.isError) return <ErrorState onRetry={() => void list.refetch()} />;

  return (
    <div className="space-y-6">
      {items.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            title="Chưa có phễu nào"
            description="Tạo phễu trong 3 bước, rồi kích hoạt để thu lead."
          />
          <div className="flex justify-center">
            <Button onClick={() => router.replace(funnelHref({ tab: 'create', create: true }))}>
              Tạo phễu
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Phễu đang chạy hiện trên cùng. Nút nổi bật là bước tiếp theo nên bấm.
          </p>
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
            <EmptyState title="Không có phễu trong nhóm này" />
          ) : (
            <div className="grid gap-3">
              {visible.map((row) => (
                <FunnelMineCard
                  key={row.id}
                  row={row}
                  copied={copiedId === row.id}
                  onCopied={setCopiedId}
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
