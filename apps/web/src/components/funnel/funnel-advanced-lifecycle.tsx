'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  useArchiveFunnel,
  useCloneFunnel,
  useFunnelQuota,
  useFunnelVersions,
  usePrepareFunnelPublish,
  useRestoreFunnelVersion,
} from '@/hooks/use-funnel-lifecycle';
import { useFunnelValidation } from '@/hooks/use-funnel-validator';
import { funnelHref } from '@/lib/funnel-tabs';
import type { FunnelCompleteSpec } from '@/types/funnel';
import type { FunnelPublishStatus } from '@/hooks/use-funnel-lifecycle';

export function FunnelAdvancedLifecycle({
  recommendationId,
  status = 'DRAFT',
  publishedVersion = 0,
  liveFrozen,
  onSpec,
}: {
  recommendationId: string;
  status?: FunnelPublishStatus;
  publishedVersion?: number;
  liveFrozen?: boolean;
  onSpec?: (spec: FunnelCompleteSpec) => void;
}) {
  const router = useRouter();
  const quota = useFunnelQuota();
  const versions = useFunnelVersions(recommendationId);
  const prepare = usePrepareFunnelPublish();
  const archive = useArchiveFunnel();
  const clone = useCloneFunnel();
  const restore = useRestoreFunnelVersion();
  const validation = useFunnelValidation(recommendationId, false);
  const [error, setError] = useState<string | null>(null);
  const busy = prepare.isPending || archive.isPending || clone.isPending || restore.isPending;

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {publishedVersion > 0 && <Badge variant="outline">Bản đã xuất {publishedVersion}</Badge>}
        {liveFrozen && <Badge variant="outline">Bản đang chạy đã khóa</Badge>}
        {validation.data && (
          <Badge variant="outline">Điểm kiểm tra {validation.data.score}/100</Badge>
        )}
        {quota.data && (
          <span className="text-xs text-muted-foreground">
            Đang chạy {quota.data.usedActive}/{quota.data.maxActive} · Tổng {quota.data.usedFunnels}/
            {quota.data.maxFunnels}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy || status === 'ARCHIVED'}
          onClick={async () => {
            setError(null);
            try {
              const res = await prepare.mutateAsync(recommendationId);
              onSpec?.(res.complete);
              await validation.refetch();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Không chuẩn bị được bản kích hoạt');
            }
          }}
        >
          Chuẩn bị kỹ thuật
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => {
            void clone
              .mutateAsync(recommendationId)
              .then((res) => router.replace(funnelHref({ tab: 'mine', design: res.id })))
              .catch((e) => setError(e instanceof Error ? e.message : 'Không sao chép được'));
          }}
        >
          Sao chép
        </Button>
        {status !== 'ARCHIVED' && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              if (window.confirm('Lưu trữ phễu? Lead đang chạy giữ nguyên.')) {
                archive.mutate(recommendationId);
              }
            }}
          >
            Lưu trữ
          </Button>
        )}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Phiên bản đã xuất bản / Khôi phục</p>
        {versions.isLoading ? (
          <p className="text-xs text-muted-foreground">Đang tải…</p>
        ) : (versions.data?.length ?? 0) === 0 ? (
          <p className="text-xs text-muted-foreground">Chưa có phiên bản đã xuất bản.</p>
        ) : (
          versions.data!.slice(0, 8).map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-2 text-xs">
              <span>
                v{v.version} · {v.summary ?? 'xuất bản'} · {new Date(v.createdAt).toLocaleString('vi-VN')}
              </span>
              {status !== 'ARCHIVED' && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2"
                  disabled={restore.isPending}
                  onClick={async () => {
                    const res = await restore.mutateAsync({
                      id: recommendationId,
                      versionId: v.id,
                    });
                    onSpec?.(res.complete);
                  }}
                >
                  Khôi phục nháp
                </Button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
