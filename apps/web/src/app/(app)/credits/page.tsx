'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Coins, Copy, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { CREDIT_LOW_THRESHOLD } from '@marketingspa/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState, LoadingState } from '@/components/shared/page-state';
import { useCreditBalance, useCreditHistory, useCreditPackages } from '@/hooks/use-credit';
import {
  useCancelPaymentOrder,
  useCreateCreditOrder,
  usePaymentOrder,
} from '@/hooks/use-billing';
import { formatCredit, formatCurrency, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n/i18n-provider';

function signedClass(amount: number) {
  if (amount > 0) return 'text-emerald-600';
  if (amount < 0) return 'text-red-600';
  return 'text-muted-foreground';
}

function formatSigned(amount: number) {
  const abs = formatCredit(Math.abs(amount));
  if (amount > 0) return `+${abs}`;
  if (amount < 0) return `-${abs}`;
  return abs;
}

export default function CreditsPage() {
  const t = useT();
  const [page, setPage] = useState(1);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const balance = useCreditBalance();
  const history = useCreditHistory({ page, pageSize: 20 });
  const packages = useCreditPackages();
  const createOrder = useCreateCreditOrder();

  if (balance.isLoading) return <LoadingState />;
  if (balance.isError) return <ErrorState onRetry={() => void balance.refetch()} />;

  const snap = balance.data;
  const available = Number(snap?.available ?? snap?.balance ?? 0);
  const used = Number(snap?.lifetimeUsed ?? 0);
  const earned = Number(snap?.lifetimeEarned ?? 0);
  const isZero = available <= 0;
  const isLow = !isZero && available < CREDIT_LOW_THRESHOLD;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('credits.title')}
        description={t('credits.extendedDescription')}
      />

      {isZero && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          Credit = 0 — các tác vụ cần AI Credit đang bị khóa. Module miễn Credit vẫn dùng bình
          thường.
        </div>
      )}
      {isLow && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Credit thấp ({formatCredit(available)}). Mua thêm gói Credit bên dưới hoặc gia hạn tại{' '}
          <Link href="/pricing" className="font-medium underline">
            Bảng giá
          </Link>
          .
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('creditsPage.balance')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-2xl font-bold">
              <Coins className="h-5 w-5 text-heading" />
              {formatCredit(available)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('creditsPage.used')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCredit(used)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Đã nhận / mua
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCredit(earned)}</div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-base font-semibold">{t('creditsPage.buyMore')}</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Thanh toán VietQR/SePay. Cộng Credit ngay khi chuyển khoản thành công — không gia hạn gói
          Subscription.
        </p>
        {packages.isLoading ? (
          <LoadingState />
        ) : !packages.data?.length ? (
          <p className="text-sm text-muted-foreground">{t('creditsPage.emptyPackages')}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            {packages.data.map((pkg) => (
              <Card key={pkg.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{pkg.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-2xl font-bold">{formatCredit(pkg.credits)}</p>
                  <p className="text-sm text-muted-foreground">{formatCurrency(pkg.priceVnd)}</p>
                  <Button
                    className="w-full"
                    disabled={createOrder.isPending}
                    onClick={async () => {
                      const order = await createOrder.mutateAsync(pkg.code);
                      setOrderId(order.id);
                      setPayOpen(true);
                    }}
                  >
                    {createOrder.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang tạo đơn...
                      </>
                    ) : (
                      t('creditsPage.buyThis')
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <CreditPaymentDialog
        orderId={orderId}
        open={payOpen}
        onOpenChange={(v) => {
          setPayOpen(v);
          if (!v) {
            void balance.refetch();
            void history.refetch();
          }
        }}
      />

      <div>
        <h2 className="mb-3 text-base font-semibold">{t('creditsPage.history')}</h2>
        {history.isLoading ? (
          <LoadingState />
        ) : history.isError ? (
          <ErrorState onRetry={() => void history.refetch()} />
        ) : !history.data?.items.length ? (
          <p className="text-sm text-muted-foreground">{t('creditsPage.emptyTransactions')}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
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
                        signedClass(row.amount),
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
            <div className="flex justify-end gap-2 border-t px-3 py-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Trước
              </Button>
              <span className="self-center text-xs text-muted-foreground">
                {page}/{history.data.totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= history.data.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Sau
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CreditPaymentDialog({
  orderId,
  open,
  onOpenChange,
}: {
  orderId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const { data: order, isLoading } = usePaymentOrder(orderId, { poll: true });
  const cancelMut = useCancelPaymentOrder();
  const [copied, setCopied] = useState<string | null>(null);
  const celebrated = useRef<string | null>(null);

  useEffect(() => {
    if (!open) celebrated.current = null;
  }, [open]);

  useEffect(() => {
    if (order?.status !== 'PAID' || !order.id) return;
    if (celebrated.current === order.id) return;
    celebrated.current = order.id;
    void qc.invalidateQueries({ queryKey: ['credits'] });
  }, [order?.status, order?.id, qc]);

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Thanh toán mua Credit</DialogTitle>
          <DialogDescription>
            Quét VietQR đúng số tiền và nội dung. Credit được cộng tự động, không gia hạn gói.
          </DialogDescription>
        </DialogHeader>
        {isLoading || !order ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t('credits.loadingOrder')}
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            {order.status === 'PAID' && (
              <p className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-800">
                Thanh toán thành công
                {order.creditPackage
                  ? ` — đã cộng ${formatCredit(order.creditPackage.credits)} Credit`
                  : ''}
                .
              </p>
            )}
            {order.qrUrl && order.status === 'PENDING' && (
              <div className="flex justify-center rounded-lg border bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={order.qrUrl} alt="VietQR" className="h-40 w-40 object-contain" />
              </div>
            )}
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Mã đơn</span>
              <button type="button" className="inline-flex items-center gap-1 font-medium" onClick={() => void copy(order.code, 'code')}>
                {order.code} <Copy className="h-3 w-3" />
                {copied === 'code' ? <span className="text-xs text-emerald-600">Đã copy</span> : null}
              </button>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Số tiền</span>
              <span className="font-medium">{formatCurrency(order.amountVnd)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Nội dung CK</span>
              <button
                type="button"
                className="inline-flex items-center gap-1 font-medium"
                onClick={() => void copy(order.transferContent, 'content')}
              >
                {order.transferContent} <Copy className="h-3 w-3" />
              </button>
            </div>
            {order.status === 'PENDING' && (
              <Button
                variant="outline"
                className="w-full"
                disabled={cancelMut.isPending}
                onClick={() =>
                  cancelMut.mutate(order.id, {
                    onSuccess: () => onOpenChange(false),
                  })
                }
              >
                Hủy đơn
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
