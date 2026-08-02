'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/shared/page-state';
import { useAdminAuditLogs } from '@/hooks/use-platform-admin';
import { formatDateTime } from '@/lib/format';

type AuditRow = {
  id: string;
  createdAt: string;
  ipAddress: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  admin: { email: string; name: string; role: string } | null;
  organization: { name: string; slug: string } | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  result: unknown;
};

export default function AdminAuditPage() {
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const list = useAdminAuditLogs({ q, action, page, pageSize: 30 });

  if (list.isLoading) return <LoadingState />;
  if (list.isError) return <ErrorState onRetry={() => void list.refetch()} />;

  const items = (list.data?.items ?? []) as AuditRow[];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Nhật ký hệ thống</h2>
        <p className="text-sm text-muted-foreground">
          Admin · thời gian · IP · hành động · đối tượng · lý do · trước/sau · kết quả (đã redact
          secret).
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          className="h-9 rounded-md border bg-background px-3 text-sm"
          placeholder="Tìm action / entity"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <input
          className="h-9 rounded-md border bg-background px-3 text-sm"
          placeholder="Lọc action"
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
        />
        <Button size="sm" variant="secondary" onClick={() => void list.refetch()}>
          Làm mới
        </Button>
      </div>

      {!items.length ? (
        <p className="text-sm text-muted-foreground">Chưa có nhật ký.</p>
      ) : (
        <div className="space-y-2">
          {items.map((row) => (
            <details
              key={row.id}
              className="rounded-xl border border-white/10 bg-[#0A3D30]/30 p-3 open:bg-[#0A3D30]/50"
            >
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-xs font-semibold text-emerald-100">
                      {row.action}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {row.entityType}
                      {row.entityId ? ` · ${row.entityId.slice(0, 8)}…` : ''}
                      {row.organization ? ` · ${row.organization.name}` : ''}
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div>{formatDateTime(row.createdAt)}</div>
                    <div>{row.admin?.email ?? 'system'}</div>
                    <div>IP {row.ipAddress ?? '—'}</div>
                  </div>
                </div>
                {row.reason && (
                  <div className="mt-1 text-xs text-amber-100/90">Lý do: {row.reason}</div>
                )}
                {row.result != null && (
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Kết quả: {String(row.result)}
                  </div>
                )}
              </summary>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Trước
                  </div>
                  <pre className="overflow-x-auto rounded-lg bg-black/30 p-2 text-[11px]">
                    {JSON.stringify(row.before ?? {}, null, 2)}
                  </pre>
                </div>
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Sau
                  </div>
                  <pre className="overflow-x-auto rounded-lg bg-black/30 p-2 text-[11px]">
                    {JSON.stringify(row.after ?? {}, null, 2)}
                  </pre>
                </div>
              </div>
            </details>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Trước
            </Button>
            <span className="text-xs text-muted-foreground">
              {page}/{list.data?.totalPages ?? 1}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= (list.data?.totalPages ?? 1)}
              onClick={() => setPage((p) => p + 1)}
            >
              Sau
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
