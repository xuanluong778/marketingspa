'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ErrorState, LoadingState } from '@/components/shared/page-state';
import { formatCredit, formatDateTime } from '@/lib/format';
import { useAdminCreditHistory } from '@/hooks/use-platform-admin';
import { cn } from '@/lib/utils';

type HistoryOrg = {
  organizationId: string;
  name: string;
  balance?: number;
  lifetimeUsed?: number;
};

type Props = {
  open: boolean;
  org: HistoryOrg | null;
  onOpenChange: (open: boolean) => void;
};

function formatSigned(amount: number) {
  const abs = formatCredit(Math.abs(amount));
  if (amount > 0) return `+${abs}`;
  if (amount < 0) return `-${abs}`;
  return abs;
}

export function AdminCreditHistoryDialog({ open, org, onOpenChange }: Props) {
  const [page, setPage] = useState(1);
  const history = useAdminCreditHistory(open ? org?.organizationId ?? null : null, {
    page,
    pageSize: 15,
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setPage(1);
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Lịch sử Credit — {org?.name ?? ''}</DialogTitle>
        </DialogHeader>
        {history.isLoading ? (
          <LoadingState />
        ) : history.isError ? (
          <ErrorState onRetry={() => void history.refetch()} />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Số dư {formatCredit(history.data?.balance.balance ?? org?.balance ?? 0)} · Đã dùng{' '}
              {formatCredit(history.data?.balance.lifetimeUsed ?? org?.lifetimeUsed ?? 0)}
            </p>
            {!history.data?.items.length ? (
              <p className="text-sm text-muted-foreground">Chưa có giao dịch.</p>
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80">
                    <tr>
                      <th className="px-3 py-2 text-left">Thời gian</th>
                      <th className="px-3 py-2 text-left">Tính năng</th>
                      <th className="px-3 py-2 text-right">+/- Credit</th>
                      <th className="px-3 py-2 text-right">Số dư</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.data.items.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="whitespace-nowrap px-3 py-2 text-xs">
                          {formatDateTime(row.createdAt)}
                        </td>
                        <td className="px-3 py-2">
                          <div>{row.featureLabel}</div>
                          {row.reason && row.reason !== row.featureLabel && (
                            <div className="text-xs text-muted-foreground">{row.reason}</div>
                          )}
                        </td>
                        <td
                          className={cn(
                            'whitespace-nowrap px-3 py-2 text-right font-medium',
                            row.amount > 0
                              ? 'text-emerald-600'
                              : row.amount < 0
                                ? 'text-red-600'
                                : '',
                          )}
                        >
                          {formatSigned(row.amount)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          {formatCredit(row.balanceAfter)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Trước
              </Button>
              <span className="self-center text-xs text-muted-foreground">
                {page}/{history.data?.totalPages ?? 1}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= (history.data?.totalPages ?? 1)}
                onClick={() => setPage(page + 1)}
              >
                Sau
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
