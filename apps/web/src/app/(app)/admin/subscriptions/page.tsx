'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ErrorState, LoadingState } from '@/components/shared/page-state';
import { formatDateTime } from '@/lib/format';
import {
  useAdminExtendSub,
  useAdminSubscriptions,
  useAdminUpgrade12m,
} from '@/hooks/use-platform-admin';

export default function AdminSubscriptionsPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const list = useAdminSubscriptions({ q, status, page, pageSize: 20 });
  const extendMut = useAdminExtendSub();
  const upgradeMut = useAdminUpgrade12m();

  function extend(id: string, org: string, expiresAt: string, remainingDays: number) {
    const daysStr = window.prompt('Số ngày cộng thêm (1–3650):', '30');
    if (!daysStr) return;
    const days = Number(daysStr);
    if (!Number.isFinite(days) || days < 1) return;
    const reason = window.prompt('Lý do gia hạn:');
    if (!reason || reason.trim().length < 3) return;
    if (
      !window.confirm(
        `Gia hạn ${org}?\nHết hạn hiện tại: ${expiresAt}\nCòn lại: ${remainingDays} ngày\nCộng thêm: ${days} ngày`,
      )
    ) {
      return;
    }
    extendMut.mutate(
      { id, days, reason: reason.trim() },
      {
        onSuccess: (r) => {
          const after = (r as { after?: { expiresAt?: string; remainingDays?: number } }).after;
          window.alert(
            `OK. Hết hạn mới: ${after?.expiresAt ?? '—'} · còn ${after?.remainingDays ?? '—'} ngày`,
          );
        },
        onError: (e) => window.alert(e instanceof Error ? e.message : 'Lỗi'),
      },
    );
  }

  function upgrade(id: string, org: string, planCode: string, months: number) {
    if (months >= 12) {
      window.alert('Gói đã là 1 năm trở lên');
      return;
    }
    const reason = window.prompt(`Nâng cấp ${org} từ ${planCode} → 1 năm.\nLý do:`);
    if (!reason || reason.trim().length < 3) return;
    if (
      !window.confirm(
        `Xác nhận nâng cấp?\nTrước: ${planCode} (${months} tháng)\nSau: msp-pro-12m (+6 tháng vào hạn hiện tại)`,
      )
    ) {
      return;
    }
    upgradeMut.mutate(
      { id, reason: reason.trim() },
      {
        onSuccess: () => window.alert('Đã nâng cấp lên gói 1 năm'),
        onError: (e) => window.alert(e instanceof Error ? e.message : 'Lỗi'),
      },
    );
  }

  if (list.isLoading) return <LoadingState />;
  if (list.isError) return <ErrorState onRetry={() => void list.refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          className="h-9 rounded-md border bg-background px-3 text-sm"
          placeholder="Tìm org / gói"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả</option>
          <option value="active">Còn hạn</option>
          <option value="expired">Hết hạn</option>
        </select>
      </div>

      {!list.data?.items.length ? (
        <p className="text-sm text-muted-foreground">Không có subscription.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left">Tổ chức</th>
                <th className="px-3 py-2 text-left">Gói</th>
                <th className="px-3 py-2 text-left">Hết hạn</th>
                <th className="px-3 py-2 text-left">Còn lại</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium">{s.organization?.name ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">{s.organization?.email}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {s.planName}
                    <div className="text-muted-foreground">
                      {s.planCode} · {s.durationMonths} tháng
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">{formatDateTime(s.expiresAt)}</td>
                  <td className="px-3 py-2 font-medium">{s.remainingDays}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">{s.status}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={extendMut.isPending}
                        onClick={() =>
                          extend(
                            s.id,
                            s.organization?.name ?? s.id,
                            formatDateTime(s.expiresAt),
                            s.remainingDays,
                          )
                        }
                      >
                        Cộng ngày
                      </Button>
                      {s.durationMonths < 12 && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={upgradeMut.isPending}
                          onClick={() =>
                            upgrade(
                              s.id,
                              s.organization?.name ?? s.id,
                              s.planCode,
                              s.durationMonths,
                            )
                          }
                        >
                          Lên 1 năm
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end gap-2 border-t px-3 py-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Trước
            </Button>
            <span className="self-center text-xs text-muted-foreground">
              {page}/{list.data.totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= list.data.totalPages}
              onClick={() => setPage(page + 1)}
            >
              Sau
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
