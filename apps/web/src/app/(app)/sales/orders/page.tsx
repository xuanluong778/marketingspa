'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ExternalLink,
  PackageCheck,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/page-state';
import { SalesOrderFormDialog } from '@/components/sales/sales-order-form-dialog';
import { SalesPrintDocument } from '@/components/sales/sales-print-document';
import {
  useCreateSalesOrder,
  useCreateSalesReturn,
  useExportSalesOrder,
  useRecordPayment,
  useRecordRefund,
  useSalesOrder,
  useSalesOrders,
  useUpdateSalesOrder,
  useUpdateSalesOrderStatus,
} from '@/hooks/use-sales';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { formatMutationError } from '@/lib/format-mutation-error';
import { useT } from '@/i18n/i18n-provider';
import {
  NEXT_STATUS,
  SALES_ORDER_STATUSES,
  type SalesOrder,
  type SalesOrderStatus,
} from '@/types/sales';

function statusVariant(status: SalesOrderStatus) {
  switch (status) {
    case 'COMPLETED':
      return 'default' as const;
    case 'CANCELLED':
    case 'RETURNED':
      return 'destructive' as const;
    case 'SHIPPED':
    case 'READY':
      return 'secondary' as const;
    default:
      return 'outline' as const;
  }
}

export default function SalesOrdersPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <SalesOrdersPageContent />
    </Suspense>
  );
}

