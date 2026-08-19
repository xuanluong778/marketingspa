'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ErrorState, LoadingState } from '@/components/shared/page-state';
import { formatCredit, formatDateTime } from '@/lib/format';
import {
  useAdminGiftSubscription,
  useAdminSubscriptions,
  type AdminSubscriptionItem,
} from '@/hooks/use-platform-admin';
import {
  GiftSubscriptionDialog,
  giftSuccessMessage,
  type GiftTimeUnit,
} from '@/components/admin/gift-subscription-dialog';
import { AdminCreditHistoryDialog } from '@/components/admin/credit-history-dialog';

export default function AdminSubscriptionsPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [giftTarget, setGiftTarget] = useState<AdminSubscriptionItem | null>(null);
  const [historyTarget, setHistoryTarget] = useState<AdminSubscriptionItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const list = useAdminSubscriptions({ q, status, page, pageSize: 20 });
  const giftMut = useAdminGiftSubscription();

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 5000);
  }

  function handleGiftConfirm(payload: {
    amount: number;
    unit: GiftTimeUnit;
    permanent?: boolean;
    creditAmount: number;
    idempotencyKey: string;
  }) {
    if (!giftTarget) return;
    giftMut.mutate(
      {
        id: giftTarget.id,
        amount: payload.amount,
        unit: payload.unit,
        permanent: payload.permanent,
        creditAmount: payload.creditAmount,
        idempotencyKey: payload.idempotencyKey,
      },
      {
        onSuccess: (r) => {
          const res = r as { idempotent?: boolean };
          if (!res.idempotent) {
            showToast(
              giftSuccessMessage(
                payload.amount,
                payload.unit,
                payload.permanent,
                payload.creditAmount,
              ),
            );
          }
          setGiftTarget(null);
          void list.refetch();
        },
        onError: (e) => window.alert(e instanceof Error ? e.message : 'Không tặng được quà'),
      },
    );
  }

  if (list.isLoading) return <LoadingState />;
  if (list.isError) return <ErrorState onRetry={() => void list.refetch()} />;

  return (
    <div className="space-y-4">
      {toast && (
        <div
          role="status"
          className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 shadow-lg"
        >
          {toast}
        </div>
      )}

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
                <th className="px-3 py-2 text-right">AI Credit</th>
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
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="font-medium text-primary underline-offset-2 hover:underline"
                      onClick={() => setHistoryTarget(s)}
                    >
                      {formatCredit(Number(s.creditBalance ?? 0))}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">{s.status}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={giftMut.isPending}
                      onClick={() => setGiftTarget(s)}
                    >
                      🎁 Quà tặng
                    </Button>
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

      <GiftSubscriptionDialog
        open={Boolean(giftTarget)}
        onOpenChange={(open) => {
          if (!open) setGiftTarget(null);
        }}
        subscription={giftTarget}
        pending={giftMut.isPending}
        onConfirm={handleGiftConfirm}
      />

      <AdminCreditHistoryDialog
        open={Boolean(historyTarget)}
        org={
          historyTarget
            ? {
                organizationId: historyTarget.organizationId,
                name: historyTarget.organization?.name ?? '—',
                balance: historyTarget.creditBalance,
              }
            : null
        }
        onOpenChange={(open) => {
          if (!open) setHistoryTarget(null);
        }}
      />
    </div>
  );
}
