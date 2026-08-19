'use client';

import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { FunnelLifecycleBar } from '@/components/funnel/funnel-lifecycle-bar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useArchiveFunnel, useCloneFunnel } from '@/hooks/use-funnel-lifecycle';
import { formatCurrency } from '@/lib/format';
import { FUNNEL_STATUS_LABEL, funnelHref, funnelListTitle } from '@/lib/funnel-tabs';
import { cn } from '@/lib/utils';
import type { FunnelRecommendationListItem } from '@/hooks/use-funnel-builder';
import { useRouter } from 'next/navigation';

const STATUS_CLASS: Record<string, string> = {
  ACTIVE: 'bg-green-600 text-white border-transparent',
  PAUSED: 'border-amber-400 text-amber-800',
  DRAFT: '',
  ARCHIVED: 'text-muted-foreground',
};

function nextHint(row: FunnelRecommendationListItem) {
  const status = row.status ?? 'DRAFT';
  const ready = Boolean(row.completeGeneratedAt);
  if (status === 'ACTIVE') return 'Đang chạy — gửi link cho khách hoặc xem kết quả.';
  if (status === 'PAUSED') return 'Đang tạm dừng. Bấm Chạy lại để nhận lead.';
  if (!ready) return 'Chưa xong thiết kế. Bấm Chỉnh sửa.';
  return 'Nháp. Bấm Kích hoạt khi đã kiểm tra xong.';
}

export function FunnelMineCard({
  row,
  copied,
  onCopied,
}: {
  row: FunnelRecommendationListItem;
  copied?: boolean;
  onCopied?: (id: string) => void;
}) {
  const router = useRouter();
  const status = row.status ?? 'DRAFT';
  const kpis = row.kpis ?? { leads: 0, booking: 0, purchase: 0, revenue: 0 };
  const [error, setError] = useState<string | null>(null);
  const archive = useArchiveFunnel();
  const clone = useCloneFunnel();
  const busy = archive.isPending || clone.isPending;

  return (
    <Card className={cn('shadow-sm', status === 'ARCHIVED' && 'opacity-70')}>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <h3 className="text-base font-semibold leading-snug">{funnelListTitle(row)}</h3>
            {row.offer ? (
              <p className="line-clamp-2 text-sm text-muted-foreground">{row.offer}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">{nextHint(row)}</p>
          </div>
          <Badge
            variant={status === 'ACTIVE' ? 'default' : 'outline'}
            className={STATUS_CLASS[status]}
          >
            {FUNNEL_STATUS_LABEL[status] ?? status}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: 'Lead', value: kpis.leads },
            { label: 'Booking', value: kpis.booking },
            { label: 'Purchase', value: kpis.purchase },
            { label: 'Revenue', value: formatCurrency(kpis.revenue), raw: true },
          ].map((kpi) => (
            <button
              key={kpi.label}
              type="button"
              className="rounded-md border bg-muted/30 px-2 py-2 text-left hover:bg-muted/50"
              onClick={() => router.replace(funnelHref({ tab: 'customers', funnel: row.id }))}
            >
              <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
              <p className="text-base font-semibold tabular-nums">{kpi.value}</p>
            </button>
          ))}
        </div>

        {status !== 'ARCHIVED' && (
          <FunnelLifecycleBar
            compact
            recommendationId={row.id}
            status={status}
            copied={copied}
            onCopied={onCopied}
          />
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.replace(funnelHref({ tab: 'mine', draft: row.id }))}
          >
            Chỉnh sửa
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" aria-label="Thêm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={busy}
                onClick={() => {
                  void clone
                    .mutateAsync(row.id)
                    .then((res) => router.replace(funnelHref({ tab: 'mine', draft: res.id })))
                    .catch((e) => setError(e instanceof Error ? e.message : 'Không sao chép được'));
                }}
              >
                Sao chép
              </DropdownMenuItem>
              {status !== 'ARCHIVED' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm('Lưu trữ phễu? Lead đang chạy giữ nguyên.')) {
                        archive.mutate(row.id);
                      }
                    }}
                  >
                    Lưu trữ
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
