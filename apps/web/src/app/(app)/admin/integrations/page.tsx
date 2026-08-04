'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/shared/page-state';
import { useAdminIntegrationsHealth } from '@/hooks/use-platform-admin';

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0A3D30]/40 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <Badge variant="outline" className={ok ? 'border-emerald-400/50 text-emerald-200' : 'border-red-400/50 text-red-200'}>
          {ok ? 'OK' : 'DOWN'}
        </Badge>
      </div>
    </div>
  );
}

function CountBlock({ title, data }: { title: string; data: Record<string, unknown> }) {
  return (
    <div className="rounded-xl border p-4">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <pre className="overflow-x-auto text-xs text-muted-foreground">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

export default function AdminIntegrationsPage() {
  const health = useAdminIntegrationsHealth();

  if (health.isLoading) return <LoadingState />;
  if (health.isError) return <ErrorState onRetry={() => void health.refetch()} />;
  if (!health.data) return <p className="text-sm text-muted-foreground">Không có dữ liệu.</p>;

  const d = health.data as {
    sepay?: { configured?: boolean; authModes?: string[] };
    redis?: { ok?: boolean };
    worker?: { ok?: boolean };
    bullmq?: Array<{ key: string; name: string; ok: boolean; counts?: Record<string, number> | null }>;
    meta?: Record<string, unknown>;
    google?: Record<string, unknown>;
    zalo?: Record<string, unknown>;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Tích hợp & hạ tầng</h2>
          <p className="text-sm text-muted-foreground">
            Meta · Google · Zalo · SePay · Redis · BullMQ — không trả token/secret.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => void health.refetch()}>
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatusPill ok={!!d.sepay?.configured} label="SePay cấu hình" />
        <StatusPill ok={!!d.redis?.ok} label="Redis" />
        <StatusPill ok={!!d.worker?.ok} label="Worker heartbeat" />
        <StatusPill
          ok={(d.bullmq ?? []).every((q) => q.ok)}
          label="BullMQ queues"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <CountBlock title="Meta" data={d.meta ?? {}} />
        <CountBlock title="Google" data={d.google ?? {}} />
        <CountBlock title="Zalo" data={d.zalo ?? {}} />
      </div>

      <div className="rounded-xl border p-4">
        <h3 className="mb-2 text-sm font-semibold">BullMQ job counts</h3>
        {!d.bullmq?.length ? (
          <p className="text-sm text-muted-foreground">Không đọc được queue.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left">Queue</th>
                  <th className="px-3 py-2 text-right">Waiting</th>
                  <th className="px-3 py-2 text-right">Active</th>
                  <th className="px-3 py-2 text-right">Failed</th>
                  <th className="px-3 py-2 text-right">Delayed</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {d.bullmq.map((q) => (
                  <tr key={q.key} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{q.name}</td>
                    <td className="px-3 py-2 text-right">{q.counts?.waiting ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{q.counts?.active ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{q.counts?.failed ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{q.counts?.delayed ?? '—'}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline">{q.ok ? 'OK' : 'ERROR'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          SePay auth modes: {(d.sepay?.authModes ?? []).join(', ') || '—'} (không hiển thị secret)
        </p>
      </div>
    </div>
  );
}