function SalesOrdersPageContent() {
  const t = useT();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SalesOrder | null>(null);
  const [detailId, setDetailId] = useState<string | null>(() => searchParams.get('id'));
  const [printKind, setPrintKind] = useState<'order' | 'export' | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const syncOrderUrl = (orderId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (orderId) params.set('id', orderId);
    else params.delete('id');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const openOrder = (orderId: string) => {
    setDetailId(orderId);
    syncOrderUrl(orderId);
  };

  const closeOrder = () => {
    setDetailId(null);
    setPrintKind(null);
    syncOrderUrl(null);
  };

  useEffect(() => {
    const id = searchParams.get('id');
    if (id) setDetailId(id);
  }, [searchParams]);

  const list = useSalesOrders({
    page,
    status: status === 'all' ? undefined : status,
    search: search.trim() || undefined,
  });
  const detail = useSalesOrder(detailId);
  const create = useCreateSalesOrder();
  const update = useUpdateSalesOrder();
  const updateStatus = useUpdateSalesOrderStatus();
  const exportOrder = useExportSalesOrder();
  const recordPayment = useRecordPayment();
  const recordRefund = useRecordRefund();
  const createReturn = useCreateSalesReturn();
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');

  const items = list.data?.items ?? [];
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((list.data?.total ?? 0) / (list.data?.pageSize ?? 20))),
    [list.data],
  );

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (order: SalesOrder) => {
    setEditing(order);
    setFormOpen(true);
  };

  const runStatus = async (id: string, next: SalesOrderStatus) => {
    setMsg('');
    setErr('');
    try {
      await updateStatus.mutateAsync({ id, status: next });
      setMsg(t('sales.statusUpdated'));
      if (detailId === id) void detail.refetch();
    } catch (e) {
      setErr(formatMutationError(e, t('sales.statusFailed')));
    }
  };

  const runExport = async (id: string) => {
    setMsg('');
    setErr('');
    try {
      await exportOrder.mutateAsync(id);
      setMsg(t('sales.exportOk'));
      openOrder(id);
      setPrintKind('export');
      if (detailId === id) void detail.refetch();
    } catch (e) {
      setErr(formatMutationError(e, t('sales.exportFailed')));
    }
  };

  return (
    <div className="space-y-4 pb-8">
      <PageHeader title={t('sales.ordersTitle')} description={t('sales.ordersDesc')}>
        <Button type="button" onClick={openCreate} className="bg-[#F97316] text-white">
          <Plus className="mr-1 h-4 w-4" />
          {t('sales.createOrder')}
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-[200px] flex-1 space-y-1">
          <Input
            placeholder={t('sales.searchPlaceholder')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            {SALES_ORDER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`sales.status.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" onClick={() => void list.refetch()}>
          <RefreshCw className="mr-1 h-4 w-4" />
          {t('common.retry')}
        </Button>
      </div>

      {msg ? <p className="text-sm text-emerald-300">{msg}</p> : null}
      {err ? <p className="text-sm text-amber-200">{err}</p> : null}

      {list.isLoading ? <LoadingState /> : null}
      {list.isError ? (
        <ErrorState
          message={formatMutationError(list.error, t('sales.loadFailed'))}
          onRetry={() => void list.refetch()}
        />
      ) : null}
      {!list.isLoading && !list.isError && !items.length ? (
        <EmptyState title={t('sales.emptyOrders')} description={t('sales.emptyOrdersHint')} />
      ) : null}

      {!list.isLoading && items.length ? (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="bg-white/5 text-xs text-muted-foreground">
              <tr>
                <th className="p-3">{t('sales.orderCode')}</th>
                <th className="p-3">{t('sales.customer')}</th>
                <th className="p-3">{t('sales.phone')}</th>
                <th className="p-3">{t('common.status')}</th>
                <th className="p-3 text-right">{t('sales.total')}</th>
                <th className="p-3">{t('sales.source')}</th>
                <th className="p-3">{t('sales.createdAt')}</th>
                <th className="p-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((o) => {
                const next = NEXT_STATUS[o.status];
                return (
                  <tr key={o.id} className="border-t border-white/5">
                    <td className="p-3 font-mono text-white">
                      <button
                        type="button"
                        className="underline-offset-2 hover:underline"
                        onClick={() => {
                          openOrder(o.id);
                          setPrintKind(null);
                        }}
                      >
                        {o.code}
                      </button>
                    </td>
                    <td className="p-3">
                      <Link
                        href={`/customers/${o.customerId}`}
                        className="inline-flex items-center gap-1 text-[#F97316] hover:underline"
                      >
                        {o.customerName}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                    <td className="p-3">{o.phone || '—'}</td>
                    <td className="p-3">
                      <Badge variant={statusVariant(o.status)}>{t(`sales.status.${o.status}`)}</Badge>
                    </td>
                    <td className="p-3 text-right font-medium text-white">
                      {formatCurrency(o.total)}
                    </td>
                    <td className="p-3">{o.source || '—'}</td>
                    <td className="p-3">{formatDateTime(o.createdAt)}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {(o.status === 'DRAFT' || o.status === 'CONFIRMED') && (
                          <Button type="button" size="sm" variant="ghost" onClick={() => openEdit(o)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {next ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={updateStatus.isPending}
                            onClick={() => void runStatus(o.id, next)}
                          >
                            → {t(`sales.status.${next}`)}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            openOrder(o.id);
                            setPrintKind('order');
                          }}
                        >
                          <Printer className="mr-1 h-3.5 w-3.5" />
                          {t('sales.printOrder')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {totalPages > 1 ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {t('common.previous')}
          </Button>
          <span className="text-sm text-muted-foreground">
            {page}/{totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('common.next')}
          </Button>
        </div>
      ) : null}

      <SalesOrderFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        isPending={create.isPending || update.isPending}
        onSubmit={(data) => {
          const done = () => {
            setFormOpen(false);
            setEditing(null);
            void list.refetch();
          };
          if (editing) {
            update.mutate(
              { id: editing.id, ...data },
              {
                onSuccess: done,
                onError: (e) => setErr(formatMutationError(e, t('sales.saveFailed'))),
              },
            );
          } else {
            create.mutate(data, {
              onSuccess: done,
              onError: (e) => setErr(formatMutationError(e, t('sales.saveFailed'))),
            });
          }
        }}
      />

      <Dialog
        open={Boolean(detailId)}
        onOpenChange={(o) => {
          if (!o) closeOrder();
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {printKind
                ? printKind === 'export'
                  ? t('sales.printExportTitle')
                  : t('sales.printOrderTitle')
                : t('sales.orderDetail')}
            </DialogTitle>
          </DialogHeader>
          {detail.isLoading ? <LoadingState /> : null}
          {detail.data && !printKind ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant={statusVariant(detail.data.status)}>
                  {t(`sales.status.${detail.data.status}`)}
                </Badge>
                <span className="font-mono text-sm text-white">{detail.data.code}</span>
              </div>
              <p className="text-sm">
                <Link
                  href={`/customers/${detail.data.customerId}`}
                  className="text-[#F97316] hover:underline"
                >
                  {detail.data.customerName}
                </Link>
                {detail.data.phone ? ` · ${detail.data.phone}` : ''}
              </p>
              {detail.data.address ? (
                <p className="text-sm text-muted-foreground">{detail.data.address}</p>
              ) : null}
              <p className="text-lg font-semibold text-[#F97316]">
                {t('sales.orderTotal')}: {formatCurrency(detail.data.total)}
              </p>
              <div className="grid gap-1 text-sm">
                <p>
                  {t('sales.amountPaid')}: {formatCurrency(detail.data.amountPaid ?? 0)}
                </p>
                <p>
                  {t('sales.amountDue')}:{' '}
                  {formatCurrency(
                    detail.data.amountDue ??
                      Math.max(0, detail.data.total - (detail.data.amountPaid ?? 0)),
                  )}
                </p>
                <p className="text-muted-foreground">
                  {t('sales.paymentStatus')}:{' '}
                  {t(`sales.payment.${detail.data.paymentStatus || 'UNPAID'}`)}
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Input
                  className="w-32"
                  type="number"
                  min={0}
                  placeholder={t('sales.payAmount')}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
                <Input
                  className="w-28"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  placeholder={t('sales.paymentMethod')}
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={recordPayment.isPending || !payAmount}
                  onClick={() => {
                    recordPayment.mutate(
                      {
                        orderId: detail.data!.id,
                        amount: Number(payAmount),
                        method: payMethod,
                      },
                      {
                        onSuccess: () => {
                          setPayAmount('');
                          setMsg(t('sales.paymentRecorded'));
                          void detail.refetch();
                        },
                        onError: (e) => setErr(formatMutationError(e)),
                      },
                    );
                  }}
                >
                  {t('sales.recordPayment')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={recordRefund.isPending || !payAmount}
                  onClick={() => {
                    recordRefund.mutate(
                      {
                        orderId: detail.data!.id,
                        amount: Number(payAmount),
                        method: payMethod,
                      },
                      {
                        onSuccess: () => {
                          setPayAmount('');
                          setMsg(t('sales.refundRecorded'));
                          void detail.refetch();
                        },
                        onError: (e) => setErr(formatMutationError(e)),
                      },
                    );
                  }}
                >
                  {t('sales.recordRefund')}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {NEXT_STATUS[detail.data.status] ? (
                  <Button
                    type="button"
                    disabled={updateStatus.isPending}
                    onClick={() =>
                      void runStatus(detail.data!.id, NEXT_STATUS[detail.data!.status]!)
                    }
                  >
                    → {t(`sales.status.${NEXT_STATUS[detail.data.status]!}`)}
                  </Button>
                ) : null}
                {(detail.data.status === 'CONFIRMED' ||
                  detail.data.status === 'READY' ||
                  detail.data.status === 'SHIPPED') &&
                !detail.data.exportedAt ? (
                  <Button
                    type="button"
                    className="bg-[#F97316] text-white"
                    disabled={exportOrder.isPending}
                    onClick={() => void runExport(detail.data!.id)}
                  >
                    <PackageCheck className="mr-1 h-4 w-4" />
                    {t('sales.exportGoods')}
                  </Button>
                ) : null}
                <Button type="button" variant="outline" onClick={() => setPrintKind('order')}>
                  <Printer className="mr-1 h-4 w-4" />
                  {t('sales.printOrder')}
                </Button>
                <Button type="button" variant="outline" onClick={() => setPrintKind('export')}>
                  <Printer className="mr-1 h-4 w-4" />
                  {t('sales.printExport')}
                </Button>
                {detail.data.status !== 'CANCELLED' &&
                detail.data.status !== 'RETURNED' &&
                detail.data.status !== 'COMPLETED' ? (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={updateStatus.isPending}
                    onClick={() => void runStatus(detail.data!.id, 'CANCELLED')}
                  >
                    {t('sales.cancelOrder')}
                  </Button>
                ) : null}
                {(detail.data.status === 'SHIPPED' ||
                  detail.data.status === 'COMPLETED' ||
                  detail.data.status === 'PARTIALLY_RETURNED') &&
                detail.data.exportedAt ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={updateStatus.isPending}
                      onClick={() => void runStatus(detail.data!.id, 'RETURNED')}
                    >
                      {t('sales.returnOrder')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={createReturn.isPending}
                      onClick={() => {
                        const item = detail.data!.items.find(
                          (it) => (it.returnedQty ?? 0) < it.quantity && it.id,
                        );
                        if (!item?.id) {
                          setErr(t('sales.nothingToReturn'));
                          return;
                        }
                        createReturn.mutate(
                          {
                            orderId: detail.data!.id,
                            reason: 'Partial return',
                            items: [{ orderItemId: item.id, quantity: 1 }],
                          },
                          {
                            onSuccess: () => {
                              setMsg(t('sales.partialReturnOk'));
                              void detail.refetch();
                              void list.refetch();
                            },
                            onError: (e) => setErr(formatMutationError(e)),
                          },
                        );
                      }}
                    >
                      {t('sales.partialReturn')}
                    </Button>
                  </>
                ) : null}
              </div>
              <ul className="space-y-1 text-sm">
                {detail.data.items.map((it) => (
                  <li key={it.id} className="flex justify-between border-b border-white/5 py-1">
                    <span>
                      {it.productName} × {it.quantity}
                    </span>
                    <span>{formatCurrency(it.totalPrice)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {detail.data && printKind ? (
            <SalesPrintDocument order={detail.data} kind={printKind} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
